import { describe, expect, it } from "vitest";
import { abzugPosition, naechsteTeilNr, schlussAufstellung, schonVerlangt, teilBetrag, teilText } from "./teilrechnung";
import { positionsNummern, zwischensummen } from "./editor";

describe("teilBetrag", () => {
  it("Prozent vom Angebot oder fester Betrag", () => {
    expect(teilBetrag(12000, { art: "prozent", wert: 30 })).toBe(3600);
    expect(teilBetrag(9999.99, { art: "prozent", wert: 33.3 })).toBe(3330);
    expect(teilBetrag(12000, { art: "betrag", wert: 2500.555 })).toBe(2500.56);
  });
  it("lehnt 0, negativ, leer und über 100 % ab", () => {
    expect(teilBetrag(12000, { art: "prozent", wert: 0 })).toBeNull();
    expect(teilBetrag(12000, { art: "prozent", wert: 101 })).toBeNull();
    expect(teilBetrag(12000, { art: "betrag", wert: -5 })).toBeNull();
    expect(teilBetrag(12000, { art: "betrag", wert: null })).toBeNull();
  });
});

describe("Nummern und Summe der Teilrechnungen", () => {
  const teile = [
    { teil_nr: 1, netto: 3600, status: "bezahlt" },
    { teil_nr: 2, netto: "2400.00", status: "storniert" },
    { teil_nr: 3, netto: 1000, status: "entwurf" },
  ];
  it("stornierte zählen nicht", () => {
    expect(schonVerlangt(teile)).toBe(4600);
    expect(naechsteTeilNr(teile)).toBe(4);
    expect(naechsteTeilNr([])).toBe(1);
  });
  it("Text nennt Anteil und Angebot", () => {
    expect(teilText(1, "AN-2026-001", 12000, 30)).toBe("1. Teilrechnung laut Angebot AN-2026-001: 30 % von € 12.000,00 netto");
    expect(teilText(2, null, 12000, null)).toBe("2. Teilrechnung");
  });
});

describe("Abzug in der Schlussrechnung", () => {
  const p = abzugPosition({ id: "t1", teil_nr: 1, nummer: "RE-2026-003", datum: "2026-10-01", netto: "3600.00" });
  it("negative Pauschale mit Herkunft", () => {
    expect(p.art).toBe("abzug");
    expect(p.einzelpreis).toBe("-3600,00");
    expect(p.bezeichnung).toBe("abzüglich 1. Teilrechnung RE-2026-003 vom 01.10.2026");
    expect(p.quelle?.teil).toEqual(["t1"]);
  });
  it("ohne Nummer und ohne Einfluss auf die Zwischensumme", () => {
    expect(positionsNummern(["titel", "leistung", "abzug"])).toEqual(["1", "1.1", ""]);
    expect(zwischensummen([{ art: "titel", gesamt: 0 }, { art: "leistung", gesamt: 100 }, { art: "abzug", gesamt: -60 }])).toEqual({ 0: 100 });
  });
  it("Aufstellung: Gesamtleistung = Rest + Abzüge, auf den Cent", () => {
    const a = schlussAufstellung({ netto: 8400, ust: 1680, brutto: 10080 }, [{ text: "1.", netto: 3600, ust: 720, brutto: 4320 }]);
    expect(a).toMatchObject({ gesamtNetto: 12000, gesamtUst: 2400, gesamtBrutto: 14400 });
  });
});
