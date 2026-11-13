-- ============================================================================
--  Demo Paket G Personal: Aufgaben mit Verlauf, interne (unproduktive)
--  Stunden, Mitarbeiter-Dokumente (Lohnzettel Vormonat, Krankenschein,
--  Anmeldung) und Firmendokumente. Läuft nach 01–03, wiederholbar:
--    scripts/sql.sh -f supabase/demo/04-personal.sql
--  Danach die PDFs dazu erzeugen und hochladen:
--    DEMO_CHEF_PASSWORT=… node supabase/demo/personal-dokumente.mjs
--
--  Legt nur ZUSÄTZLICH an und räumt nur die eigenen Zeilen weg:
--  Aufgaben mit fester ID (md5 'demo-g-aufgabe-…'), interne Stunden ohne
--  „erstellt_von“ (die App setzt es immer), Dokumente mit „/demo-“ im Pfad.
--  Alle Tage relativ zu heute — die Demo bleibt aktuell.
-- ============================================================================
do $$
declare
  d date := current_date;
  v_chef  uuid := (select id from profiles where email = 'chef@elektro.handwerkapp.at');
  v_max   uuid := (select id from profiles where email = 'max@elektro.handwerkapp.at');
  v_lisa  uuid := (select id from profiles where email = 'lisa@elektro.handwerkapp.at');
  v_tom   uuid := (select id from profiles where email = 'tom@elektro.handwerkapp.at');
  v_eva   uuid := (select id from profiles where email = 'eva@elektro.handwerkapp.at');
  v_lukas uuid := (select id from profiles where email in ('lukas@elektro.handwerkapp.at', 'stefan@elektro.handwerkapp.at') limit 1);
  v_sarah uuid := (select id from profiles where email = 'sarah@elektro.handwerkapp.at');
  v_jonas uuid := (select id from profiles where email = 'jonas@elektro.handwerkapp.at');
  -- eine laufende PV-Baustelle (die echten SETEC-Probeprojekte 0009–0011 nie)
  p_pv uuid := coalesce(
    (select id from projekte where status = 'aktiv' and name ilike '%PV%' and nummer not in ('2026-0009', '2026-0010', '2026-0011') order by nummer limit 1),
    (select id from projekte where nummer = '2026-0001'));
  p_huber uuid := (select id from projekte where nummer = '2026-0001');
  p_auto uuid := (select id from projekte where nummer = '2026-0008');
  monteure uuid[];
  vormonat date := (date_trunc('month', current_date) - interval '1 month')::date;
  a uuid;
  t date;
  schon numeric;
  krank record;
  aid uuid[] := array(select md5('demo-g-aufgabe-' || n)::uuid from generate_series(1, 12) n);
begin
  monteure := array_remove(array[v_max, v_tom, v_eva, v_lukas, v_sarah, v_jonas, v_lisa], null);

  -- ── Aufräumen (nur eigene Demo-Zeilen) ────────────────────────────────
  delete from aufgaben where id = any (aid);
  -- Folgeaufgaben, die beim Vorführen aus wiederkehrenden Demo-Aufgaben entstanden sind
  delete from aufgaben where titel in ('Werkstatt aufräumen, Kabelreste entsorgen', 'Sicherheitsunterweisung Steiger und Hubarbeitsbühne')
    and erstellt_von = v_chef;
  delete from zeiten where intern is not null and erstellt_von is null and rechnung_id is null;
  delete from personal_dokumente where pfad like '%/demo-%';
  delete from firmen_dokumente where pfad like 'firma/demo-%';

  -- ── Aufgaben: ohne Trigger, damit Zeitpunkte und Verlauf stimmen ───────
  alter table aufgaben disable trigger aufgaben_regeln;
  alter table aufgaben disable trigger aufgaben_protokoll;

  insert into aufgaben (id, titel, beschreibung, zustaendig, faellig_am, prioritaet, status, projekt_id, wiederholung, erledigt_am, erledigt_von, erstellt_von, created_at, updated_at) values
    (aid[1], 'Zählpunkt beim Netzbetreiber anmelden (Fertigmeldung PV)', 'Fertigmeldung mit Anlagenpass und Inbetriebnahmeprotokoll hochladen. Wechselrichter-Seriennummer steht am Typenschild.',
      array[v_lukas], d - 3, 'hoch', 'offen', p_pv, null, null, null, v_chef, now() - interval '6 days', now() - interval '6 days'),
    (aid[2], 'Förderantrag Klima- und Energiefonds einreichen', 'Rechnung, Fotos der Anlage und Netzzugangsvertrag beilegen. Frist laut Registrierung beachten.',
      array[v_chef], d + 2, 'hoch', 'in_arbeit', p_pv, null, null, null, v_chef, now() - interval '5 days', now() - interval '1 day'),
    (aid[3], 'Speicher-Erweiterungsmodul nachbestellen', 'Ein Batteriemodul fehlte in der Lieferung — beim Großhändler reklamieren und nachbestellen.',
      array[v_max], d - 1, 'normal', 'offen', p_pv, null, null, null, v_chef, now() - interval '4 days', now() - interval '4 days'),
    (aid[4], 'Bus 2 zum Pickerl bringen', 'Termin in der Werkstatt ist ausgemacht, Schlüssel liegt im Büro.',
      array[v_tom], d + 5, 'normal', 'offen', null, null, null, null, v_chef, now() - interval '3 days', now() - interval '3 days'),
    (aid[5], 'Messprotokoll E-Befund fertigschreiben', 'Isolationswerte Stiege 2 nachtragen, dann an das Büro.',
      array[v_eva], d, 'normal', 'in_arbeit', null, null, null, null, v_chef, now() - interval '2 days', now() - interval '3 hours'),
    (aid[6], 'Werkstatt aufräumen, Kabelreste entsorgen', 'Kupfer in den Container hinten, Kabeltrommeln zurück ins Regal.',
      array[v_lisa, v_jonas], d + 1, 'niedrig', 'offen', null, 'woechentlich', null, null, v_chef, now() - interval '13 days', now() - interval '13 days'),
    (aid[7], 'Kundendienst: FI löst aus — Kunden zurückrufen', 'Kunde meldet: FI fällt bei Regen. Außensteckdose prüfen.',
      array[v_max], d - 2, 'hoch', 'erledigt', p_huber, null, now() - interval '1 day 2 hours', v_max, v_chef, now() - interval '3 days', now() - interval '1 day 2 hours'),
    (aid[8], 'Monitoring-Zugang für den Kunden einrichten', 'Kunde in der Hersteller-App einladen, Anlage freigeben.',
      array[v_sarah], d - 2, 'normal', 'erledigt', p_pv, null, now() - interval '2 days 4 hours', v_sarah, v_chef, now() - interval '5 days', now() - interval '2 days 4 hours'),
    (aid[9], 'Angebot Wallbox Autohaus nachfassen', null,
      array[v_chef], d + 7, 'niedrig', 'offen', p_auto, null, null, null, v_chef, now() - interval '1 day', now() - interval '1 day'),
    (aid[10], 'Sicherheitsunterweisung Steiger und Hubarbeitsbühne', 'Jährliche Unterweisung — Unterlage liegt unter Dokumente → Sicherheit. Unterschreiben und abhaken.',
      monteure, d + 10, 'normal', 'offen', null, 'jaehrlich', null, null, v_chef, now() - interval '2 days', now() - interval '2 days'),
    (aid[11], 'Lieferscheine der Vorwoche mit Eingangsrechnung abgleichen', null,
      array[v_chef], d - 4, 'normal', 'erledigt', null, null, now() - interval '4 days', v_chef, v_chef, now() - interval '8 days', now() - interval '4 days'),
    (aid[12], 'Zählerkasten beschriften', 'Stromkreise laut Plan beschriften, Foto davon hier anhängen.',
      array[v_max], null, 'normal', 'offen', p_huber, null, null, null, v_max, now() - interval '1 day', now() - interval '1 day');

  -- Verlauf: angelegt für alle, dazu Status und Kommentare
  insert into aufgabe_verlauf (aufgabe_id, user_id, art, text, created_at)
    select id, erstellt_von, 'angelegt', null, created_at from aufgaben where id = any (aid);
  insert into aufgabe_verlauf (aufgabe_id, user_id, art, text, created_at) values
    (aid[1], v_lukas, 'kommentar', 'Inbetriebnahmeprotokoll fehlt noch die Unterschrift vom Kunden — hole ich morgen.', now() - interval '4 days'),
    (aid[1], v_chef, 'geaendert', 'Priorität hoch', now() - interval '2 days'),
    (aid[2], v_chef, 'status', 'in_arbeit', now() - interval '1 day'),
    (aid[2], v_chef, 'kommentar', 'Registrierung erledigt, Fotos fehlen noch vom Dach.', now() - interval '1 day'),
    (aid[3], v_max, 'kommentar', 'Großhändler sagt: Lieferung nächste Woche.', now() - interval '2 days'),
    (aid[5], v_eva, 'status', 'in_arbeit', now() - interval '3 hours'),
    (aid[7], v_max, 'status', 'in_arbeit', now() - interval '2 days 1 hour'),
    (aid[7], v_max, 'kommentar', 'Außensteckdose Terrasse: Wasser in der Dose. Dose getauscht, FI hält.', now() - interval '1 day 2 hours'),
    (aid[7], v_max, 'status', 'erledigt', now() - interval '1 day 2 hours'),
    (aid[8], v_sarah, 'status', 'erledigt', now() - interval '2 days 4 hours'),
    (aid[10], v_chef, 'geaendert', 'Fällig ' || to_char(d + 7, 'DD.MM.YYYY') || ' → ' || to_char(d + 10, 'DD.MM.YYYY'), now() - interval '1 day'),
    (aid[11], v_chef, 'status', 'erledigt', now() - interval '4 days');

  alter table aufgaben enable trigger aufgaben_regeln;
  alter table aufgaben enable trigger aufgaben_protokoll;

  -- ── Interne Stunden ────────────────────────────────────────────────────
  -- Chef: die letzten vier Wochen den Rest des Tages im Büro
  for t in select g::date from generate_series(d - 28, d - 1, interval '1 day') g loop
    continue when extract(isodow from t) > 5 or t in ('2026-10-26', '2026-11-01', '2026-12-08');
    select coalesce(sum(stunden), 0) into schon from zeiten where user_id = v_chef and datum = t;
    if schon < 7 then
      insert into zeiten (user_id, datum, stunden, intern, taetigkeit, art)
      values (v_chef, t, least(8 - schon, 8), 'Büro',
        (array['Angebote kalkuliert, Förderanträge', 'Rechnungen, Eingangsrechnungen geprüft', 'Material bestellt, Lieferanten', 'Planung PV-Anlagen, Netzanfragen'])[1 + (extract(day from t)::int % 4)], 'arbeit');
    end if;
  end loop;
  -- Lisa (Lehrling): freitags Lager/Werkstatt; Tom: Fahrzeugpflege; Jonas: Schulung; Sarah: Besprechung
  for t in select g::date from generate_series(d - 28, d - 1, interval '1 day') g where extract(isodow from g) = 5 loop
    insert into zeiten (user_id, datum, stunden, intern, taetigkeit, art) values (v_lisa, t, 1.5, 'Lager/Werkstatt', 'Lager aufgeräumt, Kabelreste sortiert', 'arbeit');
  end loop;
  if v_tom is not null then
    insert into zeiten (user_id, datum, stunden, intern, taetigkeit, art)
    values (v_tom, d - ((extract(isodow from d)::int + 1) % 7 + 1), 1, 'Fahrzeugpflege', 'Bus 2 gewaschen, Reifendruck', 'arbeit');
  end if;
  if v_jonas is not null then
    insert into zeiten (user_id, datum, stunden, intern, taetigkeit, art)
    values (v_jonas, d - 8 - case extract(isodow from d - 8)::int when 6 then 1 when 7 then 2 else 0 end, 4, 'Schulung', 'Herstellerschulung Hybrid-Wechselrichter', 'arbeit');
  end if;
  if v_sarah is not null then
    insert into zeiten (user_id, datum, stunden, intern, taetigkeit, art)
    values (v_sarah, d - (extract(isodow from d)::int - 1) - 7, 1, 'Besprechung', 'Wochenbesprechung Kundendienst', 'arbeit');
  end if;

  -- ── Mitarbeiter-Dokumente ──────────────────────────────────────────────
  -- Lohnzettel Vormonat für jeden Monteur, ungelesen (Hinweis auf der Startseite)
  insert into personal_dokumente (user_id, art, monat, pfad, name, mime, gelesen_am, hochgeladen_von, created_at)
    select u, 'lohnzettel', vormonat, u || '/demo-lohnzettel-' || to_char(vormonat, 'YYYY-MM') || '.pdf',
      'Lohnzettel ' || to_char(vormonat, 'MM-YYYY') || '.pdf', 'application/pdf', null, v_chef, now() - interval '1 day'
    from unnest(monteure) u;
  -- Lisa schon den Monat davor (gelesen)
  insert into personal_dokumente (user_id, art, monat, pfad, name, mime, gelesen_am, hochgeladen_von, created_at)
    values (v_lisa, 'lohnzettel', (vormonat - interval '1 month')::date, v_lisa || '/demo-lohnzettel-' || to_char(vormonat - interval '1 month', 'YYYY-MM') || '.pdf',
      'Lohnzettel ' || to_char(vormonat - interval '1 month', 'MM-YYYY') || '.pdf', 'application/pdf', now() - interval '30 days', v_chef, now() - interval '32 days'),
    (v_lisa, 'anmeldung', null, v_lisa || '/demo-anmeldung-oegk.pdf', 'Anmeldung ÖGK Lehrling.pdf', 'application/pdf', now() - interval '60 days', v_chef, now() - interval '70 days');
  -- Krankenschein zur letzten Krankmeldung (sonst einer von letzter Woche)
  select a2.user_id, a2.von, a2.bis into krank from abwesenheiten a2
    where a2.art = 'krank' and a2.status = 'genehmigt' and a2.von <= d order by a2.von desc limit 1;
  insert into personal_dokumente (user_id, art, titel, pfad, name, mime, gelesen_am, hochgeladen_von, created_at)
    values (coalesce(krank.user_id, v_lisa), 'krankenschein',
      'Krankenstand ' || to_char(coalesce(krank.von, d - 4), 'DD.MM.') || '–' || to_char(coalesce(krank.bis, d - 3), 'DD.MM.YYYY'),
      coalesce(krank.user_id, v_lisa) || '/demo-krankenschein.pdf', 'Arbeitsunfähigkeitsmeldung.pdf', 'application/pdf',
      now() - interval '2 days', coalesce(krank.user_id, v_lisa), now() - interval '2 days');
  -- Zertifikat bei Eva
  insert into personal_dokumente (user_id, art, titel, pfad, name, mime, gelesen_am, hochgeladen_von, created_at)
    values (v_eva, 'zeugnis', 'Befähigung Elektrotechnik — E-Befund', v_eva || '/demo-zertifikat-e-befund.pdf', 'Zertifikat E-Befund.pdf', 'application/pdf', now() - interval '90 days', v_chef, now() - interval '90 days');

  -- ── Firmendokumente ────────────────────────────────────────────────────
  insert into firmen_dokumente (ordner, titel, beschreibung, gueltig_bis, nur_chef, pfad, name, mime, hochgeladen_von, created_at) values
    ('Vorlagen', 'Inbetriebnahmeprotokoll PV-Anlage', 'Vorlage zum Ausdrucken — Anlagendaten, Messwerte, Unterschrift Kunde', null, false, 'firma/demo-inbetriebnahme-pv.pdf', 'Inbetriebnahmeprotokoll PV.pdf', 'application/pdf', v_chef, now() - interval '40 days'),
    ('Vorlagen', 'Anlagenpass PV', null, null, false, 'firma/demo-anlagenpass.pdf', 'Anlagenpass PV.pdf', 'application/pdf', v_chef, now() - interval '40 days'),
    ('Vorlagen', 'Übergabeprotokoll Speicher', null, null, false, 'firma/demo-uebergabe-speicher.pdf', 'Übergabe Speicher.pdf', 'application/pdf', v_chef, now() - interval '35 days'),
    ('Zertifikate', 'Konzession Elektrotechnik', null, null, false, 'firma/demo-konzession.pdf', 'Gewerbeberechtigung.pdf', 'application/pdf', v_chef, now() - interval '200 days'),
    ('Zertifikate', 'Service-Partner Wechselrichter', 'Zertifizierter Installationsbetrieb — jährlich erneuern', d + 20, false, 'firma/demo-servicepartner.pdf', 'Service-Partner Zertifikat.pdf', 'application/pdf', v_chef, now() - interval '340 days'),
    ('Versicherungen', 'Betriebshaftpflicht Polizze', 'Deckung 3 Mio. €', (date_trunc('year', d) + interval '1 year - 1 day')::date, true, 'firma/demo-haftpflicht.pdf', 'Polizze Betriebshaftpflicht.pdf', 'application/pdf', v_chef, now() - interval '300 days'),
    ('Versicherungen', 'Kfz-Flotte Polizze', null, (date_trunc('year', d) + interval '1 year - 1 day')::date, true, 'firma/demo-kfz.pdf', 'Polizze Kfz-Flotte.pdf', 'application/pdf', v_chef, now() - interval '300 days'),
    ('Prüfberichte', 'Leitern und Tritte — Prüfung', null, d - 5, false, 'firma/demo-pruefung-leitern.pdf', 'Prüfbericht Leitern.pdf', 'application/pdf', v_chef, now() - interval '370 days'),
    ('Prüfberichte', 'Messgeräte kalibriert', 'Installationstester und Zangenmessgerät', d + 150, false, 'firma/demo-kalibrierung.pdf', 'Kalibrierschein.pdf', 'application/pdf', v_chef, now() - interval '215 days'),
    ('Sicherheit', 'Unterweisung Steiger und Hubarbeitsbühne', null, null, false, 'firma/demo-unterweisung-steiger.pdf', 'Unterweisung Steiger.pdf', 'application/pdf', v_chef, now() - interval '20 days'),
    ('Sicherheit', 'Arbeitsplatzevaluierung (ASchG)', null, null, false, 'firma/demo-evaluierung.pdf', 'Evaluierung.pdf', 'application/pdf', v_chef, now() - interval '180 days');
end $$;
