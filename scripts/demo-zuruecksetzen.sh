#!/usr/bin/env bash
# Demo auf den Ausgangsstand: Dateien im Speicher, Betrieb, Kunden, Projekte,
# Artikel, Stunden, Material, Regieberichte, Belege, Unterschriftsbilder.
# Die Konten (chef/max/lisa …) bleiben; selbst registrierte Konten auch.
# ACHTUNG: löscht auch, was der Kunde selbst in der Demo angelegt hat
# (SETEC-Probedaten seit 11.11.2026) — vorher sichern.
#
#   DEMO_CHEF_PASSWORT=… scripts/demo-zuruecksetzen.sh
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
: "${DEMO_CHEF_PASSWORT:?DEMO_CHEF_PASSWORT fehlt (Passwort des Demo-Chefs)}"

node "$D/scripts/demo-dateien-loeschen.mjs"
# Reihenfolge einhalten: 01 löscht alles und legt den Stamm an, 02 die
# Artikel, 03 den Verlauf (braucht beides), 04 Lager, Lieferanten, Lagerplätze
for f in 01-stamm 02-artikel 03-verlauf 04-artikel; do
  datei="$D/supabase/demo/$f.sql"
  # Der Verlauf steht auf der Woche vom 26.10.2026 — ganze Wochen nach vorn
  # schieben, damit die Demo immer „aktuell“ wirkt und Wochentage stimmen
  if [ "$f" = 03-verlauf ]; then
    datei=$(mktemp --suffix=.sql)
    python3 -I "$D/supabase/demo/daten_schieben.py" "$D/supabase/demo/$f.sql" > "$datei"
  fi
  "$D/scripts/sql.sh" -f "$datei" > /dev/null
  echo "✓ $f"
  # Nach 01 gibt es keine Rechnungen mehr — erst jetzt lassen sich ihre
  # abgelegten PDFs löschen (die Demo-Rechnungen haben feste IDs)
  if [ "$f" = 01-stamm ]; then node "$D/scripts/demo-dateien-loeschen.mjs" --archiv; fi
done
python3 -I "$D/supabase/demo/unterschriften.py"
python3 -I "$D/supabase/demo/lieferscheine.py"
python3 -I "$D/supabase/demo/artikel_dateien.py"
# SETEC-Pakete (je wiederholbar, legen nur zusätzlich an): Terminplaner, PV-Projekte
# mit Förderung, Vorlagen und Online-Bestätigung, Aufgaben/Dokumente, Lieferanten
# und Anlagen samt Koordinaten (gibt auch den Demo-Kunden davor eine Lage),
# zuletzt die Kategorien (ordnet auch die Eingangsrechnungen davor ein)
for f in 04-kalender 04-projekte 04-angebote 04-personal 04-kontakte 04-buchhaltung; do
  "$D/scripts/sql.sh" -f "$D/supabase/demo/$f.sql" > /dev/null
  echo "✓ $f"
done
node "$D/supabase/demo/planung.mjs"
node "$D/supabase/demo/personal-dokumente.mjs"
node "$D/supabase/demo/eingangsrechnungen.mjs"
node "$D/scripts/demo-logo.mjs"
echo "Demo zurückgesetzt."
