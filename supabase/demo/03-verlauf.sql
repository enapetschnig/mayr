-- ============================================================================
--  Demo-Verlauf: sechs Wochen Betrieb bis Freitag, 23.10.2026.
--  Läuft nach 01-stamm.sql und 02-artikel.sql:
--    sql.sh -f supabase/demo/03-verlauf.sql
--  Danach die Unterschriften hochladen: node supabase/demo/unterschriften.mjs
--
--  Was die Demo zeigen soll:
--    2026-0001 Huber        laufende Baustelle, viel Material ausgefasst
--    2026-0002 Gruber       laufend, mit direkt gekauftem Material
--    2026-0003 Sonnenhof    fertig, alles offen → „Rechnung aus dem Projekt“
--    2026-0004 Berger       Angebot AN-2026-001 nach Räumen, wartet auf Antwort
--    2026-0005 Kirchenwirt  Regie: RB-001 verrechnet (RE-001 bezahlt),
--                           RB-002 unterschrieben und offen, RB-003 Entwurf
--    2026-0006 Sonnenhof    abgeschlossen, RE-2026-002 überfällig
-- ============================================================================
do $$
declare
  v_chef uuid := (select id from profiles where email = 'chef@elektro.handwerkapp.at');
  v_max  uuid := (select id from profiles where email = 'max@elektro.handwerkapp.at');
  v_lisa uuid := (select id from profiles where email = 'lisa@elektro.handwerkapp.at');
  p1 uuid := (select id from projekte where nummer = '2026-0001');
  p2 uuid := (select id from projekte where nummer = '2026-0002');
  p3 uuid := (select id from projekte where nummer = '2026-0003');
  p4 uuid := (select id from projekte where nummer = '2026-0004');
  p5 uuid := (select id from projekte where nummer = '2026-0005');
  p6 uuid;
  k_sonnenhof uuid := (select id from kunden where name = 'Hausverwaltung Sonnenhof');
  l_haupt uuid := (select id from lagerorte where name = 'Hauptlager');
  l_bus1 uuid := (select id from lagerorte where name like 'Bus 1%');
  l_bus2 uuid := (select id from lagerorte where name like 'Bus 2%');
  v_satz numeric := (select stundensatz from firma where id = 1);
  v_aufschlag numeric := (select material_aufschlag from firma where id = 1);
  rb1 uuid; rb2 uuid; rb3 uuid;
  an1 uuid; re1 uuid; re2 uuid;
  v_netto numeric;
begin
  if p5 is null or v_max is null then
    raise exception 'Zuerst 01-stamm.sql und 02-artikel.sql einspielen (und die Demo-Benutzer anlegen).';
  end if;

  -- ── Älteres, abgeschlossenes Projekt (Nummer 2026-0006) ─────────────────
  insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von, created_at)
  values ('Sonnenhof Stiege 1 – Stiegenhaus LED', k_sonnenhof, 'abgeschlossen', 'Sonnenweg 6', '4040', 'Linz',
          'Stiegenhausbeleuchtung auf LED mit Bewegungsmeldern umgebaut.', v_chef,
          timestamptz '2026-09-15 10:00 Europe/Vienna')
  returning id into p6;

  -- ── Stunden (ohne Regieberichte) ─────────────────────────────────────────
  insert into zeiten (user_id, projekt_id, datum, stunden, von, bis, pause_minuten, taetigkeit, erstellt_von, created_at)
  select u, p, v.tag::date, v.h, v.von::time, v.bis::time, v.pause, v.txt, u,
         (v.tag::date + time '16:30') at time zone 'Europe/Vienna'
  from (values
    -- September: Stiegenhaus Sonnenhof (verrechnet mit RE-2026-002)
    ('chef','p6','2026-09-22', 8,   null,    null,    0,  'Leuchten Stiegenhaus getauscht, Melder gesetzt'),
    ('max', 'p6','2026-09-22', 8,   '07:00','15:30', 30, 'Leuchten Stiegenhaus getauscht'),
    ('chef','p6','2026-09-23', 8,   null,    null,    0,  'Bewegungsmelder eingestellt, Messung, Übergabe'),
    ('max', 'p6','2026-09-23', 8,   '07:00','15:30', 30, 'Leitungen Kellerabgang erneuert'),
    -- Woche 41
    ('max', 'p1','2026-10-05', 8,   '07:00','15:30', 30, 'Leerverrohrung EG'),
    ('lisa','p1','2026-10-05', 8,   '07:00','15:30', 30, 'Schlitze stemmen EG'),
    ('max', 'p1','2026-10-06', 4.5, '12:00','16:30', 0,  'Leerverrohrung EG'),
    ('lisa','p1','2026-10-06', 8,   '07:00','15:30', 30, 'Leerverrohrung EG'),
    ('max', 'p1','2026-10-07', 8,   '07:00','15:30', 30, 'Leerverrohrung OG'),
    ('lisa','p1','2026-10-07', 8,   '07:00','15:30', 30, 'Leerverrohrung OG'),
    ('max', 'p1','2026-10-08', 8,   '07:00','15:30', 30, 'Dosen gesetzt OG'),
    ('lisa','p1','2026-10-08', 8,   '07:00','15:30', 30, 'Dosen gesetzt OG'),
    ('max', 'p1','2026-10-09', 6,   '07:00','13:00', 0,  'Leitungen EG eingezogen'),
    ('chef','p1','2026-10-09', 2,   null,    null,    0,  'Baubesprechung mit Bauherr'),
    -- Woche 42
    ('max', 'p1','2026-10-12', 8,   '07:00','15:30', 30, 'Leitungen OG eingezogen'),
    ('lisa','p1','2026-10-12', 8,   '07:00','15:30', 30, 'Leitungen OG eingezogen'),
    ('max', 'p1','2026-10-13', 8,   '07:00','15:30', 30, 'Netzwerkleitungen verlegt'),
    ('lisa','p1','2026-10-13', 8,   '07:00','15:30', 30, 'Schlitze verputzt'),
    ('chef','p2','2026-10-13', 3,   null,    null,    0,  'Besichtigung Backstube, Lichtplanung'),
    ('max', 'p1','2026-10-14', 8,   '07:00','15:30', 30, 'Verteiler gesetzt'),
    ('lisa','p1','2026-10-14', 8,   '07:00','15:30', 30, 'Verteiler gesetzt'),
    ('max', 'p3','2026-10-15', 8,   '07:00','15:30', 30, 'Zählerplatz demontiert, neuen Zählerverteiler gesetzt'),
    ('lisa','p1','2026-10-15', 8,   '07:00','15:30', 30, 'Dosen gesetzt Keller'),
    ('chef','p3','2026-10-15', 4,   null,    null,    0,  'Abstimmung Netzbetreiber, Fertigmeldung vorbereitet'),
    ('max', 'p3','2026-10-16', 6,   '07:00','13:00', 0,  'Steigleitung getauscht, Hauptleitungsabzweiger'),
    ('lisa','p3','2026-10-16', 6,   '07:00','13:00', 0,  'Steigleitung getauscht'),
    ('chef','p3','2026-10-16', 2,   null,    null,    0,  'Inbetriebnahme, Messprotokoll'),
    -- Woche 43
    ('max', 'p2','2026-10-19', 8,   '07:00','15:30', 30, 'Verkaufsraum LED-Downlights montiert'),
    ('lisa','p1','2026-10-19', 8,   '07:00','15:30', 30, 'Leerrohre Garage'),
    ('chef','p2','2026-10-19', 4,   null,    null,    0,  'Backstube Leuchten montiert'),
    ('max', 'p2','2026-10-20', 6,   '07:00','13:30', 30, 'Backstube Feuchtraumleuchten'),
    ('lisa','p1','2026-10-20', 8,   '07:00','15:30', 30, 'Leitungen Garage eingezogen'),
    ('chef','p2','2026-10-20', 4,   null,    null,    0,  'Rasterdecke LED-Panels eingesetzt'),
    ('max', 'p1','2026-10-21', 3,   '13:30','16:30', 0,  'Verteiler verdrahtet'),
    ('lisa','p1','2026-10-21', 3,   '13:30','16:30', 0,  'Verteiler verdrahtet'),
    ('max', 'p1','2026-10-22', 8,   '07:00','15:30', 30, 'Verteiler verdrahtet, beschriftet'),
    ('lisa','p1','2026-10-22', 8,   '07:00','15:30', 30, 'Leitungen Dachboden'),
    ('chef','p4','2026-10-22', 2,   null,    null,    0,  'Aufmaß Bad und WC'),
    ('max', 'p1','2026-10-23', 6,   '09:00','15:00', 0,  'Restarbeiten Verteiler')
  ) v(wer, prj, tag, h, von, bis, pause, txt)
  cross join lateral (select case v.wer when 'max' then v_max when 'lisa' then v_lisa else v_chef end as u,
                             case v.prj when 'p1' then p1 when 'p2' then p2 when 'p3' then p3
                                        when 'p4' then p4 when 'p6' then p6 end as p) x;

  -- ── Material ausfassen, zurückgeben, direkt ──────────────────────────────
  insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id,
                                  ek_preis, vorgang, notiz, user_id, created_at)
  select v.art, a.id, null, null, v.menge, case v.ort when 'haupt' then l_haupt when 'bus1' then l_bus1 else l_bus2 end,
         case v.prj when 'p1' then p1 when 'p2' then p2 when 'p3' then p3 when 'p6' then p6 end,
         a.ek_preis, md5(v.prj || v.tag || v.art)::uuid, null,
         case v.wer when 'max' then v_max when 'lisa' then v_lisa else v_chef end,
         (v.tag::date + time '07:15') at time zone 'Europe/Vienna'
  from (values
    ('ausfassung','p6','2026-09-22','max', 'haupt','LEDBULKHEAD11W840WT', 4),
    ('ausfassung','p6','2026-09-22','max', 'haupt','606015', 2),
    ('ausfassung','p6','2026-09-22','max', 'haupt','XC020104JC', 60),
    ('ausfassung','p6','2026-09-22','max', 'haupt','2273-203', 20),
    ('ausfassung','p1','2026-10-05','max', 'haupt','GTPTXM20', 150),
    ('ausfassung','p1','2026-10-05','max', 'haupt','1055-21', 60),
    ('ausfassung','p1','2026-10-05','max', 'haupt','2273-203', 100),
    ('ausfassung','p1','2026-10-05','max', 'haupt','XC020104JC', 300),
    ('ausfassung','p1','2026-10-05','max', 'haupt','XC020209JC', 60),
    ('ausfassung','p1','2026-10-13','max', 'haupt','HSKP4233K1', 120),
    ('ausfassung','p1','2026-10-13','max', 'haupt','211500004', 6),
    ('ausfassung','p1','2026-10-14','max', 'haupt','302543', 1),
    ('ausfassung','p1','2026-10-14','max', 'haupt','AM618116', 12),
    ('ausfassung','p1','2026-10-14','max', 'haupt','AM618316', 1),
    ('ausfassung','p1','2026-10-14','max', 'haupt','BC054103', 1),
    ('ausfassung','p1','2026-10-14','max', 'haupt','AK668616', 2),
    ('ausfassung','p1','2026-10-14','max', 'haupt','221-413', 40),
    ('ausfassung','p3','2026-10-15','max', 'haupt','XC020209JC', 25),
    ('ausfassung','p3','2026-10-15','max', 'haupt','AM618316', 2),
    ('ausfassung','p3','2026-10-15','max', 'haupt','563020', 1),
    ('ausfassung','p3','2026-10-15','max', 'haupt','80243001', 2),
    ('ausfassung','p3','2026-10-15','max', 'haupt','2273-205', 10),
    ('ausfassung','p3','2026-10-15','max', 'haupt','145806', 2),
    ('ausfassung','p2','2026-10-19','max', 'haupt','DLUGRDN155PFM14W840', 6),
    ('ausfassung','p2','2026-10-19','max', 'haupt','XC020104JC', 40),
    ('ausfassung','p2','2026-10-19','max', 'haupt','221-413', 12),
    ('ausfassung','p2','2026-10-20','chef','haupt','DPCOMP1200V33W840PS', 4),
    ('ausfassung','p1','2026-10-20','lisa','bus1', '2273-203', 20),
    ('ausfassung','p1','2026-10-20','lisa','bus1', '138-00022', 1),
    ('rueckgabe', 'p1','2026-10-22','max', 'haupt','GTPTXM20', 30),
    ('rueckgabe', 'p1','2026-10-22','max', 'haupt','1055-21', 8),
    ('rueckgabe', 'p2','2026-10-22','max', 'haupt','XC020104JC', 12)
  ) v(art, prj, tag, wer, ort, nr, menge)
  join artikel a on a.hersteller_nr = v.nr;

  -- Direkt gekauft (ohne Lager, ohne Artikelstamm)
  insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id,
                                  ek_preis, vorgang, notiz, user_id, created_at)
  values
    ('direkt', null, 'LED-Panel 62x62 cm 36 W 4000 K für Rasterdecke', 'Stk', 4, null, p2,
     48.50, gen_random_uuid(), 'beim Großhändler abgeholt', v_chef, timestamptz '2026-10-20 07:30 Europe/Vienna'),
    ('direkt', null, 'Zählerverteiler 1 ZP, vorverdrahtet', 'Stk', 1, null, p3,
     385.00, gen_random_uuid(), 'direkt auf die Baustelle geliefert', v_chef, timestamptz '2026-10-15 07:30 Europe/Vienna');

  -- ── Regieberichte Kirchenwirt ────────────────────────────────────────────
  -- RB-2026-001: Störung, unterschrieben, später mit RE-2026-001 verrechnet
  insert into regieberichte (projekt_id, datum, arbeiten, erstellt_von, created_at)
  values (p5, '2026-10-06', E'Störung Küche: FI-Schutzschalter löst aus.\nFehler eingegrenzt — Anschlussdose Geschirrspüler durchgeschmort.\nAnschlussdose erneuert, Isolationsmessung, Anlage wieder in Betrieb.',
          v_max, timestamptz '2026-10-06 11:05 Europe/Vienna')
  returning id into rb1;
  insert into zeiten (user_id, projekt_id, datum, stunden, von, bis, pause_minuten, taetigkeit, regiebericht_id, erstellt_von, created_at)
  values (v_max, p5, '2026-10-06', 3, '08:00', '11:00', 0, 'Störungssuche Küche', rb1, v_max, timestamptz '2026-10-06 11:05 Europe/Vienna');
  insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id, regiebericht_id,
                                  ek_preis, vorgang, notiz, user_id, created_at)
  select 'ausfassung', a.id, null, null, v.menge, l_bus1, p5, rb1, a.ek_preis, rb1, null, v_max,
         timestamptz '2026-10-06 11:05 Europe/Vienna'
  from (values ('80242001', 1), ('2273-203', 3)) v(nr, menge) join artikel a on a.hersteller_nr = v.nr;
  update regieberichte set status = 'unterschrieben', unterschrift_name = 'Josef Kern',
         unterschrift_pfad = p5 || '/unterschriften/' || rb1 || '.png',
         unterschrieben_am = timestamptz '2026-10-06 11:10 Europe/Vienna'
   where id = rb1;

  -- RB-2026-002: Gastgarten, unterschrieben, noch nicht verrechnet
  insert into regieberichte (projekt_id, datum, arbeiten, erstellt_von, created_at)
  values (p5, '2026-10-21', E'Gastgarten: zwei Feuchtraum-Wandleuchten an der Hausmauer montiert und angeschlossen.\nZuleitung über Abzweigkasten neu geführt, alte Leuchten demontiert und entsorgt.\nFunktionsprüfung mit dem Wirt.',
          v_max, timestamptz '2026-10-21 13:35 Europe/Vienna')
  returning id into rb2;
  insert into zeiten (user_id, projekt_id, datum, stunden, von, bis, pause_minuten, taetigkeit, regiebericht_id, erstellt_von, created_at)
  values (v_max,  p5, '2026-10-21', 5, '08:00', '13:30', 30, 'Gastgarten Beleuchtung', rb2, v_max, timestamptz '2026-10-21 13:35 Europe/Vienna'),
         (v_lisa, p5, '2026-10-21', 5, '08:00', '13:30', 30, 'Gastgarten Beleuchtung', rb2, v_max, timestamptz '2026-10-21 13:35 Europe/Vienna');
  insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id, regiebericht_id,
                                  ek_preis, vorgang, notiz, user_id, created_at)
  select 'ausfassung', a.id, null, null, v.menge, case v.ort when 'bus1' then l_bus1 else l_haupt end, p5, rb2,
         a.ek_preis, rb2, null, v_max, timestamptz '2026-10-21 13:35 Europe/Vienna'
  from (values ('LEDBULKHEAD11W840WT', 2, 'haupt'), ('80242001', 2, 'haupt'),
               ('XC020104JC', 15, 'bus1'), ('221-413', 6, 'bus1')) v(nr, menge, ort)
  join artikel a on a.hersteller_nr = v.nr;
  update regieberichte set status = 'unterschrieben', unterschrift_name = 'Josef Kern',
         unterschrift_pfad = p5 || '/unterschriften/' || rb2 || '.png',
         unterschrieben_am = timestamptz '2026-10-21 13:40 Europe/Vienna'
   where id = rb2;

  -- RB-2026-003: Entwurf vom Freitag, noch nicht unterschrieben
  insert into regieberichte (projekt_id, datum, arbeiten, erstellt_von, created_at)
  values (p5, '2026-10-23', E'Saal: zwei Leuchtmittel getauscht, Notbeleuchtung geprüft.',
          v_max, timestamptz '2026-10-23 08:55 Europe/Vienna')
  returning id into rb3;
  insert into zeiten (user_id, projekt_id, datum, stunden, von, bis, pause_minuten, taetigkeit, regiebericht_id, erstellt_von, created_at)
  values (v_max, p5, '2026-10-23', 2, '07:00', '09:00', 0, 'Saalbeleuchtung', rb3, v_max, timestamptz '2026-10-23 08:55 Europe/Vienna');
  insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id, regiebericht_id,
                                  ek_preis, vorgang, notiz, user_id, created_at)
  select 'ausfassung', a.id, null, null, 2, l_haupt, p5, rb3, a.ek_preis, rb3, null, v_max,
         timestamptz '2026-10-23 08:55 Europe/Vienna'
  from artikel a where a.hersteller_nr = 'LEDCLA608.5827FRE27P';

  -- ── RE-2026-001: Regiebericht RB-2026-001, bezahlt ───────────────────────
  insert into belege (typ, status, projekt_id, kunde_id, empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_uid, empf_email,
                      datum, leistung_von, leistung_bis, betreff, einleitung, schlusstext, erstellt_von, created_at)
  select 'rechnung', 'entwurf', p5, k.id, k.name, 'z. H. ' || k.ansprechpartner, k.strasse, k.plz, k.ort, k.uid, k.email,
         '2026-10-07', '2026-10-06', '2026-10-06', 'Störungsbehebung Küche lt. Regiebericht RB-2026-001',
         f.rechnung_einleitung, f.rechnung_schluss, v_chef, timestamptz '2026-10-07 18:00 Europe/Vienna'
  from projekte p join kunden k on k.id = p.kunde_id, firma f where p.id = p5
  returning id into re1;

  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re1, 1, 'titel', 'Regiebericht ' || r.nummer || ' vom 06.10.2026', null, 1, 'Stk', 0, null, null, null, null,
         jsonb_build_object('regie', jsonb_build_array(r.id))
  from regieberichte r where r.id = rb1;
  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re1, 2, 'arbeit', 'Arbeitszeit Max Monteur', 'Störungssuche Küche', sum(z.stunden), 'h', v_satz, null, null, null, null,
         jsonb_build_object('zeiten', jsonb_agg(z.id))
  from zeiten z where z.regiebericht_id = rb1;
  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re1, 2 + row_number() over (order by a.bezeichnung), 'material', a.bezeichnung, null, m.menge, a.einheit,
         round(a.ek_preis * (1 + v_aufschlag / 100), 2), a.ek_preis, null, a.id, null,
         jsonb_build_object('material', jsonb_build_array(m.id))
  from material_buchungen m join artikel a on a.id = m.artikel_id where m.regiebericht_id = rb1;
  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re1, 10, 'pauschale', l.kurztext, l.langtext, 1, l.einheit, l.preis, null, l.minuten, null, l.id, null
  from leistungen l where l.nummer = '08.02';

  select coalesce(sum(gesamt), 0) into v_netto from beleg_positionen where beleg_id = re1;
  update belege set nummer = 'RE-2026-001', status = 'bezahlt', netto = v_netto,
         ust = round(v_netto * 0.2, 2), brutto = v_netto + round(v_netto * 0.2, 2),
         faellig_am = '2026-10-21', bezahlt_am = '2026-10-15', fertig_am = timestamptz '2026-10-07 18:05 Europe/Vienna'
   where id = re1;
  update regieberichte set rechnung_id = re1 where id = rb1;
  update zeiten set rechnung_id = re1 where regiebericht_id = rb1;
  update material_buchungen set rechnung_id = re1 where regiebericht_id = rb1;

  -- ── RE-2026-002: Stiegenhaus Sonnenhof, offen und überfällig ─────────────
  insert into belege (typ, status, projekt_id, kunde_id, empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_uid, empf_email,
                      datum, leistung_von, leistung_bis, betreff, einleitung, schlusstext, erstellt_von, created_at)
  select 'rechnung', 'entwurf', p6, k.id, k.name, 'z. H. ' || k.ansprechpartner, k.strasse, k.plz, k.ort, k.uid, k.email,
         '2026-09-24', '2026-09-22', '2026-09-23', 'Stiegenhaus Stiege 1 – Umbau auf LED',
         f.rechnung_einleitung, f.rechnung_schluss, v_chef, timestamptz '2026-09-24 17:00 Europe/Vienna'
  from kunden k, firma f where k.id = k_sonnenhof
  returning id into re2;

  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re2, 1, 'arbeit', 'Arbeitszeit Elektrotechnik', 'Martin Muster, Max Monteur — 22. und 23.09.2026', sum(z.stunden), 'h', v_satz,
         null, null, null, null, jsonb_build_object('zeiten', jsonb_agg(z.id))
  from zeiten z where z.projekt_id = p6;
  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re2, 1 + row_number() over (order by a.bezeichnung), 'material', a.bezeichnung, null, m.menge, a.einheit,
         round(a.ek_preis * (1 + v_aufschlag / 100), 2), a.ek_preis, null, a.id, null,
         jsonb_build_object('material', jsonb_build_array(m.id))
  from material_buchungen m join artikel a on a.id = m.artikel_id where m.projekt_id = p6;
  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select re2, 10, 'pauschale', l.kurztext, l.langtext, 2, l.einheit, l.preis, null, l.minuten, null, l.id, null
  from leistungen l where l.nummer = '08.02';

  select coalesce(sum(gesamt), 0) into v_netto from beleg_positionen where beleg_id = re2;
  update belege set nummer = 'RE-2026-002', status = 'offen', netto = v_netto,
         ust = round(v_netto * 0.2, 2), brutto = v_netto + round(v_netto * 0.2, 2),
         faellig_am = '2026-10-08', fertig_am = timestamptz '2026-09-24 17:05 Europe/Vienna'
   where id = re2;
  update zeiten set rechnung_id = re2 where projekt_id = p6;
  update material_buchungen set rechnung_id = re2 where projekt_id = p6;

  -- ── AN-2026-001: Badsanierung Berger, nach Räumen ────────────────────────
  insert into belege (typ, status, projekt_id, kunde_id, empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_uid, empf_email,
                      datum, gueltig_bis, betreff, einleitung, schlusstext, erstellt_von, created_at)
  select 'angebot', 'entwurf', p4, k.id, k.name, 'z. H. ' || k.ansprechpartner, k.strasse, k.plz, k.ort, k.uid, k.email,
         '2026-10-22', '2026-11-21', 'Elektroinstallation Bad und WC',
         f.angebot_einleitung, f.angebot_schluss, v_chef, timestamptz '2026-10-22 19:00 Europe/Vienna'
  from projekte p join kunden k on k.id = p.kunde_id, firma f where p.id = p4
  returning id into an1;

  insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
  select an1, v.pos, case when v.lnr is null then 'titel' else 'leistung' end,
         coalesce(l.kurztext, v.titel), l.langtext, coalesce(v.menge, 1), coalesce(l.einheit, 'Stk'),
         coalesce(case when l.id is null then 0 end, l.preis,
                  round(coalesce(mat.vk, 0) + l.minuten / 60.0 * v_satz, 2)),
         mat.ek, l.minuten, null, l.id, null
  from (values
    (1,  null,   'Bad', null),
    (2,  '01.02', null, 2),
    (3,  '01.01', null, 1),
    (4,  '01.04', null, 2),
    (5,  '04.02', null, 6),
    (6,  '04.01', null, 1),
    (7,  '06.05', null, 1),
    (8,  '07.02', null, 1),
    (9,  '02.02', null, 40),
    (10, '02.04', null, 12),
    (11, null,   'WC', null),
    (12, '01.04', null, 1),
    (13, '04.01', null, 1),
    (14, '06.05', null, 1),
    (15, '02.02', null, 12),
    (16, null,   'Verteiler und Prüfung', null),
    (17, '03.04', null, 2),
    (18, '08.01', null, 1),
    (19, '08.02', null, 1)
  ) v(pos, lnr, titel, menge)
  left join leistungen l on l.nummer = v.lnr
  left join lateral (
    select sum(lm.menge * round(a.ek_preis * (1 + v_aufschlag / 100), 2)) as vk,
           round(sum(lm.menge * a.ek_preis), 4) as ek
    from leistung_material lm join artikel a on a.id = lm.artikel_id
    where lm.leistung_id = l.id
  ) mat on true;

  select coalesce(sum(gesamt), 0) into v_netto from beleg_positionen where beleg_id = an1;
  update belege set nummer = 'AN-2026-001', status = 'offen', netto = v_netto,
         ust = round(v_netto * 0.2, 2), brutto = v_netto + round(v_netto * 0.2, 2),
         fertig_am = timestamptz '2026-10-22 19:10 Europe/Vienna'
   where id = an1;

  -- Nummernkreise auf den Stand der eingespielten Belege
  insert into nummernkreise (typ, jahr, letzte) values ('angebot', 2026, 1), ('rechnung', 2026, 2)
  on conflict (typ, jahr) do update set letzte = excluded.letzte;


  -- ── Eingangsrechnungen (Lieferanten erfunden, ohne Foto) ─────────────────
  -- Sammelrechnung aufgeteilt (Rest Lager), Subunternehmer zum Weiterverrechnen,
  -- Tankrechnung Betrieb, eine überfällige und eine noch nicht zugeordnete.
  declare
    e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid(); e3 uuid := gen_random_uuid();
    e4 uuid := gen_random_uuid(); e5 uuid := gen_random_uuid();
  begin
    insert into eingangsrechnungen (id, lieferant, nummer, datum, faellig_am, netto, ust_satz, ust, brutto, kategorie, betrieb, bezahlt_am, notiz, erstellt_von, created_at) values
      (e1, 'Elektrogroßhandel Muster (Demo)', 'GH-2026-10871', '2026-10-09', '2026-10-23', 1240.00, 20, 248.00, 1488.00, 'material', true, '2026-10-20', 'Sammelrechnung Oktober', v_chef, '2026-10-12 08:10+02'),
      (e2, 'Kernbohrung Beispiel GmbH (Demo)', 'KB-0417', '2026-10-16', '2026-10-30', 320.00, 20, 64.00, 384.00, 'fremdleistung', false, null, null, v_chef, '2026-10-17 07:40+02'),
      (e3, 'Tankstelle Muster (Demo)', null, '2026-10-19', null, 77.08, 20, 15.42, 92.50, 'fahrzeug', true, '2026-10-19', 'Bus 1', v_chef, '2026-10-19 17:05+02'),
      (e4, 'Werkzeughandel Beispiel (Demo)', 'WZ-55120', '2026-10-01', '2026-10-15', 159.00, 20, 31.80, 190.80, 'werkzeug', true, null, 'Akku-Bohrhammer Ersatzakku', v_chef, '2026-10-02 09:30+02'),
      (e5, 'Elektrogroßhandel Muster (Demo)', 'GH-2026-11024', '2026-10-22', '2026-11-05', 214.90, 20, 42.98, 257.88, 'material', false, null, null, v_chef, '2026-10-23 07:15+02');
    insert into eingang_anteile (eingangsrechnung_id, projekt_id, betrag, text, created_at) values
      (e1, p1, 820.00, 'Kabel und Dosen OG', '2026-10-12 08:12+02'),
      (e1, p2, 300.00, 'LED-Panels Backstube', '2026-10-12 08:12+02'),
      (e2, p2, 320.00, 'Kernbohrungen Backstube', '2026-10-17 07:41+02');
  end;

  -- ── Kalender ─────────────────────────────────────────────────────────────
  insert into termine (titel, beschreibung, ort, datum, bis_datum, von, bis, ganztags, projekt_id, mitarbeiter, user_id) values
    ('Kirchenwirt – Gastgarten', null, 'Kirchenplatz 1, 4320 Perg', '2026-10-21', null, '08:00', '13:30', false, p5, array[v_max, v_lisa], v_chef),
    ('Berger – Aufmaß Bad/WC', null, 'Am Bach 4, 4210 Gallneukirchen', '2026-10-22', null, '16:00', '18:00', false, p4, array[v_chef], v_chef),
    ('Huber – Installation OG und Dachboden', 'Leitungen Dachboden fertig, Dosen OG setzen', 'Musterstraße 12, 4020 Linz', '2026-10-26', '2026-10-28', '07:00', '15:30', false, p1, array[v_max, v_lisa], v_chef),
    ('Kirchenwirt – Saalbeleuchtung', 'Notlicht-Akku tauschen', 'Kirchenplatz 1, 4320 Perg', '2026-10-27', null, '14:00', '16:00', false, p5, array[v_max], v_chef),
    ('Gruber – Backstube fertigstellen', null, 'Hauptplatz 3, 4600 Wels', '2026-10-29', null, '07:00', '15:30', false, p2, array[v_chef, v_max], v_chef),
    ('Berufsschule', null, null, '2026-10-30', null, null, null, true, null, array[v_lisa], v_chef),
    ('Berger – Angebot besprechen', 'Angebot AN-2026-001 mitnehmen', 'Am Bach 4, 4210 Gallneukirchen', '2026-10-30', null, '09:00', '10:00', false, p4, array[v_chef], v_chef),
    ('Huber – Verteiler fertig verdrahten', null, 'Musterstraße 12, 4020 Linz', '2026-11-02', '2026-11-03', '07:00', '15:30', false, p1, array[v_max], v_chef),
    ('Sonnenhof – Abnahme Zählerplatz mit Netzbetreiber', null, 'Sonnenweg 8, 4040 Linz', '2026-11-04', null, '10:00', '11:00', false, p3, array[v_chef], v_chef);
end $$;
