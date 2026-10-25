import { describe, expect, it } from "vitest";
import { artikelZeilen, ekBerechnen, hochladen, pakete, rabattFuer, type ImportArtikel, type RabattEinstellung } from "./artikelImport";

const artikel = (x: Partial<ImportArtikel>): ImportArtikel => ({
  artikelnummer: "1", bezeichnung: "Steckdose", langtext: null, einheit: "Stk", ean: null, hersteller: null,
  hersteller_nr: null, warengruppe: null, rabattgruppe: null, listenpreis: null, netto: null, ...x,
});
const ohneRabatt: RabattEinstellung = { gruppen: {}, pauschal: null, nettoVorziehen: true };

describe("Rabatt und EK", () => {
  it("Gruppe vor pauschal; 0 % in der Gruppe ist ein Rabatt, leer nicht", () => {
    const r: RabattEinstellung = { gruppen: { A: 40, B: 0, C: null }, pauschal: 25, nettoVorziehen: true };
    expect(rabattFuer({ rabattgruppe: "A" }, r)).toBe(40);
    expect(rabattFuer({ rabattgruppe: "B" }, r)).toBe(0);
    expect(rabattFuer({ rabattgruppe: "C" }, r)).toBe(25);
    expect(rabattFuer({ rabattgruppe: null }, r)).toBe(25);
    expect(rabattFuer({ rabattgruppe: "A" }, ohneRabatt)).toBeNull();
  });
  it("EK = Liste − Rabatt, sonst Nettopreis; Nettopreis aus der Datei auf Wunsch zuerst", () => {
    const r: RabattEinstellung = { gruppen: { A: 40 }, pauschal: null, nettoVorziehen: true };
    expect(ekBerechnen({ rabattgruppe: "A", listenpreis: 10, netto: null }, r)).toBe(6);
    expect(ekBerechnen({ rabattgruppe: "A", listenpreis: 10, netto: 5.5 }, r)).toBe(5.5);
    expect(ekBerechnen({ rabattgruppe: "A", listenpreis: 10, netto: 5.5 }, { ...r, nettoVorziehen: false })).toBe(6);
    expect(ekBerechnen({ rabattgruppe: "X", listenpreis: 10, netto: null }, r)).toBeNull();
    expect(ekBerechnen({ rabattgruppe: null, listenpreis: 0.895, netto: null }, { ...r, pauschal: 35 })).toBe(0.5818);
    expect(ekBerechnen({ rabattgruppe: null, listenpreis: null, netto: 3.21 }, ohneRabatt)).toBe(3.21);
  });
});

describe("Zeilen für die Tabelle", () => {
  it("nur Felder mit Wert, doppelte Nummern: die letzte gilt", () => {
    const { zeilen, doppelt, ohneNummer } = artikelZeilen([
      artikel({ artikelnummer: "1", bezeichnung: "Alt" }),
      artikel({ artikelnummer: "2", ean: "4012345678901", listenpreis: 10, rabattgruppe: "A" }),
      artikel({ artikelnummer: " ", bezeichnung: "ohne" }),
      artikel({ artikelnummer: "1", bezeichnung: "Neu", hersteller: "ZZ" }),
    ], { lieferant: " TEST-Import ", quelle: "csv", rabatt: { gruppen: { A: 50 }, pauschal: null, nettoVorziehen: true } });
    expect(doppelt).toBe(1);
    expect(ohneNummer).toBe(1);
    expect(zeilen).toEqual([
      { lieferant: "TEST-Import", artikelnummer: "2", bezeichnung: "Steckdose", einheit: "Stk", quelle: "csv",
        ean: "4012345678901", rabattgruppe: "A", listenpreis: 10, ek_preis: 5 },
      { lieferant: "TEST-Import", artikelnummer: "1", bezeichnung: "Neu", einheit: "Stk", quelle: "csv", hersteller: "ZZ" },
    ]);
  });
  it("EAN in der Schreibweise, die der Scanner sucht", () => {
    const { zeilen } = artikelZeilen([
      artikel({ artikelnummer: "1", ean: "04012345678901" }), // GTIN-14 mit führender 0
      artikel({ artikelnummer: "2", ean: "036000291452" }), // UPC-A
      artikel({ artikelnummer: "3", ean: "14012345678908" }), // Karton: bleibt
    ], { lieferant: "TEST", quelle: "datanorm", rabatt: ohneRabatt });
    expect(zeilen.map((z) => z.ean)).toEqual(["4012345678901", "0036000291452", "14012345678908"]);
  });
  it("Pakete: gleiche Felder je Paket, höchstens 500", () => {
    const zeilen = [
      ...Array.from({ length: 1200 }, (_, i) => ({ a: i, b: 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ b: 2, a: i, c: 3 })),
    ];
    const p = pakete(zeilen);
    expect(p.map((x) => x.length)).toEqual([500, 500, 200, 3]);
    for (const paket of p) {
      const k = Object.keys(paket[0]).sort().join();
      expect(paket.every((z) => Object.keys(z).sort().join() === k)).toBe(true);
    }
  });
});

describe("Hochladen", () => {
  it("zählt neu/aktualisiert, überspringt fehlerhafte Pakete, Fortschritt", async () => {
    const liste = [[1, 2], [3], [4, 5, 6]];
    const fortschritt: number[] = [];
    const e = await hochladen(liste, async (p) => {
      if (p[0] === 3) throw new Error("kaputt");
      return { neu: p.length - 1, aktualisiert: 1 };
    }, { fortschritt: (n) => fortschritt.push(n) });
    expect(e).toEqual({ neu: 3, aktualisiert: 2, fehler: 1, meldungen: ["kaputt"], offen: 0 });
    expect(fortschritt).toEqual([2, 3, 6]);
  });
  it("bricht nach drei Fehlern hintereinander ab und auf Wunsch", async () => {
    const liste = [[1], [2], [3], [4], [5]];
    const e = await hochladen(liste, async () => { throw new Error("RLS"); });
    expect(e).toMatchObject({ fehler: 3, offen: 2, meldungen: ["RLS"] });
    let n = 0;
    const e2 = await hochladen(liste, async () => ({ neu: 1, aktualisiert: 0 }), { abbrechen: () => n++ >= 2 });
    expect(e2).toMatchObject({ neu: 2, offen: 3 });
  });
  it("mehrere Pakete gleichzeitig", async () => {
    const liste = Array.from({ length: 10 }, (_, i) => [i]);
    let gleichzeitig = 0;
    let max = 0;
    const e = await hochladen(liste, async () => {
      gleichzeitig++;
      max = Math.max(max, gleichzeitig);
      await new Promise((r) => setTimeout(r, 5));
      gleichzeitig--;
      return { neu: 1, aktualisiert: 0 };
    }, { parallel: 3 });
    expect(e.neu).toBe(10);
    expect(max).toBe(3);
  });
});
