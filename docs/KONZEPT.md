# Elektriker-App — Konzept

Demo-App für einen Elektrobetrieb: **Chef** (Büro, Angebote, Rechnungen) und
**Monteure** (Stunden, Material, Regieberichte, Fotos). Alles hängt am
**Projekt** mit fortlaufender Nummer `2026-0001`. Ziel: die einfachste
Software für Elektriker — am Handy auf der Baustelle bedienbar.

> Leitlinien
> 1. **Jeder Klick ist Aufwand.** Große Knöpfe, wenige Felder, kluge Vorbelegung
>    (heute, letztes Projekt, eigener Bus). Lieber eine Funktion weniger als eine,
>    die niemand versteht.
> 2. **Nichts doppelt erfassen.** Eine Stunde aus dem Regiebericht IST die Stunde
>    in der Zeiterfassung. Ein ausgefasster Artikel landet automatisch im
>    Projektmaterial und am Ende in der Rechnung.
> 3. **Ein Mensch bestätigt.** Spracheingabe und Vorschläge füllen aus — gespeichert
>    wird erst, wenn jemand auf „Übernehmen“ tippt.
> 4. **Nichts erfinden.** Firmendaten kommen vom Betrieb (Einstellungen). Demo-Daten
>    sind als Demo erkennbar.

## Rollen

| | Chef | Monteur |
|---|---|---|
| Projekte sehen / anlegen | ✓ | ✓ |
| Projekt löschen | ✓ | – |
| Stunden | alle | sieht alle, ändert eigene |
| Material ausfassen / zurückgeben | ✓ | ✓ |
| Regieberichte schreiben + unterschreiben lassen | ✓ | ✓ |
| Angebote, Rechnungen | ✓ | – (Tabelle per RLS gesperrt) |
| Artikelstamm pflegen, Datanorm-Import, Leistungskatalog | ✓ | nur neuen Artikel anlegen (unbekannter Strichcode) |
| Lager: Wareneingang, Inventur, Lagerorte | ✓ | Bestand sehen |
| Einstellungen Betrieb, Mitarbeiter freischalten / sperren, vorläufiges Passwort | ✓ | – |

`useSitzung().istChef` im Frontend, `public.ist_chef()` in der Datenbank.

**Konten** (`lib/konto.ts`, Migration `20261025150000_konten.sql`):
- Anmelden mit Benutzername: „Jürgen Maier“ → `juergen.maier@<loginDomain>`;
  Anmelden und Registrieren rechnen gleich (`zuEmail`). Meldungen von
  Supabase Auth übersetzt `authFehler`.
- Mitarbeiter registrieren sich selbst und warten (`aktiv = false`), bis der
  Chef freischaltet. **Sperren** setzt `gesperrt = true` (der Trigger nimmt
  `aktiv` weg); Freischalten hebt die Sperre auf. Gesperrte sehen „Zugang
  gesperrt“, nicht „Wartet auf Freischaltung“, und zählen auf der Startseite
  nicht als wartend.
- **Passwort vergessen** gibt es ohne E-Mail: der Chef vergibt unter
  Einstellungen → Mitarbeiter ein vorläufiges Passwort
  (`passwort_setzen()`, bcrypt wie Supabase Auth) und sagt es weiter;
  `passwort_neu` lässt die App beim nächsten Anmelden ein eigenes verlangen
  (`ProtectedRoute` → `ChangePasswordDialog forced`). Das vorläufige Passwort
  wird nirgends gespeichert.

## Datenmodell (supabase/migrations/20261025100000_elektriker_grundschema.sql)

| Tabelle | Zweck |
|---|---|
| `firma` | genau eine Zeile: Briefkopf, Bank, Stundensatz, Materialaufschlag, Texte |
| `profiles` | Mitarbeiter: Vorname, Nachname, `rolle` chef/monteur, `aktiv`, Farbe |
| `kunden` | Kundenstamm, `nummer` ab 1001 |
| `projekte` | `nummer` 2026-0001 (Trigger), `status` angebot/aktiv/verrechnen/abgeschlossen, Baustellenadresse, optional eigener Stundensatz |
| `zeiten` | Stunden je Mitarbeiter, Projekt optional; `regiebericht_id`, `rechnung_id` |
| `artikel` | Artikelstamm; Preise **je Einheit**; `ean`; `lagerartikel`, `mindestbestand` |
| `artikel_codes` | weitere Strichcodes (Karton = `menge` Stück, gelernte Codes) |
| `leistungen` + `leistung_material` | Leistungskatalog: „Steckdose UP komplett“ = Material + `minuten` |
| `lagerorte` | Hauptlager, Fahrzeuge (`art` = fahrzeug, `user_id` = wessen Bus) |
| `material_buchungen` | **eine** Tabelle für Lager und Projekt (siehe unten) |
| `regieberichte` | Datum, Arbeiten, Unterschrift (Bild im Storage), `rechnung_id` |
| `belege` + `beleg_positionen` | Angebot/Rechnung; Positionen mit `art` titel/leistung/artikel/arbeit/material/pauschale/text |
| `dateien` | Fotos/Dokumente je Projekt (Bucket `projekt-dateien`) |
| `termine` | Kalender; `mitarbeiter uuid[]` |
| `nummernkreise` | nur über `naechste_nummer()` |

### Materialbuchungen

| art | Lager | Projekt | Pflicht |
|---|---|---|---|
| `zugang` | + | | artikel, lagerort |
| `abgang` | − | | artikel, lagerort |
| `korrektur` | ± (menge mit Vorzeichen) | | artikel, lagerort |
| `ausfassung` | − | + | projekt; lagerort wenn Artikel |
| `rueckgabe` | + | − | projekt; lagerort wenn Artikel |
| `direkt` | | + | projekt, **kein** lagerort |

`menge` ist positiv (außer `korrektur`). Freie Positionen ohne Artikel tragen
`bezeichnung` + `einheit`. `vorgang` (uuid) gruppiert einen Scan-Durchgang.
`ek_preis` = Momentaufnahme je Einheit.

Views (laufen mit den Rechten des Abfragenden):
- `lagerbestand` — Bestand je `artikel_id` + `lagerort_id`
- `projekt_material` — je Projekt und Artikel: `ausgefasst`, `zurueck`, `direkt`,
  `verbraucht` (= ausgefasst − zurück + direkt), `offen` (noch nicht verrechnet).
  Material aus Regieberichten zählt beim Regiebericht, nicht hier.
- `projekt_zahlen` — je Projekt: Stunden, offene Stunden, Regieberichte (Entwurf/offen), offenes Material zum EK

### Verrechnung — die eine Regel

Verrechnet wird **an der Quelle**: `zeiten.rechnung_id`,
`material_buchungen.rechnung_id`, `regieberichte.rechnung_id`. Beim Übernehmen in
eine Rechnung setzt die App diese Spalte und schreibt die IDs in
`beleg_positionen.quelle` = `{"zeiten":[…],"material":[…],"regie":[…]}`.

- Position im Entwurf gelöscht → Trigger gibt die Quellen frei
- Entwurf gelöscht → FK `on delete set null` gibt frei
- Rechnung storniert → `beleg_stornieren(id)` gibt frei
- Verrechnete Stunden/Buchungen und alles aus einem unterschriebenen
  Regiebericht sind **festgeschrieben** (Trigger `buchung_schutz`): nur
  `rechnung_id` darf sich noch ändern
- Fertige Rechnungen sind festgeschrieben (`beleg_schutz`, `positionen_schutz`) —
  alles, was auf dem PDF steht, auch Betreff, Texte und Fälligkeit. Danach
  ändern sich nur Status und Zahldatum (bezahlt) und die E-Mail des
  Empfängers; Projekt, Kunde und Angebot nur auf leer (wenn eines davon
  gelöscht wird). Storniert bleibt storniert. Migration `20261025140000`.

### Angebote und Rechnungen (`components/belege/`)

- Ein Editor für beide (`BelegEditor`): Titel als Räume/Abschnitte, Positionen
  aus Leistungskatalog, Artikelstamm, frei oder diktiert (`lib/sprachParser.ts`).
- „Aus dem Projekt übernehmen“ (`ImportDialog`, `importieren.ts`): angenommenes
  Angebot, unterschriebene Regieberichte (je Bericht ein Titel mit Stunden und
  Material samt Zwischensumme), Stunden und Material ohne Bericht. Nicht
  unterschriebene Berichte zeigt er als Hinweis, übernimmt sie aber nicht.
  Schon das **Speichern des Entwurfs** setzt `rechnung_id` an den Quellen —
  so kann niemand dieselbe Stunde ein zweites Mal verrechnen.
- Fertigstellen (`beleg_fertigstellen`) vergibt die Nummer und rechnet die
  Summen. Vorher warnt der Editor (blockiert nicht): kein Leistungszeitraum,
  eigene UID fehlt (ab 400 € brutto), Empfänger-UID ab 10.000 € brutto und
  bei Reverse Charge, Anschrift unvollständig, Positionen ohne Betrag.
- PDF (`lib/belegPdf.ts`): offene Rechnungen mit Bankverbindung und
  Bezahl-QR (EPC); am Handy teilen, sonst herunterladen.
- Storno gibt Stunden, Material und Berichte frei; „Korrektur anlegen“ kopiert
  die stornierte Rechnung in einen neuen Entwurf und hängt die Quellen dort an.
- Bekannte Grenzen: die Wischgeste „zurück“ am Handy fragt bei ungespeicherten
  Änderungen nicht nach (Zurück-Knopf und Neuladen schon); eine einzeln
  gelöschte Materialzeile eines übernommenen Berichts kommt nur über einen
  neuen Import zurück.

### Regiebericht = keine doppelte Erfassung

- Arbeitszeit im Regiebericht = Zeilen in `zeiten` mit `regiebericht_id`
  (für jeden Mitarbeiter der Partie — Monteure dürfen Stunden für Kollegen eintragen)
- Material im Regiebericht = `material_buchungen` mit `regiebericht_id`
  (art `ausfassung` aus dem Bus/Lager oder `direkt`)
- Schon gebuchte Stunden desselben Projekts und Tages schlägt der Editor vor
  („übernehmen“) — `regie_zeiten_zuordnen(regie, dazu[], weg[])` setzt nur
  `regiebericht_id`, auch bei Stunden eines Kollegen (die Partie schreibt den
  Bericht meist auf EINEM Handy). Migration `20261025122000`.
- Unterschreiben: Bild nach `projekt-dateien/<projekt_id>/unterschriften/<regie_id>.png`,
  dann `status = 'unterschrieben'` + `unterschrift_name`. Ohne Bild und Namen
  lehnt der Trigger `regieberichte_unterschrift` ab; `unterschrieben_am` setzt
  der Server (eine falsch gehende Handyuhr landet nicht im Beleg).
- Danach ist der Bericht fest (Trigger `regie_schutz`); die Unterschriftsdatei
  kann niemand löschen (Storage-Policy `unterschriften_bleiben`, restriktiv)
- Ungespeicherte Eingaben sichert der Editor im Gerät (`regie/sicherung.ts`) —
  eine Wischgeste „zurück“ am Handy verliert nichts
- PDF (`lib/regiePdf.ts`): Material **ohne Preise** — der Kunde unterschreibt
  auf der Baustelle, die Preise stehen auf der Rechnung

### Strichcodes und Artikel-Import

- Kamera: `components/scanner/leser.ts` — BarcodeDetector des Browsers, wo er
  die Formate kann, sonst @zxing; eintippen geht immer.
- `lib/strichcode.ts` macht aus einem Code alle Schreibweisen (UPC-A/EAN-13
  mit führender 0, GS1-128 mit „(01)“, Leerzeichen); `artikel_zu_code()` sucht
  in `artikel.ean` und `artikel_codes` (Karton = `menge` Stück).
- Unbekannter Code → `CodeUnbekanntDialog`: vorhandenen Artikel wählen (der
  Code wird gelernt) oder neuen Artikel anlegen.
- Import (Artikelstamm → „Import“, Chef): **DATANORM 4/5** (eine oder mehrere
  Dateien eines Lieferanten) oder **CSV** (Trennzeichen, Kopfzeile, Spalten
  und Zahlenformat automatisch, Spalten von Hand korrigierbar).
  EK = Listenpreis − Rabatt, Preise immer **je 1 Einheit**. Vorhandene Artikel
  erkennt der Import an Lieferant + Artikelnummer (`unique`, Upsert) — ein
  zweiter Import aktualisiert die Preise, statt doppelt anzulegen.
  Echte Sonepar-Daten gibt es in der Demo nicht; eine Sonepar-Lieferung
  (Datanorm oder CSV aus dem Webshop) geht über denselben Import.

### Nummern

`naechste_nummer(typ, datum)` (nur intern): Projekt `2026-0001`, Angebot
`AN-2026-001`, Rechnung `RE-2026-001`, Regiebericht `RB-2026-001`.
Projekt- und Regienummer vergibt ein Trigger beim Anlegen, Belegnummern
`beleg_fertigstellen(id)` (rechnet dabei auch Netto/USt/Brutto aus den Positionen).

### Preise — nur über `src/lib/preise.ts`

- `artikelVk(artikel, firma)` = fester VK, sonst EK × (1 + Aufschlag), sonst Listenpreis
- `buchungVk(buchung, firma)` = Verkaufswert einer Materialbuchung (Artikelpreis, bei freiem Text EK + Aufschlag)
- `leistungPreis(leistung, material, firma, stundensatz)` = fester Preis, sonst Material-VK + Minuten/60 × Stundensatz
- `stundensatzFuer(projekt, firma)`
- `belegSummen(positionen, ustSatz, ohneUst)` — Reverse Charge / Kleinunternehmer = ohne USt

## Hauptabläufe

1. **Stunden (Monteur)**: Start → „Stunden“ → Projekt (zuletzt benutzte oben) →
   Schnellwahl 4/6/8/8,5/9/10 h oder Von–Bis → fertig.
2. **Material ausfassen**: Projekt → „Material“ → Kamera scannt laufend →
   jeder Treffer landet in der Liste (Menge ±, bei Metern Zahlenfeld) →
   „Buchen“. Unbekannter Code → Artikel suchen und Code zuordnen ODER neuen
   Artikel anlegen. Rückgabe genauso, Modus „Zurück“. Verbrauch rechnet die View.
3. **Regiebericht**: Projekt → „Regiebericht“ → Arbeiten (diktieren) →
   Stunden der Partie (vorbelegt mit heutigen Stunden am Projekt) → Material →
   Kunde unterschreibt am Handy → PDF teilen.
4. **Angebot vor Ort (Chef)**: „Angebot“ → Kunde (neu anlegen geht direkt) →
   Projekt wird automatisch angelegt (Status Angebot) → Räume als Titel →
   Leistungen antippen (+/−) oder **diktieren** („Küche: 6 Steckdosen, 2
   Wechselschalter, 1 Herdanschluss“) → Vorschläge bestätigen → PDF.
5. **Rechnung aus dem Projekt (Chef)**: Projekt → „Rechnung“ → Assistent zeigt
   alles Offene: unterschriebene Regieberichte, Stunden ohne Regiebericht,
   verbrauchtes Material, angenommenes Angebot → anhaken → Editor → Fertigstellen → PDF.
6. **Auswertung (Chef)**: Monat/Jahr → Umsatz je Monat, Stunden je Mitarbeiter
   und Projekt, **Stundenliste als CSV** für die Lohnverrechnung. Nachkalkulation
   je Projekt: geleistet (Stunden × Satz + Material-VK) gegen Angebot und
   Verrechnetes, sortiert nach „noch nicht verrechnet“.
7. **Neuer Mitarbeiter**: registriert sich selbst unter `/auth` → Chef schaltet
   ihn unter Einstellungen → Mitarbeiter frei (Rolle, Farbe).

## Code-Konventionen

- React 18 + TS + Vite, shadcn/ui, Tailwind, @tanstack/react-query, Supabase JS
- Deutsche Bezeichner wie im Bestand (`laden`, `speichern`, `neuLaden`)
- Daten-Hooks in `src/hooks/useDaten.ts` (`useProjekte`, `useProjekt`, `useKunden`,
  `useMitarbeiter`, `useLagerorte`, `useProjektZahlen`, `useNeuLaden`)
- Nach dem Speichern `neuLaden("projekte", …)` mit den betroffenen Query-Keys
- Gemeinsame Bausteine — **benutzen statt nachbauen**:
  - `components/material/ArtikelSuche.tsx` (`<ArtikelSuche onWahl={…} />`, `useArtikelSuche`)
  - `components/scanner/ScanDialog.tsx` (`<ScanDialog open onOpenChange onCode dauerhaft titel />`;
    gibt `onCode` einen Text zurück, zeigt der Scanner ihn als Rückmeldung — sonst nichts zurückgeben)
  - `components/material/MengeFeld.tsx`, `CodeUnbekanntDialog.tsx`, `FreiePositionDialog.tsx`
  - `components/DiktatKnopf.tsx` (`<DiktatKnopf onText={…} />`, `useDiktat`)
  - `components/KundeWahl.tsx`, `components/ProjektWahl.tsx`
  - `components/FormularDialog.tsx` (Vollbild-Formular mit festem Fuß)
  - `components/Bausteine.tsx` (`Kennzahl`, `Leer`, `StatusBadge`, …)
  - `lib/format.ts` (`euro`, `zahl`, `datum`, `isoTag`, `zahlLesen`, …), `lib/preise.ts`
  - `lib/abfrage.ts`: `alleZeilen()` — Supabase liefert je Abfrage höchstens
    1000 Zeilen und schneidet still ab; für Auswertungen immer seitenweise holen.
    `csvHerunterladen()` — Strichpunkt, Dezimalkomma, BOM (Excel in Österreich)
- PostgREST-Sammel-Inserts: **jede Zeile mit denselben Feldern** (sonst NULL statt Default)
- Handy zuerst: Ziel 360 px Breite, Knöpfe ≥ 44 px, Eingaben `h-11`/`h-12`
