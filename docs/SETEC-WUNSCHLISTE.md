# SETEC — Wunschliste und Umsetzung

Kunde: **SETEC GmbH**, Stefan Sattler (Geschäftsführer), Grazer Straße 41,
8644 Kindberg-Mürzhofen — Elektrik und Photovoltaik (PV-Anlagen, Speicher,
Sanierung, E-Attestierungen). Angebot angenommen am 12.11.2026, Termin vor Ort
Dienstag 17.11.2026. Quelle: Mail „Re: Demo Zugang und Angebot“ vom 12.11.2026
mit „Wishlist ePower App.docx“ und einem Bild seines Terminplaners (Spalten =
Mitarbeiter nach Gruppen Geschäftsführung, Büro, Team 1, Team 2; Zeilen = Tage
mit Stunden; Abwesend grün, Krank rot, Einsätze orange).

Marke: Schild-Logo mit Blitz, Gold/Sand `#C4A983` auf Schwarz, Schrift
Montserrat, „SE“ dünn + „TEC“ fett, Untertitel „ELEKTRIK – PHOTOVOLTAIK“.

## Pakete

| Paket | Inhalt (Wünsche) |
|---|---|
| **A Design** | Marke SETEC: Logo, Gold auf Anthrazit, Montserrat, Seitenleiste dunkel, Anmeldung, PDFs, Demo-Betrieb SETEC |
| **B Kalender** | Terminplaner-Ansicht: Mitarbeiter als Spalten nach Teams, Tage/Stunden als Zeilen (X/Y-Achse umschaltbar); Abwesend/Krank in der Tafel; Projektsuche beim Auswählen (tippen); „Heute – Morgen“: Projekt aufklappen |
| **C Kontakte** | Lieferanten als Kontakte mit ihren Belegen; Anlagendaten am Kunden (PV kWp, Speicher, Einspeisebegrenzung, Wallbox, Überschussregelung, Link Anlagenüberwachung Fronius/Solax/Huawei, Link PV-Planung); Kunden auf der Karte |
| **D Projekte** | Bilder zoomen; Planung (PDF) im Projekt anzeigen; Feld Förderstatus; WhatsApp an den Kunden (Termin, Montage, Förderstatus); angebotene Stunden vs. gebucht; Regie getrennt in der Nachkalkulation; Lohnkosten und Stundensätze je Mitarbeiter |
| **E Angebote** | Angebotsvorlagen; Kunde bestätigt das Angebot online (Link); Datenblätter der Artikel als Anhang zum Angebot |
| **F Artikel/Lager** | Artikelbilder; VK/Aufschlag je Artikel änderbar; mehrere Lieferanten mit Preisen; Datenblatt am Artikel; Bewegungshistorie; Wareneingang per Lieferschein-PDF; Lagerplatz (Regal 3); Material aus dem Angebot als Vorschlag beim Ausfassen |
| **G Personal** | Aufgaben für Mitarbeiter mit Verfolgung; Büro- und unproduktive Stunden; Stunden in der Monatsansicht; Stunden für andere Mitarbeiter buchen; Dokumente bei Mitarbeitern (Lohnzettel, An-/Abmeldung, Krankenscheine); Reiter „Dokumente“ |
| **H Buchhaltung** | Rechnungen in der Buchhaltung öffnen; Buchhaltung getrennt nach Eingang und Ausgang; Kategorien für Ein- und Ausgangsrechnungen; alte Rechnungen einpflegen und ausbuchen |

Migrationen je Paket mit eigenem Zeitstempelbereich (`20261113` + Paket):
B `1120xx`, C `1130xx`, D `1140xx`, E `1150xx`, F `1160xx`, G `1170xx`,
H `1180xx`, A `1190xx`. Eingespielt mit `scripts/migration.sh <datei>`.

## Stand

Stand 13.11.2026: alle Wünsche umgesetzt, im Browser durchgeklickt (Chef am PC,
Monteur am Handy), RLS-Test 245/245, Durchlauf 22/22, 447 vitest-Tests grün.
Details je Funktion in `docs/KONZEPT.md`.

| Wunsch | Wo | Stand |
|---|---|---|
| Aufgaben mit Verfolgung | `/aufgaben`, Startseite, Projekt | ✓ wiederkehrend, Verlauf mit Foto |
| Lohnkosten/Stundensätze je Mitarbeiter | Einstellungen → Mitarbeiter „€“ | ✓ mit „gültig ab“, nur Chef |
| WhatsApp an den Kunden | Projekt → WhatsApp | ✓ als `wa.me`-Link mit Vorlagen (keine API) |
| Büro-/unproduktive Stunden | Stunden → „Intern“ | ✓ Arten in Einstellungen, Spalte „Unproduktiv“ |
| Stunden in Monatsansicht | `/zeiten` Woche/Monat | ✓ |
| Rechnungen in der Buchhaltung öffnen, Eingang/Ausgang, Kategorien | `/buchhaltung` | ✓ |
| Dokumente bei Mitarbeitern, Reiter „Dokumente“ | `/dokumente` | ✓ Lohnzettel „neu für dich“ |
| Lieferanten mit ihren Belegen | `/kunden` → „Kontakte“ | ✓ Zuordnung über den Namen |
| Anlagendaten (PV, Speicher, Wallbox, Links) | Kontakt, Anlage, Projekt | ✓ |
| Alte Rechnungen einpflegen und ausbuchen | Buchhaltung → Altrechnungen | ✓ Tabelle oder CSV |
| Kunden in Kartenansicht | Kontakte → Karte | ✓ OpenStreetMap, Lage beim Speichern |
| Zoomen in Bildern, Planung (PDF) | Projekt | ✓ |
| Angebotsvorlagen | Angebote → „Aus Vorlage“ | ✓ |
| Kunde bestätigt Angebot | Link `/angebot/<token>` | ✓ mit Unterschrift |
| „Heute – Morgen“ aufklappen | Startseite | ✓ |
| Material aus Angebot beim Ausfassen | Scannen | ✓ |
| Stunden für andere buchen | Stunden-Dialog | ✓ Chef und Teamleitung |
| Angebotene Stunden, Regie getrennt in der Nachkalkulation | Projekt, Auswertung | ✓ |
| Förderstatus | Projekt, Projektliste, Startseite | ✓ mit Frist |
| Artikelbilder, VK/Aufschlag, Lieferanten-Preise, Datenblatt, Bewegungen, Lagerplatz | Artikel | ✓ |
| Wareneingang per Lieferschein-PDF | Lieferscheine → Einbuchen | ✓ |
| Kalender X/Y tauschen, Projektsuche | Plantafel „Mitarbeiter“, jede Projektwahl | ✓ |

Offen für den Termin am 17.11.: Bankdaten (noch Demo), AGB-Link auf der
Bestätigungsseite, welche Karte er zeigen wollte, Export seines alten Programms
(Altrechnungen), wer zu „Büro“ gehört und was es sehen darf, interne
Stundenarten, Einsätze einheitlich orange oder in Projektfarbe.
