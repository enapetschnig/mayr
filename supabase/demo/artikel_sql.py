#!/usr/bin/env python3
"""
Erzeugt 02-artikel.sql aus artikel-demo.json: Artikelstamm, Zusatz-Strichcodes,
Material der Leistungen und der Anfangsbestand in Lager und Bussen.

Die 82 Artikel sind echte Produkte mit echter EAN und dem öffentlichen
Shop-Preis des Herstellers bzw. Großhändlers (Quelle je Artikel in der
JSON-Datei). EK = Listenpreis − 28 % ist eine Demo-Annahme.

    python3 supabase/demo/artikel_sql.py > supabase/demo/02-artikel.sql
"""
import json
import pathlib

HIER = pathlib.Path(__file__).parent
ARTIKEL = json.loads((HIER / "artikel-demo.json").read_text())

DEMO_RABATT = 0.28


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def n(x):
    return "null" if x is None else f"{float(x):.4f}".rstrip("0").rstrip(".")


# Bestand im Hauptlager (fehlt ein Artikel hier, ist er kein Lagerartikel)
HAUPTLAGER = {
    "AM618116": 40, "AM618113": 20, "AM618110": 20, "AM617116": 10, "AM618316": 6,
    "BC054103": 2, "AK668616": 8, "302543": 2, "8GB5060-4KM": 1,
    "XC020104JC": 1000, "XC020105JC": 500, "XC020208JC": 200, "XC020209JC": 300, "XC020215JC": 100,
    "XC3071614C": 100, "XC061101C": 100, "1591501/100": 200,
    "GTPTXM20": 500, "GTPTXM25": 250, "GTRLH20M3": 120, "GTZMM20": 4,
    "LF4006009016": 30, "LF2003509016": 60, "LF1501509016": 60,
    "221-412": 300, "221-413": 300, "221-415": 200, "2273-202": 500, "2273-203": 500, "2273-204": 400, "2273-205": 300,
    "1555-04": 100, "1056-04": 200, "1055-21": 200, "9463-01": 10, "80243001": 20, "80242001": 20,
    "5UB1518": 60, "5UB1511": 40, "5TA2156": 40, "5TA2155": 15, "5TG6201": 40, "5TG6205": 15, "5TG2551-0": 60, "5TG2552-0": 25,
    "LEDCLA608.5827FRE27P": 30, "LEDCLA10013840FRE27P": 20, "LEDCLB404.9827FRE14P": 20,
    "DPCOMP1200V33W840PS": 6, "DPVAL150025W4000IP65": 4, "DLUGRDN155PFM14W840": 8, "SPFIXP8W930PSDIP44WT": 24,
    "LEDBULKHEAD11W840WT": 6, "LNCOMPHO120020W4000K": 4,
    "HSKP4233K1": 500, "100023002": 6, "211500004": 20, "DN-93615": 40, "274233": 8, "BKV 15": 6,
    "606015": 4, "603816": 2, "033811": 2, "TG600AL": 4, "233602": 6,
    "568006": 10, "568008": 10, "568010": 6, "138-00022": 20, "145806": 20, "7000057831": 6, "710-00157": 10,
    "563030": 3, "563020": 4, "407100": 10, "540262": 10, "840108": 100,
}

# Mindestbestand — ein paar liegen absichtlich darunter (Liste „Nachbestellen“)
MINDEST = {
    "AM618116": 20, "BC054103": 3, "AK668616": 4, "XC020104JC": 300, "XC020209JC": 100, "GTPTXM20": 200,
    "221-413": 100, "2273-203": 200, "1055-21": 50, "5UB1518": 20, "TG600AL": 6, "211500004": 10,
    "SPFIXP8W930PSDIP44WT": 10, "138-00022": 5,
}

# Was jeder Monteur im Bus mithat
BUS = {
    "XC020104JC": 100, "GTPTXM20": 50, "221-413": 50, "2273-203": 100, "1055-21": 30, "138-00022": 2,
    "145806": 4, "AM618116": 6, "5UB1518": 10, "5TG2551-0": 10, "5TA2156": 6, "5TG6201": 6, "TG600AL": 2,
}

# Leistung (Nummer) → [(Herstellernummer, Menge)]
LEISTUNG_MATERIAL = {
    "01.01": [("1055-21", 1), ("5UB1518", 1), ("5TG2551-0", 1)],
    "01.02": [("1055-21", 2), ("5UB1518", 2), ("5TG2552-0", 1)],
    "01.04": [("1055-21", 1), ("5TA2156", 1), ("5TG6201", 1), ("5TG2551-0", 1)],
    "01.05": [("1055-21", 1), ("5TA2156", 1), ("5TG6201", 1), ("5TG2551-0", 1)],
    "01.06": [("1055-21", 1), ("5TG6201", 1), ("5TG2551-0", 1)],
    "01.07": [("1055-21", 1), ("5TA2155", 1), ("5TG6205", 1), ("5TG2551-0", 1)],
    "01.08": [("1055-21", 1), ("5TG6201", 1), ("5TG2551-0", 1)],
    "01.09": [("1055-21", 1), ("033811", 1)],
    "02.01": [("GTPTXM20", 1)],
    "02.02": [("XC020104JC", 1)],
    "02.03": [("XC020209JC", 1)],
    "03.01": [("302543", 1)],
    "03.02": [("AM618116", 1)],
    "03.03": [("BC054103", 1)],
    "03.04": [("AK668616", 1)],
    "04.01": [("221-413", 2)],
    "04.02": [("SPFIXP8W930PSDIP44WT", 1)],
    "05.01": [("1055-21", 1), ("211500004", 1)],
    "05.02": [("HSKP4233K1", 1)],
    "05.03": [("1055-21", 1), ("274233", 1)],
    "06.01": [("80243001", 1), ("XC020209JC", 3)],
    "07.01": [("TG600AL", 1)],
    "07.02": [("563020", 1), ("407100", 2)],
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
    liste = round(float(a["preis_netto"]), 2)
    ek = round(liste * (1 - DEMO_RABATT), 2)
    nr = a["hersteller_nr"]
    zeilen.append(
        "(" + ", ".join([
            q(nr), q("Demo-Stamm"), q(a["hersteller"]), q(nr), q(a["ean"]), q(a["bezeichnung"]), q(a.get("langtext")),
            q(a["einheit"]), q(a["kategorie"]), n(liste), n(ek), "true" if nr in HAUPTLAGER else "false",
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
                       einheit, kategorie, listenpreis, ek_preis, lagerartikel, mindestbestand, quelle) values""")
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
print(bestand("v_bus2", {k: v for k, v in BUS.items() if k not in ("TG600AL", "5TA2156")}))
print("end $$;")
