import { describe, expect, it } from "vitest";
import { kw, monatDazu, monatsGrenzen, monatsKalender } from "./monatsKalender";

describe("Monatskalender", () => {
  it("Grenzen und Blättern über den Jahreswechsel", () => {
    expect(monatsGrenzen("2026-11")).toEqual({ von: "2026-11-01", bis: "2026-11-30" });
    expect(monatsGrenzen("2028-02")).toEqual({ von: "2028-02-01", bis: "2028-02-29" });
    expect(monatDazu("2026-12", 1)).toBe("2027-01");
    expect(monatDazu("2026-01", -1)).toBe("2025-12");
    expect(kw("2026-11-13")).toBe(46);
    expect(kw("2027-01-01")).toBe(53);
  });
  it("November 2026: Wochen ab Montag, Allerheiligen frei, Soll 38,5 h/Woche", () => {
    const m = monatsKalender("2026-11", [], [], 38.5, "2026-12-01");
    // 1.11. ist ein Sonntag → erste Woche hat nur den Sonntag
    expect(m.wochen[0].tage.filter(Boolean).map((t) => t!.iso)).toEqual(["2026-11-01"]);
    expect(m.wochen[0].tage[6]!.feiertag).toBe("Allerheiligen");
    expect(m.wochen.length).toBe(6);
    // 21 Arbeitstage × 7,7 h
    expect(m.soll).toBe(161.7);
    expect(m.wochen[1].soll).toBe(38.5);
  });
  it("Farben: voll, knapp, fehlt, abwesend, kommt; Summen mit Abwesenheit und intern", () => {
    const m = monatsKalender("2026-11", [
      { datum: "2026-11-02", stunden: 6, projekt_id: "p" },
      { datum: "2026-11-02", stunden: 2, projekt_id: null },
      { datum: "2026-11-03", stunden: 4, projekt_id: "p" },
      { datum: "2026-11-07", stunden: 3, projekt_id: "p" },
      { datum: "2026-11-13", stunden: 2, projekt_id: "p" },
      { datum: "2026-10-30", stunden: 9, projekt_id: "p" },
    ], [
      { art: "urlaub", von: "2026-11-05", bis: "2026-11-06", stunden: null, status: "genehmigt" },
      { art: "krank", von: "2026-11-10", bis: "2026-11-10", stunden: null, status: "beantragt" },
    ], 40, "2026-11-13");
    const tag = (iso: string) => m.wochen.flatMap((w) => w.tage).find((t) => t?.iso === iso)!;
    expect(tag("2026-11-02")).toMatchObject({ ist: 8, intern: 2, ton: "voll" });
    expect(tag("2026-11-03").ton).toBe("knapp");
    expect(tag("2026-11-04").ton).toBe("fehlt");
    expect(tag("2026-11-05")).toMatchObject({ ton: "abwesend", abwesend: { art: "urlaub", stunden: 8 } });
    expect(tag("2026-11-07").ton).toBe("voll"); // Samstag gearbeitet
    expect(tag("2026-11-08").ton).toBe("frei");
    expect(tag("2026-11-10").ton).toBe("fehlt"); // nur beantragt
    expect(tag("2026-11-13").ton).toBe("knapp"); // heute, noch nicht voll
    expect(tag("2026-11-16").ton).toBe("kommt");
    expect(m.ist).toBe(17);
    expect(m.intern).toBe(2);
    expect(m.abwesend).toBe(16);
    // Woche 2.–8.11.: 15 h gebucht + 16 h Urlaub
    expect(m.wochen[1].ist).toBe(31);
    // bis gestern: 9 Arbeitstage × 8 = 72 Soll; Ist 15 + 16 Urlaub
    expect(m.sollBisHeute).toBe(72);
    expect(m.differenz).toBe(-41);
  });
});
