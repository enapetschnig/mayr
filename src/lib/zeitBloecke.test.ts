import { describe, expect, it } from "vitest";
import { ersteUeberschneidung, naechsterBlock, ueberschneiden } from "./zeitBloecke";

describe("naechsterBlock", () => {
  it("beginnt eine halbe Stunde nach dem letzten Ende", () => {
    expect(naechsterBlock({ von: "07:00", bis: "11:30" })).toEqual({ von: "12:00", bis: "15:30" });
  });
  it("liest auch Sekunden aus der Datenbank", () => {
    expect(naechsterBlock({ von: "07:00:00", bis: "12:00:00" })).toEqual({ von: "12:30", bis: "16:00" });
  });
  it("geht nie über Mitternacht", () => {
    expect(naechsterBlock({ von: "18:00", bis: "22:45" })).toEqual({ von: "23:00", bis: "23:59" });
  });
});

describe("ueberschneiden", () => {
  it("aneinander anschließend ist erlaubt", () => {
    expect(ueberschneiden({ von: "07:00", bis: "11:30" }, { von: "11:30", bis: "15:30" })).toBe(false);
  });
  it("überlappend wird erkannt", () => {
    expect(ueberschneiden({ von: "07:00", bis: "12:00" }, { von: "11:30", bis: "15:30" })).toBe(true);
  });
  it("ganz darin wird erkannt", () => {
    expect(ueberschneiden({ von: "07:00", bis: "16:00" }, { von: "09:00", bis: "10:00" })).toBe(true);
  });
  it("über Mitternacht zählt bis in den Morgen", () => {
    expect(ueberschneiden({ von: "22:00", bis: "02:00" }, { von: "23:00", bis: "23:30" })).toBe(true);
    expect(ueberschneiden({ von: "22:00", bis: "02:00" }, { von: "07:00", bis: "15:00" })).toBe(false);
  });
});

describe("ersteUeberschneidung", () => {
  it("findet das erste Paar, unvollständige Blöcke zählen nicht", () => {
    expect(ersteUeberschneidung([{ von: "07:00", bis: "11:30" }, { von: "12:00", bis: "15:30" }])).toBeNull();
    expect(ersteUeberschneidung([{ von: "07:00", bis: "11:30" }, { von: "", bis: "" }, { von: "11:00", bis: "13:00" }])).toEqual([0, 2]);
  });
});
