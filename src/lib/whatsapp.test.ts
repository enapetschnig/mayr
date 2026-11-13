import { describe, expect, it } from "vitest";
import { istFestnetz, nummerText, vorlageFuellen, vorlagenLesen, VORLAGEN_VORGABE, waLink, waNummer } from "./whatsapp";

describe("waNummer", () => {
  it("österreichische Handynummern in allen Schreibweisen", () => {
    expect(waNummer("0664 123 45 67")).toBe("436641234567");
    expect(waNummer("0664/1234567")).toBe("436641234567");
    expect(waNummer("+43 664 1234567")).toBe("436641234567");
    expect(waNummer("+43 (0)664 1234567")).toBe("436641234567");
    expect(waNummer("0043 664 1234567")).toBe("436641234567");
    expect(waNummer("664 1234567")).toBe("436641234567");
    expect(waNummer(" 0676-123 45 67 ")).toBe("436761234567");
  });
  it("die 0 nach der Ländervorwahl fällt weg", () => {
    expect(waNummer("+43 0664 1234567")).toBe("436641234567");
    expect(waNummer("0049 0151 12345678")).toBe("4915112345678");
  });
  it("ausländische Nummern bleiben", () => {
    expect(waNummer("+49 151 12345678")).toBe("4915112345678");
    expect(waNummer("0039 333 1234567")).toBe("393331234567");
    expect(waNummer("+386 41 123 456")).toBe("38641123456");
  });
  it("unbrauchbar → null", () => {
    expect(waNummer("")).toBeNull();
    expect(waNummer(null)).toBeNull();
    expect(waNummer("keine")).toBeNull();
    expect(waNummer("123")).toBeNull();
  });
});

describe("istFestnetz", () => {
  it("Handy-Vorwahlen 650–699 sind keine Festnetznummern", () => {
    expect(istFestnetz("436641234567")).toBe(false);
    expect(istFestnetz("436501234567")).toBe(false);
    expect(istFestnetz(waNummer("03862 12345"))).toBe(true);
    expect(istFestnetz(waNummer("0316 123456"))).toBe(true);
    expect(istFestnetz("4915112345678")).toBe(false);
    expect(istFestnetz(null)).toBe(false);
  });
});

describe("Vorlagen", () => {
  it("füllt Platzhalter, Unbekanntes bleibt, Leeres wird –", () => {
    expect(vorlageFuellen("Hallo {kunde}, {datum} {xyz}", { kunde: " Müller & Söhne ", datum: "" })).toBe("Hallo Müller & Söhne, – {xyz}");
  });
  it("leere oder kaputte Vorlagen → Vorgaben", () => {
    expect(vorlagenLesen(null)).toBe(VORLAGEN_VORGABE);
    expect(vorlagenLesen([{ name: "", text: "x" }, 5])).toBe(VORLAGEN_VORGABE);
    expect(vorlagenLesen([{ name: "A", text: "B" }])).toEqual([{ name: "A", text: "B" }]);
  });
  it("Link und Anzeige", () => {
    expect(waLink("436641234567", "Grüß Gott & Danke")).toBe("https://wa.me/436641234567?text=Gr%C3%BC%C3%9F%20Gott%20%26%20Danke");
    expect(nummerText("436641234567")).toBe("+43 664 1234567");
    expect(nummerText("4915112345678")).toBe("+4915112345678");
  });
});
