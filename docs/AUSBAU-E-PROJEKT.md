# Ausbau: alles Wichtige aus e-projekt, nur einfacher (03.11.2026)

Vorlage: das e-projekt-Hilfesystem (rund 1900 Seiten,
https://www.e-projekt.at/Hilfe/HTML/index.html). Ziel ist keine Kopie: Wir übernehmen, was ein kleiner
Elektrobetrieb im Alltag braucht, und lassen weg, was nur wegen Windows/FoxPro, Netzlaufwerken oder alter
Hardware existiert.

## Was mayr schon kann (e-projekt-Bereich → mayr)

| e-projekt | mayr |
|---|---|
| Kunden, Interessenten | Kunden (`/kunden`) |
| Artikel, Kataloge, Datanorm einlesen, Warengruppen, Strichcode | Artikelstamm, Datanorm 4/5 + CSV, Strichcodes, Scan |
| Stücklisten, Stundensätze, Kalkulation | Leistungskatalog (Material + Minuten), mehrere Stundensätze, Kalkulation im Angebot |
| Projekte / Kommissionen, Projektnachkalkulation | Projekte `2026-0001`, Nachkalkulation in der Auswertung |
| Angebote, Rechnungen, Storno, Gutschrift | Angebote (KV), Rechnungen, Stornorechnung, Korrektur, Rechnungsarchiv |
| Materialverwaltung, Lager, Inventur | Lager, Bus als Lagerort, Ausfassen/Rückgabe, Inventur |
| Bestellwesen, Bestellvorschlag, Wareneingang | Bestellungen je Lieferant aus Mindestbestand oder Angebot, PDF/CSV, Wareneingang per Scan mit Teillieferung |
| Zeiterfassung, Handy-APP, Mobile Aufträge mit Unterschrift + Foto | Stunden am Handy, Regiebericht mit Kundenunterschrift, Fotos |
| WEL/WER (Eingangsrechnungen) | Eingangsrechnungen, Projekten zuordnen, weiterverrechnen |
| Zeitplanung | Kalender |
| Auswertungen Umsätze, Zeiterfassung | Auswertung, Stundennachweis-PDF |
| Rechnungen zahlen mit QR-Code | Bezahl-QR (EPC) auf der Rechnung |
| Anlagen, Wartungsverträge, Prüfprotokolle (E-Check) | Anlagen mit Prüfintervall und QR-Aufkleber, Prüfprotokoll mit Messwerten und Unterschrift |

## Was fehlt – Reihenfolge nach Nutzen für den Betrieb

| # | Bereich | Was genau | Stand |
|---|---|---|---|
| 1 | **Offene Posten & Mahnwesen** | Zahlungen (auch Teilzahlungen) je Rechnung, offener Rest, überfällig, Zahlungserinnerung → 1. → 2. Mahnung als PDF mit Mahnspesen und Verzugszinsen, Liste „Offene Posten“ | ✅ 03.11.2026 |
| 2 | **Anzahlung, Teil- und Schlussrechnung** | Teilrechnung nach Prozent oder Betrag auf ein Angebot, Schlussrechnung zieht alle Teilrechnungen ab (mit USt je Teilrechnung), Restforderung (Haftrücklass später) | ✅ 03.11.2026 |
| 3 | **Anlagen & Wartung / E-Check** | Anlagen beim Kunden (Verteiler, Blitzschutz, Notlicht, PV …), Prüfintervall, „fällig“-Liste, Prüfprotokoll am Handy mit Messwerten (Isolation, Schleifenimpedanz, FI-Auslösezeit …), Kundenunterschrift, PDF, daraus Rechnung | ✅ 03.11.2026 |
| 4 | **Bestellungen beim Großhändler** | Bestellvorschlag aus Mindestbestand und Projektbedarf, Bestellung als PDF/E-Mail-Text je Lieferant, Wareneingang gegen Bestellung (Teillieferung), offene Bestellungen | ✅ 03.11.2026 |
| 5 | **Zeit & Personal** | Art je Stunde (Arbeit, Regie, Fahrt, Überstunde 50/100 %) mit Stundensatz für die Rechnung; Urlaub, Krankenstand, Arzt, Berufsschule, Zeitausgleich — Monteur beantragt am Handy, Chef bestätigt, steht im Kalender; Sollzeit je Mitarbeiter, österreichische Feiertage, Überstunden- und Urlaubskonto; Taggeld/Diäten aus den Stunden, Kilometergeld; alles im Stundennachweis-PDF und als CSV für die Lohnverrechnung | fertig (04.11.2026) |
| 6 | **Einsätze am Handy** | Monteur-Startseite „Heute / Morgen“ mit Adresse, Navi, Telefon; Einsatz begonnen/erledigt; Chef sieht „erledigt, noch nicht verrechnet“; Kundendienst/dringend; Hinweis an den Monteur, wenn sich sein Termin ändert | fertig (04.11.2026) |
| 7 | **Angebot & Rechnung verfeinern** | Wahlpositionen (mit Preis, ohne Summe; beim Umwandeln fragen), sichtbarer Nachlass im Summenblock, Skonto in der Zahlungsbedingung und Zahlungsziel je Kunde, Haftrücklass, Angebot vor Ort unterschreiben (= angenommen), Preise aus dem Stamm neu holen, Nachfass-Datum, PDF ohne Einzelpreise, Räume aus einem anderen Beleg holen | geplant |
| 8 | **Buchhaltung** | Monatsexport für den Steuerberater (BMD/RZL/DATEV-CSV + alle PDFs als ZIP, „übergeben am“), E-Rechnung ebInterface 6.1 und ZUGFeRD, Bankauszug (ELBA-CSV/camt.053) einlesen und Zahlungen zuordnen, Beleg per E-Mail aus der App mit „gesendet am“, Komplett-Datenexport | Monatsexport BMD/RZL + PDFs fertig (04.11.2026); DATEV, E-Rechnung, Bankauszug, E-Mail, Datenexport offen |
| 9 | **Eingangsrechnungen einlesen** | ZUGFeRD-/XRechnung-Daten aus dem PDF als Vorschlag, Abgleich mit der Bestellung (teurer = rot), Skonto-Frist mit Erinnerung | geplant |
| 10 | **Kunden & Stamm** | Mehrere Ansprechpartner, eigene Rechnungsadresse (Hausverwaltung), Reverse Charge am Kunden, Warnung bei säumigen Kunden, Textbausteine, Aufschlag je Warengruppe, Kostensatz je Mitarbeiter (echte Nachkalkulation), Preisänderungsliste nach Datanorm-Import, Kupferzuschlag | geplant |
| 11 | **Geräte, Etiketten, Mängel** | Geräte & Werkzeuge mit QR (Übergabe per Scan, Kalibriertermine, Messgerät im Prüfprotokoll), Strichcode-Etiketten für Lagerartikel, Mängel mit Frist bei Anlagen → Angebot | geplant |
| 12 | **Später / auf Wunsch** | Offline-Warteschlange für Buchungen, einfaches Aufmaß, ÖNORM-LV | später |

Bewusst **nicht** übernommen: Registrierkasse/Barverkauf (RKSV-Signatur braucht zertifizierte Hardware
und lohnt sich für einen Installationsbetrieb nicht), Seriennummernverwaltung, Mandantenverwaltung, eigener
Schriftverkehr/Office (E-Mail und Dokumente laufen über das Handy), MDE-Scanner (die Handykamera ersetzt sie),
alles zu Netzwerk, Datenbankwartung, Lizenzen und Updates (Web-App).

Grundlage der Reihenfolge ab 5: der Detailvergleich aller Hilfeseiten in `E-PROJEKT-VERGLEICH.md` (04.11.2026)
— was mehrere Bereiche und die Update-Notizen von e-projekt immer wieder nennen, kommt zuerst.

## Leitlinien bleiben

Die aus `KONZEPT.md`: jeder Klick ist Aufwand, nichts doppelt erfassen, ein Mensch bestätigt, nichts
erfinden. Neue Bereiche folgen dem Design „Werkbank“ (Startseite = Menü, Vollbild-Formulare, Blau als
einzige Aktionsfarbe) und den Rechten: Chef sieht Geld, Monteur sieht Arbeit.

## Abgleich mit e-projekt vom 04.11.2026 (Klicktests, e-projekt-Seite laut `E-PROJEKT-VERGLEICH.md`)

Nachgezogen: Wareneingang per Scan hakt offene Bestellungen ab (älteste zuerst, Rest ohne Bestellung),
Umbuchen/„Bus auffüllen“, Bestellpackungen (`artikel.bestell_vpe`), Datanorm mit Hersteller und Kupferzuschlag,
Mindestbestand zählt nur das Lager, Lohnart je Mitarbeiter (Lehrling zum Lehrlingssatz), Nachkalkulation mit
Material-EK, Lohnkosten (`firma.kostensatz`) und Ertrag, Rückfragen vor Mahnung und bei auffälliger Menge,
Hinweis auf schon gebuchte Stunden, Schlussrechnung gesperrt solange eine Teilrechnung Entwurf ist,
Termin „Heute“ auf der Startseite (Vorgriff auf #6), Sicherung im Prüfprotokoll, Monteur sieht keinen Materialwert
und darf nicht abschließen (auch per Trigger).

Noch offen aus dem Abgleich: echter Endrabatt im Summenblock und Wahlpositionen (#7), Skonto und Haftrücklass auf
der Rechnung, Mahntexte und Mahnsperre, Mängel mit Frist (#11), Plantafel ziehen, Einsatz annehmen/abschließen (#6),
UID-Prüfung und PLZ→Ort (#10), Bewegungsliste je Artikel, Inventur-PDF.
