#!/usr/bin/env bash
# Demo auf den Ausgangsstand: Dateien im Speicher, Betrieb, Kunden, Projekte,
# Artikel, Stunden, Material, Regieberichte, Belege, Unterschriftsbilder.
# Die Konten (chef/max/lisa) bleiben; selbst registrierte Konten auch.
#
#   DEMO_CHEF_PASSWORT=… scripts/demo-zuruecksetzen.sh
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
: "${DEMO_CHEF_PASSWORT:?DEMO_CHEF_PASSWORT fehlt (Passwort des Demo-Chefs)}"

node "$D/scripts/demo-dateien-loeschen.mjs"
# Reihenfolge einhalten: 01 löscht alles und legt den Stamm an, 02 die
# Artikel, 03 den Verlauf (braucht beides)
for f in 01-stamm 02-artikel 03-verlauf; do
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
echo "Demo zurückgesetzt."
