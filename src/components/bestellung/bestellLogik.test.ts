import { describe, expect, it } from "vitest";
import { bedarfAusAngebot, bestellSumme, offeneMenge, positionFuerArtikel, vorschlagAusBedarf, vorschlagAusLager, aufBestellungenVerteilen, aufPackung } from "./bestellLogik";

const art = (id: string, lieferant: string | null, bezeichnung = id, ek: number | null = 1) => ({ id, lieferant, ek_preis: ek, bezeichnung });

describe("vorschlagAusLager", () => {
  it("gruppiert je Lieferant, zieht schon Bestelltes ab und rundet auf", () => {
    const v = vorschlagAusLager([
      { artikel: art("a", "Sonepar", "Schalter"), fehlt: 7.2 },
      { artikel: art("b", "Rexel", "Kabel"), fehlt: 100 },
      { artikel: art("c", "Sonepar", "Abzweigdose"), fehlt: 5 },
      { artikel: art("d", null, "Eigenbau"), fehlt: 2 },
    ], new Map([["b", 40], ["c", 5]]));
    expect(v.map((g) => g.lieferant)).toEqual(["Rexel", "Sonepar", "Eigen"]);
    expect(v[0].positionen).toEqual([{ artikel_id: "b", menge: 60, ek_preis: 1, bezeichnung: "Kabel" }]);
    expect(v[1].positionen).toEqual([{ artikel_id: "a", menge: 8, ek_preis: 1, bezeichnung: "Schalter" }]);
    expect(v[2].positionen[0].artikel_id).toBe("d");
  });
  it("nichts, wenn alles schon bestellt ist", () => {
    expect(vorschlagAusLager([{ artikel: art("a", "X"), fehlt: 3 }], new Map([["a", 3]]))).toEqual([]);
  });
});

describe("bedarfAusAngebot", () => {
  it("Artikel direkt, Leistungen über ihr Material, Titel und Texte nicht", () => {
    const b = bedarfAusAngebot([
      { art: "titel", menge: 1, artikel_id: null, leistung_id: null },
      { art: "leistung", menge: 12, artikel_id: null, leistung_id: "steckdose" },
      { art: "artikel", menge: 2.5, artikel_id: "kabel", leistung_id: null },
      { art: "leistung", menge: 3, artikel_id: null, leistung_id: "unbekannt" },
    ], new Map([["steckdose", [{ artikel_id: "dose", menge: 1 }, { artikel_id: "kabel", menge: 4.5 }]]]));
    expect(Object.fromEntries(b)).toEqual({ dose: 12, kabel: 57 });
  });
  it("vorschlagAusBedarf lässt unbekannte Artikel weg", () => {
    const v = vorschlagAusBedarf(new Map([["a", 3], ["weg", 2]]), [art("a", "Rexel")]);
    expect(v).toEqual([{ lieferant: "Rexel", positionen: [{ artikel_id: "a", menge: 3, ek_preis: 1, bezeichnung: "a" }] }]);
  });
});

describe("Mengen", () => {
  it("offene Menge nie negativ", () => {
    expect(offeneMenge({ menge: 10, geliefert: 4 })).toBe(6);
    expect(offeneMenge({ menge: "10", geliefert: "12" })).toBe(0);
  });
  it("Scan trifft zuerst die Position mit offenem Rest", () => {
    const pos = [
      { id: "1", artikel_id: "a", menge: 5, geliefert: 5 },
      { id: "2", artikel_id: "a", menge: 3, geliefert: 0 },
      { id: "3", artikel_id: "b", menge: 1, geliefert: 0 },
    ];
    expect(positionFuerArtikel(pos, "a", () => 0)?.id).toBe("2");
    expect(positionFuerArtikel(pos, "a", (p) => (p.id === "2" ? 3 : 0))?.id).toBe("1");
    expect(positionFuerArtikel(pos, "x", () => 0)).toBeNull();
  });
  it("Summe", () => {
    expect(bestellSumme([{ menge: 3, ek_preis: 1.115 }, { menge: 2, ek_preis: null }])).toBe(3.35);
  });
});

describe("aufBestellungenVerteilen", () => {
  const offen = [
    { id: "p1", artikel_id: "a", menge: 10, geliefert: 6 },
    { id: "p2", artikel_id: "b", menge: 5, geliefert: 0 },
    { id: "p3", artikel_id: "a", menge: 20, geliefert: 0 },
  ];
  it("älteste Bestellung zuerst, Rest auf die nächste", () => {
    expect(aufBestellungenVerteilen("a", 10, offen)).toEqual([{ position: "p1", menge: 4 }, { position: "p3", menge: 6 }]);
  });
  it("mehr als bestellt: Überschuss ohne Bestellung ins Lager", () => {
    expect(aufBestellungenVerteilen("a", 30, offen)).toEqual([{ position: "p1", menge: 4 }, { position: "p3", menge: 20 }, { position: null, menge: 6 }]);
  });
  it("nichts bestellt: eine Buchung ohne Bestellung", () => {
    expect(aufBestellungenVerteilen("x", 2.5, offen)).toEqual([{ position: null, menge: 2.5 }]);
  });
});

describe("aufPackung", () => {
  it("rundet auf ganze Packungen", () => {
    expect(aufPackung(432.5, 100)).toBe(500);
    expect(aufPackung(300, 100)).toBe(300);
    expect(aufPackung(7.2, null)).toBe(8);
    expect(aufPackung(0.5, 0.25)).toBe(0.5);
  });
});
