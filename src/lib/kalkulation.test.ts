import { describe, expect, it } from "vitest";
import { arbeitszeitText, kalkPreis, lohnarten, rohertrag, stundensaetzeLesen, umProzent } from "./kalkulation";

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
});
