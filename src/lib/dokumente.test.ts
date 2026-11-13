import { describe, expect, it } from "vitest";
import { ablauf, groesseText, monatText, nachOrdner, passt, personalTitel, vormonat } from "./dokumente";

describe("Dokumente", () => {
  it("Monat und Vormonat", () => {
    expect(monatText("2026-10-01")).toBe("Oktober 2026");
    expect(monatText("2027-01-01")).toBe("Jänner 2027");
    expect(vormonat("2026-11-13")).toBe("2026-10-01");
    expect(vormonat("2027-01-05")).toBe("2026-12-01");
  });
  it("Titel: eigener Titel vor Art + Monat", () => {
    expect(personalTitel({ art: "lohnzettel", titel: null, monat: "2026-10-01" })).toBe("Lohnzettel Oktober 2026");
    expect(personalTitel({ art: "krankenschein", titel: " ", monat: null })).toBe("Krankenschein");
    expect(personalTitel({ art: "zeugnis", titel: "Befähigung E-Check", monat: null })).toBe("Befähigung E-Check");
  });
  it("Gültigkeit", () => {
    expect(ablauf(null, "2026-11-13")).toBeNull();
    expect(ablauf("2026-11-12", "2026-11-13")?.stufe).toBe("abgelaufen");
    expect(ablauf("2026-12-13", "2026-11-13")?.stufe).toBe("bald");
    expect(ablauf("2026-12-14", "2026-11-13")).toEqual({ stufe: "ok", text: "gültig bis 14.12.2026" });
  });
  it("Suche: alle Wörter, Umlaute und Groß/klein egal", () => {
    expect(passt("haftpflicht polizze", "Betriebshaftpflicht", "Versicherungen", "Polizze 2026.pdf")).toBe(true);
    expect(passt("prufbericht", "Prüfbericht Leiter")).toBe(true);
    expect(passt("steiger", "Prüfbericht Leiter")).toBe(false);
    expect(passt("  ", "x")).toBe(true);
  });
  it("Ordner alphabetisch, Titel darin auch", () => {
    const g = nachOrdner([
      { ordner: "Vorlagen", titel: "Regie" }, { ordner: "Versicherungen", titel: "KFZ" }, { ordner: "Vorlagen", titel: "Abnahme" },
    ]);
    expect(g.map((x) => x.ordner)).toEqual(["Versicherungen", "Vorlagen"]);
    expect(g[1].dokumente.map((d) => d.titel)).toEqual(["Abnahme", "Regie"]);
  });
  it("Größe", () => {
    expect(groesseText(0)).toBe("");
    expect(groesseText(300)).toBe("1 KB");
    expect(groesseText(1572864)).toBe("1,5 MB");
  });
});
