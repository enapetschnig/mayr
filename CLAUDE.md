# Elektriker-Demo (Repo „mayr“)

Demo-App für **einen Elektrobetrieb**: Chef (Büro, Angebote, Rechnungen) und
Monteure (Stunden, Material, Regieberichte, Fotos). Alles hängt am Projekt
mit fortlaufender Nummer `2026-0001`. Ziel: die einfachste Software für
Elektriker — am Handy auf der Baustelle bedienbar, Angebot vor Ort per Sprache.

| | |
|---|---|
| Supabase | `xcsbbaiwzdivmaodltxm` (Projekt „mayr“, ePower-Org, eu-central-1) |
| Vercel | Projekt `mayr`, Auto-Deploy von `main` |
| Betrieb | „Elektro Muster GmbH“ — Demo-Daten, in Einstellungen änderbar |

Die frühere Drei-Firmen-App ist abgelöst; sie
steht im Git-Verlauf bis Commit `769f917`, die Datensicherung unter
`~/Developer/_baukasten/sicherungen/mayr/2026-10-25-vor-umbau/`.

**Konzept, Rollen, Datenmodell, Abläufe, Code-Konventionen: `docs/KONZEPT.md`.**
Schema samt RLS und Triggern: `supabase/migrations/20261025100000_elektriker_grundschema.sql`.

## Design „Werkbank“

- Handy/Tablet: **die Startseite ist das Menü** (große Karten),
  kein Seitenmenü, keine Leiste unten; jede Unterseite hat Zurück + Logo im
  Kopf (`<Seite>` aus `components/PageHeader.tsx`). PC ab 1024 px: Seitenmenü.
- Neutrale Flächen, weiße Karten mit 1-px-Rand, keine Schatten.
  **Blau ist die einzige Aktionsfarbe.** Status nur als Pille aus einer
  Tabelle (`lib/types.ts`): Entwurf cyan, verrechnet lila, grün = erledigt.
- Formulare als Vollbild (`FormularDialog`), Eingaben 16 px am Handy.
- **Handyansicht** (`/handyansicht`, nur PC): die App in einem 390-px-Rahmen
  mit eigener Anmeldung (`lib/handyansicht.ts`, erkannt an `window.name`) —
  der Chef zeigt so, was ein Monteur am Handy sieht, ohne sich abzumelden.

## Befehle

```bash
npm run dev          # Port 8080 (belegt? npx vite --port 8093 --strictPort)
npm run build
npm run typecheck
npm run check        # Absturz-Wächter
npm test             # vitest (Parser)
```

Regeln in der Datenbank prüfen (83 Prüfungen: nicht freigeschaltet, Monteur,
Chef, Festschreiben, Stornorechnung, Korrektur, Regiebericht, Material, Konten,
Rechnungsarchiv) — legt echte Daten und Nummern an, danach **immer** aufräumen:

```bash
node tests/rls-test.mjs anlegen                  # 3 Testkonten, dann die ausgegebenen SQL-Zeilen
node tests/rls-test.mjs
scripts/sql.sh -f tests/rls-aufraeumen.sql       # Testdaten, Testkonten, Nummernkreise zurück
```

Durchklick-Test am Handy (Playwright, 390 px, gegen den laufenden Dev-Server):
Max legt ein Projekt an, bucht 4 h, fasst aus dem Bus aus, schreibt einen
Regiebericht mit Kundenunterschrift; der Chef übernimmt alles in eine
Rechnung, stellt fertig, lädt das PDF (= das abgelegte Original). Jeder
Schritt wird in der Datenbank nachgeprüft (22 Prüfungen), Bilder und PDF in
`tests/bilder/`. Danach **immer** aufräumen — das löscht auch die
Test-Unterschrift und das abgelegte PDF:

```bash
APP_URL=http://127.0.0.1:8093 MONTEUR_PW=… CHEF_PW=… node tests/durchlauf.mjs   # CHROME=… für einen eigenen Chromium
DEMO_CHEF_PASSWORT=… node tests/durchlauf-aufraeumen.mjs
```

Demo zurücksetzen — Dateien im Speicher, Stamm, Artikel, Verlauf und
Unterschriftsbilder in der richtigen Reihenfolge (die Konten bleiben):

```bash
DEMO_CHEF_PASSWORT=… scripts/demo-zuruecksetzen.sh
```

Einzeln: `scripts/demo-dateien-loeschen.mjs`, dann `supabase/demo/01-stamm.sql`,
danach `demo-dateien-loeschen.mjs --archiv` (abgelegte Rechnungs-PDFs — erst
löschbar, wenn die Rechnung weg ist), `02-artikel.sql` (aus `artikel_sql.py`
erzeugt), `03-verlauf.sql` je mit `scripts/sql.sh -f`, zuletzt
`supabase/demo/unterschriften.py`. Unterschriften
im Speicher lassen sich nicht löschen (Policy `unterschriften_bleiben`) — alte
bleiben nach dem Zurücksetzen als verwaiste Dateien liegen, wenige KB.

`scripts/sql.sh` liest das DB-Passwort aus `.supabase-db-passwort.txt` (nie
ausgeben). **Eine Anweisung je Aufruf** — mehrere mit Strichpunkt laufen still
nicht; deshalb sind die Demo- und Aufräum-Dateien je ein `do $$ … $$`-Block.
Neue Migrationen: `scripts/sql.sh push --dry-run`, dann `scripts/sql.sh push`
(spielt nur ein, was im Verlauf `supabase_migrations.schema_migrations` fehlt).
Die Rolle `postgres` darf `session_replication_role` nicht setzen — das
Zurücksetzen schaltet die Festschreib-Trigger per `alter table … disable
trigger user` nur innerhalb der eigenen Transaktion aus.

## Stolpersteine

- PostgREST-Sammel-Inserts mit **unterschiedlichen Feldern** je Zeile setzen
  fehlende Felder auf NULL statt auf den Spalten-Standard → `not null` knallt.
  Bei Mehrfach-Inserts immer alle Felder angeben.
- `beleg_positionen.gesamt` ist eine generierte Spalte — nie schreiben.
- Verrechnet wird an der Quelle (`rechnung_id` an Stunde, Materialbuchung,
  Regiebericht); verrechnete und unterschriebene Buchungen sind per Trigger
  festgeschrieben.
