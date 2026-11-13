import { describe, expect, it } from "vitest";
import { tageDazu } from "./format";
import { abwesenheitTon, einrasten, kalenderwoche, gruppenBilden, minuten, nebeneinander, planVerschieben, stundenBereich, teamTitel, zeitAus, zeitLage } from "./terminplaner";
import { normal, projektPasst, projekteSuchen } from "./projektSuche";

const p = (id: string, rolle = "monteur", gruppe: string | null = null) => ({ id, rolle, gruppe });
const teams = [
  { id: "t1", name: "1", mitglieder: ["max", "lisa"] },
  { id: "t2", name: "Team 2", mitglieder: ["tom", "max"] },
];

describe("gruppenBilden", () => {
  it("Geschäftsführung, Büro, Teams in ihrer Reihenfolge, dann ohne Team", () => {
    const g = gruppenBilden([p("tom"), p("chef", "chef"), p("anna", "monteur", "Büro"), p("lisa"), p("max"), p("neu")], teams);
    expect(g.map((x) => `${x.titel}:${x.leute.map((l) => l.id).join(",")}`)).toEqual([
      "Geschäftsführung:chef",
      "Büro:anna",
      "Team 1:lisa,max",
      "Team 2:tom",
      "Ohne Team:neu",
    ]);
  });
  it("eigene Gruppe geht vor dem Team; leere Gruppen fallen weg", () => {
    const g = gruppenBilden([p("max", "monteur", "Lager"), p("lisa")], teams);
    expect(g.map((x) => x.titel)).toEqual(["Lager", "Team 1"]);
  });
  it("Teamnamen", () => {
    expect(teamTitel("Max")).toBe("Team Max");
    expect(teamTitel("Team 1")).toBe("Team 1");
  });
});

describe("Zeiten", () => {
  it("rechnen hin und her", () => {
    expect(minuten("07:30:00")).toBe(450);
    expect(minuten(null)).toBeNull();
    expect(zeitAus(450)).toBe("07:30");
    expect(einrasten(452)).toBe(450);
    expect(einrasten(458)).toBe(465);
  });
});

const t = (teil: Partial<{ datum: string; bis_datum: string | null; ganztags: boolean; von: string | null; bis: string | null }> = {}) => ({
  datum: "2026-11-16", bis_datum: null, ganztags: false, von: "07:00", bis: "15:30", ...teil,
});

describe("zeitLage", () => {
  it("Uhrzeit, ganztägig, mehrtägig, außerhalb", () => {
    expect(zeitLage(t(), "2026-11-16", 360, 1080)).toEqual({ oben: 420, unten: 930, ganz: false });
    expect(zeitLage(t({ ganztags: true, von: null }), "2026-11-16", 360, 1080)).toEqual({ oben: 360, unten: 1080, ganz: true });
    expect(zeitLage(t({ bis_datum: "2026-11-18" }), "2026-11-17", 360, 1080)?.oben).toBe(420);
    expect(zeitLage(t(), "2026-11-17", 360, 1080)).toBeNull();
  });
  it("ohne Ende eine Stunde, abgeschnitten am Rand", () => {
    expect(zeitLage(t({ von: "09:00", bis: null }), "2026-11-16", 360, 1080)).toEqual({ oben: 540, unten: 600, ganz: false });
    expect(zeitLage(t({ von: "05:00", bis: "07:00" }), "2026-11-16", 360, 1080)).toEqual({ oben: 360, unten: 420, ganz: false });
  });
});

describe("stundenBereich", () => {
  it("6–18, erweitert für frühe und späte Einsätze", () => {
    expect(stundenBereich([t()], ["2026-11-16"])).toEqual([360, 1080]);
    expect(stundenBereich([t({ von: "05:30", bis: "19:15" })], ["2026-11-16"])).toEqual([300, 1200]);
    // andere Woche zählt nicht
    expect(stundenBereich([t({ von: "05:30" })], ["2026-11-23"])).toEqual([360, 1080]);
  });
});

describe("nebeneinander", () => {
  it("Überlappende teilen sich die Breite, Hintereinander nicht", () => {
    const m = nebeneinander([
      { id: "a", oben: 420, unten: 720 },
      { id: "b", oben: 600, unten: 900 },
      { id: "c", oben: 930, unten: 1000 },
    ]);
    expect(m.get("a")).toEqual({ spalte: 0, anzahl: 2 });
    expect(m.get("b")).toEqual({ spalte: 1, anzahl: 2 });
    expect(m.get("c")).toEqual({ spalte: 0, anzahl: 1 });
  });
  it("freie Spalte wird wieder genutzt", () => {
    const m = nebeneinander([
      { id: "a", oben: 420, unten: 1000 },
      { id: "b", oben: 450, unten: 500 },
      { id: "c", oben: 520, unten: 600 },
    ]);
    expect(m.get("c")).toEqual({ spalte: 1, anzahl: 2 });
  });
});

describe("planVerschieben", () => {
  const e = { ...t({ von: "07:00:00", bis: "11:00:00" }), mitarbeiter: ["max", "lisa"] };
  it("Zeit und Tag, Dauer bleibt", () => {
    expect(planVerschieben(e, { tage: 1, minuten: 90 }, tageDazu)).toEqual({ datum: "2026-11-17", bis_datum: null, von: "08:30", bis: "12:30", mitarbeiter: ["max", "lisa"] });
  });
  it("in eine andere Spalte = Person tauschen", () => {
    expect(planVerschieben(e, { tage: 0, minuten: 0, vonPerson: "max", nachPerson: "tom" }, tageDazu).mitarbeiter).toEqual(["lisa", "tom"]);
    // schon dabei: nicht doppelt
    expect(planVerschieben(e, { tage: 0, minuten: 0, vonPerson: "max", nachPerson: "lisa" }, tageDazu).mitarbeiter).toEqual(["lisa"]);
  });
  it("unten ziehen = nur das Ende, nie vor den Beginn", () => {
    expect(planVerschieben(e, { tage: 2, minuten: 60, griff: "unten" }, tageDazu)).toMatchObject({ datum: "2026-11-16", von: "07:00", bis: "12:00" });
    expect(planVerschieben(e, { tage: 0, minuten: -600, griff: "unten" }, tageDazu).bis).toBe("07:15");
  });
  it("mehrtägig wandert ganz, ganztägig ohne Uhrzeit", () => {
    expect(planVerschieben({ ...e, bis_datum: "2026-11-18" }, { tage: 7, minuten: 0 }, tageDazu)).toMatchObject({ datum: "2026-11-23", bis_datum: "2026-11-25" });
    expect(planVerschieben({ ...e, ganztags: true, von: null, bis: null }, { tage: 1, minuten: 120 }, tageDazu)).toMatchObject({ datum: "2026-11-17", von: null, bis: null });
  });
  it("nicht über Mitternacht", () => {
    expect(planVerschieben(e, { tage: 0, minuten: -600 }, tageDazu).von).toBe("00:00");
    expect(planVerschieben(e, { tage: 0, minuten: 900 }, tageDazu)).toMatchObject({ von: "20:00", bis: "23:59" });
  });
});

describe("kalenderwoche", () => {
  it("nach ISO", () => {
    expect(kalenderwoche("2026-11-16")).toBe(47);
    expect(kalenderwoche("2027-01-01")).toBe(53);
    expect(kalenderwoche("2027-01-04")).toBe(1);
  });
});

describe("abwesenheitTon", () => {
  it("krank rot, Urlaub grün, Schule gelb", () => {
    expect(abwesenheitTon("krank")).toBe("rot");
    expect(abwesenheitTon("urlaub")).toBe("gruen");
    expect(abwesenheitTon("abwesend")).toBe("gruen");
    expect(abwesenheitTon("berufsschule")).toBe("gelb");
  });
});

describe("Projektsuche", () => {
  const liste = [
    { nummer: "2026-0017", name: "PV-Anlage 12 kWp", ort: "Kapfenberg", kunden: { name: "Familie Müller" } },
    { nummer: "2026-0007", name: "Wohnanlage Leonding", ort: "Leonding", kunden: { name: "Wohnbau" } },
    { nummer: "2026-0170", name: "Speicher Müllner", ort: "Bruck", kunden: null },
  ];
  it("normalisiert Umlaute und Akzente", () => {
    expect(normal("Müller Straße Café")).toBe("mueller strasse cafe");
  });
  it("mehrere Wörter, Kunde, Ort", () => {
    expect(projektPasst(liste[0], "mueller kapf")).toBe(true);
    expect(projektPasst(liste[0], "müller leonding")).toBe(false);
    expect(projektPasst(liste[1], "")).toBe(true);
  });
  it("Nummer zuerst", () => {
    expect(projekteSuchen(liste, "17").map((x) => x.nummer)).toEqual(["2026-0017", "2026-0170"]);
    expect(projekteSuchen(liste, "7").map((x) => x.nummer)).toEqual(["2026-0007", "2026-0017", "2026-0170"]);
    expect(projekteSuchen(liste, "spei").map((x) => x.nummer)).toEqual(["2026-0170"]);
  });
});
