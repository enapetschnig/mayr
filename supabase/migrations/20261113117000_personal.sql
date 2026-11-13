-- Paket G Personal (SETEC-Wunschliste):
--   1. Interne (unproduktive) Stunden: Stunden ohne Projekt mit einer Art
--      (Büro, Lager/Werkstatt …) — die Arten pflegt der Betrieb.
--   2. Für andere buchen: auch die Teamleitung für ihr Team.
--   3. Aufgaben mit Verlauf (wer hat wann was geändert/kommentiert, Foto).
--   4. Mitarbeiter-Dokumente (Lohnzettel, An-/Abmeldung, Krankenschein …).
--   5. Firmendokumente in Ordnern (Vorlagen, Zertifikate, Versicherungen …).

-- ── 1. Interne Stunden ──────────────────────────────────────────────────
alter table public.firma
  add column intern_arten text[] not null
    default array['Büro', 'Lager/Werkstatt', 'Fahrzeugpflege', 'Schulung', 'Besprechung', 'Fahrt/Einkauf', 'Sonstiges'];

-- Eine Stunde gehört entweder einem Projekt oder ist intern (nie beides).
-- Die Art steht als Text da — wird sie später umbenannt, bleibt die alte
-- Buchung lesbar. Der Trigger nur_in_arbeit_buchen lässt Stunden ohne
-- Projekt ohnehin durch.
alter table public.zeiten
  add column intern text check (intern is null or btrim(intern) <> ''),
  add constraint zeiten_intern_ohne_projekt check (intern is null or projekt_id is null);

-- ── 2. Für andere buchen: Chef, Teamleitung, Partie im Regiebericht ──────
create or replace function public.leitet_team_von(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams t
     where t.aktiv and t.leiter_id = auth.uid() and p_user = any (t.mitglieder)
  )
$$;
revoke execute on function public.leitet_team_von(uuid) from public, anon;
grant execute on function public.leitet_team_von(uuid) to authenticated;

-- Wie 20261025190000, dazu: die Teamleitung bucht für ihre Leute. Ändern und
-- löschen darf sie, was sie selbst eingetragen hat (Policy zeiten_aendern).
create or replace function public.zeit_person_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.ist_chef() then
    if tg_op = 'INSERT' and auth.uid() is not null then
      new.erstellt_von := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.erstellt_von := auth.uid();
    if new.user_id is distinct from auth.uid() and new.regiebericht_id is null
       and not public.leitet_team_von(new.user_id) then
      raise exception 'Stunden für Kollegen bucht der Chef oder die Teamleitung — oder die Partie im Regiebericht.';
    end if;
    return new;
  end if;
  if new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Wer die Stunden eingetragen hat, bleibt.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'Stunden auf einen Kollegen umbuchen kann nur der Chef.';
  end if;
  return new;
end $$;

-- ── 3. Aufgaben ─────────────────────────────────────────────────────────
create table public.aufgaben (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (btrim(titel) <> ''),
  beschreibung text,
  zustaendig uuid[] not null default '{}',
  faellig_am date,
  prioritaet text not null default 'normal' check (prioritaet in ('niedrig', 'normal', 'hoch')),
  status text not null default 'offen' check (status in ('offen', 'in_arbeit', 'erledigt')),
  projekt_id uuid references public.projekte(id) on delete set null,
  kunde_id uuid references public.kunden(id) on delete set null,
  -- Wiederkehrend: beim Erledigen legt der Trigger die nächste an
  wiederholung text check (wiederholung in ('taeglich', 'woechentlich', 'monatlich', 'jaehrlich')),
  erledigt_am timestamptz,
  erledigt_von uuid references public.profiles(id) on delete set null,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.aufgaben using gin (zustaendig);
create index on public.aufgaben (projekt_id);
create index on public.aufgaben (status, faellig_am);

-- Verlauf: angelegt, Status, Änderungen (vom Trigger) und Kommentare mit Foto
create table public.aufgabe_verlauf (
  id uuid primary key default gen_random_uuid(),
  aufgabe_id uuid not null references public.aufgaben(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  art text not null check (art in ('angelegt', 'status', 'geaendert', 'kommentar')),
  text text,
  foto_pfad text,
  created_at timestamptz not null default now(),
  check (art <> 'kommentar' or coalesce(btrim(text), '') <> '' or foto_pfad is not null)
);
create index on public.aufgabe_verlauf (aufgabe_id, created_at);

-- Wer was ändern darf; Erledigt-Stempel vom Server; Wiederholung
create function public.aufgabe_regeln() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  schritt interval;
  naechst date;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    -- pg_trigger_depth > 1: Folgeaufgabe aus der Wiederholung behält den Ersteller
    if auth.uid() is not null and pg_trigger_depth() <= 1 then
      new.erstellt_von := auth.uid();
    end if;
    if new.status = 'erledigt' then
      new.erledigt_am := now();
      new.erledigt_von := auth.uid();
    else
      new.erledigt_am := null;
      new.erledigt_von := null;
    end if;
    return new;
  end if;

  if new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Wer die Aufgabe angelegt hat, bleibt.';
  end if;
  -- Zuständige ändern nur den Status; den Rest ändert, wer sie angelegt hat, oder der Chef
  if auth.uid() is not null and not public.ist_chef() and old.erstellt_von is distinct from auth.uid()
     and (to_jsonb(new) - array['status', 'erledigt_am', 'erledigt_von', 'updated_at'])
         is distinct from (to_jsonb(old) - array['status', 'erledigt_am', 'erledigt_von', 'updated_at']) then
    raise exception 'Ändern kann die Aufgabe nur, wer sie angelegt hat, oder der Chef — du kannst den Status setzen und kommentieren.';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'erledigt' then
      new.erledigt_am := now();
      new.erledigt_von := auth.uid();
      if new.wiederholung is not null then
        schritt := case new.wiederholung when 'taeglich' then interval '1 day' when 'woechentlich' then interval '7 days'
          when 'monatlich' then interval '1 month' else interval '1 year' end;
        naechst := coalesce(new.faellig_am, current_date) + schritt;
        while naechst < current_date loop naechst := naechst + schritt; end loop;
        insert into public.aufgaben (titel, beschreibung, zustaendig, faellig_am, prioritaet, projekt_id, kunde_id, wiederholung, erstellt_von)
        values (new.titel, new.beschreibung, new.zustaendig, naechst, new.prioritaet, new.projekt_id, new.kunde_id, new.wiederholung, new.erstellt_von);
        -- die Folgeaufgabe trägt die Wiederholung weiter (sonst legte Wiederöffnen
        -- und erneutes Erledigen eine zweite an)
        new.wiederholung := null;
      end if;
    else
      new.erledigt_am := null;
      new.erledigt_von := null;
    end if;
  else
    new.erledigt_am := old.erledigt_am;
    new.erledigt_von := old.erledigt_von;
  end if;
  return new;
end $$;
create trigger aufgaben_regeln before insert or update on public.aufgaben
  for each row execute function public.aufgabe_regeln();

-- Verfolgung: jede Änderung landet im Verlauf (lesbar, mit Namen)
create function public.aufgabe_protokoll() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  teile text[] := '{}';
  wer text;
begin
  if tg_op = 'INSERT' then
    insert into public.aufgabe_verlauf (aufgabe_id, user_id, art, text)
    values (new.id, coalesce(auth.uid(), new.erstellt_von), 'angelegt',
      case when pg_trigger_depth() > 1 then 'Wiederkehrende Aufgabe — nächste Runde' end);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.aufgabe_verlauf (aufgabe_id, user_id, art, text) values (new.id, auth.uid(), 'status', new.status);
  end if;
  if new.titel is distinct from old.titel then teile := teile || ('Titel: ' || new.titel); end if;
  if new.beschreibung is distinct from old.beschreibung then teile := teile || 'Beschreibung geändert'::text; end if;
  if new.faellig_am is distinct from old.faellig_am then
    teile := teile || ('Fällig ' || coalesce(to_char(old.faellig_am, 'DD.MM.YYYY'), 'offen') || ' → ' || coalesce(to_char(new.faellig_am, 'DD.MM.YYYY'), 'ohne Termin'));
  end if;
  if new.prioritaet is distinct from old.prioritaet then
    teile := teile || ('Priorität ' || case new.prioritaet when 'hoch' then 'hoch' when 'niedrig' then 'niedrig' else 'normal' end);
  end if;
  if new.zustaendig is distinct from old.zustaendig then
    select string_agg(trim(p.vorname || ' ' || p.nachname), ', ' order by p.vorname) into wer
      from public.profiles p where p.id = any (new.zustaendig);
    teile := teile || ('Zuständig: ' || coalesce(wer, 'niemand'));
  end if;
  if new.projekt_id is distinct from old.projekt_id then teile := teile || 'Projekt geändert'::text; end if;
  if new.kunde_id is distinct from old.kunde_id then teile := teile || 'Kunde geändert'::text; end if;
  -- Erledigen nimmt die Wiederholung weg (die Folgeaufgabe trägt sie) — das ist keine Änderung
  if new.wiederholung is distinct from old.wiederholung and not (new.status = 'erledigt' and old.status <> 'erledigt') then
    teile := teile || ('Wiederholung ' || coalesce(case new.wiederholung when 'taeglich' then 'täglich' when 'woechentlich' then 'wöchentlich'
      when 'monatlich' then 'monatlich' when 'jaehrlich' then 'jährlich' end, 'aus'));
  end if;
  if array_length(teile, 1) > 0 then
    insert into public.aufgabe_verlauf (aufgabe_id, user_id, art, text) values (new.id, auth.uid(), 'geaendert', array_to_string(teile, ' · '));
  end if;
  return new;
end $$;
create trigger aufgaben_protokoll after insert or update on public.aufgaben
  for each row execute function public.aufgabe_protokoll();

revoke execute on function public.aufgabe_regeln(), public.aufgabe_protokoll() from public, anon, authenticated;

alter table public.aufgaben enable row level security;
alter table public.aufgabe_verlauf enable row level security;

-- Chef sieht alle; Mitarbeiter die ihm zugewiesenen und selbst angelegten
create policy aufgaben_lesen on public.aufgaben for select to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and (auth.uid() = any (zustaendig) or erstellt_von = auth.uid())));
create policy aufgaben_anlegen on public.aufgaben for insert to authenticated with check (public.ist_aktiv());
create policy aufgaben_aendern on public.aufgaben for update to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and (auth.uid() = any (zustaendig) or erstellt_von = auth.uid())))
  with check (public.ist_aktiv());
create policy aufgaben_loeschen on public.aufgaben for delete to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and erstellt_von = auth.uid()));

create policy aufgabe_verlauf_lesen on public.aufgabe_verlauf for select to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id));
create policy aufgabe_verlauf_kommentieren on public.aufgabe_verlauf for insert to authenticated
  with check (public.ist_aktiv() and user_id = auth.uid() and art = 'kommentar'
    and exists (select 1 from public.aufgaben a where a.id = aufgabe_id));
create policy aufgabe_verlauf_loeschen on public.aufgabe_verlauf for delete to authenticated
  using (art = 'kommentar' and (public.ist_chef() or user_id = auth.uid()));

-- Fotos zu Aufgaben: <aufgabe_id>/<datei> — sehen darf sie, wer die Aufgabe sieht
insert into storage.buckets (id, name, public, file_size_limit)
values ('aufgaben', 'aufgaben', false, 20971520)
on conflict (id) do nothing;
create policy aufgaben_fotos_lesen on storage.objects for select to authenticated
  using (bucket_id = 'aufgaben' and (storage.foldername(name))[1] in (select a.id::text from public.aufgaben a));
create policy aufgaben_fotos_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'aufgaben' and public.ist_aktiv()
    and (storage.foldername(name))[1] in (select a.id::text from public.aufgaben a));
create policy aufgaben_fotos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'aufgaben' and (public.ist_chef() or owner = auth.uid()));

-- ── 4. Mitarbeiter-Dokumente ────────────────────────────────────────────
create table public.personal_dokumente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  art text not null check (art in ('lohnzettel', 'anmeldung', 'abmeldung', 'krankenschein', 'vertrag', 'zeugnis', 'fuehrerschein', 'sonstiges')),
  titel text,
  -- Lohnzettel: der 1. des Monats, für den er gilt
  monat date check (monat is null or extract(day from monat) = 1),
  pfad text not null unique,
  name text not null,
  mime text,
  groesse bigint,
  -- null = der Mitarbeiter hat es noch nicht geöffnet (Hinweis auf der Startseite)
  gelesen_am timestamptz,
  hochgeladen_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.personal_dokumente (user_id, created_at desc);

create function public.personal_dokument_regeln() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.hochgeladen_von := auth.uid();
    -- Selbst hochgeladen (Krankenschein) ist gelesen
    new.gelesen_am := case when new.user_id = auth.uid() then now() end;
  end if;
  return new;
end $$;
create trigger personal_dokumente_regeln before insert on public.personal_dokumente
  for each row execute function public.personal_dokument_regeln();
revoke execute on function public.personal_dokument_regeln() from public, anon, authenticated;

alter table public.personal_dokumente enable row level security;
-- Chef alles; Mitarbeiter liest nur die eigenen und lädt eigene Krankenscheine,
-- Zeugnisse, Führerschein hoch — Lohnzettel, Meldungen, Verträge kommen vom Büro
create policy personal_dokumente_lesen on public.personal_dokumente for select to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and user_id = auth.uid()));
create policy personal_dokumente_anlegen on public.personal_dokumente for insert to authenticated
  with check (public.ist_chef() or (public.ist_aktiv() and user_id = auth.uid()
    and art in ('krankenschein', 'zeugnis', 'fuehrerschein', 'sonstiges')));
create policy personal_dokumente_aendern on public.personal_dokumente for update to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy personal_dokumente_loeschen on public.personal_dokumente for delete to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and user_id = auth.uid() and hochgeladen_von = auth.uid()));

-- Geöffnet: nur der Mitarbeiter selbst, nur das Datum
create function public.personal_dokument_gelesen(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.personal_dokumente set gelesen_am = now()
   where id = p_id and user_id = auth.uid() and gelesen_am is null and public.ist_aktiv()
$$;
revoke execute on function public.personal_dokument_gelesen(uuid) from public, anon;
grant execute on function public.personal_dokument_gelesen(uuid) to authenticated;

-- Speicher: <user_id>/<datei>, privat; nichts überschreiben (keine update-Policy)
insert into storage.buckets (id, name, public, file_size_limit)
values ('personal', 'personal', false, 20971520)
on conflict (id) do nothing;
create policy personal_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'personal' and (public.ist_chef()
    or (public.ist_aktiv() and (storage.foldername(name))[1] = auth.uid()::text)));
create policy personal_dateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'personal' and (public.ist_chef()
    or (public.ist_aktiv() and (storage.foldername(name))[1] = auth.uid()::text)));
create policy personal_dateien_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'personal' and (public.ist_chef()
    or ((storage.foldername(name))[1] = auth.uid()::text and owner = auth.uid())));

-- ── 5. Firmendokumente ──────────────────────────────────────────────────
create table public.firmen_dokumente (
  id uuid primary key default gen_random_uuid(),
  ordner text not null default 'Allgemein' check (btrim(ordner) <> ''),
  titel text not null check (btrim(titel) <> ''),
  beschreibung text,
  -- Zertifikate, Versicherungen, Prüfberichte: läuft ab
  gueltig_bis date,
  -- nur für den Chef (Verträge, Versicherungspolizzen)
  nur_chef boolean not null default false,
  pfad text not null unique,
  name text not null,
  mime text,
  groesse bigint,
  hochgeladen_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.firmen_dokumente (ordner, titel);

alter table public.firmen_dokumente enable row level security;
create policy firmen_dokumente_lesen on public.firmen_dokumente for select to authenticated
  using (public.ist_aktiv() and (not nur_chef or public.ist_chef()));
create policy firmen_dokumente_pflegen on public.firmen_dokumente for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

insert into storage.buckets (id, name, public, file_size_limit)
values ('firmen-dokumente', 'firmen-dokumente', false, 52428800)
on conflict (id) do nothing;
create policy firmen_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'firmen-dokumente' and (public.ist_chef()
    or (public.ist_aktiv() and name in (select d.pfad from public.firmen_dokumente d))));
create policy firmen_dateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'firmen-dokumente' and public.ist_chef());
create policy firmen_dateien_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'firmen-dokumente' and public.ist_chef());
