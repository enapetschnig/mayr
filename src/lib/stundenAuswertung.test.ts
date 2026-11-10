import { describe, expect, it } from "vitest";
import { filtern, gruppieren, isoWoche, type ZeitZeile } from "./stundenAuswertung";

const z = (t: Partial<ZeitZeile> & { id: string }): ZeitZeile => ({
  user_id: "max", person: "Max", projekt_id: "p1", projekt: "2026-0001 Huber", datum: "2026-11-09", stunden: 4, art: "arbeit", km: null, verrechnet: false, ...t,
});

describe("Stundenauswertung", () => {
  it("ISO-Woche, auch über den Jahreswechsel", () => {
    expect(isoWoche("2026-11-10")).toBe("2026-W46");
    expect(isoWoche("2026-01-01")).toBe("2026-W01");
    expect(isoWoche("2027-01-01")).toBe("2026-W53");
    expect(isoWoche("2024-12-30")).toBe("2025-W01");
  });

  const zeilen = [
    z({ id: "1" }),
    z({ id: "2", stunden: 3.5, art: "ue50", datum: "2026-11-10" }),
    z({ id: "3", user_id: "tom", person: "Tom", projekt_id: "p2", projekt: "2026-0002 Gruber", stunden: 8, km: 42, verrechnet: true }),
    z({ id: "4", user_id: "tom", person: "Tom", projekt_id: null, projekt: null, stunden: 1, art: "fahrt", datum: "2026-11-16" }),
  ];

  it("filtert nach Person, Projekt (auch ohne), Art und verrechnet", () => {
    expect(filtern(zeilen, { personen: ["tom"], projekte: [], arten: [], verrechnet: "alle" }).map((x) => x.id)).toEqual(["3", "4"]);
    expect(filtern(zeilen, { personen: [], projekte: ["-"], arten: [], verrechnet: "alle" }).map((x) => x.id)).toEqual(["4"]);
    expect(filtern(zeilen, { personen: [], projekte: [], arten: ["ue50", "fahrt"], verrechnet: "alle" }).map((x) => x.id)).toEqual(["2", "4"]);
    expect(filtern(zeilen, { personen: [], projekte: [], arten: [], verrechnet: "nein" }).map((x) => x.id)).toEqual(["1", "2", "4"]);
  });

  it("gruppiert je Person mit Summen je Art, meiste zuerst", () => {
    const g = gruppieren(zeilen, "person");
    expect(g.map((x) => [x.titel, x.stunden, x.km])).toEqual([["Tom", 9, 42], ["Max", 7.5, 0]]);
    expect(g[1].jeArt).toEqual({ arbeit: 4, ue50: 3.5 });
  });

  it("je Woche nach der Zeit", () => {
    expect(gruppieren(zeilen, "woche").map((x) => [x.titel, x.stunden])).toEqual([["KW 46 / 2026", 15.5], ["KW 47 / 2026", 1]]);
    expect(gruppieren(zeilen, "projekt").map((x) => x.titel)).toEqual(["2026-0002 Gruber", "2026-0001 Huber", "Ohne Projekt"]);
  });
});
