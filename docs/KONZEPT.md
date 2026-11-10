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
| Projekt löschen, Projekt-Stundensatz | ✓ | – |
| Stunden | alle | sieht alle, bucht und ändert eigene; für Kollegen nur als Partie im Regiebericht |
| Material ausfassen / zurückgeben / direkt aufs Projekt | ✓ | ✓ |
| Regieberichte schreiben + unterschreiben lassen | ✓ | ✓ |
| Angebote, Rechnungen, verrechnen | ✓ | – (Tabelle per RLS gesperrt) |
| Eingangsrechnungen erfassen, zuordnen, weiterverrechnen | ✓ | – (Einkaufspreise; Tabellen und Speicher per RLS gesperrt) |
| Artikelstamm pflegen, Datanorm-Import, Leistungskatalog | ✓ | nur neuen Artikel anlegen (unbekannter Strichcode) |
| Lager: Wareneingang, Inventur, Lagerorte | ✓ | Bestand sehen |
| Einstellungen Betrieb, Mitarbeiter freischalten / sperren, vorläufiges Passwort | ✓ | – |

`useSitzung().istChef` im Frontend, `public.ist_chef()` in der Datenbank.
Was die Oberfläche einem Monteur nicht zeigt, verbietet auch die Datenbank —
direkte API-Aufrufe kommen nicht weiter (Migration `20261025190000_rechte_monteur.sql`):
`rechnung_id` setzen oder lösen nur der Chef; `erstellt_von` setzt der Server,
Stunden auf einen Kollegen umbuchen nur der Chef; Projektnummer fest,
Projekt-Stundensatz nur der Chef und über 0 €; Zugang, Abgang und Inventur
(`korrektur`) nur der Chef; wer gebucht hat, bleibt; Pause nie negativ.
`tests/rls-test.mjs` prüft jede dieser Regeln mit echten Konten.

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
| `termine` | Kalender und Einsätze; `mitarbeiter uuid[]`, `status` geplant/begonnen/erledigt, `dringend`, `geaendert_am` (Trigger, nur bei Zeit, Ort, Personen) |
| `abwesenheiten` | Urlaub, Krank, Arzt, Berufsschule, Zeitausgleich, Sonstiges je Person; `status` beantragt/genehmigt/abgelehnt |
| `fibu_uebergaben` + `fibu_uebergabe_belege` | Was an die Kanzlei ging, je Beleg einmal; zurücknehmen löscht die Übergabe |
| `kreditor_konten` | Kreditorennummer je Lieferant (ab 30001), einmal vergeben; Lieferanten sind sonst freier Text |
| `konto_buchungen` | Korrekturen am Überstunden- und Urlaubskonto (Anfangsbestand, Auszahlung, Übertrag); nur der Chef schreibt |
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

`menge` ist positiv (außer `korrektur`), höchstens 99 999. Freie Positionen ohne Artikel tragen
`bezeichnung` + `einheit`. `vorgang` (uuid) gruppiert einen Scan-Durchgang.
`ek_preis` = Momentaufnahme je Einheit.

- **Rückgabe** höchstens, was am Projekt ausgefasst ist — beim Buchen frisch
  geladen, sonst sperrt die App mit Artikel und Menge. Sonst würde der Verbrauch
  negativ und die Rechnung bekäme eine Minus-Position.
- **Inventur** bucht nur Gezähltes: „Bestand laden“ füllt die Liste, gebucht
  wird erst, was gezählt oder mit „Stimmt“ bestätigt ist; die Vorschau nennt
  die ungezählten Artikel. Sonst überschriebe sie still Entnahmen, die
  während des Zählens passiert sind.
- Verkaufswert einer Buchung überall über `buchungVk` (Projekt, Nachkalkulation,
  Rechnungsimport) — sonst zeigten Projekt und Rechnung nach einer
  Preisänderung verschiedene Beträge.

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
Weiterverrechnete Eingangsrechnungen genauso: `eingang_anteile.rechnung_id`,
`quelle.eingang` (Storno und gelöschte Positionen geben per Trigger frei).

- Rechnung nach Angebot: Schalter „mit dem Angebot abgegolten“ — was nicht
  angehakt ist (Stunden, Material; Regieberichte nie, die sind Zusatzarbeit),
  hängt an einer Textzeile ohne Betrag (`ABGEGOLTEN_TEXT`) und gilt als
  verrechnet. Sonst stünde es im Projekt für immer als „offen“.
- Position im Entwurf gelöscht → Trigger gibt die Quellen frei
- Entwurf gelöscht → FK `on delete set null` gibt frei
- Rechnung storniert → `beleg_stornieren(id)` gibt frei (und legt die
  Stornorechnung an, siehe unten)
- Verrechnete Stunden/Buchungen und alles aus einem unterschriebenen
  Regiebericht sind **festgeschrieben** (Trigger `buchung_schutz`): nur
  `rechnung_id` darf sich noch ändern
- Fertige Rechnungen sind festgeschrieben (`beleg_schutz`, `positionen_schutz`) —
  alles, was auf dem PDF steht, auch Betreff, Texte und Fälligkeit. Danach
  ändern sich nur Status und Zahldatum (bezahlt) und die E-Mail des
  Empfängers; Projekt, Kunde und Angebot nur auf leer (wenn eines davon
  gelöscht wird). Storniert bleibt storniert, eine Stornorechnung bleibt eine
  Stornorechnung. Migrationen `20261025140000`, `20261025180000`.

### Eingangsrechnungen (`components/eingang/`, Seite `/eingang`)

Rechnungen von Großhändlern und Subunternehmern, nur der Chef
(Migration `20261027100000_eingangsrechnungen.sql`):
- `eingangsrechnungen`: Lieferant, Nummer, Datum, fällig, netto/USt/brutto,
  Art (Material, Fremdleistung, Werkzeug, Fahrzeug, Büro, Sonstiges),
  `bezahlt_am`, Foto/PDF im privaten Bucket `eingangsrechnungen`.
- **Zuordnen** = `eingang_anteile` (Projekt, Betrag netto, Text). Eine
  Rechnung ganz auf ein Projekt oder aufgeteilt; `betrieb = true` heißt: der
  Rest gehört dem Betrieb (Lager, Werkzeug). „Zuzuordnen“ ist, was weder
  verteilt noch Betrieb ist (`eingangLogik.zuordnung`) — steht auf der
  Startseite unter „Zu erledigen“.
- Im Projekt → Belege und in der Nachkalkulation als Einkauf.
- **Ablauf** (Migration `20261110110000_eingang_freigabe_lieferscheine.sql`):
  `freigabe` offen → freigegeben (wer, wann) oder abgelehnt (mit Grund) →
  `bezahlt_am`. Überweisen geht erst nach der Freigabe (Trigger
  `eingang_freigabe`); wer Lieferant, Betrag, IBAN oder Nummer nach der
  Freigabe ändert, schickt sie zurück auf „zu prüfen“. Schon bezahlt erfasst
  (Karte, bar) gilt als geprüft. Seite `/eingang`: Zu prüfen → Zu überweisen
  (Häkchen, Skonto bis zum Skonto-Tag, `sepa.ts` erzeugt pain.001 fürs
  Banking) → Überwiesen.
- **Positionen** (`eingang_positionen`): die Zeilen der Rechnung, je Zeile ein
  Projekt; „Aufteilung aus den Positionen übernehmen“ macht daraus die
  Anteile (`anteileAusPositionen`, in Cent). „Mit KI ausfüllen“ liest Kopf,
  IBAN, Skonto, Lieferscheinnummern und Positionen aus Foto oder PDF.
- **Lieferscheine** (Seite `/lieferscheine`): Monteur fotografiert am Handy,
  die KI liest Nummer und Zeilen; der Monteur sieht nur die eigenen. In der
  Eingangsrechnung schlägt die App passende Lieferscheine vor (Nummer,
  Lieferant) und gleicht Zeile für Zeile ab (`eingangLogik.abgleich`: passt /
  andere Menge / nicht geliefert / nicht verrechnet; Fracht und Zuschläge
  zählen nicht). Zugeordnet kann der Monteur ihn nicht mehr löschen.
- **Weiterverrechnen**: „Aus dem Projekt übernehmen“ zeigt freie Anteile,
  nie vorgewählt (Material daraus ist oft schon ausgefasst). Je Anteil eine
  Zeile: Einkauf + Aufschlag (Vorgabe Materialaufschlag), Material als
  Material, sonst Pauschale. Verrechnete Anteile sind fest
  (`eingang_anteil_schutz`), die Rechnung dazu lässt sich nicht löschen.

### Offene Posten und Mahnen (`components/op/`, Seite `/offene-posten`)

Nur der Chef (Migration `20261103100000_offene_posten.sql`):
- **Zahlungen** (`zahlungen`): je Rechnung beliebig viele — Zahlung, Skonto,
  Ausbuchen. „Bezahlt“ setzt nur die Datenbank: Trigger `zahlungen_status`
  rechnet die Summe; erreicht sie den Bruttobetrag, wird die Rechnung
  `bezahlt` (Zahldatum = letzte Zahlung), sonst bleibt/wird sie `offen`.
  Zahlung löschen macht sie wieder offen. Mehr als offen geht im Dialog
  nicht (Überzahlung = Gutschrift). Ältere „als bezahlt markierte“
  Rechnungen bekamen beim Umstieg eine Zahlung über den ganzen Betrag.
- **Mahnen** (`mahnungen`, je Rechnung und Stufe eine): 1 Zahlungserinnerung
  (ohne Zinsen) → 2 1. Mahnung → 3 letzte Mahnung (kündigt Eintreibung an).
  Die nächste Stufe gibt es erst, wenn die Frist der letzten vorbei ist.
  Spesen je Stufe, neue Frist und Verzugszinsen p. a. in Einstellungen →
  Mahnen (`firma.mahn_*`, `verzugszinsen`); Zinsen ab Fälligkeit tageweise
  (`opLogik.verzugszinsen`). Die Mahnung hält fest, was draufstand; das PDF
  (`lib/mahnPdf.ts`, Bezahl-QR über den Gesamtbetrag) entsteht daraus
  jederzeit gleich neu. Nur die höchste Stufe lässt sich zurücknehmen.
- Startseite: „… zu mahnen“, „… überfällig“ führen auf `/offene-posten`.

### Teil- und Schlussrechnung (`components/belege/teilrechnung.ts`)

Migration `20261103110000_teilrechnungen.sql`:
- **Teilrechnung** = Rechnung mit `teil_nr` zum Angebot (`angebot_id`).
  Angebot → Menü/Knopf „Teilrechnung“: Prozent oder Betrag netto, angelegt
  wird ein Entwurf mit einer Pauschale („1. Teilrechnung laut Angebot … 30 %
  von …“). Das Angebot wird angenommen, bleibt aber umwandelbar.
- **Schlussrechnung**: „Schlussrechnung erstellen“ (oder „Aus dem Projekt
  übernehmen“) übernimmt das ganze Angebot und je fertiger Teilrechnung eine
  Position `art = 'abzug'` (negativ, `quelle.teil`). Verrechnet an der Quelle:
  `belege.abgezogen_in` an der Teilrechnung; Trigger `teil_abzug_pruefen`
  (nur fertige, nur einmal), Position gelöscht oder Schlussrechnung storniert
  → wieder frei. Entwürfe von Teilrechnungen werden nicht abgezogen.
- **PDF**: Abzüge nicht in der Tabelle, sondern im Summenblock —
  Gesamtleistung netto/USt/brutto, je Teilrechnung brutto mit netto + USt
  darunter, Restbetrag netto, USt, „Zu zahlen“ (§ 11 Abs. 1 Z 4 UStG).
  Haftrücklass/Deckungsrücklass gibt es (noch) nicht.

### Anlagen und Prüfprotokolle (`components/anlagen/`, Seiten `/anlagen`, `/pruefungen/:id`)

Migration `20261103120000_anlagen.sql`:
- **Anlage** beim Kunden (`anlagen`, Nummer `A1`, `A2` …): Art (Elektroanlage,
  Verteiler, Blitzschutz, Notlicht, PV, Ladestation, Gerät, sonstige),
  Standort, Prüfintervall in Monaten (Vorschlag je Art), `naechste_pruefung`,
  Preis je Prüfung (nur Chef sieht ihn). Anlegen auf `/anlagen` oder in der
  Kundenkarte. Löschen nur Chef und nur ohne Protokolle.
- **QR-Aufkleber** (70 × 40 mm PDF, `lib/pruefPdf.ts`): Code = Adresse
  `/anlagen/<id>`. Scannen auf `/anlagen` oder `/scan` öffnet die Anlage.
- **Prüfprotokoll** (`pruefungen`, `PR-2026-001`): Besichtigung als Liste je
  Art (OK/Mangel/–, eigene Punkte dazu), Messungen je Stromkreis (Schutz,
  Leitung, RISO, Zs, IΔn, IΔ, tA), Erder. Netz, Messgerät und Stromkreise
  kommen aus dem letzten Protokoll der Anlage. Grenzwerte in
  `pruefLogik.ts` (RISO ≥ 1 MΩ, Zs ≤ 230 V / (k·In) mit k = 5/10/20 für
  B/C/D, FI 50–100 % von IΔn und ≤ 300 ms, Erder ≤ 50 V / IΔn) — Verstöße
  stehen sofort beim Feld, „Aus der Prüfung übernehmen“ schreibt den
  Mängeltext, das Ergebnis wird vorgeschlagen.
- **Unterschrift** wie beim Regiebericht (`KundenUnterschrift`, Bild unter
  `anlagen/unterschriften/`). Trigger `pruefung_schutz`: danach
  festgeschrieben, nur Entwürfe löschbar, Mängel brauchen Text.
  `pruefung_termin` setzt an der Anlage letzte und nächste Prüfung.
- **Verrechnen** (nur Chef): „Rechnung erstellen“ an der Anlage nimmt alle
  unterschriebenen, offenen Protokolle als Pauschale zum Anlagenpreis,
  `quelle.pruefung` → `pruefungen.rechnung_id`. Position gelöscht oder
  Rechnung storniert → wieder frei.
- Startseite (Chef): „X Anlagen zu prüfen · Y überfällig“ (fällig = in den
  nächsten 30 Tagen).

### Zeit und Personal (`lib/zeitkonto.ts`, `components/zeiten/`, Seite `/zeiten`)

- **Art je Stunde** in `zeiten.art`: arbeit, fahrt, ue50, ue100, garantie; dazu `zeiten.km`. Auf der Rechnung
  bekommen Fahrzeit und Überstunden eine eigene Zeile, Überstunden kosten ×1,5 und ×2 (Preis bleibt änderbar).
  Garantie zählt fürs Konto, aber nie als offen und nie auf der Rechnung.
- **Abwesenheiten sind keine Zeitbuchungen.** Das Konto rechnet genehmigte Tage mit der Sollzeit des Tages,
  so landet Urlaub nie auf einer Rechnung. Zeitausgleich zählt nicht als Ist, er baut das Konto ab.
- **Antrag:** Monteur beantragt, Chef entscheidet (Trigger `abwesenheit_regeln`). Krankmeldung und Einträge
  vom Chef gelten sofort. Kollegen sehen über die View `abwesenheit_kalender` nur „abwesend“, nie den Grund.
- **Konto** (`kontoRechnen`): Wochenstunden gleichmäßig auf Mo–Fr, österreichische Feiertage frei, Saldo bis
  gestern, ab `profiles.konto_ab`. Urlaub je Kalenderjahr aus `urlaub_tage` plus Korrekturen.
  Wird berechnet, nicht gespeichert — nur Korrekturen stehen in `konto_buchungen`.
- **Lohnliste** (`lohnSumme`, Auswertung): CSV und Stundennachweis-PDF je Person mit Soll, Ist, Arten,
  Abwesenheit, Taggeld und Kilometergeld. Taggeld ist ein Vorschlag: über 3 h ein Zwölftel je angefangene
  Stunde von `firma.taggeld_satz`; die Sätze müssen zum Kollektivvertrag passen.

### Einsätze am Handy (`components/einsatz/EinsatzBereich.tsx`)

Ein Einsatz ist ein Termin mit Status. Die Startseite zeigt heute und den nächsten Arbeitstag mit Adresse, Navi,
Telefon und den Schnellwegen zu Stunden, Material und Regie. Beginnen und Erledigt setzen die Zeiten per Trigger
`termin_einsatz` und gelten nicht als Terminänderung. Verschiebt das Büro einen Termin, sieht der Monteur beim
nächsten Öffnen „Termin geändert“; was schon gesehen wurde, merkt sich das Gerät (`elektro.termine.gesehen`). Der
Chef sieht auf der Startseite Anträge und „erledigter Einsatz, noch nicht verrechnet“.

### Buchhaltung (`lib/fibu.ts`, Seite `/buchhaltung`)

Ein ZIP je Monat: Buchungen, Personenkonten, Belegliste für Excel, Original-PDFs und ein LIESMICH für die Kanzlei.
Das Format wählt der Betrieb (`firma.fibu_format`), die Konten stehen in `firma.fibu_konten` und sind nur ein
Vorschlag. Kundenkonto = 20000 + Kundennummer.

- **Quellen:** RZL „Handbuch Datenimport“ (Stand August 2026, Euro-Version, Kapitel 2 und 4); BMD „PR08/PR08A
  Verbuchen Erfassungsfile“ (Version 5.B4, variabler Satzaufbau). Die Tests in `fibu.test.ts` prüfen gegen die
  Beispiele der Hersteller. In ein echtes BMD oder RZL eingelesen wurde noch nichts: beim ersten Betrieb
  einen Probelauf mit der Kanzlei machen.
- **Steuerfälle:** normal (BMD Steuercode 03 / RZL Schlüssel = Satz), Bauleistung an Kunden (17 / Sondercode 14),
  Kleinunternehmer (00 / Sondercode 22), Eingang normal (00), Eingang Bauleistung (29 / Sondercode 15).
  Stornorechnungen haben negative Beträge und gehen als Gutschrift hinaus.
- **Teil- und Schlussrechnungen** gehen als normale Rechnungen mit ihren eigenen Beträgen hinaus (die
  Schlussrechnung ist schon gekürzt). Die Teilrechnungsautomatik von BMD und RZL nutzen wir nicht; die Belegliste
  nennt die Fälle, die Kanzlei bucht bei Bedarf um.
- **Einmal übergeben:** „Als übergeben merken“ nimmt die Belege aus dem nächsten Export. Eingangsrechnungen sind
  dann gesperrt (Trigger `eingang_uebergeben_schutz`), bis die Übergabe zurückgenommen ist.
- **Kontrollliste** (`kontrolle`): warnt vor fehlendem Kunden, UID, Original, Rechnungsnummer und falschen Summen.
  Sie sperrt nichts, der Mensch entscheidet.

### Bestellungen beim Großhändler (`components/bestellung/`, Seite `/bestellungen`, nur Chef)

Migration `20261103130000_bestellungen.sql`:
- **Bestellung** (`bestellungen`, `BE-2026-001`) an einen Lieferanten (freier
  Text, Vorschläge aus `artikel.lieferant`), Ziel genau eines: Lagerort
  (Zugang ins Lager) oder Projekt (direkt auf die Baustelle). Positionen
  (`bestell_positionen`) sind immer Artikel aus dem Stamm, EK aus dem Stamm
  vorbelegt.
- **Neue Bestellung** — drei Wege, angelegt werden Entwürfe, je Lieferant einer:
  „Lager auffüllen“ (Mindestbestand − Bestand − schon bestellt, aufgerundet),
  „Material fürs Projekt“ (Angebot des Projekts: angenommen vor offen vor
  Entwurf; Artikel-Positionen direkt, Leistungen über `leistung_material`;
  schon für das Projekt Bestelltes zählt ab), „Leere Bestellung“. Logik in
  `bestellLogik.ts` (Tests daneben). Lager → Nachbestellen hat den Knopf
  „Bestellung anlegen“; die Pille zeigt „… bestellt“.
- **Bestellen**: PDF (Lieferadresse Betrieb oder Baustelle), CSV für den
  Webshop (Artikelnummer;Menge vorne), Text kopieren — verschickt wird
  außerhalb der App. „Als bestellt markieren“ → `bestellt_am` vom Server,
  Positionen, Lieferant und Ziel stehen fest (Trigger `bestellung_schutz`,
  `bestellpos_schutz`).
- **Wareneingang** („Lieferung einbuchen“): Menge je Position, „Alles wie
  bestellt“ oder Scannen (`artikelZuCode`, Karton-Code zählt den
  Packungsinhalt, fremde Codes: „Nicht in dieser Bestellung“). Gebucht wird
  `material_buchungen` `zugang` bzw. `direkt` mit `bestellposition_id`, ein
  Vorgang je Lieferschein. `geliefert` und der Status (bestellt →
  teilgeliefert → geliefert) rechnet der Trigger `bestellung_nachrechnen`
  aus den Buchungen — Buchung gelöscht, Stand stimmt wieder. Nur der Chef,
  nur offene Bestellungen, Artikel und Ziel müssen passen.
- **Abschließen**: „Rest kommt nicht mehr“ (`erledigt`) bei Teillieferung,
  „Stornieren“ nur, solange nichts geliefert ist. Löschen nur Entwürfe.
- Startseite (Chef): „X Bestellungen unterwegs · Y Liefertermin vorbei“.

### Kalkulieren im Angebot (`lib/kalkulation.ts`)

Bewusst einfach, kein eigenes Kalkulationsblatt:
- **Mehrere Stundensätze**: `firma.stundensaetze` (jsonb-Liste
  `{name, satz}`, Migration `20261027120000_stundensaetze.sql`), in
  Einstellungen → Kalkulation; „Standard“ ist immer der Projekt- bzw.
  Betriebssatz.
- **Arbeitszeit** (`ArbeitszeitDialog`): Stunden je Satz eintragen, jeder
  Satz wird eine Position „Arbeitszeit Meister“ usw.
- **Preis kalkulieren** in der Position: Einkauf + Aufschlag % + Minuten ×
  Stundensatz → „Als Einzelpreis übernehmen“. EK und Minuten bleiben an der
  Position (`ek_preis`, `minuten`), nie auf dem PDF.
- **Kalkulationskasten** unter den Summen (nur am Bildschirm): Stunden,
  Material-Einkauf, was nach Material bleibt und je Arbeitsstunde
  (`rohertrag`). „Alle Preise ± %“ für Nachlass oder Zuschlag
  (`umProzent`).
- **Aufschlag überall sichtbar**: unter jedem Preis „EK 12,34 · +35 %“; im
  Positionsdialog Aufschlag ±5 und der Preis rechnet live mit (und umgekehrt).
  „Aufschläge“ im Summenblock setzt Material-Aufschlag und Stundensatz für den
  ganzen Beleg (`aufschlaegeSetzen`; Arbeit nur, wo noch der alte Satz steht).
- **Material per KI** (`KiMaterialDialog`): „PV-Anlage 9 kW mit Speicher“
  sagen oder tippen → die KI schlägt Komponenten mit Menge vor, je Zeile ein
  Artikel aus dem eigenen Stamm samt Alternativen oder „Ohne Artikel“; nichts
  ist übernommen, bevor man es abhakt. Erfindet keine Artikelnummern.
- **Rabatte beim Großhandel** (`rabatte`, Artikel → Rabatte, nur Chef): je
  Lieferant, optional Hersteller oder Rabattgruppe; das genaueste gewinnt.
  `rabatte_anwenden` rechnet EK = Liste − Rabatt neu (in Häppchen wegen des
  Timeouts). Artikelsuche filtert nach Hersteller (serverseitig).

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
- **Rechnungsarchiv** (`lib/belegArchiv.ts`, Speicher `beleg-archiv`): beim
  Fertigstellen legt die App das PDF ab (`<beleg-id>.pdf`, aus dem Stand in
  der Datenbank) und zeigt danach immer dieses Original — spätere Änderungen
  am Betrieb (Bank, Logo, Anschrift) oder am Projekt ändern alte Rechnungen
  nicht. Überschreiben geht nicht, löschen erst, wenn die Rechnung weg ist.
  Fehlt das Original (ältere Rechnung, Ablegen gescheitert), legt der
  PDF-Knopf es nach. Stornierte erscheinen neu erzeugt mit Stempel;
  Stornorechnungen kommen beim Stornieren ins Archiv wie fertige Rechnungen.
- Angebote sind Kostenvoranschläge. Bei Verbrauchern gilt einer als
  verbindlich, wenn nicht ausdrücklich anders erklärt (§ 5 Abs. 2 KSchG) —
  deshalb steht im PDF immer, was gilt (`kvHinweis`). Schalter im Kopf
  (`belege.kv_verbindlich`), ohne Wahl unverbindlich.
- **Storno = eigener Beleg.** `beleg_stornieren` legt eine **Stornorechnung**
  an (Status `storno`, `storno_von` = die Rechnung): nächste Nummer aus dem
  Rechnungskreis, alle Positionen mit negativer Menge, Beträge negativ, sofort
  festgeschrieben, PDF „Stornorechnung … Storno zu RE-…“ ohne Zahlungsteil.
  Die stornierte Rechnung bleibt unverändert (lückenlose Nummern, Original im
  Archiv). Beide zählen nicht zum Umsatz; in der Liste stehen sie unter
  „Storniert“. Ein Firmenkunde braucht die Stornorechnung, um die Vorsteuer
  zu berichtigen. Je Rechnung höchstens eine (eindeutiger Index).
- Storno gibt Stunden, Material und Berichte frei; „Korrektur anlegen“ kopiert
  die stornierte Rechnung in einen neuen Entwurf (`korrektur_von`, je Rechnung
  höchstens einer — Index `belege_korrektur_von_einmal`) und hängt die Quellen
  dort an. Ihr PDF nennt „Ersetzt Rechnung RE-…“.
- Löschen: Rechnungen nur als Entwurf. Angebote in jedem Status — außer eine
  Rechnung bezieht sich darauf (`angebot_verrechnet`), sonst verlöre sie den
  Bezug (Policy `belege_nicht_loeschen`).
- Liste: Summe je Belegart (Rechnungen offen/bezahlt, Angebote
  offen/angenommen), ohne Entwürfe, Stornos und abgelehnte Angebote — die
  Fußzeile sagt, was fehlt. Am PC: Zeilen mit Tab/Enter, im Editor Strg+S.
- Cent-Rundung (`runden2`) wie Postgres `round()`: halber Cent weg von null —
  sonst wiche die Stornorechnung um einen Cent ab.
- Ungespeichertes schützt zweierlei: Links, Zurück-Knopf und Neuladen fragen
  nach (`useVerlassenSchutz`); was das nicht abfängt — Wischgeste „zurück“
  am Handy, abgestürzter Browser, leerer Akku — sichert der Editor laufend im
  Gerät (`sicherung.ts`, localStorage) und bietet es beim nächsten Öffnen an.
  Abmelden löscht die Sicherungen.
- Bekannte Grenze: eine einzeln gelöschte Materialzeile eines übernommenen
  Berichts kommt nur über einen neuen Import zurück.

### Plantafel, Teams und Fuhrpark (Seiten `/plantafel`, `/fuhrpark`)

Migration `20261110100000_fuhrpark_teams_plantafel.sql`, Logik in
`lib/plantafel.ts` und `lib/fuhrpark.ts` (getestet):
- `fahrzeuge`: Busse, PKW, Steiger, Anhänger, Maschinen, Messgeräte —
  Kennzeichen, Pickerl/Service/Prüfung bis, gemietet, stillgelegt.
  `fahrzeug_eintraege` = Bordbuch (Service, Reparatur, Prüfung, Schaden,
  Tanken); Monteure melden Schäden und Tanken, alles andere der Chef.
- `teams`: Name, Farbe, Leitung, Mitglieder, Stamm-Bus. Ein Einsatz
  (`termine`) hat `team_id`, `mitarbeiter[]` und `fahrzeuge[]`.
- Plantafel: Zeilen nach Team, Person oder Fahrzeug, Spalten Tage; Einsätze
  ziehen (`ablegen`: anderes Team → Leute und Bus wechseln mit, Person auf
  Person tauscht), Leute und Steiger aus der Seitenleiste auf einen Einsatz
  ziehen (`zuweisen`). Konflikte (doppelt, abwesend) rot. Der Monteur sieht
  seine Einsätze wie gehabt am Handy.
- Fällig (Pickerl, Service, Prüfung in 30 Tagen) und offene Schäden stehen
  im Fuhrpark und auf der Startseite.

### Stundenauswertung (Auswertung → Stunden)

`lib/stundenAuswertung.ts`: Zeitraum (Woche, Monat, Jahr, frei), Filter nach
Mitarbeiter oder Team, Projekt (auch „ohne“), Art und verrechnet; gruppiert
nach Mitarbeiter, Projekt, Woche, Tag oder Art, jede Gruppe aufklappbar bis
zur einzelnen Buchung. CSV und Stundennachweis-PDF der Auswahl.

### Startseite und Menü

PC: oben „Laufende Projekte“, darunter „Zu erledigen“ (Anträge, überfällig,
mahnen, Rechnungen prüfen/überweisen, Skonto läuft ab, Fuhrpark fällig,
Schäden, zuzuordnen …), dann Einsatz und Schnell festhalten. Das Seitenmenü
lässt sich ganz auf Symbole einklappen (Cookie `sidebar:state`), jede Gruppe
einzeln zuklappen (die der offenen Seite bleibt offen); oben die
Schnellaktionen Neues Projekt, Neue Rechnung, Termin eintragen.

### Betrieb (Einstellungen)

- Stundensatz über 0 €, weitere Stundensätze mit Namen (ohne doppelte),
  Aufschlag 0–1000 %, Zahlungsziel und Angebotsfrist in
  ganzen Tagen — leer oder unlesbar wird abgewiesen, nicht still 0.
- Bankdaten (`lib/bank.ts`): IBAN mit Prüfziffer und Länge je Land, BIC, UID
  (Österreich `ATU` + 8 Ziffern); gespeichert einheitlich (IBAN in
  Vierergruppen). Was schon so gespeichert ist, sperrt nicht — die Demo-IBAN
  zeigt nur den Hinweis, dass der Bezahl-QR damit nicht funktioniert.
- Logo: auf 1200 px verkleinert, PNG bleibt PNG (Transparenz); das alte wird
  erst gelöscht, wenn das neue eingetragen ist.

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
  in `artikel.ean` und `artikel_codes` (Karton = `menge` Stück). Jede Stelle,
  die scannt (Scan-Seite, Artikelliste, Regiebericht), geht über
  `artikelZuCode` — alle Schreibweisen. Ein Code führt immer zum selben
  Artikel: gelernter Code vor Lagerartikel vor dem älteren; stillgelegte
  Artikel sind nicht buchbar (Migration `20261025200000_material_suche.sql`).
  Die Suche zeigt die exakte EAN zuerst, dann Lagerartikel; „%“ und „_“ sind
  Zeichen, keine Platzhalter.
- Unbekannter Code → `CodeUnbekanntDialog`: vorhandenen Artikel wählen (der
  Code wird gelernt) oder neuen Artikel anlegen.
- Import (Artikelstamm → „Import“, Chef): **DATANORM 4/5** (eine oder mehrere
  Dateien eines Lieferanten) oder **CSV** (Trennzeichen, Kopfzeile, Spalten
  und Zahlenformat automatisch, Spalten von Hand korrigierbar).
  EK = Listenpreis − Rabatt, Preise immer **je 1 Einheit**. Vorhandene Artikel
  erkennt der Import an Lieferant + Artikelnummer (`unique`, Upsert) — ein
  zweiter Import aktualisiert die Preise, statt doppelt anzulegen.
  Eine Sonepar-Lieferung (Datanorm oder CSV aus dem Webshop) geht über
  denselben Import.
- Was der Import nicht lesen kann, steht in einer Problemliste (Datei, Zeile,
  Grund, Auszug; höchstens 200 plus Gesamtzahl); eine Datanorm-Datei mit
  einzelnen fremden Zeilen bleibt Datanorm. Bild, PDF oder Excel statt einer
  Artikelliste → ein verständlicher Satz. EANs werden einheitlich gespeichert,
  eine EAN, die schon ein anderer Artikel hat, meldet der Import.
- Die Demo hat ~72.000 echte Sonepar-Artikel aus der Datanorm
  (`scripts/datanorm-einspielen.ts`, `quelle = 'datanorm'`).

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
   Schnellwahl 4/6/8/8,5/9/10 h, „andere“ tippen oder Von–Bis (22 bis 6 Uhr
   geht über Mitternacht) → fertig. Nicht für morgen — gebucht wird, was
   gearbeitet ist.
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
   und Projekt. **„Monat herunterladen“** = Stundennachweis als PDF mit einem
   Klick (`lib/stundenPdf.ts`: Summen je Mitarbeiter, dann je Mitarbeiter eine
   Seite mit allen Tagen und Unterschriftszeilen) für die Lohnverrechnung,
   daneben dieselben Zeilen als CSV. Nachkalkulation
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
    `csvHerunterladen()` — Strichpunkt, Dezimalkomma, BOM (Excel in Österreich);
    Text, der mit = + - @ beginnt, bekommt ein `'` davor (sonst führte Excel ihn
    als Formel aus — Monteure legen Artikel an, Tätigkeiten tippt jeder)
- PostgREST-Sammel-Inserts: **jede Zeile mit denselben Feldern** (sonst NULL statt Default)
- Zahlen aus Eingaben nur über `dezimalLesen`/`zahlLesen` (Komma oder Punkt,
  Tausenderpunkte; „1,2,3“ ist ein Tippfehler und ergibt `null`)
- Server-Daten in einem Formular: Neues nur übernehmen, wenn nichts getippt
  ist. Supabase meldet bei jeder Rückkehr in den Tab `SIGNED_IN`; `useSitzung`
  lädt dann neu, behält aber unveränderte Objekte (sonst liefe jeder
  `useEffect(…, [firma])` an)
- Diktat (`DiktatKnopf`): ohne Netz oder Mikrofon eine klare Meldung und Ende —
  kein Neustart in Schleife
- Handy zuerst: Ziel 360 px Breite, Knöpfe ≥ 44 px, Eingaben `h-11`/`h-12`
