import { describe, expect, it } from "vitest";
import { ordneZuErledigen } from "./zuErledigen";
import { NAVIGATION, navPasst, sichtbareNavigation } from "./navigation";

describe("ordneZuErledigen", () => {
  const p = (text: string, warn = false) => ({ text, warn });

  it("Dringendes zuerst, sonst Reihenfolge behalten", () => {
    const r = ordneZuErledigen([p("a"), p("b", true), p("c"), p("d", true)], 10);
    expect(r.sichtbar.map((x) => x.text)).toEqual(["b", "d", "a", "c"]);
    expect(r.rest).toBe(0);
  });

  it("„oben“ vor dem Dringenden", () => {
    const r = ordneZuErledigen([p("a", true), { text: "angenommen", oben: true }, p("c")], 10);
    expect(r.sichtbar.map((x) => x.text)).toEqual(["angenommen", "a", "c"]);
  });

  it("kürzt auf max und zählt den Rest", () => {
    const r = ordneZuErledigen(["a", "b", "c", "d", "e", "f", "g"].map((t) => p(t)), 5);
    expect(r.sichtbar).toHaveLength(5);
    expect(r.rest).toBe(2);
  });

  it("ein einzelner Punkt mehr wird nicht versteckt", () => {
    const r = ordneZuErledigen(["a", "b", "c", "d", "e", "f"].map((t) => p(t)), 5);
    expect(r.sichtbar).toHaveLength(6);
    expect(r.rest).toBe(0);
  });

  it("leere Liste", () => {
    expect(ordneZuErledigen([], 5)).toEqual({ sichtbar: [], rest: 0 });
  });
});

describe("Navigation", () => {
  const finde = (q: string) => NAVIGATION.filter((n) => navPasst(n, q)).map((n) => n.titel);

  it("Suche findet Seiten auch über Stichworte", () => {
    expect(finde("kalender")).toContain("Plantafel");
    expect(finde("Lohnzettel")).toContain("Dokumente");
    expect(finde("kunde")).toContain("Kontakte");
    expect(finde("Mitarbeiter")).toContain("Einstellungen");
    expect(finde("Pickerl")).toEqual(["Fuhrpark"]);
  });

  it("Monteur sieht keine Chef-Seiten, Handyansicht nur am PC", () => {
    const m = sichtbareNavigation(false).map((n) => n.pfad);
    for (const p of ["/angebote", "/rechnungen", "/eingang", "/offene-posten", "/buchhaltung", "/auswertung", "/handyansicht"]) expect(m).not.toContain(p);
    expect(sichtbareNavigation(true, true).map((n) => n.pfad)).toContain("/handyansicht");
  });

  it("jede Seite steht nur einmal im Menü", () => {
    const pfade = NAVIGATION.map((n) => n.pfad);
    expect(new Set(pfade).size).toBe(pfade.length);
  });
});
