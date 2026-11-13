-- ============================================================================
--  Demo Paket D (Projekte): PV-Projekte mit Förderstatus, Planung, Regie-Anteil,
--  Lohnkosten und Stundensätze je Mitarbeiter. Läuft nach 03-verlauf.sql:
--    scripts/sql.sh -f supabase/demo/04-projekte.sql
--  danach das Demo-PDF „Dachbelegung“ hochladen:
--    DEMO_CHEF_PASSWORT=… node supabase/demo/planung.mjs
--  Wiederholbar: Projekte, die es schon gibt (gleicher Name), bleiben wie sie
--  sind; die Sätze werden auf den Demo-Stand gesetzt. Namen sind erfunden.
--
--  Was die Demo zeigen soll:
--    PV Pichler   In Arbeit, Förderung zugesagt (OeMAG) mit Frist in 18 Tagen
--                 → Startseite; angenommenes Angebot mit Montagezeiten, Team Tom
--                 hat gebucht (Ampel gelb), Regiebericht Zählerplatz (Regie
--                 getrennt), Planung „Dachbelegung“ (PDF), Termin + WhatsApp
--    PV Weber     abgeschlossen, Fertigstellung gemeldet (Klimafonds)
--    PV Moser     Angebot, Förderantrag vorbereitet (Land Steiermark), Frist in 9 Tagen
-- ============================================================================
do $$
declare
  v_chef  uuid := (select id from profiles where email = 'chef@elektro.handwerkapp.at');
  v_max   uuid := (select id from profiles where email = 'max@elektro.handwerkapp.at');
  v_tom   uuid := (select id from profiles where email = 'tom@elektro.handwerkapp.at');
  v_team  uuid[];
  v_satz  numeric := (select stundensatz from firma where id = 1);
  k uuid; p_pichler uuid; p_weber uuid; p_moser uuid; an uuid; rb uuid;
  v_netto numeric; v_summe numeric := 0; z record;
begin
  if v_chef is null or v_max is null then
    raise exception 'Zuerst die Demo-Konten und 01–03 einspielen.';
  end if;

  -- ── Lohnkosten und Stundensätze je Mitarbeiter (Demo-Werte) ────────────────
  insert into mitarbeiter_saetze (user_id, gueltig_ab, lohnkosten, verrechnungssatz)
  select p.id, v.ab::date, v.lk, v.vs
  from (values
    ('chef',  '2026-01-01', 58.00, 85.00),   -- Meister/GF: Meistersatz
    ('tom',   '2026-01-01', 46.00, 82.00),   -- Partieführer
    ('max',   '2026-01-01', 38.00, null),    -- Standardsatz
    ('max',   '2026-11-01', 39.50, null),    -- Lohnerhöhung ab November
    ('eva',   '2026-01-01', 37.00, null),
    ('lukas', '2026-01-01', 40.00, null),
    ('sarah', '2026-01-01', 36.00, null),
    ('lisa',  '2026-01-01', 22.00, null),    -- Lehrling: Satz über die Lohnart
    ('jonas', '2026-01-01', 21.00, null)
  ) v(login, ab, lk, vs)
  join profiles p on p.email = v.login || '@elektro.handwerkapp.at'
  on conflict (user_id, gueltig_ab) do update set lohnkosten = excluded.lohnkosten, verrechnungssatz = excluded.verrechnungssatz;

  -- ── PV Pichler ────────────────────────────────────────────────────────────
  p_pichler := (select id from projekte where name = 'PV-Anlage 12,3 kWp mit Speicher – Pichler');
  if p_pichler is null then
    insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, email, notiz)
    values ('Familie Pichler (Demo)', 'Andrea Pichler', 'Wiener Straße 88', '8605', 'Kapfenberg', '+43 000 0000121',
            'pichler@example.at', 'Demo-Kunde (erfunden)')
    returning id into k;
    insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von,
                          foerder_status, foerder_stelle, foerder_betrag, foerder_datum, foerder_frist, foerder_notiz)
    values ('PV-Anlage 12,3 kWp mit Speicher – Pichler', k, 'aktiv', 'Wiener Straße 88', '8605', 'Kapfenberg',
            E'30 Module 410 Wp auf Ziegeldach Süd, Hybrid-Wechselrichter 10 kW, Speicher 10 kWh.\nEinspeisebegrenzung 70 %.',
            v_chef, 'zugesagt', 'OeMAG (EAG-Investitionszuschuss)', 2460.00, current_date - 41, current_date + 18,
            'Antrag Nr. DEMO-4711. Fertigstellungsmeldung mit Rechnung und Inbetriebnahmeprotokoll.')
    returning id into p_pichler;

    -- Angenommenes Angebot: Montagezeit an den Positionen + Arbeitszeit = angebotene Stunden
    insert into belege (typ, status, projekt_id, kunde_id, empf_name, empf_strasse, empf_plz, empf_ort, empf_email,
                        datum, gueltig_bis, betreff, erstellt_von)
    select 'angebot', 'entwurf', p_pichler, k, 'Familie Pichler (Demo)', 'Wiener Straße 88', '8605', 'Kapfenberg', 'pichler@example.at',
           current_date - 60, current_date - 30, 'PV-Anlage 12,3 kWp mit Speicher 10 kWh', v_chef
    returning id into an;
    insert into beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id, quelle)
    values
      (an, 1, 'titel',     'PV-Anlage',                                        null, 1,  'Stk',  0,       null,    null, null, null, null),
      (an, 2, 'material',  'PV-Modul 410 Wp Glas-Glas, schwarz',                null, 30, 'Stk',  168.00,  112.00,  20,   null, null, null),
      (an, 3, 'material',  'Unterkonstruktion Ziegeldach, Schienen und Haken',  null, 1,  'Psch', 1480.00, 960.00,  960,  null, null, null),
      (an, 4, 'material',  'Hybrid-Wechselrichter 10 kW, 3-phasig',             null, 1,  'Stk',  2890.00, 2050.00, 240,  null, null, null),
      (an, 5, 'material',  'Batteriespeicher 10 kWh, modular',                  null, 1,  'Stk',  4790.00, 3520.00, 180,  null, null, null),
      (an, 6, 'arbeit',    'DC-Verkabelung, AC-Anschluss und Inbetriebnahme',   null, 16, 'h',    v_satz,  null,    null, null, null, null),
      (an, 7, 'pauschale', 'Netzanmeldung und Förderabwicklung',                null, 1,  'Psch', 390.00,  null,    null, null, null, null);
    select coalesce(sum(gesamt), 0) into v_netto from beleg_positionen where beleg_id = an;
    update belege set nummer = naechste_nummer('angebot', current_date - 60), status = 'angenommen', netto = v_netto,
           ust = round(v_netto * 0.2, 2), brutto = v_netto + round(v_netto * 0.2, 2), fertig_am = (current_date - 60)::timestamptz
     where id = an;

    -- Stunden: Team Tom hat in den letzten Arbeitstagen montiert (aus dem
    -- Verlauf umgehängt, sonst stünden die Leute doppelt am Tag). ~45 h von
    -- 49 h angeboten → Ampel gelb.
    v_team := coalesce((select mitglieder from teams where v_tom = any(mitglieder) limit 1), array[v_tom]);
    for z in
      select zt.id, zt.stunden from zeiten zt join projekte pr on pr.id = zt.projekt_id
      where zt.user_id = any(v_team) and zt.rechnung_id is null and zt.regiebericht_id is null
        and zt.datum < current_date - 1 and pr.status = 'aktiv' and pr.nummer <= '2026-0008'
      order by zt.datum desc, zt.von nulls last
    loop
      exit when v_summe >= 44;
      update zeiten set projekt_id = p_pichler, taetigkeit = 'PV-Montage Dach und DC-Verkabelung' where id = z.id;
      v_summe := v_summe + z.stunden;
    end loop;

    -- Regie: Zusatzauftrag Zählerplatz — eigener Block in der Nachkalkulation
    insert into regieberichte (projekt_id, datum, arbeiten, erstellt_von)
    select p_pichler, zt.datum, E'Zusatzauftrag: Zählerplatz auf Stand gebracht, Überspannungsschutz Typ 1+2 nachgerüstet.\nAlte Vorsicherungen getauscht.', v_max
    from zeiten zt join projekte pr on pr.id = zt.projekt_id
    where zt.user_id = v_max and zt.rechnung_id is null and zt.regiebericht_id is null and pr.status = 'aktiv'
      and pr.nummer <= '2026-0008' and zt.datum < current_date - 1
    order by zt.datum desc limit 1
    returning id into rb;
    if rb is not null then
      update zeiten set projekt_id = p_pichler, regiebericht_id = rb, taetigkeit = 'Zählerplatz, Überspannungsschutz'
       where id = (select zt.id from zeiten zt join regieberichte r on r.id = rb
                    where zt.user_id = v_max and zt.datum = r.datum and zt.rechnung_id is null and zt.regiebericht_id is null
                    order by zt.stunden desc limit 1);
      insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id, regiebericht_id, ek_preis, vorgang, user_id)
      values ('direkt', null, 'Überspannungsableiter Typ 1+2, 4-polig', 'Stk', 1, null, p_pichler, rb, 186.00, gen_random_uuid(), v_max),
             ('direkt', null, 'Zählerplatz-Umbausatz', 'Stk', 1, null, p_pichler, rb, 94.50, gen_random_uuid(), v_max);
    end if;

    -- Material zur Pauschale (direkt auf die Baustelle)
    insert into material_buchungen (art, artikel_id, bezeichnung, einheit, menge, lagerort_id, projekt_id, ek_preis, vorgang, user_id, notiz)
    values ('direkt', null, 'Solarkabel 6 mm² schwarz', 'm', 120, null, p_pichler, 0.92, gen_random_uuid(), v_tom, 'Demo'),
           ('direkt', null, 'MC4-Stecker Paar', 'Stk', 12, null, p_pichler, 3.40, gen_random_uuid(), v_tom, 'Demo'),
           ('direkt', null, 'PV-Modul 410 Wp Glas-Glas, schwarz', 'Stk', 30, null, p_pichler, 112.00, gen_random_uuid(), v_tom, 'Demo'),
           ('direkt', null, 'Unterkonstruktion Ziegeldach', 'Psch', 1, null, p_pichler, 960.00, gen_random_uuid(), v_tom, 'Demo'),
           ('direkt', null, 'Hybrid-Wechselrichter 10 kW', 'Stk', 1, null, p_pichler, 2050.00, gen_random_uuid(), v_tom, 'Demo'),
           ('direkt', null, 'Batteriespeicher 10 kWh', 'Stk', 1, null, p_pichler, 3520.00, gen_random_uuid(), v_tom, 'Demo');

    -- Nächster Termin (für „WhatsApp an Kunde“ → Termin)
    insert into termine (titel, beschreibung, ort, datum, von, bis, ganztags, projekt_id, mitarbeiter, user_id)
    values ('Inbetriebnahme PV Pichler', 'Inbetriebnahme mit Kundin, Einweisung App', 'Wiener Straße 88, 8605 Kapfenberg',
            current_date + 4, '14:00', '15:30', false, p_pichler, array[v_chef], v_chef);

    -- Planung: das PDF lädt supabase/demo/planung.mjs an genau diesen Pfad
    insert into dateien (projekt_id, user_id, pfad, name, mime, groesse, art, beschreibung, planung)
    values (p_pichler, v_chef, p_pichler || '/demo-dachbelegung.pdf', 'Dachbelegung PV Pichler (DEMO).pdf', 'application/pdf', null,
            'dokument', 'Dachbelegung Süd, 30 Module, 2 Strings', true);

    -- Verlauf: Förderschritt und eine WhatsApp an die Kundin
    insert into projekt_verlauf (projekt_id, art, text, an, user_id, created_at) values
      (p_pichler, 'foerderung', 'Förderung: zugesagt · OeMAG (EAG-Investitionszuschuss) · 2460,00 € · Frist ' || to_char(current_date + 18, 'DD.MM.YYYY'),
       null, v_chef, (current_date - 41 + time '09:15') at time zone 'Europe/Vienna'),
      (p_pichler, 'whatsapp', E'Grüß Gott Familie Pichler (Demo),\nkurzer Stand zu Ihrer Förderung (OeMAG (EAG-Investitionszuschuss)): Zugesagt.\nWir melden uns, sobald es Neues gibt.',
       '430000000121', v_chef, (current_date - 40 + time '08:05') at time zone 'Europe/Vienna');
  end if;

  -- ── PV Weber: abgeschlossen, Fertigstellung gemeldet ─────────────────────
  p_weber := (select id from projekte where name = 'PV-Anlage 8,2 kWp – Weber');
  if p_weber is null then
    insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, notiz)
    values ('Familie Weber (Demo)', 'Thomas Weber', 'Bahnhofweg 4', '8650', 'Kindberg', '+43 000 0000122', 'Demo-Kunde (erfunden)')
    returning id into k;
    insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von,
                          foerder_status, foerder_stelle, foerder_betrag, foerder_datum, foerder_notiz)
    values ('PV-Anlage 8,2 kWp – Weber', k, 'abgeschlossen', 'Bahnhofweg 4', '8650', 'Kindberg',
            '20 Module 410 Wp, Wechselrichter 8 kW, ohne Speicher.', v_chef,
            'fertig_gemeldet', 'Klima- und Energiefonds', 1640.00, current_date - 12, 'Endabrechnung eingereicht, Auszahlung offen.')
    returning id into p_weber;
  end if;

  -- ── PV Moser: Angebot, Förderantrag vorbereitet, Einreichfrist ───────────
  p_moser := (select id from projekte where name = 'PV + Speicher 15 kWp Hof – Moser');
  if p_moser is null then
    insert into kunden (name, ansprechpartner, strasse, plz, ort, telefon, notiz)
    values ('Landwirtschaft Moser (Demo)', 'Josef Moser', 'Hofstatt 12', '8661', 'Wartberg', '+43 000 0000123', 'Demo-Kunde (erfunden)')
    returning id into k;
    insert into projekte (name, kunde_id, status, strasse, plz, ort, beschreibung, erstellt_von,
                          foerder_status, foerder_stelle, foerder_datum, foerder_frist, foerder_notiz)
    values ('PV + Speicher 15 kWp Hof – Moser', k, 'angebot', 'Hofstatt 12', '8661', 'Wartberg',
            'Stalldach Ost/West, Speicher 15 kWh, Notstrom.', v_chef,
            'vorbereitet', 'Land Steiermark', current_date - 3, current_date + 9, 'Einreichung im Fördercall — Unterlagen vom Kunden fehlen noch (Grundbuchauszug).')
    returning id into p_moser;
  end if;
end $$;
