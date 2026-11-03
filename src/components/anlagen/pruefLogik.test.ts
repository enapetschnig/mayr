import { describe, expect, it } from "vitest";
import {
  erderBewerten, ergebnisVorschlag, faelligkeit, maengelText, messungAusZeile, messungBewerten, messungenLesen, plusMonate,
  schutzLesen, zeileAusMessung, zeileLeer, zsMax, type Messung,
} from "./pruefLogik";

const m = (x: Partial<Messung>): Messung => ({ stromkreis: "", schutz: "", querschnitt: "", riso: null, zs: null, fi_in: null, fi_ia: null, fi_ta: null, ...x });

describe("Schutzorgan und Schleifenimpedanz", () => {
  it("liest B16, C 10, LS B13A", () => {
    expect(schutzLesen("B16")).toEqual({ char: "B", in: 16 });
    expect(schutzLesen("C 10")).toEqual({ char: "C", in: 10 });
    expect(schutzLesen("LS B13A")).toEqual({ char: "B", in: 13 });
    expect(schutzLesen("NH 35")).toBeNull();
  });
  it("Zs max = 230 V / (Faktor × In)", () => {
    expect(zsMax("B16")).toBe(2.87);
    expect(zsMax("C16")).toBe(1.43);
    expect(zsMax("B10")).toBe(4.6);
    expect(zsMax("")).toBeNull();
  });
});

describe("Messung bewerten", () => {
  it("in Ordnung", () => {
    expect(messungBewerten(m({ schutz: "B16", riso: 200, zs: 0.9, fi_in: 30, fi_ia: 21, fi_ta: 24 }))).toEqual([]);
  });
  it("findet jede Überschreitung", () => {
    const f = messungBewerten(m({ schutz: "B16", riso: 0.5, zs: 3.2, fi_in: 30, fi_ia: 12, fi_ta: 320 }));
    expect(f).toHaveLength(4);
    expect(f[0]).toBe("Isolation 0,5 MΩ < 1 MΩ");
    expect(f[1]).toBe("Zs 3,2 Ω > 2,87 Ω");
  });
  it("nicht gemessen ist kein Fehler", () => {
    expect(messungBewerten(m({ schutz: "B16" }))).toEqual([]);
  });
  it("Erder: 50 V / IΔn", () => {
    expect(erderBewerten(100, 30)).toBeNull();
    expect(erderBewerten(2000, 30)).toBe("Erder 2000 Ω > 1666 Ω (50 V / 30 mA)");
  });
});

describe("Ergebnis und Mängeltext", () => {
  const b = [{ punkt: "Abdeckungen vollständig", ok: false }, { punkt: "Beschriftung", ok: true }];
  it("Mangel in der Besichtigung → Mängel", () => {
    expect(ergebnisVorschlag(b, [])).toBe("maengel");
    expect(ergebnisVorschlag([{ punkt: "x", ok: true }], [m({ riso: 300 })])).toBe("ok");
  });
  it("Mängeltext aus allem", () => {
    expect(maengelText(b, [m({ stromkreis: "Küche", riso: 0.4 })])).toBe("- Abdeckungen vollständig\n- Küche: Isolation 0,4 MΩ < 1 MΩ");
  });
});

describe("Termine", () => {
  it("Monate dazu, Monatsende wie Postgres", () => {
    expect(plusMonate("2026-03-15", 12)).toBe("2027-03-15");
    expect(plusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMonate("2026-11-30", 48)).toBe("2030-11-30");
  });
  it("Fälligkeit", () => {
    expect(faelligkeit("2026-10-01", "2026-11-03").stufe).toBe("ueberfaellig");
    expect(faelligkeit("2026-11-20", "2026-11-03").stufe).toBe("bald");
    expect(faelligkeit("2027-06-01", "2026-11-03").stufe).toBe("spaeter");
    expect(faelligkeit(null, "2026-11-03").stufe).toBe("keine");
  });
});

describe("Eingabe und Speichern", () => {
  it("Komma-Zahlen hin und zurück", () => {
    const z = zeileAusMessung({ stromkreis: "Bad", schutz: "B16", zs: 0.85 }, "k");
    expect(z.zs).toBe("0,85");
    expect(messungAusZeile({ ...z, riso: "500" })).toMatchObject({ zs: 0.85, riso: 500, fi_ta: null });
    expect(zeileLeer(zeileAusMessung({}, "x"))).toBe(true);
  });
  it("liest kaputtes JSON nicht als Absturz", () => {
    expect(messungenLesen(null)).toEqual([]);
    expect(messungenLesen([{ stromkreis: "A", riso: "x" }])[0]).toMatchObject({ stromkreis: "A", riso: null });
  });
});

describe("QR-Aufkleber", () => {
  it("liest die Anlage aus der Adresse", async () => {
    const { anlageIdAusCode } = await import("./pruefLogik");
    expect(anlageIdAusCode("https://mayr.vercel.app/anlagen/0F4E2C1A-1111-4222-8333-944455556666")).toBe("0f4e2c1a-1111-4222-8333-944455556666");
    expect(anlageIdAusCode("9001234567890")).toBeNull();
  });
});
