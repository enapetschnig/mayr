-- =====================================================================
--  Demo Paket C: Kontakte, PV-Anlagendaten, Karte
-- =====================================================================
--
-- Nach 01–03 einspielen (scripts/sql.sh -f supabase/demo/04-kontakte.sql),
-- wiederholbar ohne Fehler. Legt nur zusätzlich an bzw. ergänzt die
-- Demo-Kunden aus 01-stamm (über den Namen) — echte Probedaten anderer
-- Kunden bleiben unberührt.
--
-- • Demo-Kunden ziehen ins Mürztal (Adresse + Koordinaten direkt, kein
--   Nominatim) und bekommen PV-Anlagen mit kWp, Speicher, Wallbox, Links.
-- • 11 weitere PV-Kunden zwischen Leoben und Mürzzuschlag, damit die Karte
--   voll ist.
-- • 6 Lieferanten + 2 Partner als Kontakte; ihre Belege finden sie über den
--   Namen (Eingangsrechnungen, Lieferscheine, Bestellungen aus 03-verlauf)
--   plus fünf PV-Eingangsrechnungen (Nummer DEMO-PV-…).
-- Beispiel-Links zeigen auf die Portale bzw. example.com — keine echten Anlagen.
-- =====================================================================
do $$
declare
  v_k jsonb;
  v_a jsonb;
  v_id uuid;
  v_anlage uuid;
  v_ids uuid[] := '{}';
begin
  -- ── Kunden (vorhandene Demo-Kunden ergänzen, neue anlegen) ─────────────
  for v_k in select * from jsonb_array_elements($j$[
    {"name": "Familie Huber", "strasse": "Lindenweg 12", "plz": "8605", "ort": "Kapfenberg", "lat": 47.4465, "lng": 15.2850,
     "anlage": {"bezeichnung": "PV-Anlage Wohnhaus", "kwp": 9.8, "anzahl": 22, "modul": "445 Wp Glas-Glas, schwarz", "wr": "Fronius Symo GEN24 8.0 Plus",
       "kwh": 10.2, "speicher": "BYD Battery-Box Premium HVS 10.2", "prozent": 70, "wallbox": "Fronius Wattpilot Home 11 J", "ueber": true,
       "wie": "Wattpilot lädt mit Überschuss über den Fronius Smart Meter", "ib": "2025-05-14", "zp": "AT0034000000000000000000000123456",
       "ue": "fronius", "link": "https://www.solarweb.com/", "plan": "https://example.com/pv-planung/huber-pvsol.pdf"}},
    {"name": "Bäckerei Gruber GmbH", "strasse": "Mittergasse 3", "plz": "8600", "ort": "Bruck an der Mur", "lat": 47.4103, "lng": 15.2702,
     "anlage": {"bezeichnung": "PV-Anlage Backstube (Dach)", "kwp": 29.6, "anzahl": 64, "modul": "460 Wp Glas-Glas", "wr": "Huawei SUN2000-30KTL-M3",
       "kw": 20, "ueber": true, "wie": "Kühlhaus und Gärschrank tagsüber über Huawei Smart Power Sensor", "ib": "2024-09-02",
       "ue": "huawei", "link": "https://eu5.fusionsolar.huawei.com/", "plan": "https://example.com/pv-planung/gruber-backstube.pdf"}},
    {"name": "Hausverwaltung Sonnenhof", "strasse": "Sonnenweg 8", "plz": "8700", "ort": "Leoben", "lat": 47.3812, "lng": 15.0931,
     "anlage": {"bezeichnung": "PV Gemeinschaftsanlage Haus 1–3", "kwp": 18.0, "anzahl": 40, "modul": "450 Wp", "wr": "SMA Sunny Tripower 15.0",
       "prozent": 100, "ueber": false, "ib": "2023-06-20", "ue": "sma", "link": "https://ennexos.sunnyportal.com/"}},
    {"name": "Familie Berger", "strasse": "Am Bach 4", "plz": "8662", "ort": "Mitterdorf im Mürztal", "lat": 47.5305, "lng": 15.5080,
     "anlage": {"bezeichnung": "PV-Anlage mit Speicher", "kwp": 7.4, "anzahl": 16, "modul": "460 Wp", "wr": "SolaX X3-Hybrid 8.0-D",
       "kwh": 11.5, "speicher": "SolaX T-BAT H 11.5", "prozent": 60, "ueber": false, "ib": "2025-03-28",
       "ue": "solax", "link": "https://www.solaxcloud.com/"}},
    {"name": "Gasthaus Zum Kirchenwirt", "strasse": "Kirchplatz 1", "plz": "8670", "ort": "Krieglach", "lat": 47.5466, "lng": 15.5641,
     "anlage": {"bezeichnung": "PV-Anlage Gasthaus + Parkplatz", "kwp": 24.0, "anzahl": 52, "modul": "460 Wp", "wr": "Fronius Tauro 25-3-D",
       "kwh": 20.5, "speicher": "BYD Battery-Box Premium HVM 22.1", "prozent": 70, "wallbox": "2 × Keba KeContact P30 22 kW (Gästeparkplatz)",
       "ueber": true, "wie": "Küchenlüftung und Kühlung über Fronius Ohmpilot/Smart Meter", "ib": "2024-04-11",
       "ue": "fronius", "link": "https://www.solarweb.com/", "plan": "https://example.com/pv-planung/kirchenwirt.pdf"}},
    {"name": "Wohnbau Leonding (Demo)", "strasse": "Grazer Straße 40", "plz": "8605", "ort": "Kapfenberg", "lat": 47.4380, "lng": 15.2960},
    {"name": "Autohaus Steyr (Demo)", "strasse": "Industriestraße 5", "plz": "8600", "ort": "Bruck an der Mur", "lat": 47.4235, "lng": 15.2575,
     "anlage": {"bezeichnung": "PV Werkstattdach + Ladepark", "kwp": 27.3, "anzahl": 60, "modul": "455 Wp", "wr": "Fronius Tauro 30-3-D",
       "prozent": 100, "wallbox": "4 × Fronius Wattpilot Pro 22 kW", "ueber": true, "wie": "Ladepark regelt auf PV-Überschuss", "ib": "2025-08-01",
       "ue": "fronius", "link": "https://www.solarweb.com/"}},

    {"name": "Familie Leitner", "telefon": "+43 000 0000201", "strasse": "Hauptstraße 21", "plz": "8653", "ort": "Stanz im Mürztal", "lat": 47.4835, "lng": 15.4975,
     "anlage": {"bezeichnung": "PV-Anlage Wohnhaus", "kwp": 11.2, "anzahl": 25, "modul": "450 Wp", "wr": "Fronius Symo GEN24 10.0 Plus",
       "kwh": 12.8, "speicher": "BYD Battery-Box Premium HVS 12.8", "prozent": 70, "wallbox": "Fronius Wattpilot Home 11 J",
       "ueber": true, "wie": "Wattpilot + Heizstab über Ohmpilot", "ib": "2026-04-22", "ue": "fronius", "link": "https://www.solarweb.com/"}},
    {"name": "Andreas Kogler", "telefon": "+43 000 0000202", "strasse": "Feldgasse 5", "plz": "8650", "ort": "Kindberg", "lat": 47.5042, "lng": 15.4462,
     "anlage": {"bezeichnung": "PV-Anlage Garage + Haus", "kwp": 12.3, "anzahl": 27, "modul": "455 Wp", "wr": "Huawei SUN2000-10KTL-M1",
       "kwh": 10.0, "speicher": "Huawei LUNA2000-10-S0", "prozent": 70, "wallbox": "Huawei SCharger 7 kW", "ueber": true,
       "wie": "Huawei Smart Charger Überschussladen", "ib": "2025-10-09", "ue": "huawei", "link": "https://eu5.fusionsolar.huawei.com/"}},
    {"name": "Familie Wallner", "telefon": "+43 000 0000203", "strasse": "Bergweg 14", "plz": "8641", "ort": "St. Marein im Mürztal", "lat": 47.4690, "lng": 15.3702,
     "anlage": {"bezeichnung": "PV-Anlage Süddach", "kwp": 5.6, "anzahl": 12, "modul": "470 Wp", "wr": "Fronius Primo GEN24 5.0",
       "prozent": 70, "ueber": false, "ib": "2024-07-15", "ue": "fronius", "link": "https://www.solarweb.com/"}},
    {"name": "Petra Schwaiger", "telefon": "+43 000 0000204", "strasse": "Am Anger 3", "plz": "8665", "ort": "Langenwang", "lat": 47.5662, "lng": 15.6148,
     "anlage": {"bezeichnung": "PV-Anlage mit Speicher", "kwp": 8.2, "anzahl": 18, "modul": "455 Wp", "wr": "SolaX X3-Hybrid 8.0-D",
       "kwh": 10.0, "speicher": "SolaX T-BAT H 10.0", "kw": 4, "ueber": false, "ib": "2026-02-18",
       "ue": "solax", "link": "https://www.solaxcloud.com/", "plan": "https://example.com/pv-planung/schwaiger.pdf"}},
    {"name": "Tischlerei Reiter GmbH", "telefon": "+43 000 0000205", "strasse": "Industriestraße 9", "plz": "8605", "ort": "Kapfenberg", "lat": 47.4392, "lng": 15.3058,
     "anlage": {"bezeichnung": "PV Hallendach", "kwp": 29.9, "anzahl": 65, "modul": "460 Wp", "wr": "Fronius Tauro 30-3-D",
       "prozent": 100, "ueber": true, "wie": "Absauganlage und Trockenkammer laufen bei Überschuss", "ib": "2023-11-30",
       "ue": "fronius", "link": "https://www.solarweb.com/"}},
    {"name": "Familie Fink", "telefon": "+43 000 0000206", "strasse": "Rosegger-Gasse 7", "plz": "8680", "ort": "Mürzzuschlag", "lat": 47.6058, "lng": 15.6748,
     "anlage": {"bezeichnung": "PV-Anlage Wohnhaus", "kwp": 10.5, "anzahl": 23, "modul": "460 Wp", "wr": "SolaX X3-Hybrid 10.0-D",
       "kwh": 15.0, "speicher": "SolaX T-BAT H 15.0", "prozent": 70, "wallbox": "SolaX X3-EVC 11 kW", "ueber": true,
       "wie": "Wallbox im Modus Green (nur PV)", "ib": "2025-06-05", "ue": "solax", "link": "https://www.solaxcloud.com/"}},
    {"name": "Bauernhof Pötscher", "telefon": "+43 000 0000207", "strasse": "Thörl 30", "plz": "8621", "ort": "Thörl", "lat": 47.5183, "lng": 15.2178,
     "anlage": {"bezeichnung": "PV Stall und Maschinenhalle", "kwp": 24.9, "anzahl": 54, "modul": "460 Wp", "wr": "SMA Sunny Tripower X 25",
       "kwh": 25.0, "speicher": "SMA Home Storage (5 × 5 kWh)", "prozent": 70, "ueber": true, "wie": "Melkanlage und Kühlung über SMA Sunny Home Manager",
       "ib": "2024-05-27", "ue": "sma", "link": "https://ennexos.sunnyportal.com/"}},
    {"name": "Familie Moser", "telefon": "+43 000 0000208", "strasse": "Kirchengasse 2", "plz": "8712", "ort": "Niklasdorf", "lat": 47.3906, "lng": 15.1538,
     "anlage": {"bezeichnung": "PV-Anlage Wohnhaus", "kwp": 6.8, "anzahl": 15, "modul": "455 Wp", "wr": "Fronius Primo GEN24 6.0",
       "prozent": 70, "ueber": false, "ib": "2026-07-08", "ue": "fronius", "link": "https://www.solarweb.com/"}},
    {"name": "Autowerkstatt Kainz", "telefon": "+43 000 0000209", "strasse": "Gewerbepark 4", "plz": "8793", "ort": "Trofaiach", "lat": 47.4252, "lng": 15.0098,
     "anlage": {"bezeichnung": "PV Werkstatt + Ladestationen", "kwp": 19.8, "anzahl": 44, "modul": "450 Wp", "wr": "Huawei SUN2000-20KTL-M2",
       "kwh": 15.0, "speicher": "Huawei LUNA2000-15-S0", "prozent": 100, "wallbox": "2 × Huawei SCharger 22 kW", "ueber": true,
       "wie": "Ladestationen über FusionSolar-Überschussladen", "ib": "2025-11-20", "ue": "huawei", "link": "https://eu5.fusionsolar.huawei.com/"}},
    {"name": "Familie Pichler", "telefon": "+43 000 0000210", "strasse": "Parschlug 12", "plz": "8605", "ort": "Parschlug", "lat": 47.4832, "lng": 15.2858,
     "anlage": {"bezeichnung": "PV-Anlage mit Speicher", "kwp": 9.9, "anzahl": 22, "modul": "450 Wp", "wr": "Huawei SUN2000-10KTL-M1",
       "kwh": 5.0, "speicher": "Huawei LUNA2000-5-S0", "prozent": 70, "ueber": false, "ib": "2026-09-14",
       "ue": "huawei", "link": "https://eu5.fusionsolar.huawei.com/", "plan": "https://example.com/pv-planung/pichler.pdf"}},
    {"name": "Familie Ofner", "telefon": "+43 000 0000211", "strasse": "Turnau 45", "plz": "8625", "ort": "Turnau", "lat": 47.5579, "lng": 15.3352,
     "anlage": {"bezeichnung": "PV-Anlage Wohnhaus", "kwp": 14.4, "anzahl": 32, "modul": "450 Wp", "wr": "Fronius Symo GEN24 10.0 Plus",
       "kwh": 10.2, "speicher": "BYD Battery-Box Premium HVS 10.2", "prozent": 70, "wallbox": "Fronius Wattpilot Go 22 J", "ueber": true,
       "wie": "Wattpilot Eco-Modus", "ib": "2024-10-03", "ue": "fronius", "link": "https://www.solarweb.com/"}}
  ]$j$::jsonb)
  loop
    select id into v_id from kunden where name = v_k->>'name' and art = 'kunde' order by nummer limit 1;
    if v_id is null then
      insert into kunden (name, art, telefon, strasse, plz, ort, notiz)
      values (v_k->>'name', 'kunde', v_k->>'telefon', v_k->>'strasse', v_k->>'plz', v_k->>'ort', 'Demo-Kunde (PV)')
      returning id into v_id;
    else
      update kunden set strasse = v_k->>'strasse', plz = v_k->>'plz', ort = v_k->>'ort' where id = v_id;
    end if;
    update kunden set lat = (v_k->>'lat')::float8, lng = (v_k->>'lng')::float8 where id = v_id;
    v_ids := v_ids || v_id;

    v_a := v_k->'anlage';
    if v_a is not null then
      select id into v_anlage from anlagen where kunde_id = v_id and bezeichnung = v_a->>'bezeichnung' limit 1;
      if v_anlage is null then
        insert into anlagen (kunde_id, bezeichnung, art, intervall_monate) values (v_id, v_a->>'bezeichnung', 'pv', 48)
        returning id into v_anlage;
      end if;
      update anlagen set
        art = 'pv', standort = 'Dach', hersteller = split_part(v_a->>'wr', ' ', 1),
        baujahr = extract(year from (v_a->>'ib')::date)::int,
        naechste_pruefung = ((v_a->>'ib')::date + interval '4 years')::date,
        pv_kwp = (v_a->>'kwp')::numeric, module_anzahl = (v_a->>'anzahl')::int, module_typ = v_a->>'modul',
        wechselrichter = v_a->>'wr', speicher_kwh = (v_a->>'kwh')::numeric, speicher_typ = v_a->>'speicher',
        einspeisung_prozent = (v_a->>'prozent')::numeric, einspeisung_kw = (v_a->>'kw')::numeric,
        wallbox = v_a->>'wallbox', ueberschuss = (v_a->>'ueber')::boolean, ueberschuss_wie = v_a->>'wie',
        inbetriebnahme = (v_a->>'ib')::date, zaehlpunkt = v_a->>'zp',
        ueberwachung = v_a->>'ue', ueberwachung_link = v_a->>'link', planung_link = v_a->>'plan'
      where id = v_anlage;
    end if;
  end loop;

  -- ── Lieferanten und Partner ────────────────────────────────────────────
  for v_k in select * from jsonb_array_elements($j$[
    {"name": "Sonepar", "art": "lieferant", "namen": ["Sonepar Österreich GmbH"], "kdnr": "100 2345 (Demo)", "ort": "Graz", "plz": "8020",
     "telefon": "+43 000 0000301", "lat": 47.0707, "lng": 15.4395, "notiz": "Hauptlieferant Elektro — Datanorm, Rabatte unter Artikel → Rabatte"},
    {"name": "Elektrogroßhandel Muster (Demo)", "art": "lieferant", "kdnr": "K-55012", "strasse": "Kärntner Straße 100", "plz": "8700", "ort": "Leoben",
     "telefon": "+43 000 0000302", "lat": 47.3772, "lng": 15.0848},
    {"name": "Solar-Großhandel Steiermark (Demo)", "art": "lieferant", "namen": ["Solargroßhandel Steiermark GmbH"], "kdnr": "SGS-1187",
     "ansprech": "Innendienst PV", "strasse": "Industriepark 7", "plz": "8605", "ort": "Kapfenberg", "telefon": "+43 000 0000303", "lat": 47.4502, "lng": 15.3148,
     "notiz": "Fronius-Partner: Wechselrichter, Wattpilot, Module"},
    {"name": "PV-Großhandel Alpenstrom (Demo)", "art": "lieferant", "namen": ["Alpenstrom PV Handels GmbH"], "kdnr": "AS-20931",
     "strasse": "Leobner Straße 61", "plz": "8600", "ort": "Bruck an der Mur", "telefon": "+43 000 0000304", "lat": 47.4198, "lng": 15.2548,
     "notiz": "Speicher (BYD, Huawei, SolaX), Unterkonstruktion"},
    {"name": "Würth", "art": "lieferant", "namen": ["Würth Handelsges.m.b.H."], "kdnr": "W-778120 (Demo)", "telefon": "+43 000 0000305",
     "notiz": "Befestigung, Werkzeug, Verbrauchsmaterial"},
    {"name": "Kabelwerk Beispiel (Demo)", "art": "lieferant", "strasse": "Werkstraße 2", "plz": "8700", "ort": "Leoben", "telefon": "+43 000 0000306",
     "lat": 47.3880, "lng": 15.1102},
    {"name": "Kabelzug Hofer GmbH (Demo)", "art": "partner", "ansprech": "Martin Hofer", "strasse": "Mürzgasse 11", "plz": "8650", "ort": "Kindberg",
     "telefon": "+43 000 0000307", "lat": 47.5098, "lng": 15.4402, "notiz": "Subunternehmer Kabelzug und Erdarbeiten (Reverse Charge)"},
    {"name": "Kernbohrung Beispiel GmbH (Demo)", "art": "partner", "strasse": "Wiener Straße 88", "plz": "8680", "ort": "Mürzzuschlag",
     "telefon": "+43 000 0000308", "lat": 47.6003, "lng": 15.6598, "notiz": "Kernbohrungen, Durchbrüche"}
  ]$j$::jsonb)
  loop
    select id into v_id from kunden where name = v_k->>'name' and art in ('lieferant', 'partner') limit 1;
    if v_id is null then
      insert into kunden (name, art) values (v_k->>'name', v_k->>'art') returning id into v_id;
    end if;
    update kunden set
      art = v_k->>'art', ansprechpartner = v_k->>'ansprech', strasse = v_k->>'strasse', plz = v_k->>'plz', ort = v_k->>'ort',
      telefon = v_k->>'telefon', notiz = v_k->>'notiz', kundennummer_extern = v_k->>'kdnr',
      namen = coalesce((select array_agg(x) from jsonb_array_elements_text(v_k->'namen') x), '{}'),
      lat = (v_k->>'lat')::float8, lng = (v_k->>'lng')::float8
    where id = v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- Demo-Kunden anderer Demo-Dateien („… (Demo)“) ohne Lage: Ortsmitte plus ein
  -- paar hundert Meter Streuung je Name — damit auch sie ohne Nominatim auf der
  -- Karte stehen. Diese Datei deshalb als letzte Demo-Datei einspielen.
  update kunden k set
      lat = o.lat + ((('x' || substr(md5(k.name), 1, 4))::bit(16)::int % 100) - 50) / 12000.0,
      lng = o.lng + ((('x' || substr(md5(k.name), 5, 4))::bit(16)::int % 100) - 50) / 8000.0
    from (values
      ('Kapfenberg', 47.4440, 15.2930), ('Bruck an der Mur', 47.4100, 15.2690), ('Leoben', 47.3830, 15.0940),
      ('Kindberg', 47.5050, 15.4480), ('Mürzzuschlag', 47.6070, 15.6720), ('Krieglach', 47.5460, 15.5620),
      ('Langenwang', 47.5660, 15.6110), ('St. Marein im Mürztal', 47.4660, 15.3670), ('Mitterdorf im Mürztal', 47.5300, 15.5090),
      ('Stanz im Mürztal', 47.4830, 15.4970), ('Trofaiach', 47.4260, 15.0060), ('Niklasdorf', 47.3900, 15.1550),
      ('Thörl', 47.5190, 15.2150), ('Turnau', 47.5580, 15.3340), ('Parschlug', 47.4830, 15.2860), ('Allerheiligen im Mürztal', 47.4830, 15.3970)
    ) o(ort, lat, lng)
   where k.ort = o.ort and k.lat is null and k.name like '%(Demo)%';
  v_ids := v_ids || array(select id from kunden where name like '%(Demo)%' and lat is not null);

  -- Koordinaten gelten für genau diese Adresse (wie geoAnfrage in kontaktLogik.ts) — die App sucht sie nicht neu
  update kunden set geo_adresse = case when coalesce(btrim(ort), '') = '' and coalesce(btrim(plz), '') = '' then null else
      concat_ws(', ', nullif(btrim(strasse), ''), nullif(btrim(concat_ws(' ', nullif(btrim(plz), ''), nullif(btrim(ort), ''))), '')) || ', Österreich' end
   where id = any (v_ids);

  -- ── PV-Eingangsrechnungen der Lieferanten (DEMO-PV-…) ─────────────────
  delete from eingangsrechnungen where nummer like 'DEMO-PV-%';
  insert into eingangsrechnungen (lieferant, nummer, datum, faellig_am, netto, ust_satz, ust, brutto, kategorie, betrieb, bezahlt_am, freigabe, notiz) values
    ('Solar-Großhandel Steiermark (Demo)', 'DEMO-PV-1001', current_date - 34, current_date - 4, 8420.00, 20, 1684.00, 10104.00, 'material', true, current_date - 6, 'freigegeben', 'Fronius GEN24 10.0 Plus, 25 Module 450 Wp (Lager)'),
    ('Solargroßhandel Steiermark GmbH', 'DEMO-PV-1002', current_date - 5, current_date + 25, 4980.00, 20, 996.00, 5976.00, 'material', true, null, 'offen', '2 × Wattpilot Home 11 J, Smart Meter TS 65A-3'),
    ('PV-Großhandel Alpenstrom (Demo)', 'DEMO-PV-2001', current_date - 12, current_date + 18, 6150.00, 20, 1230.00, 7380.00, 'material', true, null, 'freigegeben', 'BYD HVS 10.2 und 12.8'),
    ('Alpenstrom PV Handels GmbH', 'DEMO-PV-2002', current_date - 48, current_date - 18, 1240.50, 20, 248.10, 1488.60, 'material', true, current_date - 20, 'freigegeben', 'Unterkonstruktion Ziegeldach'),
    ('Sonepar Österreich GmbH', 'DEMO-PV-3001', current_date - 9, current_date + 21, 2310.40, 20, 462.08, 2772.48, 'material', true, null, 'offen', 'Solarkabel 6 mm², MC4, Überspannungsschutz DC');
end $$
