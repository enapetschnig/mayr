-- ============================================================================
--  Demo-Daten der Elektriker-App — setzt ALLES auf den Demo-Stand zurück.
--
--  Läuft als EIN Befehl (DO-Block), damit `supabase db query` ihn annimmt:
--    sql.sh -f supabase/demo/01-stamm.sql   (danach 02-artikel.sql, 03-verlauf.sql)
--  Benutzer (chef/max/lisa) und die Zeile `firma` bleiben, alles andere wird
--  gelöscht und neu angelegt. Dateien im Storage vorher über die Storage-API
--  löschen (SQL darf storage.objects nicht anfassen).
--
--  Alle Firmen- und Kundendaten sind erfunden und als Demo erkennbar
--  (Musterstraße, .demo-Adressen, ungültige IBAN AT00…, UID ATU00000000).
-- ============================================================================
do $$
declare
  v_chef uuid := (select id from profiles where email = 'chef@elektro.handwerkapp.at');
  v_max  uuid := (select id from profiles where email = 'max@elektro.handwerkapp.at');
  v_lisa uuid := (select id from profiles where email = 'lisa@elektro.handwerkapp.at');
  k_huber uuid; k_gruber uuid; k_sonnenhof uuid; k_berger uuid; k_kirchenwirt uuid;
begin
  -- Festschreib-Trigger (fertige Rechnungen, unterschriebene Regieberichte,
  -- verrechnete Buchungen) nur für das Zurücksetzen aus. Läuft in EINER
  -- Transaktion — bricht etwas ab, sind sie sofort wieder an.
  -- (session_replication_role darf die Rolle postgres hier nicht setzen.)
  alter table beleg_positionen disable trigger user;
  alter table regieberichte disable trigger user;
  alter table zeiten disable trigger user;
  alter table material_buchungen disable trigger user;
  delete from beleg_positionen;
  delete from material_buchungen;
  delete from zeiten;
  delete from regieberichte;
  delete from belege;
  delete from dateien;
  delete from termine;
  delete from projekte;
  delete from kunden;
  delete from leistung_material;
  delete from leistungen;
  delete from artikel_codes;
  delete from artikel;
  delete from lagerorte;
  delete from nummernkreise;
  alter table beleg_positionen enable trigger user;
  alter table regieberichte enable trigger user;
  alter table zeiten enable trigger user;
  alter table material_buchungen enable trigger user;
  perform setval(pg_get_serial_sequence('kunden', 'nummer'), 1001, false);

  -- ── Betrieb ──────────────────────────────────────────────────────────────
  update firma set
    name = 'Elektro Muster GmbH',
    zusatz = 'Elektrotechnik · Photovoltaik · Smart Home',
    inhaber = 'Martin Muster',
    strasse = 'Musterstraße 1',
    plz = '4020',
    ort = 'Linz',
    land = 'Österreich',
    telefon = '+43 000 0000000',
    email = 'office@elektro-muster.demo',
    website = 'www.elektro-muster.demo',
    uid = 'ATU00000000',
    firmenbuch = 'FN 000000a (Demo)',
    bank_name = 'Demo Bank',
    iban = 'AT00 0000 0000 0000 0000',
    bic = 'DEMOATW1',
    farbe = '#1D4ED8',
    stundensatz = 72,
    material_aufschlag = 35,
    zahlungsziel_tage = 14,
    angebot_gueltig_tage = 30,
    kleinunternehmer = false,
    angebot_einleitung = E'Sehr geehrte Damen und Herren,\nvielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen folgende Leistungen an:',
    angebot_schluss = 'Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen gerne zur Verfügung.',
    rechnung_einleitung = 'Für die durchgeführten Arbeiten erlauben wir uns, wie folgt zu verrechnen:',
    rechnung_schluss = 'Vielen Dank für Ihren Auftrag!',
    fusszeile = null
  where id = 1;

  -- ── Lager und Busse ──────────────────────────────────────────────────────
  insert into lagerorte (name, art, user_id, aktiv, reihenfolge) values
    ('Hauptlager', 'lager', null, true, 0),
    ('Bus 1 · Max', 'fahrzeug', v_max, true, 1),
    ('Bus 2 · Martin', 'fahrzeug', v_chef, true, 2);

  -- ── Kunden ───────────────────────────────────────────────────────────────
  insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, uid, notiz)
    values ('Familie Huber', 'Thomas Huber', 'Musterstraße 12', '4020', 'Linz', '+43 000 0000101', 'huber@beispiel.demo', null, 'Neubau, Bauherr erreichbar ab 17 Uhr')
    returning id into k_huber;
  insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, uid, notiz)
    values ('Bäckerei Gruber GmbH', 'Anna Gruber', 'Hauptplatz 3', '4600', 'Wels', '+43 000 0000102', 'office@baeckerei-gruber.demo', 'ATU00000001', null)
    returning id into k_gruber;
  insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, uid, notiz)
    values ('Hausverwaltung Sonnenhof', 'Ing. Peter Leitner', 'Sonnenweg 8', '4040', 'Linz', '+43 000 0000103', 'office@sonnenhof-hv.demo', 'ATU00000002', 'Rechnungen bitte per E-Mail')
    returning id into k_sonnenhof;
  insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, uid, notiz)
    values ('Familie Berger', 'Julia Berger', 'Am Bach 4', '4210', 'Gallneukirchen', '+43 000 0000104', 'berger@beispiel.demo', null, null)
    returning id into k_berger;
  insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, uid, notiz)
    values ('Gasthaus Zum Kirchenwirt', 'Josef Kern', 'Kirchenplatz 1', '4320', 'Perg', '+43 000 0000105', 'kirchenwirt@beispiel.demo', 'ATU00000003', 'Ruhetag Montag')
    returning id into k_kirchenwirt;

  -- ── Projekte (Nummer vergibt der Trigger: 2026-0001 …) ────────────────────
  insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von) values
    ('Neubau EFH Huber', k_huber, 'aktiv', 'Musterstraße 12', '4020', 'Linz',
     'Komplette Elektroinstallation Neubau: Verteiler, Leerverrohrung, Schalterprogramm, Netzwerk.', v_chef);
  insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von) values
    ('Bäckerei Gruber – LED-Umrüstung', k_gruber, 'aktiv', 'Hauptplatz 3', '4600', 'Wels',
     'Verkaufsraum und Backstube auf LED umrüsten, Notbeleuchtung prüfen.', v_chef);
  insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von) values
    ('Sonnenhof Stiege 2 – Zählerplatz', k_sonnenhof, 'verrechnen', 'Sonnenweg 8', '4040', 'Linz',
     'Zählerplatz erneuern, Steigleitung tauschen, Hauptleitungsabzweiger.', v_chef);
  insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von) values
    ('Badsanierung Berger', k_berger, 'angebot', 'Am Bach 4', '4210', 'Gallneukirchen',
     'Bad und WC: Steckdosen, Spiegelleuchte, Spots, Lüfter, Potentialausgleich.', v_chef);
  insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von) values
    ('Kirchenwirt – Regiearbeiten', k_kirchenwirt, 'aktiv', 'Kirchenplatz 1', '4320', 'Perg',
     'Laufende Störungen und Kleinaufträge nach Regie.', v_chef);

  -- ── Leistungskatalog (Preis leer = Material-VK + Minuten × Stundensatz) ──
  insert into leistungen (nummer, kurztext, langtext, kategorie, einheit, minuten, preis, suchwoerter, aktiv, reihenfolge) values
    ('01.01', 'Steckdose UP komplett', 'Schutzkontakt-Steckdose unter Putz, inkl. Gerätedose, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 25, null, 'steckdose schuko dose', true, 101),
    ('01.02', 'Doppelsteckdose UP komplett', 'Zweifach-Schutzkontakt-Steckdose unter Putz, inkl. Gerätedosen, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 30, null, 'doppelsteckdose zweifach 2fach', true, 102),
    ('01.03', 'Steckdose Feuchtraum AP IP44', 'Schutzkontakt-Steckdose Aufputz, spritzwassergeschützt IP44', 'Schalter & Steckdosen', 'Stk', 25, 42, 'feuchtraum nassraum aufputz ip44 garten', true, 103),
    ('01.04', 'Ausschalter UP komplett', 'Ausschalter unter Putz, inkl. Gerätedose, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 20, null, 'schalter ausschalter lichtschalter', true, 104),
    ('01.05', 'Wechselschalter UP komplett', 'Wechselschalter unter Putz, inkl. Gerätedose, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 25, null, 'wechselschalter wechsel', true, 105),
    ('01.06', 'Kreuzschalter UP komplett', 'Kreuzschalter unter Putz, inkl. Gerätedose, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 30, null, 'kreuzschalter kreuz', true, 106),
    ('01.07', 'Serienschalter UP komplett', 'Serienschalter unter Putz, inkl. Gerätedose, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 25, null, 'serienschalter serie', true, 107),
    ('01.08', 'Taster UP komplett', 'Taster unter Putz, inkl. Gerätedose, Anschluss und Abdeckung', 'Schalter & Steckdosen', 'Stk', 20, null, 'taster', true, 108),
    ('01.09', 'Bewegungsmelder UP', 'Bewegungsmelder unter Putz 180°, inkl. Anschluss und Einstellung', 'Schalter & Steckdosen', 'Stk', 30, null, 'bewegungsmelder präsenzmelder melder', true, 109),
    ('02.01', 'Leerverrohrung Flexrohr M20', 'Isolierrohr flexibel M20 liefern und verlegen', 'Leitungen & Verrohrung', 'm', 3, null, 'rohr flexrohr verrohrung leerrohr', true, 201),
    ('02.02', 'Mantelleitung 3x1,5 verlegen', 'Mantelleitung YM-J 3x1,5 mm² liefern und verlegen', 'Leitungen & Verrohrung', 'm', 2, null, 'leitung kabel ym nym 3x1,5', true, 202),
    ('02.03', 'Mantelleitung 5x2,5 verlegen', 'Mantelleitung YM-J 5x2,5 mm² liefern und verlegen', 'Leitungen & Verrohrung', 'm', 3, null, 'leitung kabel ym nym 5x2,5 drehstrom', true, 203),
    ('02.04', 'Schlitz stemmen und verputzen', 'Mauerschlitz für Leitungen stemmen und nach Verlegung verschließen', 'Leitungen & Verrohrung', 'm', 10, null, 'stemmen schlitz verputzen', true, 204),
    ('02.05', 'Hohlwanddose setzen', 'Hohlwand-Gerätedose bohren und setzen', 'Leitungen & Verrohrung', 'Stk', 8, null, 'dose hohlwanddose rigips', true, 205),
    ('03.01', 'Kleinverteiler 3-reihig komplett', 'Kleinverteiler 3-reihig setzen, Hutschienen bestücken, verdrahten und beschriften', 'Verteiler', 'Stk', 240, null, 'verteiler unterverteiler kleinverteiler', true, 301),
    ('03.02', 'Leitungsschutzschalter B16', 'Leitungsschutzschalter 1-polig B16 liefern, einbauen und anschließen', 'Verteiler', 'Stk', 10, null, 'ls sicherung leitungsschutzschalter b16 automat', true, 302),
    ('03.03', 'FI-Schutzschalter 40A/30mA', 'Fehlerstromschutzschalter 4-polig 40 A / 30 mA liefern, einbauen und prüfen', 'Verteiler', 'Stk', 20, null, 'fi fehlerstromschutzschalter rcd', true, 303),
    ('03.04', 'FI/LS-Schalter einbauen', 'FI/LS-Kombischalter B16 / 30 mA liefern, einbauen und prüfen', 'Verteiler', 'Stk', 15, null, 'fi/ls fi-ls kombi', true, 304),
    ('03.05', 'Überspannungsschutz Typ 2', 'Überspannungsableiter Typ 2 liefern und im Verteiler einbauen', 'Verteiler', 'Stk', 30, 245, 'überspannung überspannungsschutz spd', true, 305),
    ('04.01', 'Deckenauslass mit Leuchtenmontage', 'Deckenauslass herstellen, beigestellte Leuchte montieren und anschließen', 'Licht', 'Stk', 30, null, 'lampe leuchte deckenauslass auslass deckenlampe', true, 401),
    ('04.02', 'LED-Einbauspot komplett', 'LED-Einbaustrahler liefern, Deckenbohrung herstellen, montieren und anschließen', 'Licht', 'Stk', 20, null, 'spot einbauspot downlight strahler', true, 402),
    ('04.03', 'LED-Panel 60x60 montieren', 'LED-Panel 60x60 cm liefern, in Rasterdecke einsetzen und anschließen', 'Licht', 'Stk', 30, 119, 'panel ledpanel rasterleuchte büroleuchte', true, 403),
    ('05.01', 'Netzwerkdose Cat6 komplett', 'Netzwerkdose Cat6 unter Putz, 2-fach, inkl. Auflegen und Messung', 'Netzwerk & Medien', 'Stk', 30, null, 'netzwerk lan cat6 dose datendose', true, 501),
    ('05.02', 'Netzwerkkabel Cat7 verlegen', 'Datenkabel Cat7 liefern und verlegen', 'Netzwerk & Medien', 'm', 2, null, 'netzwerkkabel cat7 datenkabel lan', true, 502),
    ('05.03', 'TV/SAT-Dose komplett', 'Antennen-Enddose TV/SAT unter Putz, inkl. Anschluss', 'Netzwerk & Medien', 'Stk', 25, null, 'tv sat antenne fernseher dose', true, 503),
    ('06.01', 'Herdanschluss 400 V', 'Herdanschlussdose setzen und E-Herd/Kochfeld anschließen', 'Anschlüsse', 'Stk', 45, null, 'herd herdanschluss eherd kochfeld ceran', true, 601),
    ('06.02', 'Geräteanschluss Küche/Bad', 'Geschirrspüler, Waschmaschine oder Trockner anschließen', 'Anschlüsse', 'Stk', 20, null, 'geschirrspüler waschmaschine trockner anschluss', true, 602),
    ('06.03', 'Boiler anschließen', 'Warmwasserspeicher oder Durchlauferhitzer elektrisch anschließen', 'Anschlüsse', 'Stk', 60, null, 'boiler durchlauferhitzer warmwasser speicher', true, 603),
    ('06.04', 'Wallbox 11 kW montieren', 'Wallbox 11 kW montieren, anschließen, in Betrieb nehmen und einweisen', 'Anschlüsse', 'Stk', 180, null, 'wallbox ladestation eauto elektroauto laden', true, 604),
    ('06.05', 'Badlüfter anschließen', 'Kleinraumventilator montieren und mit Nachlauf anschließen', 'Anschlüsse', 'Stk', 40, null, 'lüfter ventilator badlüfter abluft', true, 605),
    ('07.01', 'Rauchwarnmelder montieren', 'Rauchwarnmelder liefern und montieren', 'Sicherheit', 'Stk', 10, null, 'rauchmelder rauchwarnmelder brandmelder', true, 701),
    ('07.02', 'Potentialausgleich Bad', 'Örtlichen Schutzpotentialausgleich im Bad herstellen', 'Sicherheit', 'Psch', 60, null, 'potentialausgleich erdung pa bad', true, 702),
    ('08.01', 'Anlagenprüfung mit Messprotokoll', 'Prüfung der Anlage nach ÖVE/ÖNORM E 8101 inkl. Messprotokoll', 'Prüfung & Doku', 'Psch', 120, null, 'prüfung messung protokoll befund e8101', true, 801),
    ('08.02', 'Anfahrt', 'Anfahrtspauschale', 'Prüfung & Doku', 'Psch', 0, 35, 'anfahrt fahrt fahrtkosten', true, 802),
    ('08.03', 'Regiestunde Elektriker', 'Arbeitsstunde Elektrotechniker nach Aufwand', 'Prüfung & Doku', 'h', 60, null, 'regie stunde arbeitsstunde aufwand', true, 803);
end $$;
