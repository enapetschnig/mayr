import { describe, expect, it } from "vitest";
import { aufschlagVon, leerePosition, mitAufschlag, mitEinkauf, schnellLesen } from "./editor";

const pos = (werte: Parameters<typeof leerePosition>[1]) => leerePosition("artikel", werte);

describe("Aufschlag je Position", () => {
  it("liest den Aufschlag aus Preis und Einkauf", () => {
    expect(aufschlagVon(pos({ einzelpreis: "13,50", ek_preis: 10 }), 70)).toBe(35);
    expect(aufschlagVon(pos({ einzelpreis: "13,50", ek_preis: null }), 70)).toBeNull();
  });
  it("Aufschlag ändern rechnet den Preis neu", () => {
    expect(mitAufschlag(pos({ einzelpreis: "13,50", ek_preis: 10 }), 50, 70).einzelpreis).toBe("15,00");
  });
  it("bei Leistungen kommt die Montagezeit dazu", () => {
    // 10 € Material + 40 %, 30 Minuten zu 70 €/h
    const p = leerePosition("leistung", { einzelpreis: "0", ek_preis: 10, minuten: 30 });
    const neu = mitAufschlag(p, 40, 70);
    expect(neu.einzelpreis).toBe("49,00");
    expect(aufschlagVon(neu, 70)).toBe(40);
  });
  it("ohne Einkauf ändert der Aufschlag nichts", () => {
    const p = pos({ einzelpreis: "20,00", ek_preis: null });
    expect(mitAufschlag(p, 50, 70)).toBe(p);
  });
  it("neuer Einkauf behält den Aufschlag", () => {
    const neu = mitEinkauf(pos({ einzelpreis: "13,50", ek_preis: 10 }), 20, 70, 30);
    expect(neu.ek_preis).toBe(20);
    expect(neu.einzelpreis).toBe("27,00");
  });
  it("erster Einkauf behält einen schon eingetragenen Preis", () => {
    const neu = mitEinkauf(pos({ einzelpreis: "25,00", ek_preis: null }), 20, 70, 30);
    expect(neu.einzelpreis).toBe("25,00");
    expect(aufschlagVon(neu, 70)).toBe(25);
  });
  it("erster Einkauf ohne Preis nimmt den Standard-Aufschlag", () => {
    expect(mitEinkauf(pos({ einzelpreis: "", ek_preis: null }), 20, 70, 30).einzelpreis).toBe("26,00");
  });
  it("Einkauf leeren lässt den Preis stehen", () => {
    const neu = mitEinkauf(pos({ einzelpreis: "13,50", ek_preis: 10 }), null, 70, 30);
    expect(neu.ek_preis).toBeNull();
    expect(neu.einzelpreis).toBe("13,50");
  });
});

describe("Eingabezeile", () => {
  it("# macht einen Titel", () => {
    expect(schnellLesen("#Küche")).toEqual({ titel: "Küche" });
    expect(schnellLesen("# Bad oben")).toEqual({ titel: "Bad oben" });
    expect(schnellLesen("#")).toBeNull();
  });
  it("eine Zahl vorne ist die Menge", () => {
    expect(schnellLesen("3 Steckdose")).toEqual({ menge: 3, text: "Steckdose" });
    expect(schnellLesen("3x Steckdose")).toEqual({ menge: 3, text: "Steckdose" });
    expect(schnellLesen("2,5 Stk Kabel")).toEqual({ menge: 2.5, text: "Kabel" });
  });
  it("sonst ein Stück, auch wenn eine Zahl im Text steht", () => {
    expect(schnellLesen("NYM-J 3x1,5")).toEqual({ menge: 1, text: "NYM-J 3x1,5" });
    expect(schnellLesen("16A Sicherung")).toEqual({ menge: 1, text: "16A Sicherung" });
    expect(schnellLesen("   ")).toBeNull();
  });
});
