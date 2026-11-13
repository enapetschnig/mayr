-- Demo für den Terminplaner (Plantafel „Mitarbeiter“) und „Heute – Morgen“:
-- Julia aus dem Büro, vier PV-/Elektro-Projekte, Einsätze diese und nächste
-- Woche für alle Teams, Büro-Termine für Chef und Büro, ein Urlaub (Julia), ein
-- Krankenstand (Lisa). Alles relativ zur laufenden Woche, wiederholbar: feste IDs,
-- vorher weg, dann neu. Andere Daten (auch echte Probedaten) bleiben unberührt.
-- Braucht das Konto julia@elektro.handwerkapp.at (scripts/demo-konten.mjs).
--
--   scripts/sql.sh -f supabase/demo/04-kalender.sql
do $$
declare
  w date := date_trunc('week', current_date)::date;  -- Montag dieser Woche
  v_chef uuid := (select id from profiles where rolle = 'chef' and aktiv order by created_at limit 1);
  v_julia uuid := (select id from profiles where email = 'julia@elektro.handwerkapp.at');
  v_max uuid := (select id from profiles where email = 'max@elektro.handwerkapp.at');
  v_lisa uuid := (select id from profiles where email = 'lisa@elektro.handwerkapp.at');
  v_tom uuid := (select id from profiles where email = 'tom@elektro.handwerkapp.at');
  v_jonas uuid := (select id from profiles where email = 'jonas@elektro.handwerkapp.at');
  v_eva uuid := (select id from profiles where email = 'eva@elektro.handwerkapp.at');
  v_lukas uuid := (select id from profiles where email in ('lukas@elektro.handwerkapp.at', 'stefan@elektro.handwerkapp.at') limit 1);
  v_sarah uuid := (select id from profiles where email = 'sarah@elektro.handwerkapp.at');
  t_max uuid := (select id from teams where v_max = any(mitglieder) and aktiv order by reihenfolge limit 1);
  t_tom uuid := (select id from teams where v_tom = any(mitglieder) and aktiv order by reihenfolge limit 1);
  t_eva uuid := (select id from teams where v_eva = any(mitglieder) and aktiv order by reihenfolge limit 1);
  t_kd uuid := (select id from teams where v_sarah = any(mitglieder) and aktiv order by reihenfolge limit 1);
  f_bus1 uuid := (select fahrzeug_id from teams where id = (select id from teams where v_max = any(mitglieder) and aktiv order by reihenfolge limit 1));
  f_bus3 uuid := (select fahrzeug_id from teams where id = (select id from teams where v_tom = any(mitglieder) and aktiv order by reihenfolge limit 1));
  f_bus2 uuid := (select fahrzeug_id from teams where id = (select id from teams where v_eva = any(mitglieder) and aktiv order by reihenfolge limit 1));
  f_pkw uuid := (select fahrzeug_id from teams where id = (select id from teams where v_sarah = any(mitglieder) and aktiv order by reihenfolge limit 1));
  f_steiger uuid := (select id from fahrzeuge where art = 'steiger' order by reihenfolge, name limit 1);
  -- feste IDs: Kunden k1–k5, Projekte p1–p5
  k1 uuid := 'b4000000-0000-4000-8000-000000000001';
  k2 uuid := 'b4000000-0000-4000-8000-000000000002';
  k3 uuid := 'b4000000-0000-4000-8000-000000000003';
  k4 uuid := 'b4000000-0000-4000-8000-000000000004';
  k5 uuid := 'b4000000-0000-4000-8000-000000000005';
  p1 uuid := 'b4000000-0000-4000-8000-000000000101';
  p2 uuid := 'b4000000-0000-4000-8000-000000000102';
  p3 uuid := 'b4000000-0000-4000-8000-000000000103';
  p4 uuid := 'b4000000-0000-4000-8000-000000000104';
  p5 uuid := 'b4000000-0000-4000-8000-000000000105';
begin
  if v_chef is null or v_max is null then
    raise notice 'Demo-Konten fehlen — nichts angelegt';
    return;
  end if;

  -- ── Büro: Julia (Konto aus demo-konten.mjs), Gruppe „Büro“ ──────────────
  update profiles set vorname = 'Julia', nachname = 'Steiner', rolle = 'monteur', aktiv = true, gesperrt = false,
         farbe = '#0D9488', gruppe = 'Büro', wochenstunden = 30, urlaub_tage = 25, telefon = '+43 000 0000206'
   where id = v_julia;

  -- ── Kunden und Projekte (nur anlegen, wenn es sie noch nicht gibt) ──────
  insert into kunden (id, name, ansprechpartner, strasse, plz, ort, telefon, email, notiz) values
    (k1, 'Familie Rainer (Demo)', 'Andrea Rainer', 'Hauptstraße 14', '8650', 'Kindberg', '+43 000 1000101', 'rainer@example.at', 'PV mit Speicher, Förderung Klimafonds beantragt'),
    (k2, 'Familie Haas (Demo)', 'Peter Haas', 'Bergweg 3', '8662', 'Mitterdorf im Mürztal', '+43 000 1000102', null, 'PV 8 kWp seit 2023, Speicher dazu'),
    (k3, 'Hausverwaltung Mürztal (Demo)', 'Fr. Brandl', 'Wiener Straße 22', '8680', 'Mürzzuschlag', '+43 000 1000103', 'office@example.at', 'E-Befunde für drei Stiegen'),
    (k4, 'Tischlerei Kogler (Demo)', 'Martin Kogler', 'Industriestraße 9', '8605', 'Kapfenberg', '+43 000 1000104', 'kogler@example.at', 'Gewerbe-PV am Hallendach'),
    (k5, 'Gasthof Mürzblick (Demo)', 'Familie Pölzl', 'Am Anger 2', '8641', 'St. Marein im Mürztal', '+43 000 1000105', null, 'Kundendienst')
  on conflict (id) do nothing;
  insert into projekte (id, name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von) values
    (p1, 'PV-Anlage 12,6 kWp mit Speicher 10 kWh', k1, 'aktiv', 'Hauptstraße 14', '8650', 'Kindberg',
     '28 Module 450 Wp, Hybrid-Wechselrichter 10 kW, Speicher 10 kWh, Einspeisebegrenzung 70 %. Zufahrt über den Hof, Schlüssel beim Nachbarn (Nr. 16).', v_chef),
    (p2, 'Speicher-Nachrüstung 7,7 kWh', k2, 'aktiv', 'Bergweg 3', '8662', 'Mitterdorf im Mürztal',
     'Bestehende PV 8 kWp (Fronius), Speicher BYD 7,7 kWh im Keller, Notstrom-Umschaltung.', v_chef),
    (p3, 'E-Befund Wohnhaus Stiege 1–3', k3, 'aktiv', 'Wiener Straße 22', '8680', 'Mürzzuschlag',
     'Befund nach ÖVE/ÖNORM E 8001 für 18 Wohnungen, Mieter sind informiert. Schlüssel bei der Hausbesorgerin.', v_chef),
    (p4, 'Gewerbe-PV 30 kWp Hallendach', k4, 'aktiv', 'Industriestraße 9', '8605', 'Kapfenberg',
     'Trapezblech, 66 Module, 2 Wechselrichter 15 kW. Steiger nötig, Kran am Mittwoch.', v_chef),
    (p5, 'Kundendienst und Störungen 2026', k5, 'aktiv', 'Am Anger 2', '8641', 'St. Marein im Mürztal',
     'FI in der Küche löst sporadisch aus, Wechselrichter meldet Isolationsfehler.', v_chef)
  on conflict (id) do nothing;

  -- ── Einsätze und Büro-Termine: feste IDs aus md5, vorher weg ────────────
  delete from termine where id in (select md5('demo-kalender-' || n)::uuid from generate_series(1, 60) n);
  insert into termine (id, titel, beschreibung, ort, datum, bis_datum, von, bis, ganztags, projekt_id, mitarbeiter, fahrzeuge, team_id, dringend, user_id)
  select md5('demo-kalender-' || x.n)::uuid, x.titel, x.text, x.ort, w + x.tag, case when x.bis_tag > x.tag then w + x.bis_tag end,
         x.von::time, x.bis::time, false, x.p, array_remove(x.leute, null), array_remove(x.fz, null), x.team, x.dringend, v_chef
    from (values
      -- diese Woche
      (1, 'PV-Montage – Unterkonstruktion und Module', 'Schienen, Dachhaken, Module Süddach', 'Hauptstraße 14, 8650 Kindberg', 0, 1, '07:00', '15:30', p1, array[v_max], array[f_bus1], null, false),
      (2, 'Speicher setzen und anschließen', 'Speicher in den Keller, Notstrom-Umschaltung vorbereiten', 'Bergweg 3, 8662 Mitterdorf im Mürztal', 2, 2, '07:30', '14:00', p2, array[v_eva, v_lukas], array[f_bus2], t_eva, false),
      (3, 'Störung: Wechselrichter Isolationsfehler', 'Fehler 475 — Strings einzeln messen', 'Am Anger 2, 8641 St. Marein im Mürztal', 3, 3, '13:00', '15:00', p5, array[v_sarah], array[f_pkw], t_kd, true),
      (4, 'Besichtigung Hallendach', 'Dachstatik, Leitungsweg zum Verteiler', 'Industriestraße 9, 8605 Kapfenberg', 1, 1, '09:00', '10:30', p4, array[v_chef], array[]::uuid[], null, false),
      (5, 'Beratung Speicher-Nachrüstung', 'Notstrom ja/nein, Förderung', 'Büro', 2, 2, '13:00', '14:30', p2, array[v_chef], array[]::uuid[], null, false),
      (6, 'Förderansuchen Klimafonds', 'Unterlagen hochladen, Datenblätter', 'Büro', 0, 0, '08:00', '12:00', p1, array[v_julia], array[]::uuid[], null, false),
      (7, 'Netzanmeldung Energienetze', 'Anlagendaten, Datenblätter Wechselrichter', 'Büro', 2, 2, '09:00', '10:00', p4, array[v_julia], array[]::uuid[], null, false),
      (8, 'Lieferantengespräch Großhandel', 'Module, Lieferzeiten Speicher', 'Büro', 4, 4, '10:00', '11:30', null, array[v_julia, v_chef], array[]::uuid[], null, false),
      -- nächste Woche
      (20, 'PV Gewerbe – Unterkonstruktion', 'Steiger mitnehmen, Absturzsicherung!', 'Industriestraße 9, 8605 Kapfenberg', 7, 8, '07:00', '15:30', p4, array[v_tom, v_jonas], array[f_bus3, f_steiger], t_tom, false),
      (21, 'PV Gewerbe – Module und DC-Verkabelung', null, 'Industriestraße 9, 8605 Kapfenberg', 10, 11, '07:00', '15:30', p4, array[v_tom, v_jonas], array[f_bus3], t_tom, false),
      (22, 'PV-Montage – Wechselrichter und Speicher', 'AC-Anschluss, Speicher, Inbetriebnahme', 'Hauptstraße 14, 8650 Kindberg', 9, 11, '07:00', '15:30', p1, array[v_max, v_lisa], array[f_bus1], t_max, false),
      (23, 'E-Befund Stiege 1', 'Wohnungen 1–6, Isolationsmessung', 'Wiener Straße 22, 8680 Mürzzuschlag', 9, 9, '07:30', '12:00', p3, array[v_eva, v_lukas], array[f_bus2], t_eva, false),
      (24, 'E-Befund Stiege 2', 'Wohnungen 7–12', 'Wiener Straße 22, 8680 Mürzzuschlag', 10, 10, '07:30', '12:00', p3, array[v_eva], array[f_bus2], null, false),
      (25, 'Störung: FI löst aus', 'Küche, nach dem Geschirrspüler', 'Am Anger 2, 8641 St. Marein im Mürztal', 7, 7, '07:30', '09:30', p5, array[v_sarah], array[f_pkw], t_kd, true),
      (26, 'Speicher – Inbetriebnahme und Einschulung', 'App einrichten, Notstrom testen', 'Bergweg 3, 8662 Mitterdorf im Mürztal', 9, 9, '13:00', '15:30', p2, array[v_sarah], array[f_pkw], t_kd, false),
      (27, 'Baubesprechung Kogler', 'Kran Mittwoch, Zufahrt', 'Industriestraße 9, 8605 Kapfenberg', 7, 7, '07:00', '08:00', p4, array[v_chef], array[]::uuid[], null, false),
      (28, 'Beratung PV Familie Leitner', 'Neuanfrage 10 kWp, Termin im Büro', 'Büro', 8, 8, '10:00', '11:30', null, array[v_chef], array[]::uuid[], null, false),
      (29, 'Besichtigung Dach Leitner', 'Ausrichtung, Zählerkasten fotografieren', 'Bruck an der Mur', 10, 10, '09:00', '10:00', null, array[v_chef], array[]::uuid[], null, false),
      (30, 'Abnahme mit Netzbetreiber', 'Zähler tauschen lassen', 'Hauptstraße 14, 8650 Kindberg', 11, 11, '13:00', '14:00', p1, array[v_chef], array[]::uuid[], null, false),
      (33, 'PV Gewerbe – Kran: Module aufs Dach', 'Kran ab 12 Uhr bestellt', 'Industriestraße 9, 8605 Kapfenberg', 9, 9, '12:00', '15:30', p4, array[v_tom, v_jonas], array[f_bus3], t_tom, false),
      (31, 'Rechnungslauf und Mahnungen', null, 'Büro', 7, 7, '08:00', '09:30', null, array[v_julia], array[]::uuid[], null, false),
      (32, 'Förderstatus nachfassen', 'Rainer und Haas', 'Büro', 8, 8, '13:00', '14:00', p1, array[v_julia], array[]::uuid[], null, false)
    ) as x(n, titel, text, ort, tag, bis_tag, von, bis, p, leute, fz, team, dringend)
   where x.p is null or exists (select 1 from projekte where id = x.p);

  -- ── Urlaub (Julia) und Krankenstand (Lisa) nächste Woche ───────────────
  delete from abwesenheiten where id in (md5('demo-kalender-urlaub')::uuid, md5('demo-kalender-krank')::uuid);
  if v_julia is not null then
    insert into abwesenheiten (id, user_id, art, von, bis, notiz, status, entschieden_von, entschieden_am, erstellt_von)
    values (md5('demo-kalender-urlaub')::uuid, v_julia, 'urlaub', w + 10, w + 11, 'Verlängertes Wochenende', 'genehmigt', v_chef, now(), v_julia);
  end if;
  if v_lisa is not null then
    insert into abwesenheiten (id, user_id, art, von, bis, notiz, status, entschieden_von, entschieden_am, erstellt_von)
    values (md5('demo-kalender-krank')::uuid, v_lisa, 'krank', w + 7, w + 8, 'Krankmeldung per Telefon', 'genehmigt', v_chef, now(), v_lisa);
  end if;
end $$;
