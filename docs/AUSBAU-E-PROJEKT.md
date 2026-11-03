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
| Zeiterfassung, Handy-APP, Mobile Aufträge mit Unterschrift + Foto | Stunden am Handy, Regiebericht mit Kundenunterschrift, Fotos |
| WEL/WER (Eingangsrechnungen) | Eingangsrechnungen, Projekten zuordnen, weiterverrechnen |
| Zeitplanung | Kalender |
| Auswertungen Umsätze, Zeiterfassung | Auswertung, Stundennachweis-PDF |
| Rechnungen zahlen mit QR-Code | Bezahl-QR (EPC) auf der Rechnung |

## Was fehlt – Reihenfolge nach Nutzen für den Betrieb

| # | Bereich | Was genau | Stand |
|---|---|---|---|
| 1 | **Offene Posten & Mahnwesen** | Zahlungen (auch Teilzahlungen) je Rechnung, offener Rest, überfällig, Zahlungserinnerung → 1. → 2. Mahnung als PDF mit Mahnspesen und Verzugszinsen, Liste „Offene Posten“ | ✅ 03.11.2026 |
| 2 | **Anzahlung, Teil- und Schlussrechnung** | Teilrechnung nach Prozent oder Betrag auf ein Angebot, Schlussrechnung zieht alle Teilrechnungen ab (mit USt je Teilrechnung), Restforderung (Haftrücklass später) | ✅ 03.11.2026 |
| 3 | **Anlagen & Wartung / E-Check** | Anlagen beim Kunden (Verteiler, Blitzschutz, Notlicht, PV …), Prüfintervall, „fällig“-Liste, Prüfprotokoll am Handy mit Messwerten (Isolation, Schleifenimpedanz, FI-Auslösezeit …), Kundenunterschrift, PDF, daraus Rechnung | geplant |
| 4 | **Bestellungen beim Großhändler** | Bestellvorschlag aus Mindestbestand und Projektbedarf, Bestellung als PDF/E-Mail-Text je Lieferant, Wareneingang gegen Bestellung (Teillieferung), offene Bestellungen | geplant |
| 5 | **Abwesenheiten & Lohnarten** | Urlaub, Krankenstand, Zeitausgleich, Feiertag; Überstundenkonto je Mitarbeiter; Diäten und Kilometergeld; alles im Stundennachweis-PDF | geplant |
| 6 | **Metallzuschlag (Kupfer)** | Datanorm-Kupferzahl (kg/km), Kupfernotiz (DEL) in Einstellungen, Zuschlag auf Kabelpositionen | geplant |
| 7 | **E-Rechnung & Buchhaltungsexport** | ebInterface 6.1 (österreichischer Standard, Pflicht bei Bund), ZUGFeRD/XRechnung, Export für BMD/DATEV (CSV) | geplant |
| 8 | **Geräte & Werkzeuge** | Wer hat welches Gerät, Prüftermine (Messgeräte kalibrieren, Leitern), Übergabe per Scan | geplant |
| 9 | **Aufmaß & ÖNORM-LV** | Aufmaß je Position mit Formel, ÖNORM A2063/B2063 einlesen und ausgeben | später, nur auf Wunsch |

Bewusst **nicht** übernommen: Registrierkasse/Barverkauf (RKSV-Signatur braucht zertifizierte Hardware
und lohnt sich für einen Installationsbetrieb nicht), Seriennummernverwaltung, Mandantenverwaltung, eigener
Schriftverkehr/Office (E-Mail und Dokumente laufen über das Handy), MDE-Scanner (die Handykamera ersetzt sie),
alles zu Netzwerk, Datenbankwartung, Lizenzen und Updates (Web-App).

## Leitlinien bleiben

Die aus `KONZEPT.md`: jeder Klick ist Aufwand, nichts doppelt erfassen, ein Mensch bestätigt, nichts
erfinden. Neue Bereiche folgen dem Design „Werkbank“ (Startseite = Menü, Vollbild-Formulare, Blau als
einzige Aktionsfarbe) und den Rechten: Chef sieht Geld, Monteur sieht Arbeit.
