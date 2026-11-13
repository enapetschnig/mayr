import { describe, expect, it } from "vitest";
import {
  altAusCsv, altSpaltenErkennen, altZeileLesen, datumLesen, eingangVorschlag, kategorieVorschlag, letzteKategorien, nachKategorie,
  stichwortListe, zahlStatus, type AltEingabe, type Kategorie,
} from "./buchhaltungLogik";

const kat = (id: string, name: string, stichworte = "", sortierung = 0): Kategorie => ({ id, richtung: "ausgang", name, art: null, konto: null, stichworte, sortierung });
const AUSGANG = [
  kat("pv", "PV-Anlage", "PV, Photovoltaik, Modul, Wechselrichter, kWp", 1),
  kat("sp", "Speicher", "Speicher, Batterie, Akku", 2),
  kat("wb", "Wallbox", "Wallbox, Ladestation, E-Auto", 3),
  kat("st", "Störungsdienst/Regie", "Störung, Regie, Notdienst", 4),
  kat("el", "Elektroinstallation", "Steckdose, Verteiler, Leitung, Installation", 5),
];

describe("Kategorie-Vorschlag", () => {
  it("Stichworte mit Komma", () => {
    expect(stichwortListe(" PV, Photovoltaik ,, Modul\nAkku")).toEqual(["pv", "photovoltaik", "modul", "akku"]);
    expect(stichwortListe(null)).toEqual([]);
  });
  it("die meisten Treffer gewinnen", () => {
    expect(kategorieVorschlag("PV-Anlage 9,8 kWp mit Wechselrichter Fronius", AUSGANG)).toBe("pv");
    expect(kategorieVorschlag("Batteriespeicher BYD 10 kWh nachrüsten", AUSGANG)).toBe("sp");
    expect(kategorieVorschlag("Wallboxmontage Garage", AUSGANG)).toBe("wb");
    expect(kategorieVorschlag("Regiebericht Störung FI", AUSGANG)).toBe("st");
  });
  it("kurze Stichworte nur als ganzes Wort", () => {
    // „pv“ steckt in „Kupvermessung“ — kein Treffer
    expect(kategorieVorschlag("Kupvermessung", AUSGANG)).toBeNull();
    expect(kategorieVorschlag("Erweiterung PV", AUSGANG)).toBe("pv");
  });
  it("Gleichstand: die weiter oben", () => {
    expect(kategorieVorschlag("PV mit Speicher", AUSGANG)).toBe("pv");
  });
  it("kein Treffer, leerer Text", () => {
    expect(kategorieVorschlag("Brötchen", AUSGANG)).toBeNull();
    expect(kategorieVorschlag("  ", AUSGANG)).toBeNull();
  });
  it("Eingang: letzte Wahl beim Lieferanten vor den Stichworten", () => {
    const ein = [kat("mpv", "Material PV", "Solar, Modul"), kat("tr", "Fahrzeuge/Treibstoff", "Tankstelle, Diesel")];
    const letzte = letzteKategorien([
      { lieferant: "Sonnen Großhandel ", kategorie_id: "mpv" },
      { lieferant: "sonnen großhandel", kategorie_id: "tr" },
      { lieferant: "Ohne", kategorie_id: null },
    ]);
    expect(letzte.get("sonnen großhandel")).toBe("mpv");
    expect(eingangVorschlag("Sonnen Großhandel", [], letzte, ein)).toBe("mpv");
    expect(eingangVorschlag("Tankstelle Mürz", ["Diesel 52 l"], letzte, ein)).toBe("tr");
    // gelöschte Kategorie zählt nicht mehr
    expect(eingangVorschlag("Sonnen Großhandel", ["Diesel"], letzte, [ein[1]])).toBe("tr");
  });
});

describe("Summen je Kategorie", () => {
  it("größte zuerst, ohne Kategorie zuletzt, Anteil am größten", () => {
    const s = nachKategorie([
      { kategorie_id: "pv", netto: 1000, brutto: 1200 },
      { kategorie_id: null, netto: 5000, brutto: 6000 },
      { kategorie_id: "sp", netto: "2000.10", brutto: "2400.12" },
      { kategorie_id: "pv", netto: 500.05, brutto: 600.06 },
      { kategorie_id: "weg", netto: 1, brutto: 1.2 },
    ], AUSGANG);
    expect(s.map((x) => x.name)).toEqual(["Speicher", "PV-Anlage", "Ohne Kategorie"]);
    expect(s[1]).toMatchObject({ anzahl: 2, netto: 1500.05, brutto: 1800.06 });
    expect(s[2]).toMatchObject({ anzahl: 2, netto: 5001 });
    expect(s[2].anteil).toBe(1);
  });
});

describe("Zahlstatus", () => {
  it("offen, teilbezahlt, bezahlt, ausgebucht, storniert", () => {
    expect(zahlStatus({ status: "offen", brutto: 100 }, []).status).toBe("offen");
    expect(zahlStatus({ status: "offen", brutto: 100 }, [{ betrag: 40, art: "zahlung" }])).toEqual({ status: "teilbezahlt", bezahlt: 40, offen: 60, ausgebucht: 0 });
    expect(zahlStatus({ status: "bezahlt", brutto: 100 }, [{ betrag: 97, art: "zahlung" }, { betrag: 3, art: "skonto" }]).status).toBe("bezahlt");
    expect(zahlStatus({ status: "bezahlt", brutto: 100 }, [{ betrag: 30, art: "zahlung" }, { betrag: 70, art: "ausbuchung" }]))
      .toEqual({ status: "ausgebucht", bezahlt: 30, offen: 0, ausgebucht: 70 });
    expect(zahlStatus({ status: "storniert", brutto: 100 }, []).status).toBe("storniert");
  });
});

describe("Altrechnungen lesen", () => {
  const leer: AltEingabe = { nummer: "", datum: "", kunde: "", netto: "", ust_satz: "", brutto: "", faellig_am: "", bezahlt: "" };
  const heute = "2026-11-13";
  it("Datum in allen Schreibweisen", () => {
    expect(datumLesen("31.12.2025")).toBe("2025-12-31");
    expect(datumLesen("1.3.26")).toBe("2026-03-01");
    expect(datumLesen("2026-02-28")).toBe("2026-02-28");
    expect(datumLesen("30.02.2026")).toBeNull();
    expect(datumLesen("gestern")).toBeNull();
  });
  it("Netto mit Satz → Brutto, Brutto → Netto, beides → USt als Differenz", () => {
    const a = altZeileLesen({ ...leer, nummer: "2025/118", datum: "15.10.2025", kunde: "Huber", netto: "1.000,00" }, heute);
    expect(a.rechnung).toMatchObject({ netto: 1000, ust: 200, brutto: 1200, ust_satz: 20, bezahlt: 0, faellig_am: null });
    const b = altZeileLesen({ ...leer, nummer: "A1", datum: "2025-10-15", kunde: "Huber", brutto: "1130", ust_satz: "13 %" }, heute);
    expect(b.rechnung).toMatchObject({ netto: 1000, ust: 130, brutto: 1130 });
    const c = altZeileLesen({ ...leer, nummer: "A2", datum: "2025-10-15", kunde: "Huber", netto: "100", brutto: "100", ust_satz: "0" }, heute);
    expect(c.rechnung).toMatchObject({ netto: 100, ust: 0, brutto: 100 });
  });
  it("bezahlt: ja, Betrag oder leer", () => {
    const basis = { ...leer, nummer: "A", datum: "1.1.2026", kunde: "K", brutto: "120" };
    expect(altZeileLesen({ ...basis, bezahlt: "ja" }, heute).rechnung?.bezahlt).toBe(120);
    expect(altZeileLesen({ ...basis, bezahlt: "50,5" }, heute).rechnung?.bezahlt).toBe(50.5);
    expect(altZeileLesen({ ...basis, bezahlt: "offen" }, heute).rechnung?.bezahlt).toBe(0);
    expect(altZeileLesen({ ...basis, bezahlt: "200" }, heute).fehler).toMatch(/Mehr bezahlt/);
  });
  it("Fehler mit verständlichem Text", () => {
    expect(altZeileLesen(leer, heute).fehler).toBe("Nummer fehlt");
    expect(altZeileLesen({ ...leer, nummer: "1", datum: "13.13.2025" }, heute).fehler).toMatch(/nicht lesbar/);
    expect(altZeileLesen({ ...leer, nummer: "1", datum: "1.1.2027", kunde: "K", netto: "1" }, heute).fehler).toMatch(/Zukunft/);
    expect(altZeileLesen({ ...leer, nummer: "1", datum: "1.1.2026", netto: "1" }, heute).fehler).toBe("Kunde fehlt");
    expect(altZeileLesen({ ...leer, nummer: "1", datum: "1.1.2026", kunde: "K" }, heute).fehler).toMatch(/Betrag fehlt/);
    expect(altZeileLesen({ ...leer, nummer: "1", datum: "1.1.2026", kunde: "K", netto: "1", faellig_am: "1.12.2025" }, heute).fehler).toMatch(/Fällig vor/);
  });
  it("CSV: Spalten erkennen, englische Zahlen", () => {
    const kopf = ["Re-Nr.", "Datum", "Kunde", "Netto €", "MwSt %", "Brutto", "Fällig am", "Bezahlt"];
    const zu = altSpaltenErkennen(kopf);
    expect(zu).toEqual({ nummer: 0, datum: 1, kunde: 2, netto: 3, ust_satz: 4, brutto: 5, faellig_am: 6, bezahlt: 7 });
    const { eingaben, format } = altAusCsv([["2025-7", "1.7.2025", "Maier", "1250.50", "20", "", "", ""], ["", "", "", "", "", "", "", ""]], zu);
    expect(eingaben).toHaveLength(1);
    expect(format).toBe("punkt");
    expect(altZeileLesen(eingaben[0], heute, format).rechnung).toMatchObject({ netto: 1250.5, brutto: 1500.6 });
  });
  it("CSV: Zahlungsziel ist nicht „bezahlt“, Status schon; Zahldatum = bezahlt", () => {
    const zu = altSpaltenErkennen(["Re-Nr.", "Datum", "Kundenname", "Netto", "MwSt", "Brutto", "Zahlungsziel", "Status"]);
    expect(zu).toEqual({ nummer: 0, datum: 1, kunde: 2, netto: 3, ust_satz: 4, brutto: 5, bezahlt: 7 });
    const { eingaben, format } = altAusCsv([["W2", "02.08.2026", "Größl", "€ 100,00", "20%", "€ 120,00", "14", "bezahlt"]], zu);
    expect(altZeileLesen(eingaben[0], heute, format).rechnung).toMatchObject({ netto: 100, brutto: 120, bezahlt: 120 });
    expect(altZeileLesen({ ...eingaben[0], bezahlt: "12.10.2025" }, heute, format).rechnung?.bezahlt).toBe(120);
  });
});
