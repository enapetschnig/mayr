#!/usr/bin/env bash
# SQL gegen das mayr-Projekt (xcsbbaiwzdivmaodltxm) über den Pooler.
#
#   scripts/sql.sh "select 1"          eine Anweisung
#   scripts/sql.sh -f datei.sql        eine Datei — sie darf nur EINE Anweisung
#                                      enthalten (ein DO-Block zählt als eine)
#   scripts/sql.sh push [--dry-run]    neue Dateien aus supabase/migrations
#                                      einspielen und im Verlauf vermerken
#
# Das Passwort steht in .supabase-db-passwort.txt und wird nie ausgegeben.
# Die Pooler-Adresse legt `supabase link --project-ref xcsbbaiwzdivmaodltxm` an.
set -euo pipefail
D=$(cd "$(dirname "$0")/.." && pwd)
if [ ! -f "$D/supabase/.temp/pooler-url" ]; then
  echo "supabase/.temp/pooler-url fehlt — erst: supabase link --project-ref xcsbbaiwzdivmaodltxm" >&2
  exit 1
fi
PW=$(tr -d '\n' < "$D/.supabase-db-passwort.txt")
ENC=$(python3 -I -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$PW")
BASE=$(cat "$D/supabase/.temp/pooler-url")
case "$BASE" in *xcsbbaiwzdivmaodltxm*) ;; *) echo "falsches Projekt in pooler-url" >&2; exit 1;; esac
URL=${BASE/@/:$ENC@}

if [ "${1:-}" = "push" ]; then
  shift
  cd "$D"
  exec supabase db push --db-url "$URL" --include-all "$@"
fi
supabase db query --db-url "$URL" "$@" 2> >(grep -v 'new version\|recommend updating' >&2)
