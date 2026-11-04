#!/usr/bin/env python3
"""
Erzeugt 02-artikel.sql aus artikel-sonepar.json: Artikelstamm, Zusatz-Strichcodes,
Material der Leistungen und der Anfangsbestand in Lager und Bussen.

Die 158 Artikel sind ein typisches Elektriker-Sortiment aus dem Sonepar-
Datanorm (Erstversorgung 11/2026): echte Artikelnummer, EAN und Listenpreis,
Verteiler und Schutzgeräte von Hager, Schalterprogramm Jung LS 990. Bei
Kabeln ist der Kupferzuschlag (DEL gegen Basis 130 €/100 kg) im Listenpreis.
Die Auswahl macht das Werkzeug unter scratchpad nicht reproduzierbar — die
JSON-Datei ist die Quelle. Netto-Konditionen des Betriebs sind bewusst nicht
drin: EK = Listenpreis − Demo-Rabatt je Kategorie (Kupferzuschlag ohne Rabatt).

    python3 supabase/demo/artikel_sql.py > supabase/demo/02-artikel.sql
"""
import json
import pathlib

HIER = pathlib.Path(__file__).parent
ARTIKEL = json.loads((HIER / "artikel-sonepar.json").read_text())
LIEFERANT = "Sonepar"

# Demo-Rabatt auf den Listenpreis je Kategorie (keine echten Konditionen)
DEMO_RABATT = {
    "Kabel & Leitungen": 0.55, "Verteiler & Schutzgeräte": 0.35, "Schalter & Steckdosen": 0.35,
    "Dosen & Verbindungstechnik": 0.35, "Rohre & Kanäle": 0.38, "Licht": 0.30, "Netzwerk & Medien": 0.30,
}
RABATT_SONST = 0.25


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def n(x):
    return "null" if x is None else f"{float(x):.4f}".rstrip("0").rstrip(".")


# Bestand im Hauptlager (fehlt ein Artikel hier, ist er kein Lagerartikel)
HAUPTLAGER = {
    # Hager
    "MBN110": 20, "MBN113": 30, "MBN116": 60, "MCN116": 10, "MBN316": 6, "MBN320": 4,
    "CDA240D": 4, "CDA440D": 4, "ADS916D": 10, "ADS913D": 4, "SBN340": 2, "SPA930": 1,
    "ERC225": 2, "EPN510": 4, "EMS001B": 2, "ST303": 2,
    "KDN363A": 6, "KDN363B": 2, "KZN023": 20, "KN10N": 6, "KN10E": 6, "JP002": 10,
    "VU24AT": 1, "VU36AT": 2, "VU36NK": 2, "VA24BN": 1, "GD104N": 3, "GD108N": 2,
    # Kabel (m)
    "NYM-J 3X1,5 RE GR": 1000, "NYM-J 3X2,5 RE GR": 500, "NYM-J 5X1,5 RE GR": 200, "NYM-J 5X2,5 RE GR": 300,
    "NYM-J 5X6 RE GR": 50, "E-YY-J 5X2,5 RE SW": 100, "H05VV-F 3G1,5 WS (YMM)": 100, "H07RN-F 3G2,5 SW (GMSUÖ)": 50,
    "H07V-K 1,5 BL (YF)": 100, "H07V-K 1,5 GNGE (YF)": 100, "H07V-K 6 SW (YF)": 50, "H07V-K 16 GNGE (YF)": 50,
    "J-Y(ST)Y 2X2X0,8 GR": 200, "LKD7KS700100100": 500, "21510025": 100,
    # Rohre & Kanäle
    "TXM20": 500, "TXM25": 250, "TXM32": 100, "TKSM20": 300, "TBM20": 20, "RM20": 50,
    "LF4006009016": 30, "LF2003509016": 60, "LF1501509016": 60, "011790": 30, "013277": 30,
    # Dosen & Klemmen
    "221-412": 300, "221-413": 300, "221-415": 200, "221-613": 50, "221-2411": 50,
    "2273-202": 500, "2273-203": 500, "2273-204": 400, "2273-205": 300,
    "1055-04": 200, "1555-04": 100, "1056-04": 150, "9062-77": 20, "80242001": 20, "80243001": 10, "32298001": 30, "10060400": 20, "520944": 6,
    # Jung LS 990
    "LS1520": 80, "LS1520KI": 20, "LS1520KIKL": 10, "506U": 50, "505U": 15, "507U": 6, "531U": 10,
    "LS990": 50, "LS995": 15, "LS990K": 4, "LS981W": 80, "LS982W": 25, "LS983W": 10, "LS990TV": 8,
    # Licht
    "VALUE CLA60 10W/827 230V FR E27": 30, "VALUE PAR16 35 4W/827 230V GU10": 20, "BASECLB40 4W/827 230 FIL E14 3ER": 10,
    "DL SLIM DN 155 12 W 4000 K WT": 12, "DL SLIM DN 105 6 W 4000 K WT": 24, "DP COMP TH 1200 V 33W 840 IP66 PS": 6,
    "LED BULKHEAD 11W 840 WT": 6, "LEDTUBE T8 EXT P 1200 15W 840": 10,
    # Netzwerk, Melder, Kleinmaterial
    "465706": 20, "LS969-1NAUA": 20, "274209": 8, "1165940010": 10,
    "TG600AL": 12, "233602": 4, "606015": 4, "603816": 2, "002800": 2,
    "138-00022": 2000, "111-01919": 1000, "263842": 20, "077765": 200, "077763": 100, "1116110": 20,
    "563200": 3, "563011": 20, "410034": 10, "410100": 10,
}

# Mindestbestand — ein paar liegen absichtlich darunter (Liste „Nachbestellen“, Bestellvorschlag)
MINDEST = {
    "MBN116": 80, "ADS916D": 15, "CDA440D": 2, "NYM-J 3X1,5 RE GR": 1200, "NYM-J 5X2,5 RE GR": 200,
    "TXM20": 300, "221-413": 400, "2273-203": 300, "1055-04": 100, "LS1520": 120, "LS981W": 40,
    "TG600AL": 6, "DL SLIM DN 105 6 W 4000 K WT": 30, "138-00022": 1000, "263842": 30, "VU36AT": 1,
    "LKD7KS700100100": 200, "465706": 10,
}

# Was jeder Monteur im Bus mithat
BUS = {
    "NYM-J 3X1,5 RE GR": 100, "TXM20": 50, "221-413": 50, "2273-203": 100, "1055-04": 30, "138-00022": 200,
    "263842": 4, "MBN116": 6, "LS1520": 10, "LS981W": 10, "506U": 6, "LS990": 6, "TG600AL": 2,
    "80242001": 4, "ADS916D": 2,
}

# Leistung (Nummer) → [(Herstellernummer, Menge)]
LEISTUNG_MATERIAL = {
    "01.01": [("1055-04", 1), ("LS1520", 1), ("LS981W", 1)],
    "01.02": [("1055-04", 2), ("LS1520", 2), ("LS982W", 1)],
    "01.04": [("1055-04", 1), ("506U", 1), ("LS990", 1), ("LS981W", 1)],
    "01.05": [("1055-04", 1), ("506U", 1), ("LS990", 1), ("LS981W", 1)],
    "01.06": [("1055-04", 1), ("507U", 1), ("LS990", 1), ("LS981W", 1)],
    "01.07": [("1055-04", 1), ("505U", 1), ("LS995", 1), ("LS981W", 1)],
    "01.08": [("1055-04", 1), ("531U", 1), ("LS990", 1), ("LS981W", 1)],
    "01.09": [("1055-04", 1), ("002800", 1)],
    "02.01": [("TXM20", 1)],
    "02.02": [("NYM-J 3X1,5 RE GR", 1)],
    "02.03": [("NYM-J 5X2,5 RE GR", 1)],
    "02.05": [("9062-77", 1)],
    "03.01": [("VU36AT", 1), ("KN10N", 1), ("KN10E", 1), ("JP002", 1)],
    "03.02": [("MBN116", 1)],
    "03.03": [("CDA440D", 1)],
    "03.04": [("ADS916D", 1)],
    "04.01": [("221-413", 2)],
    "04.02": [("DL SLIM DN 105 6 W 4000 K WT", 1)],
    "05.01": [("1055-04", 1), ("465706", 1), ("LS969-1NAUA", 1)],
    "05.02": [("LKD7KS700100100", 1)],
    "05.03": [("1055-04", 1), ("274209", 1), ("LS990TV", 1)],
    "06.01": [("520944", 1), ("NYM-J 5X2,5 RE GR", 3)],
    "07.01": [("TG600AL", 1)],
    "07.02": [("563200", 1), ("410034", 2)],
}

nummern = {a["hersteller_nr"] for a in ARTIKEL}
for liste in (HAUPTLAGER, MINDEST, BUS):
    fehlt = set(liste) - nummern
    assert not fehlt, fehlt
for teile in LEISTUNG_MATERIAL.values():
    for nr, _ in teile:
        assert nr in nummern, nr

zeilen = []
for a in ARTIKEL:
    zuschlag = float(a.get("metallzuschlag", 0))
    liste = round(float(a["listenpreis"]), 4)
    ek = round((liste - zuschlag) * (1 - DEMO_RABATT.get(a["kategorie"], RABATT_SONST)) + zuschlag, 4)
    nr = a["hersteller_nr"]
    zeilen.append(
        "(" + ", ".join([
            q(a["sonepar_nr"]), q(LIEFERANT), q(a["hersteller"]), q(nr), q(a["ean"]), q(a["bezeichnung"]), q(a.get("langtext")),
            q(a["einheit"]), q(a["kategorie"]), q(a["warengruppe"]), q(a["rabattgruppe"]), n(liste), n(ek),
            "true" if nr in HAUPTLAGER else "false",
            n(MINDEST.get(nr)), q("demo"),
        ]) + ")"
    )

print("""-- ============================================================================
--  Demo-Artikelstamm — ERZEUGT von supabase/demo/artikel_sql.py, nicht von Hand ändern.
--  Läuft nach 01-stamm.sql:  sql.sh -f supabase/demo/02-artikel.sql
-- ============================================================================
do $$
declare
  v_haupt uuid := (select id from lagerorte where name = 'Hauptlager');
  v_bus1 uuid := (select id from lagerorte where name like 'Bus 1%');
  v_bus2 uuid := (select id from lagerorte where name like 'Bus 2%');
  v_chef uuid := (select id from profiles where email = 'chef@elektro.handwerkapp.at');
  v_vorgang uuid := gen_random_uuid();
begin
  insert into artikel (artikelnummer, lieferant, hersteller, hersteller_nr, ean, bezeichnung, langtext,
                       einheit, kategorie, warengruppe, rabattgruppe, listenpreis, ek_preis, lagerartikel, mindestbestand, quelle) values""")
print(",\n".join("    " + z for z in zeilen) + ";")

# Scanner liefern UPC-A (12 Stellen) oder dasselbe als EAN-13 mit führender 0
upc = [a for a in ARTIKEL if len(a["ean"]) == 13 and a["ean"].startswith("0")]
if upc:
    print("\n  -- UPC-A-Form der amerikanischen Codes (Scanner liefern 12 oder 13 Stellen)")
    print("  insert into artikel_codes (code, artikel_id, menge)")
    print("  select substr(ean, 2), id, 1 from artikel where length(ean) = 13 and ean like '0%';")

print("\n  -- Material je Leistung")
print("  insert into leistung_material (leistung_id, artikel_id, menge)")
werte = []
for lnr, teile in LEISTUNG_MATERIAL.items():
    for anr, menge in teile:
        werte.append(f"({q(lnr)}, {q(anr)}, {menge})")
print("  select l.id, a.id, v.menge from (values\n    " + ",\n    ".join(werte) + "\n  ) v(lnr, anr, menge)")
print("  join leistungen l on l.nummer = v.lnr join artikel a on a.hersteller_nr = v.anr;")


def bestand(ort, liste):
    werte = ",\n    ".join(f"({q(nr)}, {menge})" for nr, menge in liste.items())
    # Anfangsbestand liegt vor dem Demo-Verlauf (03-verlauf.sql beginnt im September)
    return (f"  insert into material_buchungen (art, artikel_id, menge, lagerort_id, ek_preis, vorgang, notiz, user_id, created_at)\n"
            f"  select 'zugang', a.id, v.menge, {ort}, a.ek_preis, v_vorgang, 'Anfangsbestand', v_chef,\n"
            f"         timestamptz '2026-09-01 08:00 Europe/Vienna' from (values\n    {werte}\n"
            f"  ) v(nr, menge) join artikel a on a.hersteller_nr = v.nr;")


print("\n  -- Anfangsbestand Hauptlager und Busse")
print(bestand("v_haupt", HAUPTLAGER))
print(bestand("v_bus1", BUS))
print(bestand("v_bus2", {k: v for k, v in BUS.items() if k not in ("TG600AL", "506U")}))
print("end $$;")
