import { describe, expect, it } from "vitest";
import {
  aufschlagAus, ausfassVorschlag, besterLieferant, bewegungsGruppe, ekAusListe, ekVon, istNebenkosten, lagerDelta, lieferantPasst,
  mitBestandDanach, mitBestemLieferant, nummerNorm, zeileZuordnen, type WeitererLieferant,
} from "./artikelLogik";
import { artikelVk, vkHerkunft } from "@/lib/preise";

const w = (lieferant: string, ek: number | null, extra: Partial<WeitererLieferant> = {}): WeitererLieferant =>
  ({ lieferant, lieferanten_nr: `${lieferant}-1`, ek_preis: ek, bevorzugt: false, ...extra });

describe("Preise je Artikel", () => {
  const firma = { material_aufschlag: 25 };
  it("fester VK vor Aufschlag des Artikels vor dem des Betriebs", () => {
    expect(artikelVk({ vk_preis: 50, ek_preis: 10, listenpreis: 20, aufschlag: 100 }, firma)).toBe(50);
    expect(artikelVk({ vk_preis: null, ek_preis: 10, listenpreis: 20, aufschlag: 100 }, firma)).toBe(20);
    expect(artikelVk({ vk_preis: null, ek_preis: 10, listenpreis: 20, aufschlag: null }, firma)).toBe(12.5);
    expect(artikelVk({ vk_preis: null, ek_preis: 10, listenpreis: 20 }, firma)).toBe(12.5);
    // 0 % ist ein eigener Aufschlag, nicht „leer“
    expect(artikelVk({ vk_preis: null, ek_preis: 10, listenpreis: null, aufschlag: 0 }, firma)).toBe(10);
  });
  it("sagt, woher der VK kommt", () => {
    expect(vkHerkunft({ vk_preis: 5, ek_preis: 1, listenpreis: null }, firma).art).toBe("fest");
    expect(vkHerkunft({ vk_preis: null, ek_preis: 1, listenpreis: null, aufschlag: 35 }, firma).text).toBe("Aufschlag 35 % (Artikel)");
    expect(vkHerkunft({ vk_preis: null, ek_preis: 1, listenpreis: null }, firma).text).toBe("Standard · 25 %");
    expect(vkHerkunft({ vk_preis: null, ek_preis: null, listenpreis: 3 }, firma).art).toBe("liste");
  });
  it("Aufschlag aus EK und VK", () => {
    expect(aufschlagAus(10, 13.5)).toBe(35);
    expect(aufschlagAus(0, 13.5)).toBeNull();
    expect(aufschlagAus(null, 13.5)).toBeNull();
  });
});

describe("Lieferanten", () => {
  it("EK aus Liste und Rabatt", () => {
    expect(ekAusListe(100, 32)).toBe(68);
    expect(ekAusListe(null, 32)).toBeNull();
    expect(ekVon({ ek_preis: null, listenpreis: 10, rabatt: 40 })).toBe(6);
    expect(ekVon({ ek_preis: 7, listenpreis: 10, rabatt: 40 })).toBe(7);
  });
  it("bevorzugt vor günstigst", () => {
    const haupt = { lieferant: "Sonepar", ek_preis: 10, artikelnummer: "S1" };
    expect(besterLieferant(haupt, []).grund).toBe("einziger");
    expect(besterLieferant(haupt, [w("Rexel", 9)])).toMatchObject({ lieferant: "Rexel", ek_preis: 9, quelle: "weitere", grund: "guenstigst" });
    expect(besterLieferant(haupt, [w("Rexel", 11)])).toMatchObject({ lieferant: "Sonepar", quelle: "haupt" });
    expect(besterLieferant(haupt, [w("Rexel", 9), w("Schäcke", 12, { bevorzugt: true })])).toMatchObject({ lieferant: "Schäcke", grund: "bevorzugt" });
  });
  it("Gleichstand und fehlende Preise: Hauptlieferant bleibt", () => {
    expect(besterLieferant({ lieferant: "Sonepar", ek_preis: 10 }, [w("Rexel", 10)]).lieferant).toBe("Sonepar");
    expect(besterLieferant({ lieferant: "Sonepar", ek_preis: 10 }, [w("Rexel", null)]).lieferant).toBe("Sonepar");
    // Hauptlieferant ohne Preis: der mit Preis gewinnt
    expect(besterLieferant({ lieferant: "Eigen", ek_preis: null }, [w("Rexel", 4)]).lieferant).toBe("Rexel");
  });
  it("Bestellvorschlag nimmt Lieferant und EK des besten", () => {
    const a = [{ id: "a", lieferant: "Sonepar", ek_preis: 10, bezeichnung: "X" }, { id: "b", lieferant: "Sonepar", ek_preis: 5, bezeichnung: "Y" }];
    const r = mitBestemLieferant(a, new Map([["a", [w("Rexel", 8)]]]));
    expect(r[0]).toMatchObject({ lieferant: "Rexel", ek_preis: 8 });
    expect(r[1]).toBe(a[1]);
  });
});

describe("Bewegungen", () => {
  const b = (id: string, art: string, menge: number, ort: string | null, zeit: string, notiz: string | null = null) =>
    ({ id, art, menge, lagerort_id: ort, created_at: zeit, notiz });
  it("Vorzeichen je Art, Direkt bewegt kein Lager", () => {
    expect(lagerDelta(b("1", "zugang", 5, "L", ""))).toBe(5);
    expect(lagerDelta(b("1", "ausfassung", 2, "L", ""))).toBe(-2);
    expect(lagerDelta(b("1", "korrektur", -3, "L", ""))).toBe(-3);
    expect(lagerDelta(b("1", "direkt", 4, null, ""))).toBe(0);
  });
  it("Bestand danach, neueste zuerst; je Lagerort", () => {
    const liste = [
      b("3", "ausfassung", 4, "BUS", "2026-11-03T08:00:00Z"),
      b("1", "zugang", 10, "L", "2026-11-01T08:00:00Z"),
      b("2", "abgang", 5, "L", "2026-11-02T08:00:00Z", "Umbuchung Lager → Bus"),
      b("2b", "zugang", 5, "BUS", "2026-11-02T08:00:00Z", "Umbuchung Lager → Bus"),
    ];
    const alle = mitBestandDanach(liste);
    expect(alle.map((x) => [x.id, x.bestand])).toEqual([["3", 6], ["2b", 10], ["2", 5], ["1", 10]]);
    const bus = mitBestandDanach(liste, "BUS");
    expect(bus[0]).toMatchObject({ id: "3", delta: -4, bestand: 1 });
    expect(bewegungsGruppe(liste[2])).toBe("umbuchung");
    expect(bewegungsGruppe(liste[1])).toBe("zugang");
    expect(bewegungsGruppe(liste[0])).toBe("projekt");
  });
});

describe("Lieferschein-Zeile → Artikel", () => {
  const k = [
    { id: "son", lieferant: "Sonepar", artikelnummer: "120120621", hersteller_nr: "MBN106", ean: "3250614310065" },
    { id: "rex", lieferant: "Rexel", artikelnummer: "R-7788", hersteller_nr: "MBN106", ean: null, weitere: [{ lieferant: "Schäcke", lieferanten_nr: "SCH 4711" }] },
  ];
  it("Nummern und Lieferanten vergleichbar", () => {
    expect(nummerNorm(" 120.120-621 ")).toBe("120120621");
    expect(lieferantPasst("Sonepar Österreich GmbH", "Sonepar")).toBe(true);
    expect(lieferantPasst("Rexel Austria", "Sonepar")).toBe(false);
    expect(lieferantPasst(null, "Sonepar")).toBe(false);
  });
  it("Artikelnummer des Lieferanten, EAN, Hersteller-Nr.", () => {
    expect(zeileZuordnen({ artikelnummer: "120 120 621" }, "Sonepar GmbH", k)).toMatchObject({ artikel_id: "son", sicher: true });
    expect(zeileZuordnen({ artikelnummer: "3250614310065" }, "irgendwer", k)).toMatchObject({ artikel_id: "son", grund: "EAN" });
    expect(zeileZuordnen({ artikelnummer: "SCH-4711" }, "Schäcke Elektro", k)).toMatchObject({ artikel_id: "rex", sicher: true });
    // dieselbe Hersteller-Nr. bei zwei Artikeln: Vorschlag, aber nicht sicher
    expect(zeileZuordnen({ artikelnummer: "MBN106" }, "Großhandel", k)).toMatchObject({ sicher: false });
    expect(zeileZuordnen({ artikelnummer: "" }, "Sonepar", k)).toBeNull();
    expect(zeileZuordnen({ artikelnummer: "999999" }, "Sonepar", k)).toBeNull();
  });
});

describe("Ausfassen laut Angebot", () => {
  it("offen = Bedarf − schon auf dem Projekt, Erledigtes zuletzt", () => {
    const bedarf = new Map([["a", 10], ["b", 2], ["c", 4]]);
    const v = ausfassVorschlag(bedarf, new Map([["b", 2], ["c", 1.5], ["x", 9]]));
    expect(v).toEqual([
      { artikel_id: "a", soll: 10, schon: 0, offen: 10 },
      { artikel_id: "c", soll: 4, schon: 1.5, offen: 2.5 },
      { artikel_id: "b", soll: 2, schon: 2, offen: 0 },
    ]);
  });
  it("mehr ausgefasst als angeboten: offen 0", () => {
    expect(ausfassVorschlag(new Map([["a", 1]]), new Map([["a", 3]]))[0]).toMatchObject({ offen: 0, schon: 3 });
  });
});

describe("Nebenkosten auf dem Lieferschein", () => {
  it("Fracht, Verpackung, Maut ja — Ware nein", () => {
    for (const t of ["Frachtkostenpauschale", "Versandkosten", "Verpackung", "Mautzuschlag", "Mindermengenzuschlag"]) expect(istNebenkosten(t)).toBe(true);
    for (const t of ["Modulklemmen-Set Mitte/Ende", "NYM-J 3x1,5", "Dachhaken K2 CrossHook", ""]) expect(istNebenkosten(t)).toBe(false);
  });
});
