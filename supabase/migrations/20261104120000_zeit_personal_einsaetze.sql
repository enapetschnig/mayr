-- Phase 5 Zeit & Personal, Phase 6 Einsätze am Handy.

-- ── Stundenart ─────────────────────────────────────────────────────────
-- garantie = gearbeitet, aber nicht verrechenbar (Nacharbeit): zählt fürs
-- Zeitkonto, nie für die Rechnung und nie als „offen“.
alter table public.zeiten
  add column art text not null default 'arbeit' check (art in ('arbeit', 'fahrt', 'ue50', 'ue100', 'garantie')),
  add column km numeric(7,1) check (km is null or km >= 0);

create or replace view public.projekt_zahlen with (security_invoker = true) as
  select p.id as projekt_id,
    coalesce((select sum(z.stunden) from public.zeiten z where z.projekt_id = p.id), 0::numeric) as stunden,
    coalesce((select sum(z.stunden) from public.zeiten z where z.projekt_id = p.id and z.rechnung_id is null and z.art <> 'garantie'), 0::numeric) as stunden_offen,
    (select count(*) from public.regieberichte r where r.projekt_id = p.id and r.status = 'entwurf') as regie_entwurf,
    (select count(*) from public.regieberichte r where r.projekt_id = p.id and r.status = 'unterschrieben' and r.rechnung_id is null) as regie_offen,
    coalesce((select sum(case m.art when 'rueckgabe' then -m.menge else m.menge end * coalesce(m.ek_preis, 0::numeric))
      from public.material_buchungen m
      where m.projekt_id = p.id and m.rechnung_id is null and m.art = any (array['ausfassung', 'rueckgabe', 'direkt'])), 0::numeric) as material_offen_ek
  from public.projekte p;

-- ── Sollzeit und Konto je Mitarbeiter, Sätze für die Lohnverrechnung ────
alter table public.profiles
  add column wochenstunden numeric(4,1) not null default 38.5 check (wochenstunden >= 0 and wochenstunden <= 80),
  add column urlaub_tage numeric(4,1) not null default 25 check (urlaub_tage >= 0 and urlaub_tage <= 60),
  add column konto_ab date not null default current_date;

alter table public.firma
  add column taggeld_satz numeric(6,2) check (taggeld_satz is null or taggeld_satz >= 0),
  add column km_satz numeric(5,2) check (km_satz is null or km_satz >= 0);

create or replace function public.profil_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.ist_chef() then
    if new.rolle is distinct from old.rolle or new.aktiv is distinct from old.aktiv
       or new.gesperrt is distinct from old.gesperrt then
      raise exception 'Rolle und Freischaltung kann nur der Chef ändern.';
    end if;
    if new.lohnart is distinct from old.lohnart or new.wochenstunden is distinct from old.wochenstunden
       or new.urlaub_tage is distinct from old.urlaub_tage or new.konto_ab is distinct from old.konto_ab then
      raise exception 'Stundensatz, Sollzeit und Urlaubsanspruch kann nur der Chef ändern.';
    end if;
    if new.passwort_neu and not old.passwort_neu then
      raise exception 'Ein vorläufiges Passwort vergibt nur der Chef.';
    end if;
  end if;
  -- Freischalten hebt eine Sperre auf; gesperrt heißt immer auch nicht aktiv
  if new.aktiv and not old.aktiv then
    new.gesperrt := false;
  end if;
  if new.gesperrt and not old.gesperrt then
    new.aktiv := false;
  end if;
  if old.rolle = 'chef' and old.aktiv and (new.rolle <> 'chef' or not new.aktiv)
     and not exists (select 1 from public.profiles where id <> old.id and rolle = 'chef' and aktiv) then
    raise exception 'Es muss mindestens ein aktiver Chef bleiben.';
  end if;
  return new;
end $$;

-- ── Abwesenheiten ──────────────────────────────────────────────────────
-- Keine Zeitbuchung: das Zeitkonto rechnet genehmigte Abwesenheit mit der
-- Sollzeit des Tages. So landet Urlaub nie in einer Rechnung.
create table public.abwesenheiten (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  art text not null check (art in ('urlaub', 'krank', 'arzt', 'berufsschule', 'zeitausgleich', 'sonstiges')),
  von date not null,
  bis date not null,
  -- Nur ein Teil des Tages (Arzt 2 h), leer = ganzer Tag
  stunden numeric(4,2) check (stunden is null or (stunden > 0 and stunden <= 24)),
  notiz text,
  status text not null default 'beantragt' check (status in ('beantragt', 'genehmigt', 'abgelehnt')),
  entschieden_von uuid references public.profiles(id) on delete set null,
  entschieden_am timestamptz,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (bis >= von)
);
create index on public.abwesenheiten (user_id, von);
create index on public.abwesenheiten (von, bis);

create or replace function public.abwesenheit_regeln() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if public.ist_chef() then
    -- Der Chef trägt direkt ein: gilt sofort
    if tg_op = 'INSERT' and new.status = 'beantragt' then new.status := 'genehmigt'; end if;
    if new.status <> 'beantragt' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      new.entschieden_von := auth.uid();
      new.entschieden_am := now();
    end if;
    return new;
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'Abwesenheiten trägt jede und jeder nur für sich selbst ein.';
  end if;
  -- Krank ist eine Meldung, kein Antrag; alles andere entscheidet der Chef
  if tg_op = 'INSERT' then
    new.status := case when new.art = 'krank' then 'genehmigt' else 'beantragt' end;
    new.entschieden_von := null;
    new.entschieden_am := null;
  else
    if new.status is distinct from old.status then
      raise exception 'Genehmigen oder ablehnen kann nur der Chef.';
    end if;
  end if;
  return new;
end $$;
create trigger abwesenheiten_regeln before insert or update on public.abwesenheiten
  for each row execute function public.abwesenheit_regeln();

alter table public.abwesenheiten enable row level security;
-- Gründe sind Personaldaten: die anderen sehen über die Sicht unten nur „abwesend“
create policy abwesenheit_lesen on public.abwesenheiten for select to authenticated
  using (public.ist_aktiv() and (user_id = auth.uid() or public.ist_chef()));
create policy abwesenheit_anlegen on public.abwesenheiten for insert to authenticated
  with check (public.ist_aktiv());
create policy abwesenheit_aendern on public.abwesenheiten for update to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and user_id = auth.uid() and status = 'beantragt'))
  with check (public.ist_aktiv());
create policy abwesenheit_loeschen on public.abwesenheiten for delete to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and user_id = auth.uid() and status = 'beantragt'));

-- Für Kalender und Einteilung: genehmigt, Grund nur für einen selbst und den Chef
create view public.abwesenheit_kalender as
  select a.id, a.user_id, a.von, a.bis, a.stunden,
    case when a.user_id = auth.uid() or public.ist_chef() then a.art else 'abwesend' end as art
  from public.abwesenheiten a
  where a.status = 'genehmigt' and public.ist_aktiv();
grant select on public.abwesenheit_kalender to authenticated;

-- ── Kontobewegungen: Anfangsbestand, Auszahlung, Übertrag ──────────────
create table public.konto_buchungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  art text not null check (art in ('ueberstunden', 'urlaub')),
  datum date not null default current_date,
  -- Stunden bzw. Urlaubstage, mit Vorzeichen (Auszahlung negativ)
  menge numeric(7,2) not null check (menge <> 0),
  text text not null,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.konto_buchungen (user_id, datum);
alter table public.konto_buchungen enable row level security;
create policy konto_lesen on public.konto_buchungen for select to authenticated
  using (public.ist_aktiv() and (user_id = auth.uid() or public.ist_chef()));
create policy konto_anlegen on public.konto_buchungen for insert to authenticated with check (public.ist_chef());
create policy konto_aendern on public.konto_buchungen for update to authenticated using (public.ist_chef()) with check (public.ist_chef());
create policy konto_loeschen on public.konto_buchungen for delete to authenticated using (public.ist_chef());

-- ── Einsätze: ein Termin mit Status ────────────────────────────────────
alter table public.termine
  add column status text not null default 'geplant' check (status in ('geplant', 'begonnen', 'erledigt')),
  add column dringend boolean not null default false,
  add column begonnen_am timestamptz,
  add column erledigt_am timestamptz,
  add column erledigt_von uuid references public.profiles(id) on delete set null,
  add column geaendert_am timestamptz,
  add column geaendert_von uuid references public.profiles(id) on delete set null;

create or replace function public.termin_einsatz() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'geplant' then
      new.begonnen_am := null; new.erledigt_am := null; new.erledigt_von := null;
    elsif new.status = 'begonnen' then
      new.begonnen_am := coalesce(new.begonnen_am, now()); new.erledigt_am := null; new.erledigt_von := null;
    else
      new.begonnen_am := coalesce(new.begonnen_am, now()); new.erledigt_am := now(); new.erledigt_von := auth.uid();
    end if;
  end if;
  -- Wer eingeteilt ist, soll merken, wenn sich sein Termin ändert
  if (new.datum, new.bis_datum, new.von, new.bis, new.ort, new.mitarbeiter)
     is distinct from (old.datum, old.bis_datum, old.von, old.bis, old.ort, old.mitarbeiter) then
    new.geaendert_am := now();
    new.geaendert_von := auth.uid();
  end if;
  return new;
end $$;
create trigger termine_einsatz before update on public.termine
  for each row execute function public.termin_einsatz();
