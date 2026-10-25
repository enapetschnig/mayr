#!/usr/bin/env python3
"""
Lädt für alle unterschriebenen Demo-Regieberichte ein Unterschriftsbild in den
Storage (Bucket projekt-dateien, Pfad aus regieberichte.unterschrift_pfad).
Die Unterschrift ist ein gezeichneter Schriftzug — erkennbar Demo.

    DEMO_CHEF_PASSWORT=… python3 -I supabase/demo/unterschriften.py

Meldet sich als Demo-Chef an (RLS wie in der App), braucht kein Service-Key.
"""
import io
import json
import math
import os
import pathlib
import random
import sys
import urllib.request

from PIL import Image, ImageDraw

REPO = pathlib.Path(__file__).resolve().parents[2]


def env_lesen():
    werte = {}
    for zeile in (REPO / ".env").read_text().splitlines():
        if "=" in zeile and not zeile.lstrip().startswith("#"):
            k, v = zeile.split("=", 1)
            werte[k.strip()] = v.strip().strip('"')
    return werte["VITE_SUPABASE_URL"], werte["VITE_SUPABASE_KEY"]


def anfrage(url, key, methode="GET", daten=None, token=None, kopf=None):
    h = {"apikey": key, "Authorization": f"Bearer {token or key}"}
    h.update(kopf or {})
    req = urllib.request.Request(url, data=daten, method=methode, headers=h)
    with urllib.request.urlopen(req) as r:
        return r.read()


def unterschrift(name: str) -> bytes:
    """Schwungvoller Schriftzug: überlagerte Sinusbögen, 4-fach gezeichnet und verkleinert (glatt)."""
    rnd = random.Random(name)
    breite, hoehe, f = 600, 200, 4
    bild = Image.new("RGB", (breite * f, hoehe * f), "white")
    zeichnen = ImageDraw.Draw(bild)
    x0, punkte = 40, []
    for buchstabe in name:
        if buchstabe == " ":
            x0 += 30
            continue
        a, b = rnd.uniform(18, 34), rnd.uniform(0.8, 1.6)
        for i in range(24):
            t = i / 23
            x = x0 + t * 34 + math.sin(t * math.pi * 2 * b) * 6
            y = 110 - math.sin(t * math.pi) * a + math.sin(t * 9 + rnd.random()) * 5
            punkte.append((x * f, y * f))
        x0 += 34
    zeichnen.line(punkte, fill=(20, 30, 90), width=3 * f, joint="curve")
    # Unterstrich mit Schwung
    zeichnen.line([(30 * f, 150 * f), (x0 * 0.6 * f, 158 * f), (x0 * f, 146 * f)], fill=(20, 30, 90), width=2 * f, joint="curve")
    bild = bild.resize((breite, hoehe), Image.LANCZOS)
    puffer = io.BytesIO()
    bild.save(puffer, "PNG")
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
    berichte = json.loads(anfrage(
        f"{url}/rest/v1/regieberichte?select=nummer,unterschrift_pfad,unterschrift_name&status=eq.unterschrieben",
        key, token=token,
    ))
    for r in berichte:
        if not r["unterschrift_pfad"]:
            continue
        anfrage(
            f"{url}/storage/v1/object/projekt-dateien/{r['unterschrift_pfad']}", key, "POST",
            unterschrift(r["unterschrift_name"] or "Kunde"), token=token,
            kopf={"Content-Type": "image/png", "x-upsert": "true"},
        )
        print(f"{r['nummer']}: Unterschrift hochgeladen")


if __name__ == "__main__":
    main()
