-- =====================================================================
--  Bestellungen beim Großhändler
-- =====================================================================
--
-- Bestellung = eine Bestellung bei einem Lieferanten (BE-2026-001), Ziel
-- ist ein Lagerort (Nachbestellen bis zum Mindestbestand) oder ein Projekt
-- (Material laut Angebot, Lieferung auf die Baustelle). Positionen sind
-- immer Artikel aus dem Stamm (Wareneingang braucht den Artikel).
--
-- Ablauf: entwurf → bestellt (PDF/CSV an den Großhändler) → beim
-- Wareneingang bucht die App material_buchungen (zugang ins Lager bzw.
-- direkt aufs Projekt) mit bestellposition_id. Die gelieferte Menge je
-- Position und der Status (teilgeliefert/geliefert) rechnet die Datenbank
-- aus diesen Buchungen — wird eine Buchung gelöscht, stimmt es wieder.
-- „erledigt“ = Rest kommt nicht mehr (von Hand), „storniert“ = nie geliefert.
--
-- Nur der Chef: Einkaufspreise und Bestellungen sind Büro-Sache.
-- =====================================================================

alter table public.nummernkreise drop constraint nummernkreise_typ_check;
alter table public.nummernkreise add constraint nummernkreise_typ_check
  check (typ in ('projekt','angebot','rechnung','regie','pruefung','bestellung'));

create or replace function public.naechste_nummer(p_typ text, p_datum date) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_jahr int := extract(year from coalesce(p_datum, current_date))::int;
  v_n int;
begin
  insert into public.nummernkreise as nk (typ, jahr, letzte)
  values (p_typ, v_jahr, 1)
  on conflict (typ, jahr) do update set letzte = nk.letzte + 1
  returning nk.letzte into v_n;

  return case p_typ
    when 'projekt' then v_jahr || '-' || lpad(v_n::text, 4, '0')
    when 'angebot' then 'AN-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'rechnung' then 'RE-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'regie' then 'RB-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'pruefung' then 'PR-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
    when 'bestellung' then 'BE-' || v_jahr || '-' || lpad(v_n::text, 3, '0')
  end;
end $$;
revoke execute on function public.naechste_nummer(text, date) from public, anon, authenticated;

create table public.bestellungen (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  lieferant text not null check (btrim(lieferant) <> ''),
  status text not null default 'entwurf'
    check (status in ('entwurf','bestellt','teilgeliefert','geliefert','erledigt','storniert')),
  datum date not null default current_date,
  bestellt_am timestamptz,
  liefertermin date,
  -- Ziel: Lager (zugang) oder Projekt (direkt auf die Baustelle)
  lagerort_id uuid references public.lagerorte(id) on delete restrict,
  projekt_id uuid references public.projekte(id) on delete restrict,
  -- Kundennummer beim Lieferanten, Ansprechpartner, Hinweise
  notiz text,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ein_ziel check (num_nonnulls(lagerort_id, projekt_id) = 1)
);
create index on public.bestellungen (status);
create index on public.bestellungen (projekt_id);
create trigger bestellungen_updated before update on public.bestellungen
  for each row execute function public.updated_at_setzen();

create function public.bestellung_nummer_vergeben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nummer := public.naechste_nummer('bestellung', new.datum);
  return new;
end $$;
create trigger bestellungen_nummer before insert on public.bestellungen
  for each row execute function public.bestellung_nummer_vergeben();

create table public.bestell_positionen (
  id uuid primary key default gen_random_uuid(),
  bestellung_id uuid not null references public.bestellungen(id) on delete cascade,
  pos int not null default 0,
  artikel_id uuid not null references public.artikel(id) on delete restrict,
  menge numeric(12,3) not null check (menge > 0),
  ek_preis numeric(12,4),
  -- Summe der Wareneingänge (material_buchungen) — rechnet die Datenbank
  geliefert numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);
create index on public.bestell_positionen (bestellung_id);
create index on public.bestell_positionen (artikel_id);

alter table public.material_buchungen
  add column bestellposition_id uuid references public.bestell_positionen(id) on delete restrict;
create index on public.material_buchungen (bestellposition_id);

-- ── Schutz: was nach dem Bestellen bleibt ───────────────────────────────
create function public.bestellung_schutz() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'entwurf' then
      raise exception 'Eine bestellte Bestellung kann nicht gelöscht werden — stornieren.';
    end if;
    return old;
  end if;
  if old.status <> 'entwurf' and new.status = 'entwurf' then
    raise exception 'Eine bestellte Bestellung wird nicht mehr zum Entwurf.';
  end if;
  if old.status <> 'entwurf' and (new.lieferant, new.lagerort_id, new.projekt_id)
       is distinct from (old.lieferant, old.lagerort_id, old.projekt_id) then
    raise exception 'Lieferant und Lieferziel stehen nach dem Bestellen fest.';
  end if;
  if new.status = 'storniert' and old.status <> 'storniert'
     and exists (select 1 from public.bestell_positionen where bestellung_id = new.id and geliefert <> 0) then
    raise exception 'Es ist schon etwas geliefert — „Rest kommt nicht mehr“ statt stornieren.';
  end if;
  if new.status <> 'entwurf' and old.status = 'entwurf' then
    if not exists (select 1 from public.bestell_positionen where bestellung_id = new.id) then
      raise exception 'Die Bestellung hat keine Positionen.';
    end if;
    new.bestellt_am := coalesce(new.bestellt_am, now());
  end if;
  return new;
end $$;
create trigger bestellungen_schutz before update or delete on public.bestellungen
  for each row execute function public.bestellung_schutz();

-- Positionen nur im Entwurf ändern; `geliefert` schreibt nur der Trigger
create function public.bestellpos_schutz() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from public.bestellungen
   where id = coalesce(new.bestellung_id, old.bestellung_id);
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'geliefert') = (to_jsonb(old) - 'geliefert') then
    if current_setting('mayr.geliefert', true) is distinct from 'ja' then
      raise exception 'Die gelieferte Menge kommt aus dem Wareneingang.';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.geliefert := 0;
  end if;
  -- Bestellung wird gerade gelöscht (cascade): Status ist dann schon weg
  if v_status is not null and v_status <> 'entwurf' then
    raise exception 'Die Bestellung ist schon bestellt — Positionen stehen fest.';
  end if;
  return coalesce(new, old);
end $$;
create trigger bestell_positionen_schutz before insert or update or delete on public.bestell_positionen
  for each row execute function public.bestellpos_schutz();

-- ── Wareneingang: gelieferte Menge und Status nachrechnen ───────────────
create function public.bestellung_nachrechnen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pos uuid;
  v_best uuid;
  v_status text;
  v_alle boolean;
  v_etwas boolean;
begin
  for v_pos in
    select distinct x from unnest(array[
      case when tg_op <> 'DELETE' then new.bestellposition_id end,
      case when tg_op <> 'INSERT' then old.bestellposition_id end]) x where x is not null
  loop
    perform set_config('mayr.geliefert', 'ja', true);
    update public.bestell_positionen p set geliefert = coalesce((
      select sum(m.menge) from public.material_buchungen m
       where m.bestellposition_id = v_pos and m.art in ('zugang','direkt')), 0)
     where p.id = v_pos
     returning p.bestellung_id into v_best;
    perform set_config('mayr.geliefert', '', true);

    select status into v_status from public.bestellungen where id = v_best;
    if v_status in ('bestellt','teilgeliefert','geliefert') then
      select bool_and(geliefert >= menge), bool_or(geliefert > 0) into v_alle, v_etwas
        from public.bestell_positionen where bestellung_id = v_best;
      update public.bestellungen
         set status = case when v_alle then 'geliefert' when v_etwas then 'teilgeliefert' else 'bestellt' end
       where id = v_best;
    end if;
  end loop;
  return null;
end $$;
create trigger material_bestellung after insert or update of bestellposition_id, menge, art or delete
  on public.material_buchungen for each row execute function public.bestellung_nachrechnen();

-- Wareneingang gegen eine Bestellung: nur der Chef, nur bestellte
-- Bestellungen, Artikel und Ziel passen zur Position.
create function public.material_bestellung_pruefen() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  if new.bestellposition_id is null
     or (tg_op = 'UPDATE' and new.bestellposition_id is not distinct from old.bestellposition_id) then
    return new;
  end if;
  if auth.uid() is not null and not public.ist_chef() then
    raise exception 'Wareneingang gegen eine Bestellung bucht der Chef.';
  end if;
  select p.artikel_id, b.status, b.projekt_id into v
    from public.bestell_positionen p join public.bestellungen b on b.id = p.bestellung_id
   where p.id = new.bestellposition_id;
  if v.status not in ('bestellt','teilgeliefert','geliefert') then
    raise exception 'Die Bestellung ist nicht offen.';
  end if;
  if new.artikel_id is distinct from v.artikel_id then
    raise exception 'Der Artikel passt nicht zur Bestellposition.';
  end if;
  if new.art not in ('zugang','direkt') or (new.art = 'direkt' and new.projekt_id is distinct from v.projekt_id) then
    raise exception 'Wareneingang einer Bestellung geht ins Lager oder aufs Projekt der Bestellung.';
  end if;
  return new;
end $$;
create trigger material_bestellung_pruefen before insert or update of bestellposition_id on public.material_buchungen
  for each row execute function public.material_bestellung_pruefen();

-- ── Rechte: nur der Chef ────────────────────────────────────────────────
alter table public.bestellungen enable row level security;
alter table public.bestell_positionen enable row level security;

create policy bestellungen_chef on public.bestellungen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy bestell_positionen_chef on public.bestell_positionen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

notify pgrst, 'reload schema';
