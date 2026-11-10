-- ============================================================================
--  Fuhrpark (Busse, Steiger, Maschinen, Messgeräte), Teams und die Plantafel
--
--  Ein Einsatz (termine) bekommt ein Team und die Fahrzeuge/Geräte, die er
--  braucht. Die Plantafel zeigt dieselben Termine je Team, je Person und je
--  Fahrzeug — eingeteilt wird durch Ziehen. Der Monteur sieht am Handy wie
--  bisher seinen Einsatz, jetzt mit Bus und Steiger.
-- ============================================================================

-- ── Fahrzeuge und Geräte ─────────────────────────────────────────────────
create table public.fahrzeuge (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  art text not null default 'bus'
    check (art in ('bus', 'pkw', 'steiger', 'anhaenger', 'maschine', 'messgeraet')),
  kennzeichen text,
  -- Marke und Typ, z. B. „VW Crafter 35“ oder „Genie Z-45“
  typ text,
  baujahr int check (baujahr between 1950 and 2100),
  km_stand int check (km_stand >= 0),
  -- Fällig: §57a-Pickerl, Service, Prüfung (Steiger: jährliche Prüfung, Messgerät: Kalibrierung)
  pickerl_bis date,
  service_bis date,
  pruefung_bis date,
  -- Der Bus ist auch ein Lager: sein Bestand steht unter diesem Lagerort
  lagerort_id uuid references public.lagerorte(id) on delete set null,
  -- Gemietet (Steiger vom Verleih): erscheint auf der Plantafel, kein Service
  gemietet boolean not null default false,
  notiz text,
  aktiv boolean not null default true,
  reihenfolge int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bordbuch: Service, Reparatur, Prüfung, Schaden — Schäden meldet der Monteur am Handy
create table public.fahrzeug_eintraege (
  id uuid primary key default gen_random_uuid(),
  fahrzeug_id uuid not null references public.fahrzeuge(id) on delete cascade,
  datum date not null default current_date,
  art text not null default 'service' check (art in ('service', 'reparatur', 'pruefung', 'schaden', 'tanken', 'sonstiges')),
  text text not null check (btrim(text) <> ''),
  km int check (km >= 0),
  kosten numeric(12,2) check (kosten >= 0),
  erledigt boolean not null default true,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.fahrzeug_eintraege (fahrzeug_id, datum desc);

-- ── Teams ────────────────────────────────────────────────────────────────
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- Farbe auf der Plantafel (Name aus der App-Palette, z. B. „blau“)
  farbe text not null default 'blau',
  leiter_id uuid references public.profiles(id) on delete set null,
  mitglieder uuid[] not null default '{}',
  -- der Bus, mit dem das Team normalerweise fährt
  fahrzeug_id uuid references public.fahrzeuge(id) on delete set null,
  aktiv boolean not null default true,
  reihenfolge int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Einsätze bekommen Team und Fahrzeuge ─────────────────────────────────
alter table public.termine
  add column team_id uuid references public.teams(id) on delete set null,
  add column fahrzeuge uuid[] not null default '{}';
create index on public.termine using gin (fahrzeuge);
create index on public.termine using gin (mitarbeiter);

-- Wer eingeteilt ist, merkt auch, wenn sich Bus oder Steiger ändern
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
  if (new.datum, new.bis_datum, new.von, new.bis, new.ort, new.mitarbeiter, new.fahrzeuge)
     is distinct from (old.datum, old.bis_datum, old.von, old.bis, old.ort, old.mitarbeiter, old.fahrzeuge) then
    new.geaendert_am := now();
    new.geaendert_von := auth.uid();
  end if;
  return new;
end $$;

create or replace function public.fahrzeug_geaendert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger fahrzeuge_geaendert before update on public.fahrzeuge
  for each row execute function public.fahrzeug_geaendert();

-- ── Rechte: alle Aktiven sehen, der Chef pflegt; Schäden meldet jede:r ───
alter table public.fahrzeuge enable row level security;
alter table public.fahrzeug_eintraege enable row level security;
alter table public.teams enable row level security;

create policy fahrzeuge_lesen on public.fahrzeuge for select to authenticated using (public.ist_aktiv());
create policy fahrzeuge_pflegen on public.fahrzeuge for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

create policy fz_eintraege_lesen on public.fahrzeug_eintraege for select to authenticated using (public.ist_aktiv());
create policy fz_eintraege_anlegen on public.fahrzeug_eintraege for insert to authenticated
  with check (public.ist_chef() or (public.ist_aktiv() and erstellt_von = auth.uid() and art in ('schaden', 'tanken')));
create policy fz_eintraege_aendern on public.fahrzeug_eintraege for update to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy fz_eintraege_loeschen on public.fahrzeug_eintraege for delete to authenticated using (public.ist_chef());

create policy teams_lesen on public.teams for select to authenticated using (public.ist_aktiv());
create policy teams_pflegen on public.teams for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
