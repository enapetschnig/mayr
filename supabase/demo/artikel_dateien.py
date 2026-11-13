#!/usr/bin/env python3
"""
Demo-Bilder und Demo-Datenblätter für gängige PV- und Elektro-Artikel, dazu
das PDF des offenen Demo-Lieferscheins SN-20931 (04-artikel.sql). Alles
selbst gezeichnet und deutlich als Platzhalter erkennbar — keine Bilder oder
Datenblätter von Herstellern.

    DEMO_CHEF_PASSWORT=… python3 -I supabase/demo/artikel_dateien.py

Wiederholbar: frühere Demo-Dateien (Name beginnt mit „demo-“) der Artikel
werden ersetzt. Läuft nach 04-artikel.sql.
"""
import io
import json
import os
import sys
import urllib.error
import urllib.parse

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unterschriften import anfrage, env_lesen  # noqa: E402

BUCKET = "projekt-dateien"

# Artikelnummer → (Form des Platzhalters, Datenblatt ja/nein)
ARTIKEL = {
    "PVD-0001": ("modul", True), "PVD-0002": ("kabel", True), "PVD-0003": ("stecker", True),
    "PVD-0004": ("haken", True), "PVD-0005": ("schiene", False), "PVD-0006": ("klemme", False),
    "PVD-0007": ("speicher", True), "PVD-0008": ("speicher", True), "PVD-0009": ("geraet", True),
    "120120409": ("geraet", True), "120120624": ("geraet", False), "120993590": ("geraet", True),
    "12015982533": ("kabel", False), "12000023816": ("kabel", False), "120351483": ("klemme", False),
    "120349726": ("dose", False), "120542266": ("leuchte", False), "120386993": ("melder", False),
    "120120878": ("verteiler", False), "120360028": ("melder", True),
}

GRAU = (90, 98, 110)
LINIE = (60, 66, 76)
FLAECHE = (236, 239, 243)


def schrift(groesse: int, fett: bool = False):
    for pfad in (
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if fett else ''}.ttf",
        f"/usr/share/fonts/TTF/DejaVuSans{'-Bold' if fett else ''}.ttf",
    ):
        if os.path.exists(pfad):
            return ImageFont.truetype(pfad, groesse)
    return ImageFont.load_default()


def umbrechen(text: str, breite: int, font, z: ImageDraw.ImageDraw) -> list[str]:
    zeilen, aktuell = [], ""
    for wort in text.split():
        probe = f"{aktuell} {wort}".strip()
        if z.textlength(probe, font=font) <= breite:
            aktuell = probe
        else:
            if aktuell:
                zeilen.append(aktuell)
            aktuell = wort
    if aktuell:
        zeilen.append(aktuell)
    return zeilen


def symbol(z: ImageDraw.ImageDraw, form: str, cx: int, cy: int):
    """Ein schlichtes Strichsymbol je Artikelart — erkennbar gezeichnet, kein Foto."""
    if form == "modul":
        x0, y0 = cx - 150, cy - 100
        z.rectangle([x0, y0, x0 + 300, y0 + 200], outline=LINIE, width=6, fill=(52, 62, 80))
        for i in range(1, 6):
            z.line([(x0 + i * 50, y0), (x0 + i * 50, y0 + 200)], fill=(120, 130, 150), width=2)
        for j in range(1, 4):
            z.line([(x0, y0 + j * 50), (x0 + 300, y0 + j * 50)], fill=(120, 130, 150), width=2)
    elif form == "speicher":
        z.rounded_rectangle([cx - 90, cy - 120, cx + 90, cy + 120], radius=16, outline=LINIE, width=6, fill=(250, 250, 250))
        z.rectangle([cx - 40, cy - 140, cx + 40, cy - 120], fill=LINIE)
        for k in range(3):
            z.rectangle([cx - 60, cy + 60 - k * 55, cx + 60, cy + 95 - k * 55], fill=(92, 170, 110))
    elif form == "kabel":
        for r in (120, 95, 70):
            z.ellipse([cx - r, cy - r, cx + r, cy + r], outline=LINIE, width=10)
        z.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], fill=FLAECHE, outline=LINIE, width=4)
    elif form == "stecker":
        z.rounded_rectangle([cx - 160, cy - 30, cx - 10, cy + 30], radius=20, outline=LINIE, width=6, fill=(40, 40, 40))
        z.rounded_rectangle([cx + 10, cy - 30, cx + 160, cy + 30], radius=20, outline=LINIE, width=6, fill=(40, 40, 40))
        z.line([(cx - 220, cy), (cx - 160, cy)], fill=(180, 40, 40), width=10)
        z.line([(cx + 160, cy), (cx + 220, cy)], fill=(40, 40, 40), width=10)
    elif form in ("haken", "schiene", "klemme"):
        if form == "haken":
            z.line([(cx - 120, cy + 80), (cx + 60, cy + 80), (cx + 60, cy - 80), (cx + 140, cy - 80)], fill=LINIE, width=18, joint="curve")
        elif form == "schiene":
            z.rectangle([cx - 200, cy - 25, cx + 200, cy + 25], outline=LINIE, width=6, fill=(200, 205, 212))
            z.line([(cx - 200, cy), (cx + 200, cy)], fill=LINIE, width=3)
        else:
            z.rectangle([cx - 70, cy - 60, cx + 70, cy + 60], outline=LINIE, width=6, fill=(220, 224, 230))
            for k in (-35, 0, 35):
                z.ellipse([cx + k - 12, cy - 12, cx + k + 12, cy + 12], fill=(240, 160, 40))
    elif form == "dose":
        z.rounded_rectangle([cx - 110, cy - 110, cx + 110, cy + 110], radius=24, outline=LINIE, width=6, fill=(252, 252, 252))
        z.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], outline=LINIE, width=5)
        for k in (-28, 28):
            z.ellipse([cx + k - 10, cy - 10, cx + k + 10, cy + 10], fill=LINIE)
    elif form == "leuchte":
        z.ellipse([cx - 110, cy - 110, cx + 110, cy + 110], outline=LINIE, width=8, fill=(255, 250, 225))
        z.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=(255, 240, 170))
    elif form == "melder":
        z.ellipse([cx - 110, cy - 110, cx + 110, cy + 110], outline=LINIE, width=6, fill=(252, 252, 252))
        for r in (70, 40):
            z.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(150, 156, 166), width=4)
        z.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=(200, 60, 60))
    elif form == "verteiler":
        z.rectangle([cx - 150, cy - 110, cx + 150, cy + 110], outline=LINIE, width=6, fill=(250, 250, 250))
        for row in (-45, 35):
            for k in range(8):
                z.rectangle([cx - 130 + k * 33, cy + row - 25, cx - 105 + k * 33, cy + row + 25], fill=(210, 214, 220), outline=LINIE)
    else:  # Reiheneinbaugerät
        z.rectangle([cx - 80, cy - 120, cx + 80, cy + 120], outline=LINIE, width=6, fill=(248, 248, 248))
        z.rectangle([cx - 25, cy - 40, cx + 25, cy + 40], fill=(60, 120, 200))
        for k in (-50, 0, 50):
            z.ellipse([cx + k - 10, cy - 100, cx + k + 10, cy - 80], fill=LINIE)
            z.ellipse([cx + k - 10, cy + 80, cx + k + 10, cy + 100], fill=LINIE)


def bild(a: dict, form: str) -> bytes:
    b = Image.new("RGB", (800, 600), FLAECHE)
    z = ImageDraw.Draw(b)
    symbol(z, form, 400, 250)
    font = schrift(28, True)
    y = 440
    for zeile in umbrechen(a["bezeichnung"], 720, font, z)[:2]:
        z.text((400, y), zeile, font=font, fill=(30, 34, 40), anchor="mm")
        y += 38
    z.text((400, 560), "PLATZHALTER-BILD · DEMO", font=schrift(20), fill=GRAU, anchor="mm")
    puffer = io.BytesIO()
    b.save(puffer, "PNG", optimize=True)
    return puffer.getvalue()


def pdf_aus(seite: Image.Image) -> bytes:
    puffer = io.BytesIO()
    seite.save(puffer, "PDF", resolution=150)
    return puffer.getvalue()


def datenblatt(a: dict, form: str) -> bytes:
    s = Image.new("RGB", (1240, 1754), "white")
    z = ImageDraw.Draw(s)
    z.rectangle([0, 0, 1240, 120], fill=(40, 44, 52))
    z.text((80, 60), "DEMO-DATENBLATT", font=schrift(48, True), fill="white", anchor="lm")
    z.text((1160, 60), "kein Original des Herstellers", font=schrift(24), fill=(200, 204, 210), anchor="rm")
    y = 190
    for zeile in umbrechen(a["bezeichnung"], 1080, schrift(42, True), z)[:3]:
        z.text((80, y), zeile, font=schrift(42, True), fill=(20, 20, 20))
        y += 56
    z.text((80, y + 10), a.get("hersteller") or "", font=schrift(30), fill=GRAU)
    kasten = Image.new("RGB", (800, 600), FLAECHE)
    symbol(ImageDraw.Draw(kasten), form, 400, 300)
    s.paste(kasten.resize((560, 420)), (80, y + 80))
    t = y + 560
    felder = [("Hersteller-Nr.", a.get("hersteller_nr")), ("Artikelnummer", a.get("artikelnummer")), ("EAN", a.get("ean")),
              ("Einheit", a.get("einheit")), ("Kategorie", a.get("kategorie"))]
    for name, wert in felder:
        z.line([(80, t), (1160, t)], fill=(220, 222, 226), width=2)
        z.text((80, t + 18), name, font=schrift(28), fill=GRAU)
        z.text((420, t + 18), wert or "–", font=schrift(28), fill=(20, 20, 20))
        t += 70
    z.line([(80, t), (1160, t)], fill=(220, 222, 226), width=2)
    z.text((80, t + 60), "Technische Daten: siehe Datenblatt des Herstellers.", font=schrift(28), fill=(20, 20, 20))
    z.text((80, t + 110), "Dieses Blatt ist ein Platzhalter für die Vorführung der App.", font=schrift(28), fill=GRAU)
    z.text((620, 1690), "DEMO-DATENBLATT · Elektriker-App", font=schrift(22), fill=GRAU, anchor="mm")
    return pdf_aus(s)


def lieferschein(ls: dict) -> bytes:
    s = Image.new("RGB", (1240, 1754), "white")
    z = ImageDraw.Draw(s)
    z.text((80, 80), ls["lieferant"], font=schrift(44, True), fill=(20, 20, 20))
    z.text((80, 140), "Musterweg 1 · 8644 Mürzhofen · DEMO", font=schrift(26), fill=GRAU)
    z.text((80, 260), "LIEFERSCHEIN", font=schrift(56, True), fill=(20, 20, 20))
    d = ls["datum"]
    z.text((80, 340), f"Nr. {ls['nummer']}      Datum {d[8:10]}.{d[5:7]}.{d[:4]}", font=schrift(30), fill=(20, 20, 20))
    z.text((80, 390), "Lieferadresse: Betrieb, Hauptlager", font=schrift(28), fill=(20, 20, 20))
    y = 500
    z.line([(80, y), (1160, y)], fill=(0, 0, 0), width=3)
    for x, t in ((80, "Pos"), (170, "Artikel-Nr."), (420, "Bezeichnung"), (980, "Menge")):
        z.text((x, y + 12), t, font=schrift(26, True), fill=(20, 20, 20))
    y += 60
    z.line([(80, y), (1160, y)], fill=(0, 0, 0), width=2)
    for i, p in enumerate(ls["positionen"], 1):
        y += 20
        z.text((80, y), str(i), font=schrift(28), fill=(20, 20, 20))
        z.text((170, y), p.get("artikelnummer") or "", font=schrift(28), fill=(20, 20, 20))
        z.text((420, y), p["bezeichnung"][:34], font=schrift(28), fill=(20, 20, 20))
        z.text((980, y), f"{p['menge']:g} {p.get('einheit') or ''}", font=schrift(28), fill=(20, 20, 20))
        y += 50
    z.line([(80, y + 20), (1160, y + 20)], fill=(0, 0, 0), width=2)
    z.text((80, 1500), "Ware erhalten: ______________________", font=schrift(28), fill=(20, 20, 20))
    z.text((620, 1690), "DEMO-LIEFERSCHEIN", font=schrift(22), fill=GRAU, anchor="mm")
    return pdf_aus(s)


def main():
    passwort = os.environ.get("DEMO_CHEF_PASSWORT")
    if not passwort:
        sys.exit("DEMO_CHEF_PASSWORT fehlt")
    url, key = env_lesen()
    sitzung = json.loads(anfrage(
        f"{url}/auth/v1/token?grant_type=password", key, "POST",
        json.dumps({"email": "chef@elektro.handwerkapp.at", "password": passwort}).encode(),
        kopf={"Content-Type": "application/json"},
    ))
    token = sitzung["access_token"]
    rest = f"{url}/rest/v1"
    nummern = ",".join(f'"{n}"' for n in ARTIKEL)
    liste = json.loads(anfrage(
        f"{rest}/artikel?quelle=eq.demo&artikelnummer=in.({urllib.parse.quote(nummern)})"
        "&select=id,artikelnummer,bezeichnung,hersteller,hersteller_nr,ean,einheit,kategorie", key, token=token))
    for a in liste:
        form, mit_blatt = ARTIKEL[a["artikelnummer"]]
        # alte Demo-Dateien dieses Artikels weg
        alt = json.loads(anfrage(f"{rest}/artikel_dateien?artikel_id=eq.{a['id']}&name=like.demo-*&select=id,pfad", key, token=token))
        if alt:
            anfrage(f"{url}/storage/v1/object/{BUCKET}", key, "DELETE", json.dumps({"prefixes": [x["pfad"] for x in alt]}).encode(),
                    token=token, kopf={"Content-Type": "application/json"})
            anfrage(f"{rest}/artikel_dateien?artikel_id=eq.{a['id']}&name=like.demo-*", key, "DELETE", token=token)
        dateien = [("bild", "demo-bild.png", "image/png", bild(a, form))]
        if mit_blatt:
            dateien.append(("datenblatt", "demo-datenblatt.pdf", "application/pdf", datenblatt(a, form)))
        for art, name, mime, inhalt in dateien:
            pfad = f"artikel/{a['id']}/{name}"
            anfrage(f"{url}/storage/v1/object/{BUCKET}/{pfad}", key, "POST", inhalt, token=token,
                    kopf={"Content-Type": mime, "x-upsert": "true"})
            anfrage(f"{rest}/artikel_dateien", key, "POST",
                    json.dumps({"artikel_id": a["id"], "art": art, "pfad": pfad, "name": name}).encode(),
                    token=token, kopf={"Content-Type": "application/json", "Prefer": "return=minimal"})
        print(f"{a['artikelnummer']}: {len(dateien)} Datei(en)")

    # PDF des offenen Demo-Lieferscheins
    ls = json.loads(anfrage(f"{rest}/lieferscheine?nummer=eq.SN-20931&select=nummer,lieferant,datum,datei_pfad,positionen", key, token=token))
    for l in ls:
        try:
            anfrage(f"{url}/storage/v1/object/lieferscheine/{l['datei_pfad']}", key, "POST", lieferschein(l), token=token,
                    kopf={"Content-Type": "application/pdf", "x-upsert": "true"})
            print(f"{l['nummer']}: PDF hochgeladen")
        except urllib.error.HTTPError as e:
            print(f"{l['nummer']}: {e.code} {e.read()[:200]!r}")


if __name__ == "__main__":
    main()
