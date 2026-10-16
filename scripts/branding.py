#!/usr/bin/env python3
"""
============================================================================
 BRANDING SETZEN — eine Farbe, ein Logo, fertig
============================================================================

    python3 scripts/branding.py "#1B3A6B"                    # nur Farbe
    python3 scripts/branding.py "#1B3A6B" ~/Downloads/logo.png

Was passiert:
  1. kunde.config.ts bekommt die Farbe als Hex UND als HSL — beide Werte
     bleiben damit garantiert synchron (von Hand ging das oft schief).
  2. Aus dem Logo entstehen alle Bildgrößen, die die App erwartet:
        public/logo.png            (Anmeldeseite, Menü, PDF-Briefkopf)
        public/icon-192.png        (PWA, quadratisch, transparent gepolstert)
        public/icon-512.png        (PWA)
        public/apple-touch-icon.png(180 px, WEISSER Grund — Apple-Vorgabe)
        public/favicon.ico         (16/32/48 in einer Datei)
  3. Ohne Logo entsteht ein ordentlicher Platzhalter: abgerundetes Quadrat
     in der Hauptfarbe mit den Initialen des Kurznamens. Die App sieht damit
     vom ersten Start an nach dem Kunden aus; das echte Logo kann jederzeit
     mit demselben Befehl nachgereicht werden.

Alles weitere (CSS-Palette, PWA-Manifest, theme-color, PDF-Akzente) leitet
sich zur Laufzeit aus kunde.config.ts ab — hier ist nichts mehr zu tun.
"""

import colorsys
import pathlib
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow fehlt: python3 -m pip install pillow")

WURZEL = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = WURZEL / "public"
CONFIG = WURZEL / "src" / "kunde.config.ts"


# ── Farbe ───────────────────────────────────────────────────────────────────

def hex_nach_hsl(hexwert: str) -> str:
    """'#1B3A6B' → '215 60% 26%' (Format der CSS-Variablen)."""
    hexwert = hexwert.lstrip("#")
    if len(hexwert) == 3:
        hexwert = "".join(c * 2 for c in hexwert)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", hexwert):
        sys.exit(f"Keine gültige Hex-Farbe: #{hexwert}")
    r, g, b = (int(hexwert[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return f"{round(h * 360)} {round(s * 100)}% {round(l * 100)}%"


def config_aktualisieren(hexwert: str, hsl: str) -> None:
    s = CONFIG.read_text(encoding="utf-8")
    s, n1 = re.subn(r'(\n\s*primary: )"[^"]*"', rf'\1"{hsl}"', s, count=1)
    s, n2 = re.subn(r'(\n\s*primaryHex: )"[^"]*"', rf'\1"{hexwert}"', s, count=1)
    if n1 != 1 or n2 != 1:
        sys.exit("kunde.config.ts: primary/primaryHex nicht gefunden — Datei prüfen.")
    CONFIG.write_text(s, encoding="utf-8")
    print(f"  kunde.config.ts:  primary {hsl}  ·  primaryHex {hexwert}")


# ── Logo-Pipeline ───────────────────────────────────────────────────────────

def quadrat(bild: Image.Image, kante: int, hintergrund=None, polster=0.10) -> Image.Image:
    """Logo mittig auf quadratische Fläche setzen, Seitenverhältnis erhalten."""
    flaeche = Image.new("RGBA", (kante, kante), hintergrund or (0, 0, 0, 0))
    nutz = round(kante * (1 - 2 * polster))
    kopie = bild.copy()
    kopie.thumbnail((nutz, nutz), Image.LANCZOS)
    flaeche.paste(kopie, ((kante - kopie.width) // 2, (kante - kopie.height) // 2), kopie)
    return flaeche


def initialen_ermitteln() -> str:
    m = re.search(r'\n\s*kurzname: "([^"]*)"', CONFIG.read_text(encoding="utf-8"))
    worte = (m.group(1) if m else "App").split()
    return "".join(w[0] for w in worte[:2]).upper() or "A"


def platzhalter_bauen(hexwert: str) -> Image.Image:
    """Abgerundetes Quadrat in Markenfarbe mit weißen Initialen."""
    kante = 1024
    farbe = tuple(int(hexwert.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    bild = Image.new("RGBA", (kante, kante), (0, 0, 0, 0))
    zeichner = ImageDraw.Draw(bild)
    zeichner.rounded_rectangle([0, 0, kante, kante], radius=kante // 5, fill=farbe + (255,))

    text = initialen_ermitteln()
    schrift = None
    for pfad in ("/System/Library/Fonts/Helvetica.ttc",
                 "/System/Library/Fonts/HelveticaNeue.ttc",
                 "/Library/Fonts/Arial.ttf"):
        try:
            schrift = ImageFont.truetype(pfad, size=round(kante * 0.42))
            break
        except OSError:
            continue
    if schrift is None:
        schrift = ImageFont.load_default(size=round(kante * 0.42))

    box = zeichner.textbbox((0, 0), text, font=schrift)
    zeichner.text(((kante - box[2] + box[0]) / 2 - box[0],
                   (kante - box[3] + box[1]) / 2 - box[1]),
                  text, font=schrift, fill=(255, 255, 255, 255))
    return bild


def bilder_schreiben(logo: Image.Image, echtes_logo: bool) -> None:
    logo = logo.convert("RGBA")

    # Hauptlogo: Breite maximal 512, Verhältnis bleibt
    haupt = logo.copy()
    haupt.thumbnail((512, 512), Image.LANCZOS)
    haupt.save(PUBLIC / "logo.png")

    quadrat(logo, 192).save(PUBLIC / "icon-192.png")
    quadrat(logo, 512).save(PUBLIC / "icon-512.png")
    # Apple verlangt deckenden Grund — Transparenz würde schwarz.
    quadrat(logo, 180, hintergrund=(255, 255, 255, 255)).convert("RGB") \
        .save(PUBLIC / "apple-touch-icon.png")
    quadrat(logo, 48).save(PUBLIC / "favicon.ico",
                           format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

    art = "aus Logodatei" if echtes_logo else "Platzhalter mit Initialen"
    print(f"  Bilder ({art}):  logo.png · icon-192 · icon-512 · apple-touch-icon · favicon.ico")


# ── Ablauf ──────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        sys.exit('Aufruf: python3 scripts/branding.py "#RRGGBB" [logodatei]')

    hexwert = sys.argv[1] if sys.argv[1].startswith("#") else "#" + sys.argv[1]
    hsl = hex_nach_hsl(hexwert)
    config_aktualisieren(hexwert, hsl)

    if len(sys.argv) >= 3:
        pfad = pathlib.Path(sys.argv[2]).expanduser()
        if not pfad.exists():
            sys.exit(f"Logodatei nicht gefunden: {pfad}")
        bilder_schreiben(Image.open(pfad), echtes_logo=True)
    else:
        bilder_schreiben(platzhalter_bauen(hexwert), echtes_logo=False)

    print("  ✓ Branding gesetzt — Rest läuft zur Laufzeit aus kunde.config.ts.")


if __name__ == "__main__":
    main()
