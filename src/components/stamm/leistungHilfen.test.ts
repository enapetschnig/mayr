import { describe, expect, it } from "vitest";
import { kalkulieren, nachKategorie, naechsteNummer, naechsteReihenfolge, passtZuSuche } from "./leistungHilfen";

const l = (id: string, kategorie: string, nummer: string | null, reihenfolge: number, kurztext = id) =>
  ({ id, kategorie, nummer, reihenfolge, kurztext });

const KATALOG = [
  l("a", "Schalter & Steckdosen", "01.01", 101),
  l("b", "Schalter & Steckdosen", "01.09", 109),
  l("c", "Licht", "04.01", 401),
  l("d", "Licht", "04.03", 403),
  l("e", "Prüfung & Doku", "08.02", 802),
];

describe("Nummer und Reihenfolge", () => {
  it("nächste Nummer in der Kategorie, neue Kategorie = nächste Hauptnummer", () => {
    expect(naechsteNummer(KATALOG, "Schalter & Steckdosen")).toBe("01.10");
    expect(naechsteNummer(KATALOG, "licht")).toBe("04.04");
    expect(naechsteNummer(KATALOG, "Photovoltaik")).toBe("09.01");
    expect(naechsteNummer(KATALOG, "")).toBe("");
    expect(naechsteNummer([l("x", "A", "Pauschale", 1)], "A")).toBe("");
    expect(naechsteNummer([], "Neu")).toBe("");
  });
  it("Reihenfolge: ans Ende der Kategorie, neue Kategorie auf den nächsten Hunderter", () => {
    expect(naechsteReihenfolge(KATALOG, "Licht")).toBe(404);
    expect(naechsteReihenfolge(KATALOG, "Photovoltaik")).toBe(901);
    expect(naechsteReihenfolge([], "Neu")).toBe(101);
    // die Leistung selbst zählt nicht mit (Umzug in eine andere Kategorie)
    expect(naechsteReihenfolge(KATALOG, "Prüfung & Doku", "e")).toBe(501);
  });
});

describe("Katalog", () => {
  it("Kategorien nach ihrer ersten Leistung, darin nach Reihenfolge und Nummer", () => {
    const g = nachKategorie([KATALOG[3], KATALOG[4], KATALOG[1], KATALOG[0], KATALOG[2], l("f", "", "10", 0)]);
    expect(g.map((x) => x.kategorie)).toEqual(["Allgemein", "Schalter & Steckdosen", "Licht", "Prüfung & Doku"]);
    expect(g[1].leistungen.map((x) => x.id)).toEqual(["a", "b"]);
    expect(g[2].leistungen.map((x) => x.id)).toEqual(["c", "d"]);
  });
  it("Suche: alle Wörter, auch in Suchwörtern und Langtext", () => {
    const x = { nummer: "01.01", kurztext: "Steckdose UP komplett", langtext: "inkl. Gerätedose", suchwoerter: "schuko dose", kategorie: "Schalter" };
    expect(passtZuSuche(x, "schuko up")).toBe(true);
    expect(passtZuSuche(x, "01.01 geräte")).toBe(true);
    expect(passtZuSuche(x, "schuko aufputz")).toBe(false);
    expect(passtZuSuche(x, "  ")).toBe(true);
  });
});

describe("Kalkulation", () => {
  const firma = { stundensatz: 72, material_aufschlag: 35 };
  const material = [
    { menge: 1, artikel: { ek_preis: 4, vk_preis: null, listenpreis: null } },
    { menge: 2, artikel: { ek_preis: 1, vk_preis: 3, listenpreis: null } },
  ];
  it("berechnet: Material-VK + Minuten × Stundensatz, Rohertrag = Preis − Material-EK", () => {
    const k = kalkulieren({ preis: null, minuten: 25 }, material, firma);
    expect(k).toMatchObject({ materialEk: 6, materialVk: 11.4, lohn: 30, berechnet: 41.4, preis: 41.4, rohertrag: 35.4 });
    expect(k.jeStunde).toBe(84.96);
    expect(k.rohertragProzent).toBeCloseTo(85.507, 2);
  });
  it("fester Preis geht vor; ohne Minuten kein Ertrag je Stunde", () => {
    const k = kalkulieren({ preis: 50, minuten: 0 }, material, firma);
    expect(k).toMatchObject({ preis: 50, berechnet: 11.4, rohertrag: 44, jeStunde: null });
    expect(kalkulieren({ preis: null, minuten: 0 }, [], firma)).toMatchObject({ preis: 0, rohertragProzent: null });
  });
});
