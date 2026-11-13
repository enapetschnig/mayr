-- ============================================================================
--  Demo: Angebotsvorlagen für einen PV-Betrieb und Online-Bestätigung
--  (Paket E). Läuft nach 01–03:  scripts/sql.sh -f supabase/demo/04-angebote.sql
--  Wiederholbar: Artikel und Vorlagen werden ergänzt bzw. aufgefrischt, die
--  zwei Demo-Angebote (feste IDs) nur angelegt, wenn es sie noch nicht gibt.
--  Danach supabase/demo/unterschriften.py (lädt auch die Unterschrift der
--  Online-Annahme hoch). Nur erfundene Kunden.
--
--  Bestätigungslinks (fest, erkennbar Demo):
--    /angebot/DEMO-pv-brunner-angebot-bestaetigen-2026   (offen)
--    /angebot/DEMO-pv-reisinger-angebot-angenommen-2026  (online angenommen)
-- ============================================================================
do $$
declare
  f public.firma;
  v_satz numeric;
  v_auf numeric;
  v jsonb;
  r jsonb;
  pos jsonb;
  a public.artikel;
  l public.leistungen;
  v_preis numeric;
  v_ek numeric;
  v_min numeric;
  v_netto numeric;
  -- feste IDs der Demo-Angebote
  k1 constant uuid := 'e5000000-0000-4000-8000-0000000000c1';
  k2 constant uuid := 'e5000000-0000-4000-8000-0000000000c2';
  p1 constant uuid := 'e5000000-0000-4000-8000-0000000000d1';
  p2 constant uuid := 'e5000000-0000-4000-8000-0000000000d2';
  b1 constant uuid := 'e5000000-0000-4000-8000-0000000000b1';
  b2 constant uuid := 'e5000000-0000-4000-8000-0000000000b2';
  t1 constant text := 'DEMO-pv-brunner-angebot-bestaetigen-2026';
  t2 constant text := 'DEMO-pv-reisinger-angebot-angenommen-2026';
  v_beleg uuid;
  v_vorlage text;
  i int;
  s record;
begin
  select * into f from public.firma limit 1;
  v_satz := coalesce(f.stundensatz, 77);
  v_auf := coalesce(f.material_aufschlag, 30);

  -- ── PV-Artikel, die der Datanorm-Stamm nicht hat (Fronius kommt von dort) ──
  insert into public.artikel (artikelnummer, lieferant, hersteller, bezeichnung, langtext, einheit, kategorie, listenpreis, ek_preis, quelle)
  values
    ('PVD-0001', 'Sonepar', 'JA Solar', 'PV-Modul JA Solar JAM54D40 450 Wp Glas-Glas Full Black', 'Bifaziales Glas-Glas-Modul, 450 Wp, 1762 × 1134 mm, 30 Jahre Leistungsgarantie', 'Stk', 'Photovoltaik', 135.00, 92.00, 'demo'),
    ('PVD-0002', 'Sonepar', 'Lapp', 'Solarkabel H1Z2Z2-K 1×6 mm² schwarz', 'PV-Leitung UV- und ozonbeständig, 1,5 kV DC', 'm', 'Photovoltaik', 1.40, 0.95, 'demo'),
    ('PVD-0003', 'Sonepar', 'Stäubli', 'MC4-Evo2 Steckverbinder-Paar 4–6 mm²', 'Stecker und Buchse, 1500 V DC', 'Stk', 'Photovoltaik', 6.20, 4.20, 'demo'),
    ('PVD-0004', 'Sonepar', 'K2 Systems', 'Dachhaken K2 CrossHook 3S für Ziegeldach', 'Edelstahl, höhenverstellbar, inkl. Schrauben', 'Stk', 'Photovoltaik', 14.40, 9.80, 'demo'),
    ('PVD-0005', 'Sonepar', 'K2 Systems', 'Montageschiene K2 SingleRail 36, 4,40 m', 'Aluminium, inkl. Verbinder', 'Stk', 'Photovoltaik', 47.80, 32.50, 'demo'),
    ('PVD-0006', 'Sonepar', 'K2 Systems', 'Modulklemmen-Set Mitte/Ende 30–42 mm', 'je Modul ein Set', 'Stk', 'Photovoltaik', 3.10, 2.10, 'demo'),
    ('PVD-0007', 'Sonepar', 'BYD', 'BYD Battery-Box Premium HVS Batteriemodul 2,56 kWh', 'LiFePO4, stapelbar, 3 Module = 7,7 kWh, 4 Module = 10,2 kWh', 'Stk', 'Photovoltaik', 1206.00, 820.00, 'demo'),
    ('PVD-0008', 'Sonepar', 'BYD', 'BYD Battery-Box Premium HVS Steuereinheit (BCU) inkl. Sockel', 'Battery Control Unit, Sockel und Kabelsatz', 'Stk', 'Photovoltaik', 765.00, 520.00, 'demo'),
    ('PVD-0009', 'Sonepar', 'Dehn', 'DC-Überspannungsschutz PV Typ 2, 1000 V', 'Ableiter für 1 MPP-Tracker, im Gehäuse', 'Stk', 'Photovoltaik', 115.00, 78.00, 'demo')
  on conflict (lieferant, artikelnummer) do nothing;

  -- ── Vorlagen ──
  -- Je Zeile: ["titel", Text] | ["artikel", Artikelnummer, Menge] | ["leistung", Kurztext, Menge]
  --          | ["arbeit", Text, Stunden] | ["pauschale", Text, Menge, Preis] | ["text", Text]
  for v in select * from jsonb_array_elements($j$[
    {"name": "PV 10 kWp Aufdach – Fronius GEN24", "kategorie": "PV-Anlage", "betreff": "PV-Anlage 9,9 kWp Aufdach",
     "positionen": [
       ["titel", "PV-Generator 9,9 kWp"],
       ["artikel", "PVD-0001", 22], ["artikel", "PVD-0004", 44], ["artikel", "PVD-0005", 10], ["artikel", "PVD-0006", 22],
       ["artikel", "PVD-0002", 60], ["artikel", "PVD-0003", 6],
       ["arbeit", "Montage Unterkonstruktion und Module", 16],
       ["titel", "Wechselrichter und Zähler"],
       ["artikel", "121387519", 1], ["artikel", "121071727", 1], ["artikel", "PVD-0009", 1],
       ["arbeit", "Elektroinstallation, AC-Anschluss und Inbetriebnahme", 8],
       ["titel", "Anmeldung und Förderung"],
       ["pauschale", "Netzanmeldung beim Netzbetreiber und Fertigstellungsmeldung", 1, 290],
       ["pauschale", "Förderabwicklung (Antrag und Endabrechnung)", 1, 190],
       ["text", "Gerüst bzw. Absturzsicherung nach Besichtigung. Förderungen werden vom Kaufpreis nicht abgezogen."]
     ]},
    {"name": "PV 10 kWp + Speicher 7,7 kWh – BYD HVS", "kategorie": "PV-Anlage", "betreff": "PV-Anlage 9,9 kWp mit Stromspeicher 7,7 kWh",
     "positionen": [
       ["titel", "PV-Generator 9,9 kWp"],
       ["artikel", "PVD-0001", 22], ["artikel", "PVD-0004", 44], ["artikel", "PVD-0005", 10], ["artikel", "PVD-0006", 22],
       ["artikel", "PVD-0002", 60], ["artikel", "PVD-0003", 6],
       ["arbeit", "Montage Unterkonstruktion und Module", 16],
       ["titel", "Hybrid-Wechselrichter"],
       ["artikel", "121387519", 1], ["artikel", "121071727", 1], ["artikel", "PVD-0009", 1],
       ["arbeit", "Elektroinstallation, AC-Anschluss und Inbetriebnahme", 8],
       ["titel", "Stromspeicher 7,7 kWh"],
       ["artikel", "PVD-0008", 1], ["artikel", "PVD-0007", 3],
       ["arbeit", "Montage und Inbetriebnahme Speicher", 4],
       ["titel", "Anmeldung und Förderung"],
       ["pauschale", "Netzanmeldung beim Netzbetreiber und Fertigstellungsmeldung", 1, 290],
       ["pauschale", "Förderabwicklung PV und Speicher (Antrag und Endabrechnung)", 1, 240],
       ["pauschale", "Einschulung und Einrichtung der App (Fronius Solar.web)", 1, 95]
     ]},
    {"name": "Speicher-Nachrüstung Fronius Reserva Pro 11,9 kWh", "kategorie": "Speicher", "betreff": "Nachrüstung Stromspeicher 11,9 kWh",
     "positionen": [
       ["titel", "Stromspeicher Fronius Reserva Pro"],
       ["artikel", "121378668", 1], ["artikel", "121378667", 3],
       ["arbeit", "Montage, DC-Anschluss und Inbetriebnahme Speicher", 5],
       ["pauschale", "Firmware-Update Wechselrichter und Speicher-Konfiguration", 1, 120],
       ["pauschale", "Förderabwicklung Speicher", 1, 150],
       ["text", "Voraussetzung: vorhandener Fronius GEN24 Plus Hybrid-Wechselrichter."]
     ]},
    {"name": "Wallbox 11 kW – Fronius Wattpilot", "kategorie": "Wallbox", "betreff": "Ladestation 11 kW mit PV-Überschussladen",
     "positionen": [
       ["titel", "Wallbox"],
       ["artikel", "121205682", 1],
       ["leistung", "Wallbox 11 kW montieren", 1],
       ["titel", "Zuleitung und Absicherung"],
       ["artikel", "DE-YY-J-5x2,5", 0],
       ["artikel", "FI-40-4P", 0],
       ["arbeit", "Zuleitung verlegen bis 15 m, Absicherung im Verteiler", 3],
       ["pauschale", "Meldung beim Netzbetreiber", 1, 60],
       ["text", "PV-Überschussladen mit vorhandenem Fronius Wechselrichter inklusive."]
     ]},
    {"name": "E-Befund Einfamilienhaus", "kategorie": "E-Befund", "betreff": "Elektrotechnische Überprüfung (E-Befund)",
     "positionen": [
       ["titel", "Überprüfung nach ÖVE/ÖNORM E 8101"],
       ["leistung", "Anlagenprüfung mit Messprotokoll", 1],
       ["pauschale", "Prüfbefund mit Mängelliste und Fotodokumentation", 1, 90],
       ["leistung", "Anfahrt", 1],
       ["text", "Kleine Mängel beheben wir auf Wunsch gleich vor Ort nach Aufwand."]
     ]},
    {"name": "Notstrom nachrüsten – Fronius Backup Controller", "kategorie": "Speicher", "betreff": "Notstrom-Umschaltung für das ganze Haus",
     "positionen": [
       ["titel", "Notstrom (Backup)"],
       ["artikel", "121289987", 1],
       ["arbeit", "Umbau Hauptverteiler und Umschaltung", 6],
       ["pauschale", "Funktionsprüfung Netzausfall und Einschulung", 1, 90],
       ["text", "Voraussetzung: Fronius GEN24 Plus mit Speicher."]
     ]}
  ]$j$::jsonb) loop
    pos := '[]'::jsonb;
    for r in select * from jsonb_array_elements(v->'positionen') loop
      if r->>0 = 'titel' or r->>0 = 'text' then
        pos := pos || jsonb_build_array(jsonb_build_object('art', r->>0, 'bezeichnung', r->>1, 'langtext', null, 'menge', 1, 'einheit', 'Stk', 'einzelpreis', 0,
          'ek_preis', null, 'minuten', null, 'artikel_id', null, 'leistung_id', null));
      elsif r->>0 = 'artikel' then
        -- Kurzschlüssel für Artikel aus dem Demo-Stamm
        select * into a from public.artikel
         where aktiv and case r->>1
                 when 'DE-YY-J-5x2,5' then bezeichnung = 'Erdkabel E-YY-J 5x2,5'
                 when 'FI-40-4P' then bezeichnung = 'FI-Schalter 40A 4-polig 30mA Typ A'
                 else artikelnummer = r->>1 end
         order by (quelle = 'demo') desc limit 1;
        continue when a.id is null;
        v_preis := coalesce(a.vk_preis, round(a.ek_preis * (1 + v_auf / 100), 2), a.listenpreis, 0);
        pos := pos || jsonb_build_array(jsonb_build_object('art', 'artikel', 'bezeichnung', a.bezeichnung, 'langtext', a.langtext,
          -- Menge 0 = Kabel und FI: übliche Menge je Wallbox
          'menge', case when (r->>2)::numeric = 0 then case when a.einheit = 'm' then 15 else 1 end else (r->>2)::numeric end,
          'einheit', a.einheit, 'einzelpreis', v_preis, 'ek_preis', a.ek_preis, 'minuten', null, 'artikel_id', a.id, 'leistung_id', null));
      elsif r->>0 = 'leistung' then
        select * into l from public.leistungen where aktiv and kurztext = r->>1 order by created_at limit 1;
        continue when l.id is null;
        select coalesce(sum(m.menge * coalesce(ar.vk_preis, ar.ek_preis * (1 + v_auf / 100), ar.listenpreis, 0)), 0),
               coalesce(sum(m.menge * coalesce(ar.ek_preis, 0)), 0)
          into v_preis, v_ek
          from public.leistung_material m left join public.artikel ar on ar.id = m.artikel_id where m.leistung_id = l.id;
        v_preis := coalesce(l.preis, round(v_preis + coalesce(l.minuten, 0) / 60 * v_satz, 2));
        pos := pos || jsonb_build_array(jsonb_build_object('art', 'leistung', 'bezeichnung', l.kurztext, 'langtext', l.langtext,
          'menge', (r->>2)::numeric, 'einheit', l.einheit, 'einzelpreis', v_preis, 'ek_preis', nullif(v_ek, 0),
          'minuten', l.minuten, 'artikel_id', null, 'leistung_id', l.id));
      elsif r->>0 = 'arbeit' then
        pos := pos || jsonb_build_array(jsonb_build_object('art', 'arbeit', 'bezeichnung', r->>1, 'langtext', null,
          'menge', (r->>2)::numeric, 'einheit', 'h', 'einzelpreis', v_satz, 'ek_preis', null, 'minuten', null, 'artikel_id', null, 'leistung_id', null));
      else
        pos := pos || jsonb_build_array(jsonb_build_object('art', 'pauschale', 'bezeichnung', r->>1, 'langtext', null,
          'menge', (r->>2)::numeric, 'einheit', 'Psch', 'einzelpreis', (r->>3)::numeric, 'ek_preis', null, 'minuten', null, 'artikel_id', null, 'leistung_id', null));
      end if;
    end loop;
    select coalesce(sum(round((x->>'menge')::numeric * (x->>'einzelpreis')::numeric, 2)), 0) into v_netto
      from jsonb_array_elements(pos) x where x->>'art' not in ('titel', 'text');
    insert into public.angebot_vorlagen (name, kategorie, betreff, positionen, netto)
    values (v->>'name', v->>'kategorie', v->>'betreff', pos, v_netto)
    on conflict ((lower(btrim(name)))) do update
      set kategorie = excluded.kategorie, betreff = excluded.betreff, positionen = excluded.positionen, netto = excluded.netto;
  end loop;

  -- ── Zwei Demo-Angebote: eines mit Bestätigungslink, eines online angenommen ──
  insert into public.kunden (id, name, strasse, plz, ort, telefon, email) values
    (k1, 'Familie Brunner (Demo)', 'Kirchweg 12', '8650', 'Kindberg', '0664 0000 101', 'brunner@example.com'),
    (k2, 'Familie Reisinger (Demo)', 'Sonnleiten 4', '8661', 'Wartberg im Mürztal', '0664 0000 102', 'reisinger@example.com')
  on conflict (id) do nothing;
  insert into public.projekte (id, name, kunde_id, status, strasse, plz, ort) values
    (p1, 'PV 9,9 kWp mit Speicher – Brunner', k1, 'angebot', 'Kirchweg 12', '8650', 'Kindberg'),
    (p2, 'PV 9,9 kWp Aufdach – Reisinger', k2, 'aktiv', 'Sonnleiten 4', '8661', 'Wartberg im Mürztal')
  on conflict (id) do nothing;

  for i in 1..2 loop
    v_beleg := case i when 1 then b1 else b2 end;
    continue when exists (select 1 from public.belege where id = v_beleg);
    v_vorlage := case i when 1 then 'PV 10 kWp + Speicher 7,7 kWh – BYD HVS' else 'PV 10 kWp Aufdach – Fronius GEN24' end;
    select * into s from public.angebot_vorlagen where name = v_vorlage;
    insert into public.belege (id, typ, status, projekt_id, kunde_id, empf_name, empf_strasse, empf_plz, empf_ort, empf_email,
                               datum, gueltig_bis, betreff, einleitung, schlusstext, ust_satz)
    select v_beleg, 'angebot', 'entwurf', case i when 1 then p1 else p2 end, k.id, k.name, k.strasse, k.plz, k.ort, k.email,
           current_date - case i when 1 then 3 else 9 end, current_date + case i when 1 then 27 else 21 end,
           s.betreff, f.angebot_einleitung, f.angebot_schluss, 20
      from public.kunden k where k.id = case i when 1 then k1 else k2 end;
    insert into public.beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id)
    select v_beleg, x.n::int, x.p->>'art', x.p->>'bezeichnung', x.p->>'langtext', (x.p->>'menge')::numeric, x.p->>'einheit',
           (x.p->>'einzelpreis')::numeric, (x.p->>'ek_preis')::numeric, (x.p->>'minuten')::numeric,
           (x.p->>'artikel_id')::uuid, (x.p->>'leistung_id')::uuid
      from jsonb_array_elements(s.positionen) with ordinality x(p, n);
    -- wie Fertigstellen: Nummer und Summen
    update public.belege b set
      nummer = public.naechste_nummer('angebot', b.datum),
      status = case i when 1 then 'offen' else 'angenommen' end,
      fertig_am = now() - interval '1 day' * case i when 1 then 3 else 9 end,
      netto = x.netto, ust = round(x.netto * 0.2, 2), brutto = x.netto + round(x.netto * 0.2, 2)
      from (select round(sum(round(menge * einzelpreis, 2)), 2) netto from public.beleg_positionen
             where beleg_id = v_beleg and art not in ('titel', 'text')) x
     where b.id = v_beleg;

    insert into public.angebot_links (beleg_id, token, ablauf, created_at, geoeffnet_am)
    values (v_beleg, case i when 1 then t1 else t2 end, current_date + 27,
            now() - interval '1 day' * case i when 1 then 2 else 8 end,
            now() - interval '1 day' * case i when 1 then 1 else 7 end + interval '3 hours');
    insert into public.angebot_verlauf (beleg_id, art, name, text, unterschrift_pfad, betrag, gelesen, wer, created_at)
    select v_beleg, x.art, x.name, x.text, x.pfad, x.betrag, x.gelesen, null, x.zeit
      from (values
        ('link', null, 'Bestätigungslink erzeugt', null::text, null::numeric, true, now() - interval '1 day' * case i when 1 then 2 else 8 end),
        ('geoeffnet', null, 'Kunde hat den Link geöffnet', null, null, true, now() - interval '1 day' * case i when 1 then 1 else 7 end + interval '3 hours')
      ) x(art, name, text, pfad, betrag, gelesen, zeit);
    if i = 1 then
      insert into public.angebot_verlauf (beleg_id, art, name, text, gelesen, wer, created_at)
      values (v_beleg, 'rueckfrage', 'Andrea Brunner',
              'Guten Tag, kann man den Speicher später noch auf 10 kWh erweitern? Und wie lange dauert die Förderabwicklung ungefähr?',
              false, null, now() - interval '20 hours');
    else
      insert into public.angebot_verlauf (beleg_id, art, name, text, unterschrift_pfad, betrag, gelesen, wer, created_at)
      select v_beleg, 'angenommen', 'Helmut Reisinger', 'Online angenommen', t2 || '/demo-unterschrift.png', b.brutto, false, null,
             now() - interval '2 days' + interval '19 hours'
        from public.belege b where b.id = v_beleg;
    end if;
  end loop;
end $$;
