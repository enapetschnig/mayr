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
| Einstellungen Betrieb, Mitarbeiter freischalten | ✓ | – |

`useSitzung().istChef` im Frontend, `public.ist_chef()` in der Datenbank.

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
- Fertige Rechnungen sind festgeschrieben (`beleg_schutz`, `positionen_schutz`)

### Regiebericht = keine doppelte Erfassung

- Arbeitszeit im Regiebericht = Zeilen in `zeiten` mit `regiebericht_id`
  (für jeden Mitarbeiter der Partie — Monteure dürfen Stunden für Kollegen eintragen)
- Material im Regiebericht = `material_buchungen` mit `regiebericht_id`
  (art `ausfassung` aus dem Bus/Lager oder `direkt`)
- Unterschreiben: Bild nach `projekt-dateien/<projekt_id>/unterschriften/<regie_id>.png`,
  dann `status = 'unterschrieben'`, `unterschrift_name`, `unterschrieben_am`
- Danach ist der Bericht fest (Trigger `regie_schutz`)

### Nummern

`naechste_nummer(typ, datum)` (nur intern): Projekt `2026-0001`, Angebot
`AN-2026-001`, Rechnung `RE-2026-001`, Regiebericht `RB-2026-001`.
Projekt- und Regienummer vergibt ein Trigger beim Anlegen, Belegnummern
`beleg_fertigstellen(id)` (rechnet dabei auch Netto/USt/Brutto aus den Positionen).

### Preise — nur über `src/lib/preise.ts`

- `artikelVk(artikel, firma)` = fester VK, sonst EK × (1 + Aufschlag), sonst Listenpreis
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

## Code-Konventionen

- React 18 + TS + Vite, shadcn/ui, Tailwind, @tanstack/react-query, Supabase JS
- Deutsche Bezeichner wie im Bestand (`laden`, `speichern`, `neuLaden`)
- Daten-Hooks in `src/hooks/useDaten.ts` (`useProjekte`, `useProjekt`, `useKunden`,
  `useMitarbeiter`, `useLagerorte`, `useProjektZahlen`, `useNeuLaden`)
- Nach dem Speichern `neuLaden("projekte", …)` mit den betroffenen Query-Keys
- Gemeinsame Bausteine — **benutzen statt nachbauen**:
  - `components/material/ArtikelSuche.tsx` (`<ArtikelSuche onWahl={…} />`, `useArtikelSuche`)
  - `components/scanner/ScanDialog.tsx` (`<ScanDialog open onOpenChange onCode dauerhaft titel />`)
  - `components/DiktatKnopf.tsx` (`<DiktatKnopf onText={…} />`, `useDiktat`)
  - `components/KundeWahl.tsx`, `components/ProjektWahl.tsx`
  - `components/FormularDialog.tsx` (Vollbild-Formular mit festem Fuß)
  - `components/Bausteine.tsx` (`Kennzahl`, `Leer`, `StatusBadge`, …)
  - `lib/format.ts` (`euro`, `zahl`, `datum`, `isoTag`, `zahlLesen`, …), `lib/preise.ts`
- PostgREST-Sammel-Inserts: **jede Zeile mit denselben Feldern** (sonst NULL statt Default)
- Handy zuerst: Ziel 360 px Breite, Knöpfe ≥ 44 px, Eingaben `h-11`/`h-12`
