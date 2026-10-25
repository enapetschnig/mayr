-- =====================================================================
--  Strichcode → Artikel eindeutig, Artikelsuche richtig sortiert
-- =====================================================================
--
-- Funktionstest 25.10.2026 (Material, Lager, Artikel):
--
-- 1. artikel_zu_code: Haben zwei Artikel dieselbe EAN (zwei Lieferanten
--    führen dieselbe Ware, ein Import bringt sie ein zweites Mal), lieferte
--    „limit 1“ ohne Reihenfolge mal den einen, mal den anderen. Jetzt fest:
--    ein gelernter Zusatzcode vor der EAN, dann der Lagerartikel, dann der
--    ältere Artikel.
-- 2. artikel_zu_code: Ein inaktiver Artikel kam über seinen Zusatzcode
--    weiter in die Buchungen, über seine EAN aber nicht. Jetzt keiner.
-- 3. artikel_suchen: „(a.ean = q) desc“ ist bei Artikeln ohne EAN NULL —
--    und NULL steht bei desc vorne, vor allen Lagerartikeln.
-- 4. artikel_suchen: „%“ und „_“ im Suchtext waren Platzhalter („%“ fand
--    50 beliebige Artikel). Jetzt sucht man genau diese Zeichen.
--
-- Beide Funktionen laufen weiter mit den Rechten des Abfragenden (RLS).
-- =====================================================================

create or replace function public.artikel_zu_code(p_code text)
returns table (artikel_id uuid, menge numeric)
language sql stable set search_path = public as $$
  select t.artikel_id, t.menge
  from (
    select c.artikel_id, c.menge, 0 as rang, a.lagerartikel, a.created_at
      from public.artikel_codes c
      join public.artikel a on a.id = c.artikel_id
     where c.code = btrim(p_code) and a.aktiv
    union all
    select a.id, 1::numeric, 1, a.lagerartikel, a.created_at
      from public.artikel a
     where a.ean = btrim(p_code) and a.aktiv
  ) t
  order by t.rang, t.lagerartikel desc, t.created_at, t.artikel_id
  limit 1
$$;

create or replace function public.artikel_suchen(p_q text, p_anzahl int default 30)
returns setof public.artikel
language sql stable set search_path = public, extensions as $$
  with w as (
    select btrim(coalesce(p_q, '')) as q,
           array_remove(regexp_split_to_array(lower(btrim(coalesce(p_q, ''))), '\s+'), '') as woerter
  )
  select a.*
  from public.artikel a, w
  where a.aktiv
    and (
      a.ean = w.q
      or a.artikelnummer = w.q
      or lower(a.hersteller_nr) = lower(w.q)
      or not exists (
        select 1 from unnest(w.woerter) x
        where lower(a.bezeichnung || ' ' || coalesce(a.hersteller, '') || ' ' || coalesce(a.hersteller_nr, '')
                    || ' ' || coalesce(a.artikelnummer, '') || ' ' || coalesce(a.kategorie, ''))
              not like '%' || replace(replace(replace(x, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
      or (length(w.q) >= 4 and word_similarity(lower(w.q), lower(a.bezeichnung)) > 0.5)
    )
  order by coalesce(a.ean = w.q, false) desc, a.lagerartikel desc,
           word_similarity(lower(w.q), lower(a.bezeichnung)) desc, a.bezeichnung
  limit greatest(1, least(p_anzahl, 200))
$$;

grant execute on function public.artikel_suchen(text, int), public.artikel_zu_code(text) to authenticated;
