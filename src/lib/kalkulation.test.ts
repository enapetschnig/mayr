import { describe, expect, it } from "vitest";
import { arbeitszeitText, aufschlaegeSetzen, aufschlagAus, kalkPreis, lohnarten, rohertrag, stundensaetzeLesen, umProzent } from "./kalkulation";

describe("Kalkulation", () => {
  it("liest die weiteren Stundensätze", () => {
    expect(stundensaetzeLesen([{ name: "Meister", satz: 85 }, { name: " Lehrling ", satz: "42" }])).toEqual([
      { name: "Meister", satz: 85 }, { name: "Lehrling", satz: 42 },
    ]);
    expect(stundensaetzeLesen([{ name: "", satz: 50 }, { name: "Null", satz: 0 }, "x", null])).toEqual([]);
    expect(stundensaetzeLesen(null)).toEqual([]);
  });

  it("Standard zuerst", () => {
    const l = lohnarten({ stundensaetze: [{ name: "Meister", satz: 85 }] }, 72);
    expect(l.map((x) => [x.name, x.satz])).toEqual([["Standard", 72], ["Meister", 85]]);
    expect(arbeitszeitText(l[0])).toBe("Arbeitszeit");
    expect(arbeitszeitText(l[1])).toBe("Arbeitszeit Meister");
  });

  it("Preis aus Einkauf, Aufschlag und Arbeitszeit", () => {
    // 4,59 € EK + 35 % = 6,20; 25 min × 72 €/h = 30,00
    expect(kalkPreis({ ek: 4.59, aufschlag: 35, minuten: 25, satz: 72 })).toBe(36.2);
    expect(kalkPreis({ ek: 0, aufschlag: 35, minuten: 60, satz: 85 })).toBe(85);
    expect(kalkPreis({ ek: 10, aufschlag: 0, minuten: 0, satz: 72 })).toBe(10);
  });

  it("Preise um Prozent ändern", () => {
    expect(umProzent(100, 5)).toBe(105);
    expect(umProzent(39.07, -3)).toBe(37.9);
  });

  it("Rohertrag", () => {
    expect(rohertrag(1000, 300, 10)).toEqual({ bleibt: 700, jeStunde: 70, anteil: 0.7 });
    expect(rohertrag(0, 0, 0)).toEqual({ bleibt: 0, jeStunde: null, anteil: null });
  });

  it("Aufschlag aus dem Preis zurückrechnen", () => {
    expect(aufschlagAus({ preis: 6.2, ek: 4.59, minuten: 0, satz: 72 })).toBe(35.1);
    // 36,20 = 6,20 Material + 30,00 Arbeit
    expect(aufschlagAus({ preis: 36.2, ek: 4.59, minuten: 25, satz: 72 })).toBe(35.1);
    // unter Einkauf: negativer Aufschlag
    expect(aufschlagAus({ preis: 9, ek: 10, minuten: null, satz: 72 })).toBe(-10);
    expect(aufschlagAus({ preis: 50, ek: null, minuten: 30, satz: 72 })).toBeNull();
  });

  it("Aufschläge für den ganzen Beleg", () => {
    const liste = [
      { art: "titel", einheit: "", einzelpreis: 0, ek_preis: null, minuten: null },
      { art: "artikel", einheit: "Stk", einzelpreis: 13, ek_preis: 10, minuten: null },
      { art: "leistung", einheit: "Stk", einzelpreis: 43, ek_preis: 10, minuten: 25 },
      { art: "arbeit", einheit: "h", einzelpreis: 72, ek_preis: null, minuten: null },
      { art: "arbeit", einheit: "h", einzelpreis: 85, ek_preis: null, minuten: null },
      { art: "pauschale", einheit: "pausch", einzelpreis: 150, ek_preis: null, minuten: null },
    ];
    // nur Material 40 %: Satz bleibt 72
    expect(aufschlaegeSetzen(liste, { material: 40, satz: null }, 72)).toEqual([null, 14, 44, null, null, null]);
    // nur Stundensatz 80: Aufschlag bleibt (30 %), Meister bleibt
    expect(aufschlaegeSetzen(liste, { material: null, satz: 80 }, 72)).toEqual([null, null, 46.33, 80, null, null]);
    // auch nach unten
    expect(aufschlaegeSetzen(liste, { material: 10, satz: 65 }, 72)).toEqual([null, 11, 38.08, 65, null, null]);
  });
});
