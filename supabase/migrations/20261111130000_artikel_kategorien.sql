-- Katalog im Angebot: Datanorm-Artikel in wenige, für Elektriker
-- verständliche Kategorien (dieselben Namen wie die Demo-Artikel), darunter
-- die Warengruppe des Lieferanten als Unterkategorie (ohne „(PG 08)“ und
-- Großhändler-Vorsatz). Neue Datanorm-Importe ordnet der Trigger ein.

alter table public.artikel add column if not exists unterkategorie text;

create or replace function public.artikel_einordnen(wg text, hersteller text)
returns text
language sql
immutable
as $$
  select case
    when w is null then 'Sonstiges'
    when w ~* 'E-Mobility|Ladesäule|Ladesystem|Wattpilot|Fronius|^PV |PV Speicher|Hensel PV|OBO E-Mob' then 'E-Mobilität & PV'
    when w ~ 'AFDD' then 'Verteiler & Schutzgeräte'
    when w ~* 'Brandschutz|BSS-|Funktionserhalt' then 'Brandschutz'
    when w ~* 'Arbeitsschutz|Werkzeug|Thermo FH' then 'Werkzeug & Messen'
    when w ~* 'Überspannung|ÜSP|Blitzschutz|Erdung|TBS-|Potentialausgl|^Dehn \(PG [234]\)' then 'Erdung & Blitzschutz'
    when w ~* 'Türkommunikation|Türstation|Sprechanlage|Videoanlage|Alarm|Sicherheitstechnik|Rufsystem|CCTV|GBK Video|Bewegungs|Präsenz|Wächter|Personensens|True Presen|Argus|Esylux' then 'Sicherheit & Melder'
    when w ~ 'KNX|EIB|eNet|ENET|Jung home|Netatmo|Wiser|Business Solutions|Gira G1|FacilityServer|BI system|Wohnraumelektronik|Gebäudeelektronik|SMART PROF|IOBL|Gebäudeleittechnik|HLK-Regelung' then 'Smart Home & KNX'
    when w ~* 'LEDVANCE|Philips|Signify|lamps|Leuchte|Strahler|Lampen|LAMPEN|Maste|Heiru|Ersatzglas|RSPRO|Leuchtmittel|LED Tubes|LED DRIVER|MODULES|CONSUMER LUM|VORSCHALTGERÄTE|Steinel' then 'Licht'
    when w ~* 'Datenkabel|Dätwyler (Da|LW)|LWL|Koax|^EDV|ISDN|Kathrein|Multi Channel|Lautsprecher|Datente' then 'Netzwerk & Medien'
    when w ~ '^(\(N\)HXH|2YSL|A-2Y|A07RN|E-A|EY2Y|EYCY|F-|FLG|H0|HSLH|J-|JB-|JE-|LIY|LTG|N2XH|NAYY|NGFLG|NHXMH|NSG|NSH|NSSH|NYM|NYSL|NYY|PVC-Baust|Schlepp|Servo|SIA|SIF|SIHF|YMLCM|YMS|YMT|YR|YSL|YYSch|Kabel \+|Div\. Draht)' or w ~ 'Dätwyler Fu' then 'Kabel & Leitungen'
    when w ~* 'Spelsberg|Hensel D[KE]|Kaiser|Abzweigdose|Abzweigkäst|Streudosen|Dosen|Hohlwand' then 'Dosen & Verbindungstechnik'
    when w ~ 'Verteiler|Verte$|Kleinverteiler|Feldverteiler|Steuerschr|Niedersp|LS-Schalter|LS/FI|FI\M|FI$|FI/|Leistungs- und Lasttrenns|Sicherung|Fernschalter|Schütze|REG Schalter|Zeit- und Lichtsteuerung|Zeitschalt|Treppenlicht|Reiheneinbau|Zähleranschluss|Messen|Energiemanag|Kombipakete|Wohnungspakete|VDVT|Doepke|Hager|Industrieschrank|USV|Reihenklemme|Rex|MCB|EDS16|Hensel (MI|FP|KV)|Legrand \(PG A6[0-5]\)|Spulen|Schmachtl|Uhren|Energieverteiler' then 'Verteiler & Schutzgeräte'
    when w ~* 'Schalter|Flächenprogram|UP\+W|LS990|LS1912|AP600|WG800|WG600|WG-Aufputz|Aufputz|Mechanisches Material|Elektronik|Valena|Mosaic|Niloe|Plexo|Galea|Creo|Roc$|SEANO|InMatic|Pro21|Splashproof|System M|System D|Renova|Contura|Aqua|ELSO|Fokus|Berker|Mediopt|British Standard|IP\+|Schnelldreher|Energiesäule|Steckdo|Kernartikel|Einsätze|Renovierung|Sonderartike|Herd/Geräted|Jung Nettoartikel' then 'Schalter & Steckdosen'
    when w ~* 'KTS-|LFS-|UFS-|Kanal|kanal|Rinne|Rohr-Systeme|Kabelschutzschlauch|Installationssäu|EGS-' then 'Rohre & Kanäle'
    when w ~* 'Klemmen|Kabelschuh|Presskabel|Quetschkabel|Kabelverbi|Verbind|Aderendh|Gehäuse|Kabelverschraub|Wago|Schurrer' then 'Dosen & Verbindungstechnik'
    when w ~* 'Befest|Schellen|Trägerklammern|Schienen-Systeme|Schraub|Montage|Kabelbinder|Bezeichnungsmaterial|Allgemeines Installatio|Verankerung|Weitspann|Baukasten|Leuchtenträger|Schiffbau|Sorti' then 'Befestigung & Kleinmaterial'
    else 'Sonstiges'
  end
  from (select nullif(btrim(wg), '') as w) x
$$;

-- „Euro Unitech (PG 08) Jung LS990 Les Coul“ → „Jung LS990 Les Coul“
create or replace function public.artikel_unterkategorie(wg text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(wg, ''),
    '^(Euro Unitech|Siblik|Electro Terminal|Schneider E\.|Edler Systems Kabeltechnik -|I\.Müller)\s*', ''),
    '\((PG|WG|RG)\s*[^)]*\)\s*', '', 'g'),
    '^Bettermann\M', 'OBO'),
    '\s+', ' ', 'g')), '')
$$;

create or replace function public.artikel_kategorie_setzen()
returns trigger
language plpgsql
as $$
begin
  if new.quelle = 'datanorm' and (tg_op = 'INSERT' or new.warengruppe is distinct from old.warengruppe or new.kategorie is null) then
    new.kategorie := public.artikel_einordnen(new.warengruppe, new.hersteller);
    new.unterkategorie := public.artikel_unterkategorie(new.warengruppe);
  end if;
  return new;
end;
$$;

drop trigger if exists artikel_kategorie on public.artikel;
create trigger artikel_kategorie before insert or update of warengruppe, kategorie, quelle on public.artikel
  for each row execute function public.artikel_kategorie_setzen();

update public.artikel
   set kategorie = public.artikel_einordnen(warengruppe, hersteller),
       unterkategorie = public.artikel_unterkategorie(warengruppe)
 where quelle = 'datanorm';

create index if not exists artikel_katalog_idx on public.artikel (kategorie, unterkategorie) where aktiv;

-- Baum für den Katalog: Kategorie → Unterkategorie (mit Hersteller) → Anzahl
create or replace function public.artikel_katalog()
returns table (kategorie text, unterkategorie text, hersteller text, anzahl bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(a.kategorie, 'Sonstiges'), a.unterkategorie, a.hersteller, count(*)
    from public.artikel a
   where a.aktiv
   group by 1, 2, 3
$$;
grant execute on function public.artikel_katalog() to authenticated;
