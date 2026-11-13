-- ============================================================================
--  Demo Artikel/Lager (SETEC, Paket F) — nach 01–03:
--    scripts/sql.sh -f supabase/demo/04-artikel.sql
--  danach Bilder, Datenblätter und das Lieferschein-PDF:
--    DEMO_CHEF_PASSWORT=… node supabase/demo/artikel_dateien.mjs
--
--  Wiederholbar. Berührt nur Demo-Artikel (quelle = 'demo') — Artikel, die
--  der Betrieb selbst angelegt hat, bleiben unverändert.
--  · eigener Aufschlag / fester VK an einigen Artikeln
--  · zweiter Lieferant mit anderem Preis bei 15 Artikeln
--  · Lagerplätze (Regal, Fach) im Hauptlager und in Bus 1
--  · Bewegungen: Wareneingang PV, Umbuchung in den Bus, Ausfassen aufs Projekt, Inventur
--  · ein gelesener, noch nicht eingebuchter Lieferschein mit passender Bestellung
-- ============================================================================
do $$
declare
  v_haupt uuid := (select id from lagerorte where name = 'Hauptlager');
  v_bus1 uuid := (select id from lagerorte where name like 'Bus 1%' order by reihenfolge limit 1);
  v_chef uuid := (select id from profiles where email = 'chef@elektro.handwerkapp.at');
  v_max uuid := (select id from profiles where email = 'max@elektro.handwerkapp.at');
  v_projekt uuid := (select id from projekte where nummer = '2026-0012');
  -- feste Kennungen: so findet ein zweiter Lauf seine eigenen Zeilen wieder
  v_ls uuid := 'f0000000-0000-4000-8000-00000000a001';
  v_eingang uuid := 'f0000000-0000-4000-8000-00000000b001';
  v_umbuchung uuid := 'f0000000-0000-4000-8000-00000000b002';
  v_ausfassen uuid := 'f0000000-0000-4000-8000-00000000b003';
  v_inventur uuid := 'f0000000-0000-4000-8000-00000000b004';
  c_nord constant text := 'Solar-Großhandel Nord (Demo)';
  c_muster constant text := 'Elektrogroßhandel Muster (Demo)';
  v_best uuid;
begin
  if v_haupt is null or v_chef is null then
    raise exception 'Erst 01-stamm.sql bis 03-verlauf.sql einspielen';
  end if;

  -- ── Aufräumen (nur eigene Zeilen) ──────────────────────────────────────
  delete from material_buchungen where vorgang in (v_eingang, v_umbuchung, v_ausfassen, v_inventur) or lieferschein_id = v_ls;
  delete from lieferscheine where id = v_ls;
  delete from artikel_lieferanten where artikel_id in (select id from artikel where quelle = 'demo');
  delete from artikel_lagerplaetze where artikel_id in (select id from artikel where quelle = 'demo');
  update artikel set aufschlag = null where quelle = 'demo' and aufschlag is not null;

  -- ── Preise je Artikel ──────────────────────────────────────────────────
  -- Module und Speicher knapp kalkuliert, Kleinmaterial mit mehr Aufschlag, Steckdose mit festem VK
  update artikel set aufschlag = 18 where quelle = 'demo' and artikelnummer = 'PVD-0001';
  update artikel set aufschlag = 22 where quelle = 'demo' and artikelnummer in ('PVD-0007', 'PVD-0008');
  update artikel set aufschlag = 60 where quelle = 'demo' and artikelnummer in ('120351481', '120351482', '120351483', '120181548');
  update artikel set vk_preis = 9.90 where quelle = 'demo' and artikelnummer = '120349726';

  -- PV-Kleinteile liegen im Lager
  update artikel set lagerartikel = true, mindestbestand = 50 where quelle = 'demo' and artikelnummer = 'PVD-0003';
  update artikel set lagerartikel = true, mindestbestand = 200, bestell_vpe = 100 where quelle = 'demo' and artikelnummer = 'PVD-0002';
  update artikel set lagerartikel = true, mindestbestand = 100 where quelle = 'demo' and artikelnummer = 'PVD-0006';
  update artikel set lagerartikel = true where quelle = 'demo' and artikelnummer in ('PVD-0001', 'PVD-0004', 'PVD-0005', 'PVD-0007', 'PVD-0008', 'PVD-0009');

  -- ── Zweiter Lieferant mit anderem Preis ────────────────────────────────
  insert into artikel_lieferanten (artikel_id, lieferant, lieferanten_nr, listenpreis, rabatt, ek_preis, lieferzeit_tage, bevorzugt, notiz)
  select a.id, c_nord, 'SN-' || substr(a.artikelnummer, 5), round(a.listenpreis, 2), x.rabatt,
         round(a.ek_preis * x.faktor, 4), x.tage, x.bevorzugt, x.notiz
    from (values
      ('PVD-0001', 34::numeric, 0.95, 2, true,  'Palette ab 36 Stk frei Haus'),
      ('PVD-0002', 30::numeric, 1.04, 2, false, null),
      ('PVD-0003', 35::numeric, 0.92, 2, false, null),
      ('PVD-0004', 28::numeric, 1.06, 5, false, null),
      ('PVD-0005', 30::numeric, 0.97, 5, false, null),
      ('PVD-0006', 33::numeric, 0.94, 2, false, null),
      ('PVD-0007', 25::numeric, 1.03, 7, false, 'Lieferzeit schwankt'),
      ('PVD-0008', 25::numeric, 1.02, 7, false, null),
      ('PVD-0009', 32::numeric, 0.96, 3, false, null)
    ) as x(nr, rabatt, faktor, tage, bevorzugt, notiz)
    join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr;

  insert into artikel_lieferanten (artikel_id, lieferant, lieferanten_nr, listenpreis, rabatt, ek_preis, lieferzeit_tage, bevorzugt, notiz)
  select a.id, c_muster, 'EM-' || right(a.artikelnummer, 6), round(a.listenpreis, 2), x.rabatt,
         round(a.ek_preis * x.faktor, 4), 1, false, null
    from (values
      ('120120409', 30::numeric, 0.93), ('120120624', 34::numeric, 1.05), ('120993590', 31::numeric, 0.97),
      ('12015982533', 29::numeric, 1.08), ('120351483', 36::numeric, 0.95), ('120542266', 33::numeric, 1.02)
    ) as x(nr, rabatt, faktor)
    join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr;

  -- ── Lagerplätze ────────────────────────────────────────────────────────
  -- Hauptlager: je Kategorie ein Regal, im Regal der Reihe nach Fach A–F
  insert into artikel_lagerplaetze (artikel_id, lagerort_id, platz)
  select id, v_haupt,
         case kategorie
           when 'Verteiler & Schutzgeräte' then 'Regal 1'
           when 'Schalter & Steckdosen' then 'Regal 2'
           when 'Dosen & Verbindungstechnik' then 'Regal 3'
           when 'Licht' then 'Regal 4'
           when 'Sicherheit & Melder' then 'Regal 4'
           when 'Netzwerk & Medien' then 'Regal 5'
           when 'Rohre & Kanäle' then 'Regal 6'
           when 'Befestigung & Kleinmaterial' then 'Regal 7'
           when 'Erdung & Blitzschutz' then 'Regal 7'
           when 'Kabel & Leitungen' then 'Kabelständer'
           when 'Photovoltaik' then 'Halle PV'
           else 'Regal 8'
         end || ', Fach ' || chr(65 + ((row_number() over (partition by kategorie order by bezeichnung) - 1) % 6)::int)
    from artikel where quelle = 'demo' and lagerartikel;
  -- Bus 1: was der Monteur immer dabei hat
  if v_bus1 is not null then
    insert into artikel_lagerplaetze (artikel_id, lagerort_id, platz)
    select a.id, v_bus1, x.platz
      from (values
        ('120351481', 'Sortimentskasten 1'), ('120351482', 'Sortimentskasten 1'), ('120351483', 'Sortimentskasten 1'),
        ('120181548', 'Sortimentskasten 2'), ('120120624', 'Schublade links oben'), ('120120409', 'Schublade links oben'),
        ('PVD-0003', 'Kiste PV rechts'), ('PVD-0002', 'Dachträger hinten'), ('12015982533', 'Kabelhaspel hinten')
      ) as x(nr, platz)
      join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr;
  end if;

  -- ── Bewegungen ─────────────────────────────────────────────────────────
  -- Wareneingang PV vor drei Wochen
  insert into material_buchungen (art, artikel_id, menge, lagerort_id, ek_preis, vorgang, notiz, user_id, created_at)
  select 'zugang', a.id, x.menge, v_haupt, a.ek_preis, v_eingang, 'Lieferschein SN-20517 · ' || c_nord, v_chef, now() - interval '21 days'
    from (values ('PVD-0001', 40), ('PVD-0002', 500), ('PVD-0003', 100), ('PVD-0004', 120), ('PVD-0005', 60),
                 ('PVD-0006', 200), ('PVD-0007', 12), ('PVD-0008', 4), ('PVD-0009', 6)) as x(nr, menge)
    join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr;

  -- Max füllt seinen Bus auf (Abgang Lager + Zugang Bus, wie die Scan-Seite)
  if v_bus1 is not null then
    insert into material_buchungen (art, artikel_id, menge, lagerort_id, ek_preis, vorgang, notiz, user_id, created_at)
    select y.art, a.id, x.menge, case y.art when 'abgang' then v_haupt else v_bus1 end, a.ek_preis, v_umbuchung,
           'Umbuchung Hauptlager → ' || (select name from lagerorte where id = v_bus1), coalesce(v_max, v_chef), now() - interval '10 days'
      from (values ('PVD-0003', 20), ('PVD-0002', 100)) as x(nr, menge)
      join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr
      cross join (values ('abgang'), ('zugang')) as y(art);
  end if;

  -- Ausgefasst auf die PV-Baustelle (nur wenn das Projekt in Arbeit ist)
  if v_projekt is not null and (select status from projekte where id = v_projekt) = 'aktiv' then
    insert into material_buchungen (art, artikel_id, menge, lagerort_id, projekt_id, ek_preis, vorgang, notiz, user_id, created_at)
    select 'ausfassung', a.id, x.menge, v_haupt, v_projekt, a.ek_preis, v_ausfassen, null, coalesce(v_max, v_chef), now() - interval '7 days'
      from (values ('PVD-0001', 28), ('PVD-0004', 56), ('PVD-0005', 26), ('PVD-0006', 80), ('PVD-0007', 4), ('PVD-0008', 1)) as x(nr, menge)
      join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr;
  end if;

  -- Inventur: zwei Modulklemmen fehlen
  insert into material_buchungen (art, artikel_id, menge, lagerort_id, ek_preis, vorgang, notiz, user_id, created_at)
  select 'korrektur', a.id, -2, v_haupt, a.ek_preis, v_inventur, 'Zwischeninventur Halle PV', v_chef, now() - interval '3 days'
    from artikel a where a.quelle = 'demo' and a.artikelnummer = 'PVD-0006';

  -- ── Offener Lieferschein (PDF: artikel_dateien.mjs) ────────────────────
  -- Nummern wie gedruckt: drei kennt die App als Nummer bei Solar-Nord, eine
  -- über die EAN-freie Hersteller-Nr. nicht — die ordnet man von Hand zu; Fracht bleibt weg.
  insert into lieferscheine (id, projekt_id, lieferant, nummer, datum, datei_pfad, datei_mime, positionen, gelesen_am, erstellt_von)
  values (v_ls, null, c_nord, 'SN-20931', current_date - 1, v_chef || '/demo-ls-sn-20931.pdf', 'application/pdf',
    '[{"artikelnummer":"SN-0001","bezeichnung":"JA Solar JAM54D40 450W Glas-Glas FB","menge":20,"einheit":"Stk"},
      {"artikelnummer":"SN-0003","bezeichnung":"MC4-Evo2 Steckerpaar 4-6mm2","menge":50,"einheit":"Stk"},
      {"artikelnummer":"SN-0002","bezeichnung":"Solarkabel H1Z2Z2-K 6mm2 sw","menge":200,"einheit":"m"},
      {"artikelnummer":"SN-0006","bezeichnung":"Modulklemme Mitte/Ende 30-42","menge":100,"einheit":"Stk"},
      {"artikelnummer":"K2-2002597","bezeichnung":"Endkappe SingleRail 36 schwarz","menge":20,"einheit":"Stk"},
      {"artikelnummer":"FR-01","bezeichnung":"Frachtkostenpauschale","menge":1,"einheit":"Psch"}]'::jsonb,
    now(), v_chef);

  -- Die Bestellung dazu (einmal angelegt, behält ihre Nummer; Status rechnet der Trigger aus den Buchungen)
  select id into v_best from bestellungen where lieferant = c_nord and notiz = 'Demo: kommt mit Lieferschein SN-20931' limit 1;
  if v_best is null then
    insert into bestellungen (lieferant, status, datum, liefertermin, lagerort_id, notiz, erstellt_von)
    values (c_nord, 'entwurf', current_date - 6, current_date, v_haupt, 'Demo: kommt mit Lieferschein SN-20931', v_chef)
    returning id into v_best;
    insert into bestell_positionen (bestellung_id, pos, artikel_id, menge, ek_preis)
    select v_best, x.pos, a.id, x.menge, l.ek_preis
      from (values (1, 'PVD-0001', 20), (2, 'PVD-0003', 50)) as x(pos, nr, menge)
      join artikel a on a.quelle = 'demo' and a.artikelnummer = x.nr
      left join artikel_lieferanten l on l.artikel_id = a.id and l.lieferant = c_nord;
    update bestellungen set status = 'bestellt' where id = v_best;
  end if;
end $$;
