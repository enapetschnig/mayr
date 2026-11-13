#!/usr/bin/env bash
# Eine Migrationsdatei einspielen und im Verlauf vermerken — auch mit vielen
# Anweisungen (über die Management-API, nicht über den Pooler).
#
#   scripts/migration.sh supabase/migrations/20261113100000_name.sql
#
# Gedacht für parallele Arbeit in mehreren Worktrees: `sql.sh push` bricht ab,
# sobald der Verlauf Versionen kennt, die im eigenen Ordner fehlen. Hier wird
# nur die eine Datei eingespielt; steht ihre Version schon im Verlauf, passiert
# nichts. Der Zugangsschlüssel kommt aus ~/.config/hw/zugangsdaten.env und wird
# nie ausgegeben.
set -euo pipefail
DATEI=${1:?Datei fehlt}
REF=xcsbbaiwzdivmaodltxm
NAME=$(basename "$DATEI" .sql)
VERSION=${NAME%%_*}
REST=${NAME#*_}
set -a; . ~/.config/hw/zugangsdaten.env >/dev/null 2>&1; set +a
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN fehlt}"

frage() {
  python3 -I -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' \
    | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @-
}

schon=$(echo "select count(*) as n from supabase_migrations.schema_migrations where version = '$VERSION'" | frage)
case "$schon" in *'"n":1'*) echo "$VERSION steht schon im Verlauf — nichts zu tun."; exit 0;; esac

antwort=$( { echo "begin;"; cat "$DATEI"; echo; echo "insert into supabase_migrations.schema_migrations (version, name, statements) values ('$VERSION', '$REST', array[]::text[]);"; echo "commit;"; } | frage)
case "$antwort" in
  *'"message"'*|*'"error"'*) echo "Fehler: $antwort" >&2; exit 1;;
esac
echo "$VERSION $REST eingespielt."
