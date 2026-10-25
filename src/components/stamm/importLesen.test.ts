import { describe, expect, it } from "vitest";
import { dateiArt, ImportFehler, importLesen, rabattgruppenAus } from "./importLesen";

// Nur selbst gebaute Beispielzeilen — keine Lieferantendateien.
const datei = (name: string, text: string | number[]) => ({
  name,
  daten: typeof text === "string" ? new TextEncoder().encode(text) : new Uint8Array(text),
});

const DN4_ARTIKEL = [
  "V 050926ZZ Testgroßhandel                        Artikelanlage                                                  04EUR",
  "A;N;100;00;TEST Steckdose;weiß;1;0;ST;250;R1;H1;",
  "A;N;200;00;TEST Leerrohr M20;;1;2;M;12500;R2;H2;",
].join("\r\n");
const DN4_RABATT = "R;R1;1;3500;Schalterprogramme\r\nR;R2;1;1000;Rohre";

describe("Dateien erkennen", () => {
  it("ZIP, Excel, leer, Datanorm, Text", () => {
    expect(dateiArt(datei("preise.zip", [0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBe("zip");
    expect(dateiArt(datei("liste.xlsx", [0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBe("excel");
    expect(dateiArt(datei("alt.xls", [0xd0, 0xcf, 0x11, 0xe0, 1]))).toBe("excel");
    expect(dateiArt(datei("x.csv", ""))).toBe("leer");
    expect(dateiArt(datei("ARTIKEL.001", DN4_ARTIKEL))).toBe("datanorm");
    expect(dateiArt(datei("liste.csv", "Artikelnummer;Bezeichnung\n1;X"))).toBe("text");
  });

  it("verständliche Fehler statt Zeichensalat", async () => {
    await expect(importLesen([datei("liste.xlsx", [0x50, 0x4b, 0x03, 0x04])])).rejects.toThrow(/Excel/);
    await expect(importLesen([datei("dn.zip", [0x50, 0x4b, 0x03, 0x04])])).rejects.toThrow(/entpacken/);
    await expect(importLesen([datei("leer.csv", "")])).rejects.toThrow(/leer/);
    await expect(importLesen([datei("a.csv", "Nr;Bezeichnung\n1;A"), datei("b.csv", "Nr;Bezeichnung\n2;B")])).rejects.toThrow(/nur eine CSV/);
    // nur Preise ohne Artikeldatei
    const nurPreise = importLesen([datei("DATPREIS.001", "V;050;P;20260209;EUR;\nP;124;1;1;2950;124;1;0;1;0;1;0;20260209")]);
    await expect(nurPreise).rejects.toBeInstanceOf(ImportFehler);
    await expect(nurPreise).rejects.toThrow(/Artikeldatei/);
  });
});

describe("Datanorm lesen", () => {
  it("mehrere Dateien zusammen, fremde Dateien übergangen, Warengruppe und Preise je Einheit", async () => {
    const g = await importLesen([datei("ARTIKEL.001", DN4_ARTIKEL), datei("RABATT.RAB", DN4_RABATT), datei("liesmich.txt", "Hallo!\nDas ist keine Datanorm-Datei.")]);
    if (g.art !== "datanorm") throw new Error("Datanorm erwartet");
    expect(g.ergebnis.version).toBe(4);
    expect(g.ergebnis.firma).toBe("ZZ Testgroßhandel");
    expect(g.uebergangen).toEqual(["liesmich.txt"]);
    expect(g.artikel).toEqual([
      { artikelnummer: "100", bezeichnung: "TEST Steckdose weiß", langtext: null, einheit: "Stk", ean: null, hersteller: null,
        hersteller_nr: null, warengruppe: "H1", rabattgruppe: "R1", listenpreis: 2.5, netto: null },
      { artikelnummer: "200", bezeichnung: "TEST Leerrohr M20", langtext: null, einheit: "m", ean: null, hersteller: null,
        hersteller_nr: null, warengruppe: "H2", rabattgruppe: "R2", listenpreis: 1.25, netto: null },
    ]);
    expect(rabattgruppenAus(g.artikel, g.ergebnis.rabattgruppen)).toEqual([
      { code: "R1", name: "Schalterprogramme", anzahl: 1, rabatt: 35 },
      { code: "R2", name: "Rohre", anzahl: 1, rabatt: 10 },
    ]);
  });
});

describe("CSV lesen", () => {
  it("Titelzeile übersprungen, Spalten erkannt, Windows-Zeichensatz", async () => {
    const text = "Preisliste Oktober;;;\r\nArt.-Nr.;Bezeichnung;EAN;Nettopreis\r\n4711;TEST Abzweigdose grau;4012345678901;1,95\r\n4712;TEST Dübel;;0,10\r\n";
    const daten = [...Buffer.from(text, "latin1")];
    const g = await importLesen([datei("liste.csv", daten)]);
    if (g.art !== "csv") throw new Error("CSV erwartet");
    expect(g.zeichensatz).toBe("windows-1252");
    expect(g.trennzeichen).toBe(";");
    expect(g.kopf).toBe(1);
    expect(g.kopfErkannt).toBe(true);
    expect(g.zuordnung).toMatchObject({ artikelnummer: 0, bezeichnung: 1, ean: 2, ek_preis: 3 });
    expect(g.auswertung.artikel.map((a) => [a.artikelnummer, a.bezeichnung, a.ean, a.netto])).toEqual([
      ["4711", "TEST Abzweigdose grau", "4012345678901", 1.95],
      ["4712", "TEST Dübel", null, 0.1],
    ]);
  });

  it("ohne erkennbare Kopfzeile: erste Zeile, nichts zugeordnet", async () => {
    const g = await importLesen([datei("x.csv", "a,b,c\n1,2,3\n")]);
    if (g.art !== "csv") throw new Error("CSV erwartet");
    expect(g.kopfErkannt).toBe(false);
    expect(g.kopf).toBe(0);
    expect(g.zuordnung).toEqual({});
    expect(g.auswertung.artikel).toEqual([]);
    expect(g.auswertung.ohneNummer).toBe(1);
  });

  it("Zeichensatz und Trennzeichen lassen sich vorgeben", async () => {
    const g = await importLesen([datei("x.csv", "Nr,Bezeichnung;Teil\n1,A;B\n")], { trennzeichen: ",", zeichensatz: "utf-8" });
    if (g.art !== "csv") throw new Error("CSV erwartet");
    expect(g.trennzeichen).toBe(",");
    expect(g.zeilen[1]).toEqual(["1", "A;B"]);
  });
});
