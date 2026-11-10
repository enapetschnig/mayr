import { describe, expect, it } from "vitest";
import { filtern, gruppieren, isoWoche, schnitt, tagesnachweis, type ZeitZeile } from "./stundenAuswertung";

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

describe("tagesnachweis", () => {
  const z = (teil: Partial<ZeitZeile> & { id: string }): ZeitZeile => ({
    user_id: "max", person: "Max", projekt_id: "p1", projekt: "2026-0001 Huber", datum: "2026-11-10", stunden: 8, art: "arbeit", km: null, verrechnet: false,
    von: "07:00", bis: "15:30", pause_minuten: 30, ...teil,
  });
  it("Tag auf zwei Baustellen: Beginn, Ende, Blöcke, Stunden", () => {
    const [t] = tagesnachweis([
      z({ id: "b", von: "12:00", bis: "15:30", stunden: 3.5, pause_minuten: 0, projekt: "2026-0007 Wohnanlage" }),
      z({ id: "a", von: "07:00", bis: "11:30", stunden: 4.5, pause_minuten: 0 }),
    ]);
    expect(t).toMatchObject({ beginn: "07:00", ende: "15:30", stunden: 8, pause: 0, hinweise: [] });
    expect(t.bloecke.map((b) => b.von)).toEqual(["07:00", "12:00"]);
    expect(t.projekte).toEqual(["2026-0007 Wohnanlage", "2026-0001 Huber"]);
  });
  it("Hinweise: früh, spät, lang, Überschneidung", () => {
    const [t] = tagesnachweis([
      z({ id: "a", von: "05:30", bis: "15:30", stunden: 9.5 }),
      z({ id: "b", von: "15:00", bis: "19:30", stunden: 4.5, pause_minuten: 0 }),
    ]);
    expect(t.hinweise).toEqual(["Beginn vor 6 Uhr", "Ende nach 19 Uhr", "über 10 Stunden", "Zeiten überschneiden sich"]);
  });
  it("nur Stunden ohne Uhrzeit, und der Schnitt", () => {
    const [t] = tagesnachweis([z({ id: "a", von: null, bis: null, stunden: 6 })]);
    expect(t).toMatchObject({ beginn: null, ende: null, ohneZeit: 6 });
    expect(schnitt([{ beginn: "07:00", ende: "15:30" }, { beginn: "06:30", ende: "16:00" }, { beginn: null, ende: null }])).toEqual({ beginn: "06:45", ende: "15:45" });
  });
});
