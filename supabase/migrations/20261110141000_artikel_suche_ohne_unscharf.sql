-- ============================================================================
--  Artikelsuche: unscharfe Suche abschaltbar
--
--  Die KI fragt für einen Materialvorschlag dutzende Suchtexte auf einmal ab;
--  die Tippfehler-Suche (<%) kostet je Aufruf über eine Sekunde und bringt
--  der KI nichts (sie sucht ohnehin mit mehreren Begriffen).
-- ============================================================================
drop function public.artikel_suchen(text, int);

create or replace function public.artikel_suchen(p_q text, p_anzahl int default 30, p_unscharf boolean default true)
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
       and not (a.ean is not distinct from $1 or a.artikelnummer is not distinct from $1 or a.hersteller_nr is not distinct from $1)
     order by a.lagerartikel desc, word_similarity($2, a.suchtext) desc, length(a.bezeichnung), a.bezeichnung
     limit $3', bedingung)
    using q, lower(q), n - gefunden;
  get diagnostics dazu = row_count;
  gefunden := gefunden + dazu;

  -- Tippfehler: unscharf, nur wenn noch Platz ist
  if p_unscharf and gefunden < least(n, 5) and length(q) >= 4 then
    return query
      select a.* from public.artikel a
       where a.aktiv and lower(q) <% a.suchtext
         -- was schon über die Wörter kam, nicht doppelt
         and exists (select 1 from unnest(woerter[1:6]) x where a.suchtext not like '%' || x || '%')
       order by word_similarity(lower(q), a.suchtext) desc limit n - gefunden;
  end if;
end $$;

grant execute on function public.artikel_suchen(text, int, boolean) to authenticated;
notify pgrst, 'reload schema';
