# mayr — MAM Mechatronik & Partner

App für **drei Elektrofirmen ohne Mitarbeiter**, die immer wieder zusammen
auf Baustellen arbeiten: eine ist Generalunternehmer (GU) und rechnet mit dem
Kunden ab, die anderen sind Subunternehmer (SU) und stellen ihre Rechnung an
den GU.

| | |
|---|---|
| Firma 1 (echt) | MAM Mechatronik, Guntendorf 18, 4550 Kremsmünster |
| Firma 2, 3 | Demo Elektro Nord / Demo Elektro Süd — Platzhalter, in der App umbenennbar |
| Supabase | `xcsbbaiwzdivmaodltxm` (Projekt „mayr“, ePower-Org, eu-central-1) |
| Domain | mayr.handwerkapp.at |

## Kein hw-core-Fork

Bewusst **eigene, schlanke App im selben Look** — nicht aus `neue-app.sh`.
hw-core ist auf *einen* Betrieb mit Mitarbeitern gebaut (Rollen, Lohn,
Plantafel, 200 Migrations). Hier gibt es drei Firmen, keine Mitarbeiter und
eine Sichtbarkeitslogik quer durch alle Tabellen. Das in hw-core
hineinzuschneiden hätte praktisch jede Kerndatei verändert.

Übernommen aus hw-core: `components/ui`, `index.css`, Farblogik in
`kunde.config.ts` (`farbenAnwenden`), `branding.py`, `check-crash-risks.mjs`,
PWA-Setup, Seitenkopf/Karten-Optik. Aus der Tilger-App: `FormularDialog`
(Vollbild-Formulare), Rechnungs-PDF (`lib/pdf.ts`). Aus Schrettl: „+ Foto“
oben auf der Startseite (`SchnellErfassung`) und `Serienaufnahme`.

**Kein `upstream`-Remote** — `git merge upstream/main` gibt es hier nicht.

## Das Datenmodell in einem Satz

Jeder Benutzer gehört zu einer Firma (`profiles.firma_id`); Projekte sind
`privat` oder `gemeinsam`; Stunden, Material, Dateien und Termine tragen
**ihre eigene** `sichtbarkeit`; Rechnungen sieht nur die ausstellende Firma
und — sobald fertig — die Empfängerfirma.

Alles als RLS in `supabase/migrations/20261016120000_grundschema.sql`.
Hilfsfunktionen: `meine_firma()`, `ist_aktiv()`, `ist_admin()`,
`projekt_sichtbar(id)`, `datei_sichtbar(pfad)`.

| Tabelle | Zweck |
|---|---|
| `firmen` | Briefkopf, Bank, Präfixe, Stundensatz, Materialaufschlag, Farbe, Logo |
| `projekte` + `projekt_rollen` | Projekt, Freigabe, GU/SU je Firma (max. ein GU, Index) |
| `zeiten` | Stunden direkt **oder** Von/Bis/Pause; `rechnung_id` = verrechnet |
| `material` | Buchungen mit EK; `rechnung_id` = verrechnet |
| `dateien` | Fotos/Dokumente, Bucket `projekt-dateien` (privat, signierte URLs) |
| `termine` | Kalender; `firmen uuid[]` = wer ist dabei |
| `rechnungen` + `rechnung_positionen` | Rechnung/Angebot, an Kunde oder Firma |
| `nummernkreise` | fortlaufend je Firma/Typ/Jahr, nur über `beleg_fertigstellen()` |

### Regeln, die in der Datenbank stecken (nicht nur im UI)

- Freigabe eines Projekts ändert nur die Eigentümerfirma (`projekt_schutz`)
- Firma/Freischaltung/Admin eines Profils ändert nur ein Admin (`profil_schutz`)
- Fertige Rechnungen sind festgeschrieben (`rechnung_schutz`, `positionen_schutz`)
- Nummer erst beim Fertigstellen → keine Lücken durch gelöschte Entwürfe
- Gemeinsames Projekt bekommt automatisch die Eigentümerfirma als GU

## Rechnungsablauf

1. SU öffnet das gemeinsame Projekt → „Rechnung an GU schreiben“
2. „Stunden & Material aus Projekt“: Stundensatz, Aufschlag, Material als
   **Materialpauschale** oder einzeln → Reverse Charge ist bei Kollegen
   automatisch an (§ 19 Abs. 1a UStG, Bauleistungen)
3. Fertigstellen → Nummer, festgeschrieben, beim GU unter „Von Kollegen“
4. GU schreibt die Kundenrechnung, holt eigene Buchungen + „Von Kollegen
   übernehmen“ (je Rechnung eine Zeile oder Positionen einzeln, mit Aufschlag)
5. PDF (jsPDF, Briefkopf je Firma, Bezahl-QR wenn IBAN gepflegt) → Bezahlt

Storno gibt verknüpfte Stunden/Material wieder frei.

## Befehle

```bash
npm run dev          # Port 8080
npm run build
npm run check        # Absturz-Wächter
node tests/rls-test.mjs anlegen   # Testnutzer je Firma anlegen (danach per SQL aktivieren)
node tests/rls-test.mjs           # 22 Prüfungen der Sichtbarkeitsregeln
CHROME=<pfad> node tests/durchlauf.mjs   # kompletter Klickdurchlauf am Handyformat (App muss laufen, Port 8093)
```

Beide Tests legen Daten an — danach aufräumen (siehe Git-Verlauf, Abschnitt
„Testdaten entfernen“: Storage-API für Dateien, SQL mit
`session_replication_role = replica` wegen der Festschreib-Trigger).

## Stolperstein

PostgREST-Sammel-Inserts mit **unterschiedlichen Feldern** je Zeile setzen
fehlende Felder auf NULL statt auf den Spalten-Standard → `not null` knallt.
Bei Mehrfach-Inserts immer alle Felder angeben.
