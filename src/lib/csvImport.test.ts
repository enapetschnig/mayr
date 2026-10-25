import { describe, expect, it } from "vitest";
import {
  CsvLeser, csvArtikel, csvArtikelStueckweise, csvZerlegen, dezimalLesen, kopfzeileFinden, spaltenName, spaltenZuordnen,
  trennzeichenErkennen, zahlenFormatErkennen,
} from "./csvImport";

describe("Zahlen", () => {
  it("deutsch, englisch, mit Währung, Tausenderpunkt", () => {
    expect(dezimalLesen("12,50")).toBe(12.5);
    expect(dezimalLesen("1.250,50")).toBe(1250.5);
    expect(dezimalLesen("1,250.50")).toBe(1250.5);
    expect(dezimalLesen("12.5")).toBe(12.5);
    expect(dezimalLesen("1.250")).toBe(1250);
    expect(dezimalLesen("0.125")).toBe(0.125);
    expect(dezimalLesen("12,50 €")).toBe(12.5);
    expect(dezimalLesen("EUR 3,99")).toBe(3.99);
    expect(dezimalLesen("")).toBeNull();
    expect(dezimalLesen("abc")).toBeNull();
    expect(dezimalLesen(null)).toBeNull();
    expect(dezimalLesen(7)).toBe(7);
  });
  it("Schreibweise einer Spalte", () => {
    expect(zahlenFormatErkennen(["12.125", "3.50", "1.99"])).toBe("punkt");
    expect(zahlenFormatErkennen(["12,125", "3,50"])).toBe("komma");
    expect(zahlenFormatErkennen(["12", "3"])).toBeNull();
  });
});

describe("Zerlegen", () => {
  it("Trennzeichen: Strichpunkt trotz Beistrich in Preisen, Tab, Beistrich", () => {
    expect(trennzeichenErkennen(["Preisliste 2026", "Nr;Bezeichnung;EK;VK", "1;Dose;0,15;0,30", "2;Rohr;1,05;2,10"])).toBe(";");
    expect(trennzeichenErkennen(["Nr\tBezeichnung\tEK", "1\tDose, grau\t0,15"])).toBe("\t");
    expect(trennzeichenErkennen(["Nr,Bezeichnung,EK", '1,"Dose; grau",0.15', "2,Rohr,1.05"])).toBe(",");
  });
  it("Anführungszeichen mit Trennzeichen, Zeilenumbruch und verdoppeltem Zeichen; leere Zeilen fallen weg", () => {
    const text = 'Nr;Bezeichnung;Langtext\r\n1;"Dose; grau";"Zeile 1\r\nZeile 2"\r\n\r\n2;"Zoll 3/4""";\n3;Ende';
    expect(csvZerlegen(text, ";")).toEqual([
      ["Nr", "Bezeichnung", "Langtext"],
      ["1", "Dose; grau", "Zeile 1\r\nZeile 2"],
      ["2", 'Zoll 3/4"', ""],
      ["3", "Ende"],
    ]);
  });
  it("Stück für Stück: Grenzen mitten im Feld, im Anführungszeichen und zwischen \" und \"", () => {
    const text = 'a;"b""c";"d\ne";f\r\ng;h';
    for (let schnitt = 1; schnitt < text.length; schnitt++) {
      const l = new CsvLeser(";");
      l.text(text.slice(0, schnitt));
      l.text(text.slice(schnitt));
      expect(l.ende()).toEqual([["a", 'b"c', "d\ne", "f"], ["g", "h"]]);
    }
  });
  it("Anführungszeichen mitten im Feld bleibt stehen", () => {
    expect(csvZerlegen('1;Rohr 3/4" grau;2', ";")).toEqual([["1", 'Rohr 3/4" grau', "2"]]);
  });
});

describe("Spalten zuordnen", () => {
  it("Namen vereinheitlichen", () => {
    expect(spaltenName("Art.-Nr.")).toBe("artnr");
    expect(spaltenName("Stückpreis €")).toBe("stueckpreis");
    expect(spaltenName("EAN / GTIN")).toBe("eangtin");
  });
  it("exakte Namen und Teil-Treffer, Hersteller-Nr. nicht als Artikelnummer", () => {
    const kopf = ["Art.-Nr.", "Kurztext 1", "Kurztext 2", "Hersteller-Artikelnummer", "Hersteller", "EAN / GTIN", "ME",
      "Listenpreis netto", "Ihr Preis", "PE", "Rabattgruppe", "Warengruppe", "Lieferant"];
    expect(spaltenZuordnen(kopf)).toEqual({
      artikelnummer: 0, bezeichnung: 1, bezeichnung2: 2, hersteller_nr: 3, hersteller: 4, ean: 5, einheit: 6,
      listenpreis: 7, ek_preis: 8, preiseinheit: 9, rabattgruppe: 10, warengruppe: 11,
    });
    expect(spaltenZuordnen(["Artikelnummer Hersteller", "Artikelnummer", "Bezeichnung", "Einkaufspreis netto €"])).toEqual({
      hersteller_nr: 0, artikelnummer: 1, bezeichnung: 2, ek_preis: 3,
    });
  });
  it("Kopfzeile nach Titelzeilen finden", () => {
    const zeilen = [["Preisliste Elektro 2026"], ["Stand: Oktober"], ["Artikelnummer", "Bezeichnung", "Preis"], ["1", "Dose", "0,15"]];
    expect(kopfzeileFinden(zeilen)).toBe(2);
    expect(kopfzeileFinden([["a", "b"], ["1", "2"]])).toBe(-1);
  });
});

describe("Zeilen → Artikel", () => {
  const text = [
    "Artikelnummer;Bezeichnung;Bezeichnung 2;EAN;Einheit;Listenpreis;EK;PE;Rabattgruppe",
    "100;NYM-J 3x1,5;Ring 100 m;9006445041715;MTR;89,50;62,65;100;124",
    "200;Abzweigdose;;'4012345678901;ST;1.250,00;;1;",
    ";ohne Nummer;;;;1,00;;;",
    "300;;;;;1,00;;;",
    "400;Excel-EAN;;4,01235E+12;;;0,99;;",
  ].join("\n");
  const zeilen = csvZerlegen(text);
  const kopf = kopfzeileFinden(zeilen);
  const zu = spaltenZuordnen(zeilen[kopf]);

  it("Preise je Einheit (Preiseinheit), EAN bereinigt, Gründe fürs Überspringen", () => {
    const e = csvArtikel(zeilen, kopf, zu);
    expect(e.ohneNummer).toBe(1);
    expect(e.ohneBezeichnung).toBe(1);
    expect(e.artikel).toHaveLength(3);
    expect(e.artikel[0]).toEqual({
      artikelnummer: "100", bezeichnung: "NYM-J 3x1,5 Ring 100 m", langtext: null, einheit: "m", ean: "9006445041715",
      hersteller: null, hersteller_nr: null, warengruppe: null, rabattgruppe: "124", listenpreis: 0.895, netto: 0.6265,
    });
    expect(e.artikel[1]).toMatchObject({ einheit: "Stk", ean: "4012345678901", listenpreis: 1250, netto: null, rabattgruppe: null });
    expect(e.artikel[2]).toMatchObject({ ean: null, netto: 0.99, einheit: "Stk" });
  });

  it("stückweise liefert dasselbe", async () => {
    const e = await csvArtikelStueckweise(zeilen, kopf, zu);
    expect(e).toEqual(csvArtikel(zeilen, kopf, zu));
  });
});
