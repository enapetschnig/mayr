-- ============================================================================
--  Artikelsuche schnell auch mit dem ganzen Datanorm-Katalog (70.000+ Artikel)
--
--  Vorher prüfte artikel_suchen jeden Artikel einzeln (Text zusammengesetzt,
--  word_similarity) — ohne Treffer lief das bis in die Zeitgrenze. Jetzt:
--  ein gespeicherter Suchtext mit Trigramm-Index, jedes Wort ein eigenes
--  LIKE (der Index findet jedes Wortstück, auch in „Schukosteckdose“), und
--  nur wenn das zu wenig bringt, die unscharfe Suche (<% mit Index).
-- ============================================================================
alter table public.artikel add column suchtext text generated always as (
  lower(bezeichnung || ' ' || coalesce(hersteller, '') || ' ' || coalesce(hersteller_nr, '')
        || ' ' || coalesce(artikelnummer, '') || ' ' || coalesce(kategorie, '') || ' ' || coalesce(warengruppe, ''))
) stored;
create index artikel_suchtext_trgm on public.artikel using gin (suchtext extensions.gin_trgm_ops);
create index if not exists artikel_artikelnummer_idx on public.artikel (artikelnummer);

create or replace function public.artikel_suchen(p_q text, p_anzahl int default 30)
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
  if gefunden < least(n, 5) and length(q) >= 4 then
    return query
      select a.* from public.artikel a
       where a.aktiv and lower(q) <% a.suchtext
         -- was schon über die Wörter kam, nicht doppelt
         and exists (select 1 from unnest(woerter[1:6]) x where a.suchtext not like '%' || x || '%')
       order by word_similarity(lower(q), a.suchtext) desc limit n - gefunden;
  end if;
end $$;

grant execute on function public.artikel_suchen(text, int) to authenticated;
notify pgrst, 'reload schema';
