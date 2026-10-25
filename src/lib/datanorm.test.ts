import { describe, expect, it } from "vitest";
import {
  HAEPPCHEN, dateiText, datanormDateiart, datanormDateienLesen, datanormLesen, datanormLesenMehrere, einheitNorm,
  istDatanorm, kurztextVerbinden, versionAusVorlauf, zeichensatzErkennen, zeichensatzErkennenStueckweise,
  zeilenStueckweise,
} from "./datanorm";

// Nur selbst gebaute Zeilen im Aufbau der Formate — keine Lieferantendateien.
const bytes = (...teile: (string | number[])[]) =>
  new Uint8Array(teile.flatMap((t) => (typeof t === "string" ? [...Buffer.from(t, "latin1")] : t)));

describe("Zeichensätze", () => {
  it("CP850, Windows-1252 und UTF-8", () => {
    const dos = bytes("A;N;1;00;Abzweigd", [0x81], "bel ", [0x84], "u", [0xe1], "ere ", [0xf8], [0xfd]);
    expect(zeichensatzErkennen(dos)).toBe("cp850");
    expect(dateiText(dos)).toBe("A;N;1;00;Abzweigdübel äußere °²");
    const win = bytes("Steckdose f", [0xfc], "r Au", [0xdf], "en ", [0xe4]);
    expect(zeichensatzErkennen(win)).toBe("windows-1252");
    expect(dateiText(win)).toBe("Steckdose für Außen ä");
    expect(dateiText(new TextEncoder().encode("Dübel"))).toBe("Dübel");
    expect(zeichensatzErkennen(new TextEncoder().encode("Größe"))).toBe("utf-8");
  });
  it("CP850 deckt die ganze obere Hälfte ab", () => {
    const alle = new Uint8Array(128).map((_, i) => 0x80 + i);
    const text = dateiText(alle, "cp850");
    expect(text).toHaveLength(128);
    expect(text.startsWith("ÇüéâäàåçêëèïîìÄÅÉ")).toBe(true);
    expect(text.charCodeAt(127)).toBe(0xa0);
  });
  it("DOS-Dateiende (0x1A) und UTF-8-BOM fallen weg", () => {
    expect(dateiText(bytes("A;N;1;00;X;;1;0;ST;100;;;\r\n", [0x1a]))).toBe("A;N;1;00;X;;1;0;ST;100;;;\r\n");
    expect(dateiText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("A");
  });
  it("stückweise erkennen: Umlaut erst hinter dem ersten Häppchen", async () => {
    const gross = new Uint8Array(HAEPPCHEN + 10).fill(0x41);
    gross[HAEPPCHEN + 5] = 0x81; // ü in CP850 — im ersten MB nur ASCII
    expect(await zeichensatzErkennenStueckweise(gross)).toBe("cp850");
    const utf8 = new TextEncoder().encode("x".repeat(HAEPPCHEN - 1) + "ü"); // ü über die Grenze geschnitten
    expect(await zeichensatzErkennenStueckweise(utf8)).toBe("utf-8");
  });
  it("Zeilen über Häppchengrenzen hinweg, auch mit zerschnittenem UTF-8-Zeichen", async () => {
    const zeile1 = "A;N;1;" + "x".repeat(HAEPPCHEN - 8) + "ü;Ende";
    const text = `${zeile1}\r\nA;N;2;Zweite\r\n\r\nA;N;3;Dritte`;
    const zeilen: string[] = [];
    const anteile: number[] = [];
    await zeilenStueckweise(new TextEncoder().encode(text), "utf-8", (z) => zeilen.push(z), (a) => anteile.push(a));
    expect(zeilen).toEqual([zeile1, "A;N;2;Zweite", "A;N;3;Dritte"]);
    expect(anteile.length).toBe(2);
    expect(anteile.at(-1)).toBe(1);
  });
});

describe("Erkennen", () => {
  it("Version am Vorlauf, Dateiart an den Satzarten", () => {
    expect(versionAusVorlauf("V;050;A;20260201;EUR;Artikelanlage;;;ZZ Elektrogroßhandel GmbH;")).toBe(5);
    expect(versionAusVorlauf("V 220726                                        Preisdatei     04EUR")).toBe(4);
    expect(datanormDateiart("V;050;P;20260209;EUR;\nP;124;1;1;2950;124;1;0;1;0;1;0;20260209")).toBe("preise");
    expect(datanormDateiart("V;050;S;20260209;EUR;\nS;001;;Installationsmaterial")).toBe("warengruppen");
    expect(datanormDateiart("R;100;1;3500;Schalterprogramme")).toBe("rabatt");
    expect(istDatanorm("A;N;123;00;Steckdose;;1;0;ST;250;R1;H;")).toBe(true);
    // CSV mit Kopfzeile ist keine Datanorm-Datei, auch wenn sie mit „A“ beginnt
    expect(istDatanorm("Artikelnummer;Bezeichnung;EK\n123;Steckdose;2,50")).toBe(false);
    expect(istDatanorm("")).toBe(false);
  });
  it("Kurztexte: am Feldende getrennte Wörter zusammensetzen", () => {
    expect(kurztextVerbinden("NYM-J 3x1,5 mm2 Mantelleitung grau Ring 1", "00 m")).toBe("NYM-J 3x1,5 mm2 Mantelleitung grau Ring 1 00 m");
    expect(kurztextVerbinden("ZZ Schalterprogramm Abdeckrahmen 1-fach Stei", "nweiß glänzend")).toBe("ZZ Schalterprogramm Abdeckrahmen 1-fach Steinweiß glänzend");
    expect(kurztextVerbinden("Abzweigdose", "")).toBe("Abzweigdose");
    expect(kurztextVerbinden("", "nur zweite Zeile")).toBe("nur zweite Zeile");
  });
  it("Einheiten auf die Einheiten der App", () => {
    expect(["PCE", "STCK", "ST", "MTR", "LFM", "MTK", "KGM", "LTR", "PK", "ro", "SET", "XYZ", "Stk."].map(einheitNorm))
      .toEqual(["Stk", "Stk", "Stk", "m", "m", "m²", "kg", "l", "Pkg", "Rolle", "Set", "XYZ", "Stk"]);
  });
});

describe("DATANORM 4", () => {
  const DN4 = [
    "V 050926ZZ Elektrogroßhandel                     Artikelanlage                                                  04EUR",
    "A;N;0123456;00;Kabelbinder 200x4,8;schwarz UV-best.;1;2;ST;1890;R12;KB;",
    "A;N;0987654;00;Wago Klemme 3x2,5;;2;0;ST;45;R10;KL;",
    "A;N;5555555;00;NYM-J 3x1,5;Ring 100 m;1;3;M;98000;R20;KA;",
    "B;N;0123456;KB2004;;;0;0;0;4012345678901;;KB1;0;100;;;",
    "P;A;0123456;1;2000;1;0;0;0;0987654;2;48;1;0;0;0",
    "A;N;LOESCH1;00;Alt;;1;0;ST;100;;;",
    "A;L;LOESCH1;;;;;;;;;;",
  ].join("\r\n");

  it("A-, B- und P-Satz (Blocklänge 7), Preiseinheit-Code 0–3, Löschen", () => {
    const e = datanormLesen(DN4);
    expect(e.version).toBe(4);
    expect(e.firma).toBe("ZZ Elektrogroßhandel");
    expect(e.artikel).toHaveLength(3);
    expect(e.geloescht).toBe(1);
    const kb = e.artikel.find((a) => a.artikelnummer === "0123456")!;
    // P-Satz ersetzt die Liste aus dem A-Satz: 20,00 je 100 St → 0,20 je St
    expect(kb).toMatchObject({
      bezeichnung: "Kabelbinder 200x4,8 schwarz UV-best.", einheit: "Stk", preiseinheit: 100,
      listenpreis: 0.2, netto: null, rabattgruppe: "R12", hauptwarengruppe: "KB", warengruppe: "KB1", ean: "4012345678901",
    });
    expect(e.artikel.find((a) => a.artikelnummer === "0987654")).toMatchObject({ listenpreis: null, netto: 0.48, preiseinheit: 1 });
    // Code 3 = je 1000: 980,00 € je 1000 m → 0,98 € je m
    expect(e.artikel.find((a) => a.artikelnummer === "5555555")).toMatchObject({ einheit: "m", listenpreis: 0.98, preiseinheit: 1000 });
  });

  it("Artikel mit Preis 0 + Preisdatei mit 9er-Blöcken, Reihenfolge der Dateien egal", () => {
    const artikel = [
      "V 220726                                                                                                     04EUR",
      "A;N;111-100;00;Schraube M5x16 verzinkt; ;2;2;ST;0;001;0; ;",
      "A;N;222-10;00;Mutter M8; ;2;1;ST;0;001;0; ;",
      "A;N;333;00;Ohne Preis; ;2;0;ST;0;001;0; ;",
      "B;N;111-100;SCHR516; ; ;0;0;0;4048678438400; ;1;0;100; ; ;",
    ].join("\r\n");
    const preise = [
      "V 220726ZZ Befestigung                          Preisdatei                                         04EUR",
      "P;A;111-100;2;1342;;;;;;;222-10;2;4126;;;;;;;999;2;100;;;;;;;",
    ].join("\r\n");
    const wrg = ["V 220726                                                     04EUR", "S;;0;Schrauben;;;", "S;;0;;1;Sechskantschrauben;"].join("\r\n");
    for (const reihenfolge of [[artikel, preise, wrg], [preise, wrg, artikel]]) {
      const e = datanormLesenMehrere(reihenfolge.map((text) => ({ text })));
      expect(e.artikel.find((x) => x.artikelnummer === "111-100")).toMatchObject({
        netto: 0.1342, preiseinheit: 100, hauptwarengruppe: "0", warengruppe: "1", warengruppeName: "Sechskantschrauben",
        ean: "4048678438400",
      });
      expect(e.artikel.find((x) => x.artikelnummer === "222-10")!.netto).toBe(4.126);
      // Preis 0 im Artikelsatz = ohne Preis, nicht 0 €
      expect(e.artikel.find((x) => x.artikelnummer === "333")).toMatchObject({ listenpreis: null, netto: null });
      expect(e.preiseOhneArtikel).toBe(1);
      expect(e.ohnePreis).toBe(1);
    }
  });

  it("Preis 0 in der Preisdatei überschreibt keinen Preis aus dem Artikelsatz", () => {
    const e = datanormLesenMehrere([{ text: "A;N;1;00;Leerrohr M20;;2;0;M;125;;H;" }, { text: "P;A;1;2;0;;;;;;" }]);
    expect(e.artikel[0].netto).toBe(1.25);
  });

  it("Rabatt im P-Satz (RabKz 1) ergibt den Nettopreis", () => {
    const e = datanormLesenMehrere([{ text: "A;N;7;00;Schalter;;1;0;ST;1000;R1;H;" }, { text: "P;A;7;1;1000;1;3000;0;0" }]);
    expect(e.artikel[0]).toMatchObject({ listenpreis: 10, netto: 7, rabattDatei: 30 });
  });
});

describe("DATANORM 5", () => {
  const A5 = [
    "V;050;A;20260209;EUR;Neuanlagen;;;ZZ Elektrogroßhandel GmbH;;;Teststraße 1;A;4020;Linz",
    "A;N;100;NYM-J 3x1,5 mm2 grau;Ring 100 m;MTR;1;100;8950;124;001;274;NYMJ315;;04012106;;;;9006445041715;;1;;0;;;1;;;",
    "A;N;200;ZZ Abdeckrahmen 1-fach reinweiß glänzend Ser;ie 55;st;1;1;395;490;004;162;;;4171;;;;;;1;;0;;;1;;;",
    "A;N;300;ZZ Leitungsschutzschalter B16 1-polig;;st;2;1;412;502;008;300;;;;;;;;;;;;",
    "A;N;400;ZZ ohne Preis;;st;1;1;0;502;008;300;;;;;;;;;;;;",
    "A;L;500;;;;;;;;;;;;;;;;;;;;;;",
    "E;5;;",
  ].join("\r\n");
  const P5 = [
    "V;050;P;20260209;EUR;Preise;;;ZZ Elektrogroßhandel GmbH;",
    "P;100;2;100;6265;124;1;0;1;0;1;0;20260209",
    "P;200;1;1;395;490;1;4500;1;0;1;0;20260209",
  ].join("\r\n");
  const W5 = ["V;050;S;20260209;EUR;", "S;001;;Installationsmaterial", "S;001;274;Mantelleitungen"].join("\r\n");
  const R5 = ["V;050;R;20260209;EUR;", "R;124;1;3500;Kabel und Leitungen", "R;490;1;4000;Schalterprogramme"].join("\r\n");

  it("A-Satz: Einheit an Stelle 5, Preiseinheit als Menge, EAN an Stelle 18", () => {
    const e = datanormLesen(A5);
    expect(e.version).toBe(5);
    expect(e.firma).toBe("ZZ Elektrogroßhandel GmbH");
    expect(e.geloescht).toBe(1);
    expect(e.artikel).toHaveLength(4);
    expect(e.artikel.find((x) => x.artikelnummer === "100")).toMatchObject({
      bezeichnung: "NYM-J 3x1,5 mm2 grau Ring 100 m", einheit: "m", einheitRoh: "MTR", listenpreis: 0.895, netto: null,
      preiseinheit: 100, rabattgruppe: "124", hauptwarengruppe: "001", warengruppe: "274", ean: "9006445041715",
    });
    // Wort am Feldende getrennt („Ser“ + „ie 55“)
    expect(e.artikel.find((x) => x.artikelnummer === "200")!.bezeichnung).toBe("ZZ Abdeckrahmen 1-fach reinweiß glänzend Serie 55");
    // PK 2 = Nettopreis
    expect(e.artikel.find((x) => x.artikelnummer === "300")).toMatchObject({ listenpreis: null, netto: 4.12 });
    expect(e.artikel.find((x) => x.artikelnummer === "400")).toMatchObject({ listenpreis: null, netto: null });
    expect(e.ohnePreis).toBe(1);
  });

  it("Preisdatei (Netto, Rabatt), Warengruppen- und Rabattgruppen-Datei in beliebiger Reihenfolge", () => {
    const e = datanormLesenMehrere([{ name: "DATANORM.RAB", text: R5 }, { text: P5 }, { text: A5 }, { text: W5 }]);
    expect(e.artikel.find((x) => x.artikelnummer === "100")).toMatchObject({
      listenpreis: 0.895, netto: 0.6265, warengruppeName: "Mantelleitungen",
    });
    // Liste 3,95 mit 45 % Rabatt aus der Preisdatei
    expect(e.artikel.find((x) => x.artikelnummer === "200")).toMatchObject({ listenpreis: 3.95, netto: 2.1725, rabattDatei: 45 });
    expect(e.rabattgruppen).toEqual([
      { code: "124", name: "Kabel und Leitungen", rabatt: 35 },
      { code: "490", name: "Schalterprogramme", rabatt: 40 },
    ]);
    expect(e.dateien.map((d) => d.art)).toEqual(["rabatt", "preise", "artikel", "warengruppen"]);
  });

  it("große Dateien: Bytes in Häppchen, Zeichensatz je Datei, Fortschritt bis 1", async () => {
    const zeilen = ["V;050;A;20260209;EUR;Test;;;ZZ Elektro;"];
    for (let i = 0; i < 6000; i++) {
      zeilen.push(`A;N;${10000 + i};ZZ Abzweigdose ${i} gr${"ü"}n ${"x".repeat(150)};;st;1;1;${100 + i};R1;001;002;;;;;;;;;;;;;;;`);
    }
    const text = zeilen.join("\r\n");
    // als CP850: ü = 0x81
    const daten = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) daten[i] = text.charCodeAt(i) === 0xfc ? 0x81 : text.charCodeAt(i);
    expect(daten.length).toBeGreaterThan(HAEPPCHEN);
    const anteile: number[] = [];
    const e = await datanormDateienLesen([{ name: "DATANORM.001", daten }], { fortschritt: (a) => anteile.push(a) });
    expect(e.zeichensaetze).toEqual(["cp850"]);
    expect(e.artikel).toHaveLength(6000);
    expect(e.artikel[5999]).toMatchObject({ artikelnummer: "15999", listenpreis: 60.99 });
    expect(e.artikel[0].bezeichnung).toMatch(/^ZZ Abzweigdose 0 grün x+$/);
    expect(anteile.at(-1)).toBeCloseTo(1);
    expect(anteile.every((a, i) => i === 0 || a >= anteile[i - 1])).toBe(true);
  });
});
