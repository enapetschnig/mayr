-- ============================================================================
--  Rabattkonditionen und Artikelsuche nach Lieferant / Hersteller
--
--  rabatte: je Lieferant ein Grundrabatt, dazu genauere für einen Hersteller
--  oder eine Rabattgruppe (aus der Datanorm). Der genaueste gewinnt:
--  Rabattgruppe vor Hersteller vor Grundrabatt.
--  rabatte_anwenden(lieferant) rechnet den Einkauf aller Artikel mit
--  Listenpreis neu: EK = Listenpreis × (1 − Rabatt). Artikel ohne passende
--  Kondition behalten ihren EK.
--
--  artikel_suchen bekommt p_lieferant / p_hersteller — gefiltert wird in der
--  Datenbank, nicht in den besten 200 Treffern.
-- ============================================================================
update public.artikel set hersteller = 'Dehn' where hersteller = 'DEHN';

create table public.rabatte (
  id uuid primary key default gen_random_uuid(),
  lieferant text not null,
  hersteller text,
  rabattgruppe text,
  rabatt numeric(5,2) not null check (rabatt > -100 and rabatt < 100),
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rabatte_eindeutig on public.rabatte (lieferant, coalesce(hersteller, ''), coalesce(rabattgruppe, ''));
alter table public.rabatte enable row level security;
-- Einkaufskonditionen sieht und pflegt nur der Chef
create policy rabatte_chef on public.rabatte for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));

create or replace function public.rabatte_anwenden(p_lieferant text, p_max int default 2000)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if auth.uid() is not null and not public.ist_chef() then raise exception 'Nur der Chef' using errcode = '42501'; end if;
  -- EK auf 4 Stellen wie in der Datanorm (Kleinteile kosten Bruchteile von Cent). Höchstens p_max Artikel je Aufruf (die App ruft, bis 0 zurückkommt) — sonst Zeitgrenze
  update public.artikel a
     set ek_preis = s.ek, updated_at = now()
    from (
      select t.id, t.ek from (
        select b.id, b.ek_preis, round(b.listenpreis * (1 - (
          select x.rabatt from public.rabatte x
           where x.lieferant = b.lieferant
             and (x.rabattgruppe is null or x.rabattgruppe = b.rabattgruppe)
             and (x.hersteller is null or x.hersteller = b.hersteller)
           order by (x.rabattgruppe is not null) desc, (x.hersteller is not null) desc
           limit 1) / 100), 4) as ek
          from public.artikel b
         where b.lieferant = p_lieferant and b.listenpreis is not null
      ) t
      where t.ek is not null and t.ek_preis is distinct from t.ek
      limit greatest(1, least(coalesce(p_max, 2000), 5000))
    ) s
   where a.id = s.id;
  get diagnostics n = row_count;
  return n;
end $$;
drop function if exists public.rabatte_anwenden(text);
revoke all on function public.rabatte_anwenden(text, int) from public, anon;
grant execute on function public.rabatte_anwenden(text, int) to authenticated;

-- Hersteller und Rabattgruppen mit Anzahl — für Filter und Rabatt-Auswahl
create or replace function public.artikel_gruppen(p_lieferant text default null)
returns table (hersteller text, rabattgruppe text, anzahl bigint)
language sql stable set search_path = public as $$
  select a.hersteller, a.rabattgruppe, count(*)
    from public.artikel a
   where a.aktiv and (p_lieferant is null or a.lieferant = p_lieferant)
   group by 1, 2
$$;
grant execute on function public.artikel_gruppen(text) to authenticated;

create index if not exists artikel_hersteller_idx on public.artikel (hersteller);

drop function public.artikel_suchen(text, int, boolean);
create or replace function public.artikel_suchen(
  p_q text, p_anzahl int default 30, p_unscharf boolean default true,
  p_lieferant text default null, p_hersteller text default null
)
returns setof public.artikel
language plpgsql stable set search_path = public, extensions as $$
declare
  q text := btrim(coalesce(p_q, ''));
  woerter text[] := array_remove(regexp_split_to_array(lower(q), '\s+'), '');
  n int := greatest(1, least(coalesce(p_anzahl, 30), 200));
  bedingung text := '';
  w text;
  gefunden int;
  dazu int;
begin
  if q = '' then return; end if;
  -- genaue Treffer (Strichcode, Artikelnummer, Hersteller-Nr.) zuerst
  return query
    select a.* from public.artikel a
     where a.aktiv and (a.ean = q or a.artikelnummer = q or a.hersteller_nr = q)
       and (p_lieferant is null or a.lieferant = p_lieferant)
       and (p_hersteller is null or a.hersteller is not distinct from nullif(p_hersteller, '-'))
     order by a.lagerartikel desc, a.bezeichnung limit n;
  get diagnostics gefunden = row_count;
  if gefunden >= n then return; end if;

  -- jedes Wort muss vorkommen (höchstens 6, %/_ im Suchtext wörtlich)
  foreach w in array woerter[1:6] loop
    bedingung := bedingung || format(' and a.suchtext like %L',
      '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%');
  end loop;
  return query execute format(
    'select a.* from public.artikel a where a.aktiv %s
       and ($4::text is null or a.lieferant = $4)
       and ($5::text is null or a.hersteller is not distinct from nullif($5, ''-''))
       and not (a.ean is not distinct from $1 or a.artikelnummer is not distinct from $1 or a.hersteller_nr is not distinct from $1)
     order by a.lagerartikel desc, word_similarity($2, a.suchtext) desc, length(a.bezeichnung), a.bezeichnung
     limit $3', bedingung)
    using q, lower(q), n - gefunden, p_lieferant, p_hersteller;
  get diagnostics dazu = row_count;
  gefunden := gefunden + dazu;

  -- Tippfehler: unscharf, nur wenn noch Platz ist
  if p_unscharf and gefunden < least(n, 5) and length(q) >= 4 then
    return query
      select a.* from public.artikel a
       where a.aktiv and lower(q) <% a.suchtext
         and (p_lieferant is null or a.lieferant = p_lieferant)
         and (p_hersteller is null or a.hersteller is not distinct from nullif(p_hersteller, '-'))
         -- was schon über die Wörter kam, nicht doppelt
         and exists (select 1 from unnest(woerter[1:6]) x where a.suchtext not like '%' || x || '%')
       order by word_similarity(lower(q), a.suchtext) desc limit n - gefunden;
  end if;
end $$;
grant execute on function public.artikel_suchen(text, int, boolean, text, text) to authenticated;
notify pgrst, 'reload schema';
