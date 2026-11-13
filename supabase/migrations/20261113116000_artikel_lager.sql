-- ============================================================================
--  Artikel und Lager (SETEC, Paket F)
--  · eigener Aufschlag je Artikel (VK fest > Aufschlag Artikel > Betrieb)
--  · Bilder und Datenblätter am Artikel (artikel_dateien, Speicher projekt-dateien/artikel/…)
--  · weitere Lieferanten je Artikel mit eigenem Preis (artikel_lieferanten)
--  · Lagerplatz je Artikel und Lagerort („Regal 3, Fach B“)
--  · Wareneingang aus einem Lieferschein — genau einmal (lieferschein_einbuchen)
--  · Material laut Angebot fürs Ausfassen, auch für Monteure (angebot_material)
-- ============================================================================

-- ── VK je Artikel ───────────────────────────────────────────────────────────
-- leer = Materialaufschlag des Betriebs; ein fester VK (vk_preis) geht vor
alter table public.artikel add column if not exists aufschlag numeric
  check (aufschlag is null or (aufschlag >= -100 and aufschlag <= 1000));

-- Massenänderung je Kategorie/Hersteller/Lieferant in Häppchen (Statement-Timeout
-- bei ~72.000 Datanorm-Artikeln): die App ruft so lange auf, bis 0 zurückkommt.
create or replace function public.artikel_aufschlag_setzen(
  p_aufschlag numeric, p_kategorie text default null, p_hersteller text default null,
  p_lieferant text default null, p_max integer default 3000)
returns integer
language plpgsql security invoker set search_path = public
as $$
declare n integer;
begin
  if not public.ist_chef() then raise exception 'Aufschläge ändert nur der Chef'; end if;
  if p_kategorie is null and p_hersteller is null and p_lieferant is null then
    raise exception 'Kategorie, Hersteller oder Lieferant angeben';
  end if;
  update public.artikel set aufschlag = p_aufschlag
   where id in (
     select id from public.artikel
      where aktiv
        and (p_kategorie is null or kategorie = p_kategorie)
        and (p_hersteller is null or hersteller = p_hersteller)
        and (p_lieferant is null or lieferant = p_lieferant)
        and aufschlag is distinct from p_aufschlag
      limit greatest(1, least(coalesce(p_max, 3000), 5000)));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.artikel_aufschlag_setzen(numeric, text, text, text, integer) from public, anon;
grant execute on function public.artikel_aufschlag_setzen(numeric, text, text, text, integer) to authenticated;

-- ── Dateien am Artikel ──────────────────────────────────────────────────────
-- pfad im Bucket „projekt-dateien“, immer unter artikel/<artikel_id>/…
-- Hauptbild = das älteste Bild. Paket E (Datenblätter am Angebot) liest diese Tabelle.
create table if not exists public.artikel_dateien (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.artikel on delete cascade,
  art text not null check (art in ('bild', 'datenblatt')),
  pfad text not null,
  name text,
  created_at timestamptz not null default now()
);
create index if not exists artikel_dateien_artikel_idx on public.artikel_dateien (artikel_id, art, created_at);
alter table public.artikel_dateien enable row level security;
create policy artikel_dateien_lesen on public.artikel_dateien for select to authenticated using ((select public.ist_aktiv()));
create policy artikel_dateien_pflegen on public.artikel_dateien for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()) and pfad like 'artikel/' || artikel_id || '/%');

-- ── Weitere Lieferanten ─────────────────────────────────────────────────────
-- Der Lieferant am Artikel (artikel.lieferant, .ek_preis) bleibt der Hauptlieferant
-- und der EK der Kalkulation. Hier stehen die anderen mit ihren Preisen.
-- Lieferant = Name wie in artikel.lieferant, rabatte.lieferant, bestellungen.lieferant.
create table if not exists public.artikel_lieferanten (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.artikel on delete cascade,
  lieferant text not null check (btrim(lieferant) <> ''),
  lieferanten_nr text,
  listenpreis numeric check (listenpreis is null or listenpreis >= 0),
  rabatt numeric check (rabatt is null or (rabatt >= 0 and rabatt <= 100)),
  ek_preis numeric check (ek_preis is null or ek_preis >= 0),
  lieferzeit_tage integer check (lieferzeit_tage is null or (lieferzeit_tage >= 0 and lieferzeit_tage <= 365)),
  bevorzugt boolean not null default false,
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artikel_id, lieferant)
);
-- höchstens ein bevorzugter je Artikel
create unique index if not exists artikel_lieferanten_bevorzugt on public.artikel_lieferanten (artikel_id) where bevorzugt;
create index if not exists artikel_lieferanten_nr_idx on public.artikel_lieferanten (lieferanten_nr);
create index if not exists artikel_lieferanten_lieferant_idx on public.artikel_lieferanten (lieferant);
create trigger artikel_lieferanten_updated before update on public.artikel_lieferanten
  for each row execute function public.updated_at_setzen();
alter table public.artikel_lieferanten enable row level security;
-- Einkaufspreise: nur der Chef
create policy artikel_lieferanten_chef on public.artikel_lieferanten for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));

-- ── Lagerplatz ──────────────────────────────────────────────────────────────
create table if not exists public.artikel_lagerplaetze (
  artikel_id uuid not null references public.artikel on delete cascade,
  lagerort_id uuid not null references public.lagerorte on delete cascade,
  platz text not null check (btrim(platz) <> '' and length(platz) <= 60),
  updated_at timestamptz not null default now(),
  primary key (artikel_id, lagerort_id)
);
create index if not exists artikel_lagerplaetze_ort_idx on public.artikel_lagerplaetze (lagerort_id);
create trigger artikel_lagerplaetze_updated before update on public.artikel_lagerplaetze
  for each row execute function public.updated_at_setzen();
alter table public.artikel_lagerplaetze enable row level security;
create policy lagerplaetze_lesen on public.artikel_lagerplaetze for select to authenticated using ((select public.ist_aktiv()));
-- Chef überall, ein Monteur in seinem eigenen Bus
create policy lagerplaetze_pflegen on public.artikel_lagerplaetze for all to authenticated
  using ((select public.ist_chef()) or ((select public.ist_aktiv()) and exists (
    select 1 from public.lagerorte o where o.id = lagerort_id and o.user_id = (select auth.uid()))))
  with check ((select public.ist_chef()) or ((select public.ist_aktiv()) and exists (
    select 1 from public.lagerorte o where o.id = lagerort_id and o.user_id = (select auth.uid()))));

-- ── Wareneingang aus dem Lieferschein ───────────────────────────────────────
alter table public.lieferscheine add column if not exists eingebucht_am timestamptz;
alter table public.lieferscheine add column if not exists eingebucht_von uuid references public.profiles on delete set null;
alter table public.material_buchungen add column if not exists lieferschein_id uuid references public.lieferscheine on delete set null;
create index if not exists material_buchungen_lieferschein_idx on public.material_buchungen (lieferschein_id) where lieferschein_id is not null;
-- Bewegungen eines Artikels nach Zeit
create index if not exists material_buchungen_artikel_zeit_idx on public.material_buchungen (artikel_id, created_at desc);

-- Eingebucht bleibt eingebucht — ein Monteur darf seinen Lieferschein sonst ändern
create or replace function public.lieferschein_eingebucht_schutz()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.eingebucht_am is not null and not public.ist_chef() then
      raise exception 'Lieferschein ist schon eingebucht';
    end if;
    return old;
  end if;
  if (new.eingebucht_am is distinct from old.eingebucht_am or new.eingebucht_von is distinct from old.eingebucht_von)
     and not public.ist_chef() then
    raise exception 'Einbuchen nur durch den Chef';
  end if;
  return new;
end $$;
drop trigger if exists lieferschein_eingebucht_schutz on public.lieferscheine;
create trigger lieferschein_eingebucht_schutz before update or delete on public.lieferscheine
  for each row execute function public.lieferschein_eingebucht_schutz();

/*
  Lieferschein einbuchen — alles oder nichts, genau einmal.
  p_zeilen: [{art: 'zugang'|'direkt', artikel_id, menge, lagerort_id, projekt_id, ek_preis, bestellposition_id}]
  Die Regeln der Buchungen (Lagerort/Projekt passend, nur „In Arbeit“, Bestellung passt)
  prüfen die vorhandenen Trigger und Checks.
*/
create or replace function public.lieferschein_einbuchen(p_lieferschein uuid, p_zeilen jsonb)
returns integer
language plpgsql security invoker set search_path = public
as $$
declare
  ls public.lieferscheine;
  n integer;
  v_vorgang uuid := gen_random_uuid();
begin
  if not public.ist_chef() then raise exception 'Einbuchen nur durch den Chef'; end if;
  select * into ls from public.lieferscheine where id = p_lieferschein for update;
  if not found then raise exception 'Lieferschein nicht gefunden'; end if;
  if ls.eingebucht_am is not null or exists (select 1 from public.material_buchungen where lieferschein_id = p_lieferschein) then
    raise exception 'Lieferschein ist schon eingebucht';
  end if;
  if jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) = 0 then
    raise exception 'Nichts zum Einbuchen';
  end if;
  insert into public.material_buchungen
    (art, artikel_id, menge, lagerort_id, projekt_id, ek_preis, bestellposition_id, vorgang, notiz, lieferschein_id, user_id)
  select z.art, z.artikel_id, z.menge, z.lagerort_id, z.projekt_id, z.ek_preis, z.bestellposition_id, v_vorgang,
         concat_ws(' · ', 'Lieferschein ' || coalesce(nullif(ls.nummer, ''), 'ohne Nummer'), nullif(ls.lieferant, '')),
         p_lieferschein, auth.uid()
    from jsonb_to_recordset(p_zeilen) as z(art text, artikel_id uuid, menge numeric, lagerort_id uuid, projekt_id uuid,
                                           ek_preis numeric, bestellposition_id uuid)
   where z.art in ('zugang', 'direkt');
  get diagnostics n = row_count;
  if n <> jsonb_array_length(p_zeilen) then raise exception 'Art der Buchung muss zugang oder direkt sein'; end if;
  update public.lieferscheine set eingebucht_am = now(), eingebucht_von = auth.uid() where id = p_lieferschein;
  return n;
end $$;
revoke all on function public.lieferschein_einbuchen(uuid, jsonb) from public, anon;
grant execute on function public.lieferschein_einbuchen(uuid, jsonb) to authenticated;

-- ── Material laut Angebot (Ausfassen) ───────────────────────────────────────
-- Monteure sehen keine Belege (RLS). Für die Vorschlagsliste beim Ausfassen
-- reichen Art, Menge, Artikel und Leistung — ohne Preise.
-- Angebot: angenommen vor offen, das neueste.
create or replace function public.angebot_material(p_projekt uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with a as (
    select b.id, b.nummer, b.status from public.belege b
     where b.projekt_id = p_projekt and b.typ = 'angebot' and b.status in ('angenommen', 'offen')
     order by case b.status when 'angenommen' then 0 else 1 end, b.created_at desc
     limit 1
  )
  select case when not public.ist_aktiv() or not exists (select 1 from a) then null else jsonb_build_object(
    'angebot', (select coalesce(a.nummer, 'Entwurf') from a),
    'status', (select a.status from a),
    'positionen', coalesce((
      select jsonb_agg(jsonb_build_object('art', p.art, 'menge', p.menge, 'artikel_id', p.artikel_id, 'leistung_id', p.leistung_id))
        from public.beleg_positionen p where p.beleg_id = (select a.id from a)), '[]'::jsonb),
    'leistung_material', coalesce((
      select jsonb_agg(jsonb_build_object('leistung_id', lm.leistung_id, 'artikel_id', lm.artikel_id, 'menge', lm.menge))
        from public.leistung_material lm
       where lm.leistung_id in (select p.leistung_id from public.beleg_positionen p where p.beleg_id = (select a.id from a))), '[]'::jsonb)
  ) end
$$;
revoke all on function public.angebot_material(uuid) from public, anon;
grant execute on function public.angebot_material(uuid) to authenticated;
