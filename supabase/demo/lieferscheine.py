#!/usr/bin/env python3
"""
Zeichnet für die Demo-Lieferscheine ein Foto (weißes Blatt, leicht schief,
grauer Tisch) und lädt es in den Bucket „lieferscheine“ — an den Pfad aus
lieferscheine.datei_pfad. Erkennbar Demo, Inhalt aus lieferscheine.positionen,
damit die KI-Lesung in der App dasselbe findet wie die Datenbank.

    DEMO_CHEF_PASSWORT=… python3 -I supabase/demo/lieferscheine.py
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from unterschriften import anfrage, env_lesen  # noqa: E402


def schrift(groesse: int, fett: bool = False):
    for pfad in (
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if fett else ''}.ttf",
        f"/usr/share/fonts/TTF/DejaVuSans{'-Bold' if fett else ''}.ttf",
    ):
        if os.path.exists(pfad):
            return ImageFont.truetype(pfad, groesse)
    return ImageFont.load_default()


def foto(ls: dict) -> bytes:
    blatt = Image.new("RGB", (1240, 1754), "white")
    z = ImageDraw.Draw(blatt)
    z.text((80, 80), ls["lieferant"] or "Großhandel", font=schrift(44, True), fill=(20, 20, 20))
    z.text((80, 140), "Musterweg 1 · 4000 Musterstadt · DEMO", font=schrift(26), fill=(90, 90, 90))
    z.text((80, 260), "LIEFERSCHEIN", font=schrift(56, True), fill=(20, 20, 20))
    z.text((80, 340), f"Nr. {ls['nummer']}      Datum {ls['datum'][8:10]}.{ls['datum'][5:7]}.{ls['datum'][:4]}", font=schrift(30), fill=(20, 20, 20))
    z.text((80, 390), "Lieferadresse: SETEC GmbH, Baustelle", font=schrift(28), fill=(20, 20, 20))
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
        menge = f"{p['menge']:g} {p.get('einheit') or ''}"
        z.text((980, y), menge, font=schrift(28), fill=(20, 20, 20))
        y += 50
    z.line([(80, y + 20), (1160, y + 20)], fill=(0, 0, 0), width=2)
    z.text((80, 1500), "Ware erhalten: ______________________", font=schrift(28), fill=(20, 20, 20))
    # wie mit dem Handy fotografiert: leicht gedreht auf grauem Tisch
    tisch = Image.new("RGB", (1500, 2000), (120, 118, 112))
    gedreht = blatt.rotate(1.6, expand=True, fillcolor=(120, 118, 112))
    tisch.paste(gedreht, (110, 90))
    tisch = tisch.resize((1050, 1400), Image.LANCZOS)
    puffer = io.BytesIO()
    tisch.save(puffer, "JPEG", quality=82)
    return puffer.getvalue()


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
    liste = json.loads(anfrage(f"{url}/rest/v1/lieferscheine?select=nummer,lieferant,datum,datei_pfad,positionen", key, token=token))
    for ls in liste:
        if "/demo-" not in ls["datei_pfad"]:
            continue
        try:
            anfrage(f"{url}/storage/v1/object/lieferscheine/{ls['datei_pfad']}", key, "POST", foto(ls), token=token,
                    kopf={"Content-Type": "image/jpeg", "x-upsert": "true"})
            print(f"{ls['nummer']}: Foto hochgeladen")
        except urllib.error.HTTPError as e:
            print(f"{ls['nummer']}: {e.code} {e.read()[:200]!r}")


if __name__ == "__main__":
    main()
