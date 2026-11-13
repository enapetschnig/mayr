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
Ausbau nach dem Vorbild e-projekt (was fehlt, Reihenfolge, Stand): `docs/AUSBAU-E-PROJEKT.md`.
Schema samt RLS und Triggern: `supabase/migrations/20261025100000_elektriker_grundschema.sql`.

## Design „Werkbank“

- Menü wie Lengauer Stockner (`components/rahmen/`, Details KONZEPT „Startseite
  und Menü“): Handy **die Startseite ist das Menü** (große Karten mit „… öffnen“,
  Seltenes unter „Mehr“), keine Leiste unten; jede Unterseite hat Zurück + Logo
  im Kopf (`<Seite>` aus `components/PageHeader.tsx`). Tablet ab 768 px schmale
  Symbol-Leiste, PC ab 1024 px helle Seitenleiste mit Suche (Strg+K) und „+ Neu“.
- Neutrale Flächen, weiße Karten mit 1-px-Rand, keine Schatten (Ausnahme: die
  Menü-Karten der Startseite, leicht).
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

Regeln in der Datenbank prüfen (223 Prüfungen: nicht freigeschaltet, Monteur,
Chef, Festschreiben, Offene Posten, Stornorechnung, Korrektur, Eingangsrechnungen
mit Freigabe und Positionen, Teil-/Schlussrechnung, Anlagen und Prüfprotokolle,
Bestellungen, Regiebericht, Material, Konten, Rechnungsarchiv, Abwesenheiten,
Zeitkonto, Einsätze, Buchhaltung, Fuhrpark und Teams, Lieferscheine, Rabatte, Buchen nur „In Arbeit“) — legt echte Daten und Nummern an, danach **immer** aufräumen:

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

Das Skript schiebt den Verlauf (`supabase/demo/daten_schieben.py`) um ganze Wochen bis in die laufende Woche.
`03-verlauf.sql` schreibt außerdem drei Monate Stunden mit Von–Bis für alle
Monteure bis gestern und plant die Teams acht Wochen voraus (Plantafel).

Einzeln: `scripts/demo-dateien-loeschen.mjs`, dann `supabase/demo/01-stamm.sql`,
danach `demo-dateien-loeschen.mjs --archiv` (abgelegte Rechnungs-PDFs — erst
löschbar, wenn die Rechnung weg ist), `02-artikel.sql` (aus `artikel_sql.py`
erzeugt), `03-verlauf.sql`, `04-artikel.sql` (Lagerplätze, zweite Lieferanten, Bewegungen, offener Lieferschein SN-20931) je mit `scripts/sql.sh -f`, zuletzt
`supabase/demo/unterschriften.py` und `lieferscheine.py` (Fotos der Demo-Lieferscheine), `artikel_dateien.py` (Platzhalter-Bilder, DEMO-DATENBLÄTTER),
dann `DEMO_CHEF_PASSWORT=… node supabase/demo/eingangsrechnungen.mjs` (erzeugt je
Demo-Eingangsrechnung ohne Datei ein PDF mit Positionen und „DEMO-BELEG“ im Fuß).
Demo-Artikel: 158 Sonepar-Artikel aus `artikel-sonepar.json` (Artikelnummer, EAN,
Listenpreis samt Kupferzuschlag) plus ~72.000 aus der Sonepar-Datanorm
(`quelle = 'datanorm'`, übersteht das Zurücksetzen; neu einspielen mit
`scripts/datanorm-einspielen.ts <Ordner>`, nur die Marken eines Elektrobetriebs).
EK = Liste − Rabatt aus der Tabelle `rabatte` (je Lieferant, Hersteller,
Rabattgruppe; Demo: Sonepar 32 %, Hager 36 %, AI25 40 %), angewandt in Häppchen
per `rabatte_anwenden` — echte Netto-Konditionen nie ins Repo (öffentlich).
Demo-Konten: chef/max/lisa (Passwort `chef123`/`max123`/`lisa123`) plus tom, eva,
stefan, sarah, jonas (Passwort `demo123`, anlegen mit `SUPABASE_SERVICE_KEY=… node scripts/demo-konten.mjs`). Unterschriften
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

## KI (Edge Function `ki`)

`supabase/functions/ki/index.ts`, Modell `claude-opus-5-5`, Secret
`ANTHROPIC_API_KEY` (`supabase secrets set`). Aufgaben: `material_vorschlag`
(„PV-Anlage 9 kW“ → Komponenten aus dem eigenen Artikelstamm, `artikel_suchen`
ohne Unscharf, höchstens 4 parallel — sonst Statement-Timeout 8 s) und
`beleg_lesen` (Eingangsrechnung oder Lieferschein aus Foto/PDF). Aufrufer:
`src/lib/ki.ts`. Deploy: `supabase functions deploy ki --project-ref xcsbbaiwzdivmaodltxm --use-api`.

## Änderungswünsche und Roboter

„Änderung melden“ in jedem Seitenkopf (`components/wunsch/WunschMelden.tsx`, wie Lengauer
Stockner; Dialog und Aufnahmeleiste einmal in `App.tsx`): erst Bildschirmfoto (html2canvas),
dann Dialog — Bild groß **einkreisen** (`BildMarkieren.tsx`), Sprachnachricht, **„Bildschirm
aufnehmen & erklären“** (rrweb zeichnet die Seite auf, Ton läuft mit, Seitenwechsel in der App
überlebt sie, unten „Fertig“; `lib/bildschirmAufnahme.ts`, Spalten `aufnahme_pfad`/
`aufnahme_ablauf`), Text, Dateien. Bei einer Vorführung macht `sprache-zu-text` aus
Zeitmarken-Abschrift (whisper-1) und Ablauf eine Zeitleiste und Claude die einzelnen Wünsche. Tabelle und
Ablage `aenderungswuensche` (Migration `20261111100000_aenderungswuensche.sql`),
Abschrift im Hintergrund per Edge Function `sprache-zu-text` (Secret `OPENAI_API_KEY`).
Ein Trigger schickt jeden Wunsch per pg_net ans ePower-Cockpit
(`cockpit_verbindung`, Zeile mit Geheimnis nur in der DB, App-Schlüssel `mayr`); Bilder
holt das Cockpit über `wunsch-datei` (ohne JWT, Secret `COCKPIT_SECRET`). Der
Änderungswunsch-Roboter (`_baukasten/werkzeuge/roboter`, YOLO an) setzt um, pusht nach
`main` und schreibt Status/Antwort zurück; Liste unter `/wuensche`. Neuer Stand →
unten links „Jetzt aktualisieren“ (`UpdateHinweis.tsx`, PWA im Modus `prompt`,
`/version.json` mit der Build-Kennung). Testwünsche mit `ZZTEST` beginnen lassen
(kein Telegram) und sofort in mayr **und** in `crm.app_wuensche` löschen.
Hier arbeitet der Zweig `elektriker` und wird nach `main` gepusht — vor eigener Arbeit
`git pull origin main`, der Roboter pusht ebenfalls nach `main`.

## Stolpersteine

- PostgREST-Sammel-Inserts mit **unterschiedlichen Feldern** je Zeile setzen
  fehlende Felder auf NULL statt auf den Spalten-Standard → `not null` knallt.
  Bei Mehrfach-Inserts immer alle Felder angeben.
- `beleg_positionen.gesamt` ist eine generierte Spalte — nie schreiben.
- Verrechnet wird an der Quelle (`rechnung_id` an Stunde, Materialbuchung,
  Regiebericht); verrechnete und unterschriebene Buchungen sind per Trigger
  festgeschrieben.
