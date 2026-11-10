import { describe, expect, it } from "vitest";
import { ablegen, arbeitsStuecke, bahnen, balkenLage, inZeile, konflikte, tageZwischen, projektFarbe, textAuf, ueberschneiden, verschieben, zuweisen, type PlanTermin } from "./plantafel";
import { faelligkeiten } from "./fuhrpark";

const t = (teil: Partial<PlanTermin> & { id: string }): PlanTermin => ({
  datum: "2026-11-10", bis_datum: null, ganztags: false, von: "07:00", bis: "12:00",
  mitarbeiter: [], fahrzeuge: [], team_id: null, ...teil,
});

describe("ueberschneiden", () => {
  it("Vormittag und Nachmittag passen hintereinander", () => {
    expect(ueberschneiden(t({ id: "a" }), t({ id: "b", von: "12:00", bis: "16:00" }), "2026-11-10")).toBe(false);
  });
  it("ganztägig belegt alles", () => {
    expect(ueberschneiden(t({ id: "a", ganztags: true, von: null }), t({ id: "b", von: "14:00", bis: "15:00" }), "2026-11-10")).toBe(true);
  });
  it("mehrtägig: die Uhrzeit gilt an jedem Tag", () => {
    const lang = t({ id: "a", datum: "2026-11-09", bis_datum: "2026-11-12", von: "07:00", bis: "10:00" });
    expect(ueberschneiden(lang, t({ id: "b", von: "13:00", bis: "15:00" }), "2026-11-10")).toBe(false);
    expect(ueberschneiden(lang, t({ id: "b", von: "09:00", bis: "15:00" }), "2026-11-10")).toBe(true);
    // außerhalb der Tage nie
    expect(ueberschneiden(lang, t({ id: "b", datum: "2026-11-13", von: "09:00" }), "2026-11-13")).toBe(false);
  });
});

describe("konflikte", () => {
  it("findet Person doppelt, Bus doppelt und abwesend", () => {
    const liste = [
      t({ id: "a", mitarbeiter: ["max"], fahrzeuge: ["bus1"] }),
      t({ id: "b", von: "10:00", bis: "14:00", mitarbeiter: ["max", "lisa"], fahrzeuge: ["bus1"] }),
      t({ id: "c", von: "13:00", bis: "16:00", mitarbeiter: ["tom"] }),
    ];
    const k = konflikte(liste, ["2026-11-10"], [{ user_id: "tom", von: "2026-11-10", bis: "2026-11-14" }]);
    expect(k.map((x) => `${x.art}:${x.ressource}:${x.termine.sort().join(",")}`).sort()).toEqual([
      "fahrzeug_doppelt:bus1:a,b",
      "person_abwesend:tom:c",
      "person_doppelt:max:a,b",
    ]);
  });
  it("hintereinander ist kein Konflikt", () => {
    const liste = [t({ id: "a", mitarbeiter: ["max"] }), t({ id: "b", von: "12:30", bis: "15:00", mitarbeiter: ["max"] })];
    expect(konflikte(liste, ["2026-11-10"], [])).toEqual([]);
  });
});

describe("ablegen", () => {
  const teams = [
    { id: "t1", mitglieder: ["max", "lisa"], fahrzeug_id: "bus1" },
    { id: "t2", mitglieder: ["tom", "eva"], fahrzeug_id: "bus2" },
  ];
  it("anderer Tag, gleiche Zeile: nur verschieben, mehrtägig bleibt", () => {
    const e = t({ id: "a", bis_datum: "2026-11-11", mitarbeiter: ["max"] });
    expect(ablegen(e, { zeile: { art: "person", id: "max" }, tag: "2026-11-10" }, { zeile: { art: "person", id: "max" }, tag: "2026-11-12" }, teams))
      .toEqual({ datum: "2026-11-12", bis_datum: "2026-11-13", mitarbeiter: ["max"], fahrzeuge: [], team_id: null });
  });
  it("von Team 1 zu Team 2: Leute und Bus wechseln, Einzelne bleiben", () => {
    const e = t({ id: "a", team_id: "t1", mitarbeiter: ["max", "lisa", "chef"], fahrzeuge: ["bus1", "steiger"] });
    const r = ablegen(e, { zeile: { art: "team", id: "t1" }, tag: "2026-11-10" }, { zeile: { art: "team", id: "t2" }, tag: "2026-11-10" }, teams);
    expect(r.team_id).toBe("t2");
    expect(r.mitarbeiter).toEqual(["chef", "tom", "eva"]);
    expect(r.fahrzeuge).toEqual(["steiger", "bus2"]);
  });
  it("Person zu Person tauscht", () => {
    const e = t({ id: "a", mitarbeiter: ["max", "lisa"] });
    const r = ablegen(e, { zeile: { art: "person", id: "max" }, tag: "2026-11-10" }, { zeile: { art: "person", id: "tom" }, tag: "2026-11-10" }, teams);
    expect(r.mitarbeiter).toEqual(["lisa", "tom"]);
  });
  it("Fahrzeug zu Fahrzeug tauscht (Steiger gegen Miet-Steiger)", () => {
    const e = t({ id: "a", fahrzeuge: ["bus1", "steiger"] });
    const r = ablegen(e, { zeile: { art: "fahrzeug", id: "steiger" }, tag: "2026-11-10" }, { zeile: { art: "fahrzeug", id: "miete" }, tag: "2026-11-11" }, teams);
    expect(r).toMatchObject({ datum: "2026-11-11", fahrzeuge: ["bus1", "miete"] });
  });
  it("aus „Nicht eingeteilt“ auf ein Team: Team übernimmt", () => {
    const e = t({ id: "a" });
    const r = ablegen(e, { zeile: { art: "offen" }, tag: "2026-11-10" }, { zeile: { art: "team", id: "t1" }, tag: "2026-11-10" }, teams);
    expect(r).toMatchObject({ team_id: "t1", mitarbeiter: ["max", "lisa"], fahrzeuge: ["bus1"] });
  });
  it("Team nach „Nicht eingeteilt“: Team, seine Leute und Bus fallen weg", () => {
    const e = t({ id: "a", team_id: "t1", mitarbeiter: ["max", "lisa"], fahrzeuge: ["bus1"] });
    const r = ablegen(e, { zeile: { art: "team", id: "t1" }, tag: "2026-11-10" }, { zeile: { art: "offen" }, tag: "2026-11-10" }, teams);
    expect(r).toMatchObject({ team_id: null, mitarbeiter: [], fahrzeuge: [] });
  });
});

describe("zuweisen und inZeile", () => {
  it("doppelt zuweisen bleibt einmal", () => {
    expect(zuweisen(t({ id: "a", mitarbeiter: ["max"] }), { art: "person", id: "max" }).mitarbeiter).toEqual(["max"]);
    expect(zuweisen(t({ id: "a" }), { art: "fahrzeug", id: "steiger" }).fahrzeuge).toEqual(["steiger"]);
  });
  it("ohne Team und Leute steht der Einsatz bei „Nicht eingeteilt“", () => {
    expect(inZeile(t({ id: "a", fahrzeuge: ["bus1"] }), { art: "offen" })).toBe(true);
    expect(inZeile(t({ id: "a", team_id: "t1" }), { art: "offen" })).toBe(false);
  });
  it("tageZwischen über den Monatswechsel", () => {
    expect(tageZwischen("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("faelligkeiten", () => {
  const f = { art: "steiger", pickerl_bis: "2026-11-01", service_bis: "2026-11-30", pruefung_bis: "2027-03-01", gemietet: false, aktiv: true };
  it("überfällig und bald, das Früheste zuerst; weit weg bleibt weg", () => {
    expect(faelligkeiten(f, "2026-11-10")).toEqual([
      { was: "Pickerl", datum: "2026-11-01", ueberfaellig: true },
      { was: "Service", datum: "2026-11-30", ueberfaellig: false },
    ]);
  });
  it("gemietet: nichts zu tun", () => {
    expect(faelligkeiten({ ...f, gemietet: true }, "2026-11-10")).toEqual([]);
  });
});

describe("Gantt", () => {
  it("balkenLage schneidet am Rand ab", () => {
    expect(balkenLage("2026-11-08", "2026-11-11", "2026-11-09", 7)).toEqual({ links: 0, laenge: 3, offenLinks: true, offenRechts: false });
    expect(balkenLage("2026-11-20", "2026-11-21", "2026-11-09", 7)).toBeNull();
  });
  it("verschieben: Mitte, Ränder, nie über das andere Ende", () => {
    const e = { datum: "2026-11-10", bis_datum: "2026-11-12" };
    expect(verschieben(e, "mitte", 2)).toEqual({ datum: "2026-11-12", bis_datum: "2026-11-14" });
    expect(verschieben(e, "rechts", 3)).toEqual({ datum: "2026-11-10", bis_datum: "2026-11-15" });
    expect(verschieben(e, "links", -1)).toEqual({ datum: "2026-11-09", bis_datum: "2026-11-12" });
    expect(verschieben(e, "links", 5)).toEqual({ datum: "2026-11-12", bis_datum: null });
    expect(verschieben(e, "rechts", -9)).toEqual({ datum: "2026-11-10", bis_datum: null });
    expect(verschieben({ datum: "2026-11-10", bis_datum: null }, "rechts", 4)).toEqual({ datum: "2026-11-10", bis_datum: "2026-11-14" });
  });
  it("bahnen: Überlappende untereinander, Folgende in dieselbe Bahn", () => {
    const { bahn, anzahl } = bahnen([
      { id: "a", datum: "2026-11-10", bis_datum: "2026-11-12" },
      { id: "b", datum: "2026-11-11", bis_datum: null },
      { id: "c", datum: "2026-11-13", bis_datum: null },
    ]);
    expect(anzahl).toBe(2);
    expect([bahn.get("a"), bahn.get("b"), bahn.get("c")]).toEqual([0, 1, 0]);
  });
});

describe("Farben und Stücke", () => {
  it("aufeinanderfolgende Projekte bekommen verschiedene Farben", () => {
    const f = [1, 2, 3, 4].map((n) => projektFarbe({ id: "x", nummer: `2026-000${n}` }));
    expect(new Set(f).size).toBe(4);
    expect(projektFarbe(null)).toBe("#64748B");
  });
  it("Schrift hell auf dunkel, dunkel auf hell", () => {
    expect(textAuf("#2563EB")).toBe("#ffffff");
    expect(textAuf("#CA8A04")).toBe("#ffffff");
    expect(textAuf("#FDE68A")).toBe("#111827");
  });
  it("Wochenende wird zur Lücke, nur Wochenende bleibt ganz", () => {
    // Fr(4) Sa(5) So(6) Mo(7)
    const frei = (i: number) => i % 7 === 5 || i % 7 === 6;
    expect(arbeitsStuecke({ links: 4, laenge: 4 }, frei)).toEqual([{ links: 4, laenge: 1 }, { links: 7, laenge: 1 }]);
    expect(arbeitsStuecke({ links: 5, laenge: 1 }, frei)).toEqual([{ links: 5, laenge: 1 }]);
    expect(arbeitsStuecke({ links: 0, laenge: 3 }, frei)).toEqual([{ links: 0, laenge: 3 }]);
  });
});
