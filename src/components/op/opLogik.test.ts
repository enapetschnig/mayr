import { describe, expect, it } from "vitest";
import { mahnFristAbgelaufen, mahnSpesen, mahnVorschlag, naechsteStufe, offenBetrag, verzugTage, verzugszinsen } from "./opLogik";

const firma = { mahn_frist_tage: 10, mahn_spesen: [0, 10, 20], verzugszinsen: 4 };

describe("offenBetrag", () => {
  it("zieht Teilzahlungen ab und wird nie negativ", () => {
    expect(offenBetrag(1200, [])).toBe(1200);
    expect(offenBetrag("1200.00", [{ betrag: 500 }, { betrag: "200.10" }])).toBe(499.9);
    expect(offenBetrag(100, [{ betrag: 150 }])).toBe(0);
  });
});

describe("verzugTage", () => {
  it("zählt erst nach der Fälligkeit", () => {
    expect(verzugTage("2026-11-01", "2026-11-01")).toBe(0);
    expect(verzugTage("2026-11-01", "2026-11-11")).toBe(10);
    expect(verzugTage(null, "2026-11-11")).toBe(0);
    // über die Zeitumstellung (25.10.) hinweg ganze Tage
    expect(verzugTage("2026-10-20", "2026-10-30")).toBe(10);
  });
});

describe("verzugszinsen", () => {
  it("rechnet Satz p. a. tageweise", () => {
    expect(verzugszinsen(1000, 4, 365)).toBe(40);
    expect(verzugszinsen(1000, 4, 30)).toBe(3.29);
    expect(verzugszinsen(1000, 0, 30)).toBe(0);
    expect(verzugszinsen(0, 4, 30)).toBe(0);
  });
});

describe("mahnSpesen / naechsteStufe", () => {
  it("liest Spesen je Stufe, kaputte Werte sind 0", () => {
    expect(mahnSpesen([0, 10, 20], 2)).toBe(10);
    expect(mahnSpesen([0, "x", 20], 2)).toBe(0);
    expect(mahnSpesen(null, 3)).toBe(0);
  });
  it("geht 1 → 2 → 3 und dann nicht weiter", () => {
    expect(naechsteStufe([])).toBe(1);
    expect(naechsteStufe([{ stufe: 1 }])).toBe(2);
    expect(naechsteStufe([{ stufe: 1 }, { stufe: 2 }])).toBe(3);
    expect(naechsteStufe([{ stufe: 3 }])).toBeNull();
  });
});

describe("mahnVorschlag", () => {
  const beleg = { brutto: 1200, faellig_am: "2026-10-01", status: "offen" };
  it("Zahlungserinnerung ohne Zinsen, Frist aus den Einstellungen", () => {
    expect(mahnVorschlag(beleg, [{ betrag: 200 }], [], firma, "2026-10-31")).toEqual({
      stufe: 1, offen: 1000, spesen: 0, zinsen: 0, frist_bis: "2026-11-10", tage: 30,
    });
  });
  it("1. Mahnung mit Spesen und Zinsen ab Fälligkeit", () => {
    const v = mahnVorschlag(beleg, [], [{ stufe: 1, datum: "2026-10-15", frist_bis: "2026-10-25" }], firma, "2026-10-31");
    expect(v).toMatchObject({ stufe: 2, offen: 1200, spesen: 10, zinsen: 3.95 });
  });
  it("nichts zu mahnen: bezahlt, noch nicht fällig, letzte Mahnung schon draußen", () => {
    expect(mahnVorschlag({ ...beleg, status: "bezahlt" }, [], [], firma, "2026-10-31")).toBeNull();
    expect(mahnVorschlag(beleg, [], [], firma, "2026-09-30")).toBeNull();
    expect(mahnVorschlag(beleg, [{ betrag: 1200 }], [], firma, "2026-10-31")).toBeNull();
    expect(mahnVorschlag(beleg, [], [{ stufe: 3, datum: "2026-10-20", frist_bis: "2026-10-30" }], firma, "2026-10-31")).toBeNull();
  });
});

describe("mahnFristAbgelaufen", () => {
  it("schaut auf die Frist der höchsten Stufe", () => {
    expect(mahnFristAbgelaufen([], "2026-10-31")).toBe(true);
    expect(mahnFristAbgelaufen([{ stufe: 1, datum: "2026-10-20", frist_bis: "2026-10-30" }], "2026-10-31")).toBe(true);
    expect(mahnFristAbgelaufen([
      { stufe: 1, datum: "2026-10-01", frist_bis: "2026-10-11" },
      { stufe: 2, datum: "2026-10-25", frist_bis: "2026-11-04" },
    ], "2026-10-31")).toBe(false);
  });
});
