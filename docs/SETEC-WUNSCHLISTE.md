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

(wird beim Zusammenführen ergänzt)
