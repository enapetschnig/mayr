-- Demo Buchhaltung (Paket H): Kategorien für Ein- und Ausgang, die Demo-
-- Rechnungen eingeordnet, acht Altrechnungen aus dem „alten Programm“
-- (3 offen, davon 1 überfällig zum Mahnen; 1 abgeschrieben).
--
--   scripts/sql.sh -f supabase/demo/04-buchhaltung.sql
--
-- Wiederholbar: Kategorien per Name, Altrechnungen ALT-… werden neu angelegt.
-- Echte Probedaten (Projekte 2026-0009 bis -0011, ihre Kunden, die
-- Eingangsrechnung GBC Solino) bleiben unberührt — nur was keine Kategorie hat
-- und eindeutig Demo ist, wird eingeordnet.
do $$
declare
  k record;
  v_alt record;
  v_kunde uuid;
  v_id uuid;
  v_echte_projekte text[] := array['2026-0009', '2026-0010', '2026-0011'];
  v_echte_kunden text[] := array['Stefan Sattler', 'Walter Bärnthaler', 'Fa. xyz'];
begin
  -- ── Kategorien ──────────────────────────────────────────────────────
  for k in select * from (values
    ('ausgang', 'PV-Anlage', null, 'PV, Photovoltaik, Modul, Wechselrichter, kWp, Solar, Unterkonstruktion', 1),
    ('ausgang', 'Speicher', null, 'Speicher, Batterie, Akku, kWh, Notstrom', 2),
    ('ausgang', 'Elektroinstallation', null, 'Installation, Steckdose, Verteiler, Leitung, Sanierung, Umbau, Elektro, Beleuchtung, Leuchte', 3),
    ('ausgang', 'Störungsdienst/Regie', null, 'Störung, Regie, Notdienst, Reparatur, Fehlersuche, FI', 4),
    ('ausgang', 'E-Befund', null, 'Befund, Attest, Überprüfung, Prüfprotokoll, E-Befund, Messung', 5),
    ('ausgang', 'Wallbox', null, 'Wallbox, Ladestation, E-Auto, Ladepunkt', 6),
    ('eingang', 'Material PV', 'material', 'Solar, Modul, Wechselrichter, PV, Photovoltaik, Unterkonstruktion, Speicher', 1),
    ('eingang', 'Material Elektro', 'material', 'Kabel, Elektro, Leitung, Schalter, Steckdose, Leuchten, Großhandel', 2),
    ('eingang', 'Fahrzeuge/Treibstoff', 'fahrzeug', 'Tankstelle, Diesel, Benzin, Werkstatt, Reifen, Autohaus', 3),
    ('eingang', 'Werkzeug', 'werkzeug', 'Werkzeug, Messgerät, Bohrmaschine, Hilti, Makita', 4),
    ('eingang', 'Miete', 'sonstiges', 'Miete, Pacht, Leasing', 5),
    ('eingang', 'Versicherung', 'sonstiges', 'Versicherung, Polizze, Prämie', 6),
    ('eingang', 'Büro', 'buero', 'Büro, Papier, Software, Telefon, Internet, Porto', 7),
    ('eingang', 'Subunternehmer', 'fremdleistung', 'Subunternehmer, Kernbohrung, Kabelzug, Montage, Gerüst, Dachdecker', 8),
    ('eingang', 'Sonstiges', 'sonstiges', '', 9)
  ) as t(richtung, name, art, stichworte, sortierung) loop
    insert into public.rechnung_kategorien (richtung, name, art, stichworte, sortierung)
    values (k.richtung, k.name, k.art, k.stichworte, k.sortierung)
    on conflict (richtung, lower(btrim(name))) do update set art = excluded.art, stichworte = excluded.stichworte, sortierung = excluded.sortierung;
  end loop;

  -- ── Demo-Rechnungen einordnen (nur ohne Kategorie, nie die echten) ──
  update public.belege b set kategorie_id = (
      select c.id from public.rechnung_kategorien c
       where c.richtung = 'ausgang' and c.name = case
         when concat_ws(' ', b.betreff, p.name, (select string_agg(bezeichnung, ' ') from public.beleg_positionen where beleg_id = b.id)) ~* '(wallbox|ladestation)' then 'Wallbox'
         when concat_ws(' ', b.betreff, p.name, (select string_agg(bezeichnung, ' ') from public.beleg_positionen where beleg_id = b.id)) ~* '(speicher|batterie)' then 'Speicher'
         when concat_ws(' ', b.betreff, p.name, (select string_agg(bezeichnung, ' ') from public.beleg_positionen where beleg_id = b.id)) ~* '(\mpv\M|photovoltaik|wechselrichter|kwp)' then 'PV-Anlage'
         when concat_ws(' ', b.betreff, p.name, (select string_agg(bezeichnung, ' ') from public.beleg_positionen where beleg_id = b.id)) ~* '(befund|attest|überprüfung)' then 'E-Befund'
         when concat_ws(' ', b.betreff, p.name, (select string_agg(bezeichnung, ' ') from public.beleg_positionen where beleg_id = b.id)) ~* '(störung|regie|notdienst|reparatur)' then 'Störungsdienst/Regie'
         else 'Elektroinstallation' end)
    from public.belege b2 left join public.projekte p on p.id = b2.projekt_id
   where b.id = b2.id and b.typ = 'rechnung' and b.kategorie_id is null and not b.altbestand
     and coalesce(p.nummer, '') <> all(v_echte_projekte)
     and coalesce(b.empf_name, '') <> all(v_echte_kunden);

  update public.eingangsrechnungen e set
      kategorie_id = c.id, kategorie = c.art
    from public.rechnung_kategorien c
   where e.kategorie_id is null and e.lieferant not ilike 'GBC Solino%'
     and c.richtung = 'eingang' and c.name = case
       when e.kategorie = 'fahrzeug' then 'Fahrzeuge/Treibstoff'
       when e.kategorie = 'werkzeug' then 'Werkzeug'
       when e.kategorie = 'fremdleistung' then 'Subunternehmer'
       when e.kategorie = 'buero' then 'Büro'
       when e.kategorie = 'material' and (e.lieferant ~* '(solar|\mpv\M|photovoltaik)' or exists (select 1 from public.eingang_positionen x
              where x.eingangsrechnung_id = e.id and x.bezeichnung ~* '(solar|modul|wechselrichter|\mpv\M|speicher)')) then 'Material PV'
       when e.kategorie = 'material' then 'Material Elektro'
       else 'Sonstiges' end;

  -- ── Altrechnungen aus dem „alten Programm“ ──────────────────────────
  delete from public.belege where altbestand and nummer like 'ALT-%';

  for k in select * from (values
    ('Familie Pölzl (Demo)', 'Bergstraße 12', '8650', 'Kindberg'),
    ('Tischlerei Haider (Demo)', 'Gewerbepark 3', '8643', 'Allerheiligen im Mürztal'),
    ('Bauernhof Leitner (Demo)', 'Hochegg 7', '8662', 'Mitterdorf im Mürztal'),
    ('Gemeinde Musterdorf (Demo)', 'Hauptplatz 1', '8650', 'Kindberg'),
    ('Bau-Service Krenn (Demo)', 'Industriestraße 40', '8605', 'Kapfenberg')
  ) as t(name, strasse, plz, ort) loop
    if not exists (select 1 from public.kunden where name = k.name) then
      insert into public.kunden (name, strasse, plz, ort, notiz) values (k.name, k.strasse, k.plz, k.ort, 'Demo-Kunde aus dem alten Programm');
    end if;
  end loop;

  -- tage = Rechnungsdatum vor heute, ziel = Zahlungsziel in Tagen, bezahlt/art = schon gebucht
  for v_alt in select * from (values
    ('ALT-2025-0412', 'Familie Pölzl (Demo)',       'PV-Anlage',            'PV-Anlage 9,8 kWp mit Wechselrichter', 330, 14, 14800.00, 14800.00, 'zahlung'),
    ('ALT-2026-0003', 'Tischlerei Haider (Demo)',   'Elektroinstallation',  'Werkstatt Elektroinstallation',        310, 30,  3250.00,  3250.00, 'zahlung'),
    ('ALT-2026-0011', 'Bauernhof Leitner (Demo)',   'Speicher',             'Batteriespeicher 10 kWh',               40, 60,  6900.00,  3000.00, 'zahlung'),
    ('ALT-2026-0004', 'Gemeinde Musterdorf (Demo)', 'E-Befund',             'E-Befund Volksschule',                 290, 30,  1180.00,  1180.00, 'zahlung'),
    ('ALT-2026-0005', 'Familie Pölzl (Demo)',       'Wallbox',              'Wallbox 11 kW Garage',                 270, 14,  1640.00,  1640.00, 'zahlung'),
    ('ALT-2026-0012', 'Tischlerei Haider (Demo)',   'Störungsdienst/Regie', 'Störungsdienst Absaugung',              20, 30,   420.00,     0.00, null),
    ('ALT-2026-0009', 'Bauernhof Leitner (Demo)',   'PV-Anlage',            'PV-Erweiterung Stall 4 kWp',            65, 30,  2480.00,     0.00, null),
    ('ALT-2025-0398', 'Bau-Service Krenn (Demo)',   'Elektroinstallation',  'Baustrom und Provisorium',             360, 14,   860.00,   860.00, 'ausbuchung')
  ) as t(nummer, kunde, kategorie, betreff, tage, ziel, netto, bezahlt, art) loop
    select id into v_kunde from public.kunden where name = v_alt.kunde order by created_at limit 1;
    v_id := gen_random_uuid();
    insert into public.belege (id, typ, status, altbestand, nummer, datum, faellig_am, kunde_id,
      empf_name, empf_strasse, empf_plz, empf_ort, betreff, netto, ust_satz, ust, brutto, kategorie_id)
    select v_id, 'rechnung', 'offen', true, v_alt.nummer, current_date - v_alt.tage, current_date - v_alt.tage + v_alt.ziel, ku.id,
      ku.name, ku.strasse, ku.plz, ku.ort, v_alt.betreff, v_alt.netto, 20, round(v_alt.netto * 0.2, 2), round(v_alt.netto * 1.2, 2),
      (select id from public.rechnung_kategorien where richtung = 'ausgang' and name = v_alt.kategorie)
      from public.kunden ku where ku.id = v_kunde;
    if v_alt.art = 'ausbuchung' then
      insert into public.zahlungen (beleg_id, datum, betrag, art, notiz)
      values (v_id, current_date - v_alt.tage + 120, round(v_alt.bezahlt * 1.2, 2), 'ausbuchung', 'Firma insolvent, Forderung uneinbringlich');
    elsif v_alt.bezahlt > 0 then
      insert into public.zahlungen (beleg_id, datum, betrag, art, notiz)
      values (v_id, least(current_date, current_date - v_alt.tage + v_alt.ziel - 3),
              case when v_alt.bezahlt = v_alt.netto then round(v_alt.netto * 1.2, 2) else v_alt.bezahlt end,
              'zahlung', 'Übernommen aus dem alten Programm');
    end if;
  end loop;
end $$;
