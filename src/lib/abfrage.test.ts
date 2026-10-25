import { describe, expect, it } from "vitest";
import { alsText, csvFeld } from "./abfrage";

describe("CSV-Felder für Excel", () => {
  it("Text, der wie eine Formel beginnt, bleibt Text", () => {
    expect(csvFeld("=1+2")).toBe("'=1+2");
    expect(csvFeld("+1")).toBe("'+1");
    expect(csvFeld("- Kabel verlegt")).toBe("'- Kabel verlegt");
    expect(csvFeld("@SUMME(A1)")).toBe("'@SUMME(A1)");
    expect(csvFeld('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
    expect(csvFeld("Steckdose; weiß")).toBe('"Steckdose; weiß"');
    expect(csvFeld("NYM-J 5x2,5")).toBe("NYM-J 5x2,5");
  });

  it("Zahlen mit Dezimalkomma, auch negative; leer bleibt leer", () => {
    expect(csvFeld(-2.5)).toBe("-2,5");
    expect(csvFeld(0)).toBe("0");
    expect(csvFeld(null)).toBe("");
    expect(csvFeld(undefined)).toBe("");
  });

  it("EAN als Text: führende Null bleibt, keine 4,01235E+12", () => {
    expect(csvFeld(alsText("0036000291452"))).toBe('"=""0036000291452"""');
    expect(csvFeld(alsText("4012345678901"))).toBe('"=""4012345678901"""');
    expect(csvFeld(alsText(null))).toBe("");
    expect(csvFeld(alsText(""))).toBe("");
  });
});
