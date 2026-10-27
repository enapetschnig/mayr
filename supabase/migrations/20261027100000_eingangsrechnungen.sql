-- =====================================================================
--  Eingangsrechnungen: Rechnungen von Großhändlern und Subunternehmern
-- =====================================================================
--
-- Der Chef fotografiert die Rechnung (oder lädt das PDF), trägt Lieferant und
-- Betrag ein und ordnet sie zu: ganz oder aufgeteilt auf Projekte
-- (eingang_anteile), der Rest ist Betrieb (Lager, Werkzeug, Büro).
--
-- Ein Anteil kann an den Kunden weiterverrechnet werden — wie Stunden und
-- Material an der Quelle: rechnung_id am Anteil, Position mit
-- quelle = {"eingang": [...]}. Verrechnete Anteile sind festgeschrieben,
-- Storno und gelöschte Positionen geben sie wieder frei.
--
-- Nur der Chef: Einkaufspreise gehen Monteure nichts an.
-- =====================================================================

create table public.eingangsrechnungen (
  id uuid primary key default gen_random_uuid(),
  lieferant text not null check (btrim(lieferant) <> ''),
  -- Rechnungsnummer des Lieferanten
  nummer text,
  datum date not null default current_date,
  faellig_am date,
  netto numeric(12,2) not null default 0,
  ust_satz numeric(5,2) not null default 20,
  ust numeric(12,2) not null default 0,
  brutto numeric(12,2) not null default 0,
  kategorie text not null default 'material'
    check (kategorie in ('material','fremdleistung','werkzeug','fahrzeug','buero','sonstiges')),
  -- Was nicht auf Projekte verteilt ist, gehört dem Betrieb — erledigt
  betrieb boolean not null default false,
  bezahlt_am date,
  -- Foto oder PDF im Bucket „eingangsrechnungen“
  datei_pfad text,
  datei_name text,
  datei_mime text,
  notiz text,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.eingangsrechnungen (datum desc);
create index on public.eingangsrechnungen (lieferant);

create table public.eingang_anteile (
  id uuid primary key default gen_random_uuid(),
  eingangsrechnung_id uuid not null references public.eingangsrechnungen(id) on delete cascade,
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  -- netto, Einkauf
  betrag numeric(12,2) not null check (betrag <> 0),
  text text,
  rechnung_id uuid references public.belege(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.eingang_anteile (eingangsrechnung_id);
create index on public.eingang_anteile (projekt_id);
create index on public.eingang_anteile (rechnung_id);

create trigger eingangsrechnungen_updated_at before update on public.eingangsrechnungen
  for each row execute function public.updated_at_setzen();

-- Verrechnet = festgeschrieben: nur die Verrechnung selbst darf sich ändern
create function public.eingang_anteil_schutz() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.rechnung_id is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Schon an den Kunden verrechnet — kann nicht mehr gelöscht werden.';
  end if;
  if (to_jsonb(new) - 'rechnung_id') is distinct from (to_jsonb(old) - 'rechnung_id') then
    raise exception 'Schon an den Kunden verrechnet — kann nicht mehr geändert werden.';
  end if;
  return new;
end $$;
create trigger eingang_anteile_schutz before update or delete on public.eingang_anteile
  for each row execute function public.eingang_anteil_schutz();

-- Position gelöscht (auch: Entwurf gelöscht) → Anteile wieder frei
create function public.eingang_freigeben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.quelle is null or old.quelle->'eingang' is null then return old; end if;
  update public.eingang_anteile set rechnung_id = null
   where rechnung_id = old.beleg_id
     and id in (select x::uuid from jsonb_array_elements_text(old.quelle->'eingang') x);
  return old;
end $$;
create trigger positionen_eingang_freigeben after delete on public.beleg_positionen
  for each row execute function public.eingang_freigeben();

-- Rechnung storniert → Anteile wieder frei (wie Stunden und Material in beleg_stornieren)
create function public.eingang_storno_freigeben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.eingang_anteile set rechnung_id = null where rechnung_id = new.id;
  return new;
end $$;
create trigger belege_eingang_storno after update of status on public.belege
  for each row when (new.status = 'storniert' and old.status is distinct from 'storniert')
  execute function public.eingang_storno_freigeben();

revoke execute on function public.eingang_freigeben(), public.eingang_storno_freigeben() from public, anon;

-- ── Rechte: nur der Chef ────────────────────────────────────────────────
alter table public.eingangsrechnungen enable row level security;
alter table public.eingang_anteile enable row level security;

create policy eingang_chef on public.eingangsrechnungen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy eingang_anteile_chef on public.eingang_anteile for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

-- ── Speicher ────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('eingangsrechnungen', 'eingangsrechnungen', false)
on conflict (id) do nothing;

create policy eingangsrechnungen_lesen on storage.objects for select to authenticated
  using (bucket_id = 'eingangsrechnungen' and public.ist_chef());
create policy eingangsrechnungen_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'eingangsrechnungen' and public.ist_chef());
create policy eingangsrechnungen_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'eingangsrechnungen' and public.ist_chef());

notify pgrst, 'reload schema';
