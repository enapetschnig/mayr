-- =====================================================================
--  Kontakte: Kunden, Lieferanten, Partner · PV-Anlagendaten · Karte
-- =====================================================================
--
-- Lieferanten waren bisher nur freier Text an Eingangsrechnung, Lieferschein,
-- Bestellung, Rabatt und Artikel. Statt einer dritten Liste werden sie
-- Kontakte in der Tabelle `kunden` mit `art = 'lieferant'` (dazu `partner`
-- für Subunternehmer, Planer …). Der freie Text bleibt, wie er ist — die
-- Belege eines Lieferanten findet `kontakt_belege` über den Namen und die
-- weiteren Schreibweisen in `namen` („Sonepar Österreich GmbH“ = „Sonepar“),
-- ohne Groß-/Kleinschreibung und doppelte Leerzeichen. So bleiben
-- Eingangsrechnungen, SEPA, Bestellungen, Rabatte und Kreditorennummern
-- (`kreditor_konten`, Schlüssel = Name klein) unverändert.
--
-- PV-Anlagendaten hängen an der vorhandenen Anlage (`anlagen`, Art „pv“) —
-- ein Kunde kann mehrere Anlagen/Standorte haben, Prüfung und QR-Aufkleber
-- gibt es dazu geschenkt.
--
-- Karte: Koordinaten einmal per Nominatim aus der Adresse (die App fragt
-- höchstens 1×/s), gespeichert mit der Adresse, zu der sie gehören
-- (`geo_adresse`) — erst eine geänderte Adresse wird neu gesucht. Nicht
-- gefunden = lat/lng leer, geo_adresse gesetzt (nicht jedes Mal neu fragen).
-- =====================================================================

alter table public.kunden
  add column art text not null default 'kunde' check (art in ('kunde', 'lieferant', 'partner')),
  -- weitere Schreibweisen des Namens auf Belegen (Lieferanten)
  add column namen text[] not null default '{}',
  -- unsere Kundennummer beim Lieferanten (für Bestellungen, Anrufe)
  add column kundennummer_extern text,
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column geo_adresse text;
create index on public.kunden (art);

-- Name → Schlüssel zum Vergleichen: klein, ohne Rand- und doppelte Leerzeichen
create function public.lieferant_schluessel(p text) returns text
language sql immutable parallel safe as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;

create index on public.eingangsrechnungen (public.lieferant_schluessel(lieferant));
create index on public.bestellungen (public.lieferant_schluessel(lieferant));
create index on public.lieferscheine (public.lieferant_schluessel(lieferant));

-- Belege eines Lieferanten: Eingangsrechnungen, Lieferscheine, Bestellungen.
-- Läuft mit den Rechten des Aufrufers (RLS): der Monteur sieht nur seine
-- Lieferscheine, Rechnungen und Bestellungen nur der Chef.
create function public.kontakt_belege(p_kontakt uuid)
returns table (
  quelle text, id uuid, nummer text, datum date, betrag numeric, status text,
  projekt_id uuid, projekt text
)
language sql stable security invoker set search_path = public as $$
  with k as (
    select array_agg(distinct public.lieferant_schluessel(n)) as schluessel
      from public.kunden, unnest(array_prepend(name, namen)) n
     where kunden.id = p_kontakt and btrim(n) <> ''
  )
  select 'rechnung', e.id, e.nummer, e.datum, e.brutto,
         case when e.bezahlt_am is not null then 'bezahlt' else e.freigabe end,
         null::uuid, null::text
    from public.eingangsrechnungen e, k
   where public.lieferant_schluessel(e.lieferant) = any (k.schluessel)
  union all
  select 'lieferschein', l.id, l.nummer, l.datum, null,
         case when l.eingangsrechnung_id is null then 'offen' else 'zugeordnet' end,
         l.projekt_id, p.nummer || ' · ' || p.name
    from public.lieferscheine l
    left join public.projekte p on p.id = l.projekt_id, k
   where public.lieferant_schluessel(l.lieferant) = any (k.schluessel)
  union all
  select 'bestellung', b.id, b.nummer, b.datum,
         (select round(sum(bp.menge * coalesce(bp.ek_preis, 0)), 2) from public.bestell_positionen bp where bp.bestellung_id = b.id),
         b.status, b.projekt_id, p.nummer || ' · ' || p.name
    from public.bestellungen b
    left join public.projekte p on p.id = b.projekt_id, k
   where public.lieferant_schluessel(b.lieferant) = any (k.schluessel)
  order by 4 desc nulls last
$$;
grant execute on function public.kontakt_belege(uuid) to authenticated;

-- ── PV-Anlagendaten an der Anlage ──────────────────────────────────────
alter table public.anlagen
  add column pv_kwp numeric(8,2) check (pv_kwp >= 0),
  add column module_anzahl int check (module_anzahl >= 0),
  add column module_typ text,
  add column wechselrichter text,
  add column speicher_kwh numeric(8,2) check (speicher_kwh >= 0),
  add column speicher_typ text,
  -- Einspeisebegrenzung: Prozent der Modulleistung oder fester Wert in kW
  add column einspeisung_prozent numeric(5,1) check (einspeisung_prozent between 0 and 100),
  add column einspeisung_kw numeric(8,2) check (einspeisung_kw >= 0),
  add column wallbox text,
  -- Überschussregelung: null = unbekannt
  add column ueberschuss boolean,
  add column ueberschuss_wie text,
  add column inbetriebnahme date,
  add column zaehlpunkt text,
  add column ueberwachung text check (ueberwachung in ('fronius', 'solax', 'huawei', 'sma', 'sonstige')),
  add column ueberwachung_link text,
  add column planung_link text;
