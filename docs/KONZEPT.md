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
| `kunden` | Kontakte, `nummer` ab 1001; `art` kunde/lieferant/partner, Lage `lat`/`lng` (siehe „Kontakte“) |
| `projekte` | `nummer` 2026-0001 (Trigger), `status` angebot/aktiv/verrechnen/abgeschlossen (Pille auf Kachel, Liste und im Projekt antippen = umstellen, `ProjektStatusWahl`), Baustellenadresse, optional eigener Stundensatz. Gebucht (Stunden, Ausfassen/direkt, Regie) wird nur bei „aktiv“ = In Arbeit — Trigger `nur_in_arbeit_buchen`; Garantiestunden gehen auch danach, Rückgaben immer |
| `zeiten` | Stunden je Mitarbeiter, Projekt optional; `regiebericht_id`, `rechnung_id` |
| `artikel` | Artikelstamm; Preise **je Einheit**; `ean`; `lagerartikel`, `mindestbestand` |
| `artikel_codes` | weitere Strichcodes (Karton = `menge` Stück, gelernte Codes) |
| `leistungen` + `leistung_material` | Leistungskatalog: „Steckdose UP komplett“ = Material + `minuten` |
| `lagerorte` | Hauptlager, Fahrzeuge (`art` = fahrzeug, `user_id` = wessen Bus) |
| `material_buchungen` | **eine** Tabelle für Lager und Projekt (siehe unten) |
| `regieberichte` | Datum, Arbeiten, Unterschrift (Bild im Storage), `rechnung_id` |
| `belege` + `beleg_positionen` | Angebot/Rechnung; Positionen mit `art` titel/leistung/artikel/arbeit/material/pauschale/text |
| `dateien` | Fotos/Dokumente je Projekt (Bucket `projekt-dateien`); `planung` = steht oben unter „Planung“ |
| `projekt_verlauf` | je Projekt: WhatsApp an den Kunden (Text, Nummer), Förderschritte (Trigger), Notizen |
| `mitarbeiter_saetze` | Lohnkosten und Verrechnungssatz je Person mit `gueltig_ab` — nur der Chef (RLS) |
| `termine` | Kalender und Einsätze; `mitarbeiter uuid[]`, `status` geplant/begonnen/erledigt, `dringend`, `geaendert_am` (Trigger, nur bei Zeit, Ort, Personen) |
| `abwesenheiten` | Urlaub, Krank, Arzt, Berufsschule, Zeitausgleich, Sonstiges je Person; `status` beantragt/genehmigt/abgelehnt |
| `fibu_uebergaben` + `fibu_uebergabe_belege` | Was an die Kanzlei ging, je Beleg einmal; zurücknehmen löscht die Übergabe |
| `rechnung_kategorien` | Kategorien für Ausgangs- und Eingangsrechnungen (`belege.kategorie_id`, `eingangsrechnungen.kategorie_id`); `belege.altbestand` = Altrechnung |
| `kreditor_konten` | Kreditorennummer je Lieferant (ab 30001), einmal vergeben; an den Belegen bleibt der Lieferant freier Text, der Lieferanten-Kontakt findet sie über den Namen |
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

### Kontakte, PV-Anlagendaten und Karte (`components/kontakte/`, Seite `/kunden`)

Migration `20261113113000_kontakte_anlagen_karte.sql`, Logik in `kontaktLogik.ts` (getestet):
- **Kontakte** = Tabelle `kunden` mit `art` Kunde / Lieferant / Partner (Subunternehmer, Planer).
  Seite „Kontakte“: Filter je Art (`?art=`), Liste oder Karte (`?ansicht=karte`). Kundenauswahl
  (`KundeWahl`) zeigt keine Lieferanten.
- **Lieferanten** bleiben an Eingangsrechnung, Lieferschein, Bestellung, Rabatt, Artikel freier Text —
  nichts davon wurde umgebaut. Der Kontakt findet seine Belege über Name + `namen` (weitere
  Schreibweisen, „Sonepar Österreich GmbH“) per `kontakt_belege(id)`: Vergleich über
  `lieferant_schluessel` (klein, Leerzeichen zusammengezogen), läuft mit RLS des Aufrufers.
  Im Kontakt Summen (Rechnungen, nicht überwiesen, bestellt) und Öffnen (`/eingang?offen=`,
  `/lieferscheine?offen=`, `/bestellungen/:id`); dazu `kundennummer_extern` und die Kreditorennummer.
  Lieferanten-Kontakte erscheinen als Vorschlag in Eingangsrechnung und Bestellung.
- **PV-Anlagendaten** an der vorhandenen Anlage (`anlagen`, Art PV — ein Kunde kann mehrere haben):
  kWp, Module, Wechselrichter, Speicher kWh + Typ, Einspeisebegrenzung % und/oder kW, Wallbox,
  Überschussregelung (ja/nein + wie), Inbetriebnahme, Zählpunkt, Überwachung (Fronius Solar.web,
  SolaX Cloud, Huawei FusionSolar, SMA, sonstige) + Link, Link PV-Planung. Links nur http(s)
  (`linkSauber`). Zu sehen in der Anlage, im Kontakt (Eckdaten + Knöpfe) und im **Projekt**
  („Anlage des Kunden“ in der Übersicht — auch für den Monteur).
- **Karte** (Leaflet + OpenStreetMap-Kacheln, erst beim Öffnen geladen): Punkt je Kontakt mit
  Lage; Farbe Projekt läuft / Kunde mit PV / Kunde / Lieferant / Partner (Status-Tokens);
  Filter PV, Speicher, Wallbox, Projekt läuft; Tippen → Eckdaten + „Öffnen“.
  Koordinaten aus Nominatim, höchstens 1 Anfrage/s (`kontaktDaten.ts`), gespeichert samt der
  gesuchten Adresse (`geo_adresse`) — neu gesucht wird nur bei geänderter Adresse: automatisch
  beim Speichern des Kontakts, für Altbestand per Knopf „Lage suchen“ auf der Karte.
  Demo: `supabase/demo/04-kontakte.sql` trägt Koordinaten direkt ein.

### Zeit und Personal (`lib/zeitkonto.ts`, `components/zeiten/`, Seite `/zeiten`)

- **Stunden buchen** (`ZeitDialog`): Dauer oder Von–Bis mit Pause; „Weiterer Block“ bucht mehrere Blöcke
  am selben Tag, je Block ein eigenes Projekt möglich (`lib/zeitBloecke.ts`: Vorschlag 30 min nach dem
  letzten Ende, Überschneidungen werden abgelehnt — auch gegen schon gebuchte Zeiten). Jeder Block wird
  eine eigene Zeile in `zeiten`. Kilometer fragt der Dialog nicht mehr ab (`zeiten.km` bleibt für Altbestand).
- **Art je Stunde** in `zeiten.art`: arbeit, fahrt, ue50, ue100, garantie. Auf der Rechnung
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
Telefon und den Schnellwegen zu Stunden, Material und Regie. Einen Knopf „Beginnen“ gibt es nicht mehr (die
Zeit kommt aus den Stunden); „Erledigt“ setzt den Status per Trigger `termin_einsatz` und gilt nicht als
Terminänderung. Verschiebt das Büro einen Termin, sieht der Monteur beim
nächsten Öffnen „Termin geändert“; was schon gesehen wurde, merkt sich das Gerät (`elektro.termine.gesehen`). Der
Chef sieht auf der Startseite Anträge und „erledigter Einsatz, noch nicht verrechnet“.
Jeder Einsatz (heute und morgen) klappt auf (`EinsatzDetails.tsx`): Projekt, Adresse mit Karte und Navigation,
Kunde mit Telefon/Mail, Notiz und Projektbeschreibung, wer noch dabei ist (mit Anruf-Knopf), Bus und Geräte,
offene Hinweise (dringend, Regieberichte ohne Unterschrift, Projekt noch im Angebot), „Ins Projekt“.

### Buchhaltung (`lib/fibu.ts`, `components/buchhaltung/`, Seite `/buchhaltung`)

Vier Reiter (`?reiter=`): **Ausgang** (unsere fertigen Rechnungen), **Eingang** (Lieferanten), **Altrechnungen**,
**Kanzlei** (die Monatsübergabe unten). Ausgang und Eingang je Monat oder Jahr: Netto, USt/Vorsteuer, Brutto,
noch offen; Balken je Kategorie (antippen = Filter), Offen/Bezahlt, Suche, CSV. Zeile antippen öffnet die
Rechnung (`/belege/:id`) bzw. die Eingangsrechnung, das Symbol daneben das Original (Archiv-PDF bzw. Foto/PDF).

- **Kategorien** (`rechnung_kategorien`, Migration `20261113118000`): pflegbar getrennt für Ausgang und Eingang
  (Kopf → „Kategorien“), mit Stichworten und optional eigenem Konto. Eine Eingangs-Kategorie trägt die Art
  (Material, Fremdleistung … = `eingangsrechnungen.kategorie`) — im Eingangsformular ersetzt die Kategorie
  das Feld „Art“. Vorschlag (`buchhaltungLogik.ts`, getestet): Eingang zuerst die letzte Kategorie desselben
  Lieferanten, sonst Stichworte in Lieferant und (KI-)Positionen; Ausgang Stichworte in Betreff, Projekt und
  Positionen. Vorschläge stehen grau mit „?“ da, „… Vorschläge übernehmen“ setzt sie. `kategorie_id` ist auch
  an fertigen Rechnungen änderbar (`beleg_schutz` lässt sie frei, steht auf keinem PDF). Trigger
  `kategorie_richtung_pruefen`: Ausgangs-Kategorie nur an `belege`, Eingangs-Kategorie nur an Eingangsrechnungen.
  Konto der Kategorie im Export: Eingang immer vor dem der Art, Ausgang nur bei 20 % (13/10 %, Reverse Charge
  behalten ihre Konten).
- **Altrechnungen** (`belege.altbestand`): Rechnungen aus dem bisherigen Programm, damit Offene Posten, Mahnen
  und Kundenhistorie stimmen. Nummer frei (nicht aus dem Nummernkreis, eindeutig wie jede Belegnummer),
  keine Positionen, offen angelegt; schon Bezahltes wird eine Zahlung. Erfassen als Tabelle zum Durchtippen
  (Enter in „Bezahlt“ der letzten Zeile = neue Zeile; Netto oder Brutto genügt) oder CSV mit wählbaren
  Spalten (UTF-8 oder Windows-1252); je Zeile optional das Original-PDF (ins Rechnungsarchiv). Unbekannte
  Kunden legt das Speichern an. `/belege/:id` zeigt statt des Editors `AltrechnungAnsicht`: Daten,
  Kategorie, Original, Zahlungen/Ausbuchen/Mahnen (`OpKarte`), Bearbeiten, Löschen. Regeln in der Datenbank
  (`altrechnung_anlegen`, `beleg_schutz`): Nummer, Kunde, Netto + USt = Brutto > 0; nicht festgeschrieben,
  aber nie storniert, nie zurück zur normalen Rechnung; Betrag geändert → Status aus den Zahlungen neu (nicht
  unter das Bezahlte); löschen geht (samt Zahlungen und Mahnungen). **Nie in der Übergabe**: der Export
  filtert sie, `fibu_uebergeben` lehnt sie ab, der Reiter Kanzlei nennt ihre Zahl.
- „Ausbuchen“ = `ZahlungDialog`: Zahlung (auch Teilzahlung), Skonto oder Ausbuchen (uneinbringlich). In den
  Listen heißt eine erledigte Rechnung mit Ausbuchung „Ausgebucht“ (`zahlStatus`).

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
- **Aufschlag je Position direkt in der Tabelle** (PC ab 1280 px): Spalten
  EK | Aufschlag % | EP netto hängen zusammen (`mitEinkauf`, `mitAufschlag`,
  `aufschlagVon` in `components/belege/editor.ts`): Aufschlag ändern →
  Preis neu; EK ändern → Aufschlag bleibt, Preis rechnet mit; freier Preis
  ohne EK → EK eintragen zeigt den Aufschlag. Arbeitsminuten bleiben im Preis.
  Spalten ausblendbar („EK/Aufschlag ausblenden“, `elektro.beleg.kalk`), kleiner
  sonst als „EK 12,34 · +35 %“ unter dem Preis; im Positionsdialog Aufschlag
  ±5 und der Preis rechnet live mit (und umgekehrt).
  „Aufschläge“ im Summenblock setzt Material-Aufschlag und Stundensatz für den
  ganzen Beleg (`aufschlaegeSetzen`; Arbeit nur, wo noch der alte Satz steht).
- **Material per KI** (`KiMaterialDialog`): „PV-Anlage 9 kW mit Speicher“
  sagen oder tippen → die KI schlägt Komponenten mit Menge vor, je Zeile ein
  Artikel aus dem eigenen Stamm samt Alternativen oder „Ohne Artikel“; nichts
  ist übernommen, bevor man es abhakt. Erfindet keine Artikelnummern.
- **Artikelkatalog** (`KatalogDialog`, Knopf neben „Material per KI“ — eine
  Option, das Angebot geht weiter ganz normal): Kacheln je Kategorie mit
  Anzahl → Hersteller und Programm (Warengruppe des Lieferanten) als Filter →
  Artikelliste mit Preis und ＋/−/Menge; gesammelt wird im Korb, „n übernehmen“
  setzt alles unter den aktiven Titel. Suche im ganzen Katalog oder in der
  Kategorie. Datanorm-Artikel ordnet `artikel_einordnen(warengruppe)` in die
  15 Kategorien der Demo-Artikel ein, `artikel_unterkategorie` macht aus
  „Euro Unitech (PG 08) Jung LS990“ „Jung LS990“; der Trigger
  `artikel_kategorie` tut das bei jedem Import. Baum: RPC `artikel_katalog()`
  (Migrationen `20261111130000`/`…131000`).
- **PDF-Vorschau live** (`LiveVorschau.tsx`, pdf.js auf Canvas): am breiten PC
  (≥ 1536 px) rechts neben dem Editor, ausblendbar (`elektro.beleg.vorschau`);
  sonst „Vorschau“ im Kopf als Vollbild — auch am Handy. Zeigt genau das PDF,
  das der Kunde bekommt, ohne zu speichern; neu gezeichnet 0,7 s nach der
  letzten Eingabe.
- **Rabatte beim Großhandel** (`rabatte`, Artikel → Rabatte, nur Chef): je
  Lieferant, optional Hersteller oder Rabattgruppe; das genaueste gewinnt.
  `rabatte_anwenden` rechnet EK = Liste − Rabatt neu (in Häppchen wegen des
  Timeouts). Artikelsuche filtert nach Hersteller (serverseitig).

### Angebote und Rechnungen (`components/belege/`)

- **Eigene Menüpunkte** `/angebote` und `/rechnungen` (`pages/Belege.tsx`,
  direkt unter Projekte; `/belege?…` leitet weiter). Kennzahlen oben sind
  zugleich Filter. Angebote: Ohne Antwort, Nachfassen (offen und gültig bis
  in ≤ 7 Tagen oder abgelaufen), Angenommen, Entwurf, In Rechnung, Abgelehnt.
  Rechnungen: Offen, Überfällig, Entwurf, Bezahlt, Storniert. Die Startseite
  verlinkt „nachfassen“ und Entwürfe direkt in den Filter.
- Ein Editor für beide (`BelegEditor`): Titel als Räume/Abschnitte, Positionen
  aus Leistungskatalog, Artikelstamm, frei oder diktiert (`lib/sprachParser.ts`).
- **Eingabezeile am PC** (`Eingabezeile.tsx`) unter der Tabelle: tippen,
  ↑↓, Enter. Sucht Leistungen und Artikel (auch Datanorm); ohne Treffer eine
  freie Position (Fokus springt in deren Preis). „3 Steckdose“ = Menge 3,
  „#Küche“ = Titel (`schnellLesen`). Knöpfe „+ Titel“ und „Text“.
- **Titel ohne Dialog**: direkt in der Zeile benennen (Vorschläge Küche, Bad …
  als Liste bzw. am Handy als Chips); „Titel darüber einfügen“ im Zeilenmenü.
  Neue Positionen landen unter dem zuletzt angetippten Titel.
- Langtext klein und grau (2 Zeilen), antippen zum Bearbeiten. Am PC unten
  eine feste Summenleiste mit Netto, Brutto, „bleibt nach Material“, je
  Stunde und Speichern.
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
- Plantafel und Kalender sind eins (beide zeigen `termine`; `/kalender`
  leitet auf `/plantafel`). Am PC füllt die Seite Breite und Höhe
  (`PageHeader voll`), Ansicht Woche, 2 Wochen, Monat, 3 Monate als Gantt
  (`components/plantafel/Gantt.tsx`) oder „Kalender“ als Monatsblatt mit
  Tagesliste (`components/plantafel/Monat.tsx`, Alle/Meine).
- Gantt nach Vorbild Steinbrecher: Kopf mit Monat, KW und Tag (darunter
  „x frei“, Namen im Tooltip), Wochenende/Feiertag gelb bzw. rosa, rote
  Heute-Linie. Jeder Balken trägt die Farbe seines Projekts (`projektFarbe`,
  12 kräftige Farben, Schrift per `textAuf`), Wochenenden sind Lücken
  (`arbeitsStuecke`). Zeilen: je Team ein Kopf (zuklappbar, Bus als Auswahl —
  der Bus eines Teams hat keine eigene Zeile) mit seinen Leuten, „+ Neues
  Team“ (Namen tippen oder eine Person hereinziehen = Team mit ihr als
  Leitung), „Ohne Team“, „Geräte & Fahrzeuge“ (zuklappbar: Steiger,
  Anhänger, Maschinen, Messgeräte, Busse ohne Team; „+ Gerät“ legt eines an),
  „Nicht eingeteilt“. In der Personenzeile erscheinen Einsätze des eigenen Teams nur
  als dünner Strich, eigene Einsätze als Balken.
- Balken antippen = kleines Fenster am Balken (`BalkenInfo`: Projekt, Zeit,
  Ort, Leute herausnehmen, Geräte an/ab, Erledigt, Löschen); erst
  „Bearbeiten“ öffnet das große Formular.
- Oben „Noch nicht eingeplant“: laufende Projekte ohne Einsatz ab heute (Suche
  findet alle laufenden) — auf eine Zeile ziehen = Einsatz bis Freitag
  7:00–15:30. Ziehen (Maus, am Tablet langer Druck): Balken = verschieben,
  auch in eine andere Zeile (`ablegen`); mit Strg/Alt = kopieren; Ränder =
  länger/kürzer; leere Tage aufziehen = neuer Einsatz; Person am Griff ⋮⋮ auf
  einen Balken (`zuweisen`) oder ein Team (Mitglied wechseln); Gerät am Griff
  auf einen Balken = mitnehmen, Bus/PKW auf ein Team = Bus des Teams; Projekt
  auf die Steigerzeile = Einsatz nur mit dem Steiger. Ein Balken aus der
  Gerätezeile auf ein Team behält das Gerät (Leute und Geräte tauschen nur
  untereinander). Bus tauschen
  ändert auch die Einsätze des Teams ab heute. Alles mit Rückgängig (Knopf,
  Strg+Z). Konflikte (doppelt, abwesend) als roter Knopf in der Leiste.
- Am Handy eine Liste je Tag der Woche, Alle oder Meine (Monteur: Meine),
  mit Abwesenheiten, Farbstreifen je Projekt.
- **Terminplaner** (Umschalter „Tafel | Mitarbeiter“, am Handy „Liste | Leute“,
  gemerkt in `elektro.plantafel.sicht`; `components/plantafel/Terminplaner.tsx`,
  Logik `lib/terminplaner.ts`, getestet) — Achsen getauscht wie SETECs alter
  Terminplaner: Spalten = Leute nach Gruppen, Zeilen = Tage der Woche mit
  den Stunden 6–18 (weiter, wenn ein Einsatz früher/später liegt), Sa/So nur
  mit Einträgen. Gruppen (`gruppenBilden`): Geschäftsführung, eigene Gruppen
  (`profiles.gruppe`, z. B. „Büro“, im Teams-Dialog pflegbar), Teams in ihrer
  Reihenfolge, „Ohne Team“; eigene Gruppe geht vor Team, ein Chef ohne beides
  ist Geschäftsführung (Migration `20261113112000_profil_gruppe.sql`).
  Einsätze als Blöcke (Kunde, Titel, Zeit; Projektfarbe, ohne Projekt blau),
  Überlappendes nebeneinander (`nebeneinander`), Abwesenheit als Fläche:
  Urlaub/ZA grün, Krank rot, Schule/Arzt gelb. Filter Alle/Gruppe/Person,
  rechts (ab 1280 px) Monatskalender zum Springen. Leere Zelle = neuer
  Einsatz für Person und Uhrzeit (`TerminDialog` mit `von`/`bis`), Block =
  `BalkenInfo`; ziehen = andere Zeit/Tag/Person (`planVerschieben`, 15-Min.-
  Raster, Person wird getauscht), unterer Rand = Ende; „Rückgängig“ im Hinweis.
  Handy: „Tag“ (Leute untereinander, Zeit quer) oder „Person“ (Mo–Fr,
  Stunden nach unten), wischen = nächster Tag bzw. nächste Person.
- Fuhrpark: oben je Art eine Kachel zum Filtern (Anzahl, wie viele unterwegs)
  plus „Fällig & Schäden“, darunter je Art ein Block mit Kacheln (im Einsatz
  oder frei, Team, heute, Fälligkeiten).
- Fällig (Pickerl, Service, Prüfung in 30 Tagen) und offene Schäden stehen
  im Fuhrpark und auf der Startseite.

### Stundenauswertung (Auswertung → Stunden)

`lib/stundenAuswertung.ts`: Zeitraum (Woche, Monat, Jahr, frei), Filter nach
Mitarbeiter oder Team, Projekt (auch „ohne“), Art und verrechnet; gruppiert
nach Mitarbeiter, Projekt, Woche, Tag oder Art, jede Gruppe aufklappbar bis
zur einzelnen Buchung. CSV und Stundennachweis-PDF der Auswahl.
„Von–Bis je Tag“ (`tagesnachweis`, `components/auswertung/VonBis.tsx`): je
Person und Tag Beginn, Ende, Pause, Stunden und eine Zeitleiste 6–19 Uhr mit
den einzelnen Blöcken; je Person Ø Beginn/Ende; auffällig sind Beginn vor 6,
Ende nach 19, über 10 h, Überschneidung, Lücke über 1 h. Auch als CSV.

### Startseite und Menü

PC: unter dem Gruß die Schnellaktionen Neues Projekt, Neue Rechnung, Termin
eintragen; dann „Laufende Projekte“, darunter „Zu erledigen“ (Anträge, überfällig,
mahnen, Rechnungen prüfen/überweisen, Skonto läuft ab, Fuhrpark fällig,
Schäden, zuzuordnen …), dann Einsatz und Schnell festhalten.

Menü nach dem Vorbild Lengauer Stockner (`components/rahmen/`):
- **Seitenleiste** (`Seitenleiste.tsx`): hell, 240 px, ab 1024 px einklappbar auf
  56 px (gemerkt in `localStorage` `mayr.seitenleiste`); Tablet 768–1023 px immer
  schmal. Oben Logo auf weißer Plakette, „Suchen … Strg K“ und das blaue „+ Neu“.
  Gruppen ohne Etikett (Start, Projekte, Angebote, Rechnungen, Plantafel), dann
  BAUSTELLE und BÜRO, einzeln zuklappbar (`menue.zu`; die Gruppe der offenen Seite
  ist offen, zugeklappt nur bis zum Seitenwechsel). Aktiv: hellere Fläche und
  blauer Strich links. „+“ beim Überfahren an Projekte, Angebote, Rechnungen,
  Plantafel, Stunden, Regieberichte legt gleich an. Im Fuß Einstellungen,
  Änderungswünsche, Handyansicht und das Konto mit Namen (`KontoMenue leiste`).
- **„+ Neu“** (`NeuMenue.tsx`, `NeuRahmen` einmal im Rahmen): Projekt, Angebot,
  Angebot vor Ort, Rechnung, Termin, Stunden, Regiebericht, Foto (Monteur ohne
  Angebot/Rechnung) — jeder Eintrag öffnet den vorhandenen Dialog oder die Seite.
  `neuStarten(art)` startet eine Aktion von überall.
- **Suche** (`Suchpalette.tsx`): Strg+K, am Handy die Lupe im Kopf der Startseite
  (Vollbild). Projekte, Kunden, Belege (nur Chef), Seiten, Neu anlegen; Pfeile +
  Enter.
- **Startseite am Handy/Tablet** (`StartListe.tsx`): Kopf mit Logo, Datum und
  Gruß, Lupe, Melden, Konto. Menü als große Karten mit blauem „… öffnen“ und
  leichtem Schatten; ab 7 Einträgen wandern die seltenen (`selten` in
  `lib/navigation.ts`) unter „Mehr in …“ (aufgeklappt gemerkt: `start.mehr`).

Projekte (`pages/Projekte.tsx`) als Kacheln: Nummer, Name, Status, Förderung, Kunde,
Adresse, Stunden und was noch nicht verrechnet ist; Filter „Förderung“ mit Unterfilter je Schritt; am Handy eine Spalte,
ab 480 px zwei, PC drei bis vier. Am PC umschaltbar auf die Liste
(`elektro.projekte.ansicht`).

### Projektseite: Planung, Fotos, Förderung, WhatsApp, Nachkalkulation

Migration `20261113114000_projekte_foerderung_planung_saetze.sql`, Bausteine in `components/projekt/`:
- **Fotos** (`BildBetrachter`, ohne Bibliothek): Vollbild, zwei Finger zoomen, Doppeltipp/-klick 2,5×,
  gezoomt verschieben, sonst wischen = nächstes Bild; PC Mausrad zur Maus, Pfeiltasten, + − 0, Esc.
- **Planung** (`PlanungBereich`, oben in der Übersicht): Dokumente mit `dateien.planung` (PV-Plan,
  Stringplan, Dachbelegung) — „Plan ablegen“ oder im Ordner Dokumente „Als Planung oben zeigen“.
  PDFs zeichnet `PdfAnsicht` mit pdf.js (lazy geladen): am PC eingebettet, am Handy Vollbild; Seiten
  blättern, Zoom, Herunterladen bzw. am Handy Teilen. Bilder öffnen im Betrachter.
- **Förderung** (`projekte.foerder_*`): keine / Antrag vorbereitet / eingereicht / zugesagt /
  Fertigstellung gemeldet / ausbezahlt / abgelehnt, mit Förderstelle (Vorschläge OeMAG, Klimafonds,
  Land, Gemeinde), Betrag, Datum, Frist, Notiz. Pille im Kopf und auf der Kachel (`foerderPille`).
  Jede Änderung schreibt der Trigger `foerderung_verlauf` in den Verlauf. Startseite (Chef): Frist
  offener Schritte in ≤ 30 Tagen oder vorbei (`lib/foerderung.ts`).
- **WhatsApp an Kunde** (`WhatsAppDialog`, ohne API): Vorlage wählen (Termin = nächster Einsatz mit
  Datum, Uhrzeit, Team; Montage fertig; Förderung; frei), Text prüfen, „In WhatsApp öffnen“ →
  `wa.me/<nummer>?text=…` (`waNummer`: 0664… → 43664…). Gesendet wird in WhatsApp; vermerkt wird die
  Absicht mit Text und Nummer im Verlauf. Vorlagen mit Platzhaltern `{kunde}` … in Einstellungen →
  Betrieb (`firma.whatsapp_vorlagen`, leer = Vorgaben in `lib/whatsapp.ts`).
- **Nachkalkulation** (`NachkalkulationKarte`, `lib/nachkalkulation.ts`, nur Chef): zählendes Angebot =
  die angenommenen, sonst die offenen. **Angebotene Stunden** = Arbeitszeit-Positionen in h + Menge ×
  Montageminuten jeder Position; gegen die gebuchten Stunden **ohne Regie**, Ampel bis 85 % grün, bis
  100 % gelb, darüber rot. **Regie getrennt**: Stunden und Material mit `regiebericht_id` sind ein
  eigener Block (Wert, Material-EK, Lohnkosten, Ertrag) und zählen nie gegen das Angebot; die
  Pauschale rechnet Angebot − Lohnkosten − Material-EK − Fremdleistung. Garantie kostet, bringt nichts;
  Überstunden ×1,5/×2 auf beiden Seiten. Auswertung → Nachkalkulation zeigt dieselbe Rechnung je Projekt
  (Spalte „davon Regie“, Stunden „ohne Regie / angeboten“).
- **Lohnkosten und Stundensatz je Mitarbeiter** (Einstellungen → Mitarbeiter, Knopf „€“): Zeilen mit
  „gültig ab“; jede Stunde rechnet mit dem Satz ihres Tages (`satzAm`). Lohnkosten: Person, sonst
  `firma.kostensatz`. Verrechnungssatz: Person, sonst Lohnart, sonst Projekt-/Betriebssatz — so auch in
  „Aus dem Projekt übernehmen“ (Rechnung, Regie); wer einen eigenen Satz hat, bekommt eine eigene Zeile
  „Arbeitszeit <Name>“. Monteure lesen die Tabelle nicht (RLS `saetze_chef`).

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
   je Projekt: geleistet (Stunden × Satz der Person + Material-VK, Regie getrennt) gegen Angebot und
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
  - `components/KundeWahl.tsx`, `components/ProjektWahl.tsx` (Projekt per Tippen: Nummer, Name, Kunde,
    Ort — `lib/projektSuche.ts`; Liste klappt im Formular auf, Pfeile/Enter/Esc)
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
