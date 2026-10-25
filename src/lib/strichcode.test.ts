import { describe, expect, it } from "vitest";
import {
  codeBereinigen, codeVarianten, codeVerdaechtig, gs1Gtin, gtinPruefziffer, normalisieren, pruefzifferOk, upcEZuUpcA,
} from "./strichcode";

// Echte Codes aus dem Demo-Artikelstamm
const LS_B16 = "9004840010831"; // LS-Schalter B16 (Schrack)
const WAGO = "4050821027850"; // WAGO 2273-203
const YMJ = "9004840534344"; // YM-J 3x1,5

describe("Prüfziffer", () => {
  it("rechnet die GS1-Prüfziffer", () => {
    expect(gtinPruefziffer("900484001083")).toBe(1);
    expect(gtinPruefziffer("405082102785")).toBe(0);
    expect(gtinPruefziffer("9638507")).toBe(4); // EAN-8
    expect(gtinPruefziffer("03600029145")).toBe(2); // UPC-A
  });

  it("erkennt gültige Codes aller Längen", () => {
    for (const c of [LS_B16, WAGO, YMJ, "96385074", "036000291452", "0036000291452", "09004840010831"]) {
      expect(pruefzifferOk(c), c).toBe(true);
    }
  });

  it("lehnt falsche Prüfziffer und Nicht-GTINs ab", () => {
    expect(pruefzifferOk("9004840010832")).toBe(false);
    expect(pruefzifferOk("AM618116")).toBe(false);
    expect(pruefzifferOk("12345")).toBe(false);
    expect(pruefzifferOk("")).toBe(false);
  });

  it("prüft auch mit Leerzeichen", () => {
    expect(pruefzifferOk(" 9004 8400 10831 ")).toBe(true);
  });
});

describe("Bereinigen", () => {
  it("entfernt Leerzeichen, Zeilenumbruch und Steuerzeichen", () => {
    expect(codeBereinigen(" 9004 8400 10831\n")).toBe(LS_B16);
    expect(codeBereinigen("\u001d0109004840010831")).toBe("0109004840010831");
    expect(codeBereinigen(null)).toBe("");
  });
});

describe("UPC-E", () => {
  it("rechnet UPC-E in UPC-A um", () => {
    expect(upcEZuUpcA("04252614")).toBe("042100005264");
    expect(upcEZuUpcA("01234565")).toBe("012345000065");
  });

  it("gibt null für keinen gültigen UPC-E", () => {
    expect(upcEZuUpcA("04252615")).toBeNull(); // falsche Prüfziffer
    expect(upcEZuUpcA("96385074")).toBeNull(); // EAN-8, beginnt mit 9
    expect(upcEZuUpcA("1234")).toBeNull();
  });
});

describe("GS1-Etikett", () => {
  it("liest die Artikelnummer aus (01)", () => {
    expect(gs1Gtin("(01)09004840010831(10)CHARGE7")).toBe("09004840010831");
    expect(gs1Gtin("0109004840010831")).toBe("09004840010831");
    expect(gs1Gtin("]C10109004840010831\u001d10ABC")).toBe("09004840010831");
  });

  it("ignoriert anderes", () => {
    expect(gs1Gtin(LS_B16)).toBeNull();
    expect(gs1Gtin("(01)09004840010832")).toBeNull(); // Prüfziffer falsch
    expect(gs1Gtin("https://example.com/01")).toBeNull();
  });
});

describe("Normalisieren", () => {
  it("UPC-A wird EAN-13 mit führender 0", () => {
    expect(normalisieren("036000291452")).toBe("0036000291452");
  });

  it("EAN-13 und EAN-8 bleiben", () => {
    expect(normalisieren(` ${WAGO} `)).toBe(WAGO);
    expect(normalisieren("96385074")).toBe("96385074");
  });

  it("GTIN-14 mit führender 0 und GS1-Etikett werden EAN-13", () => {
    expect(normalisieren("09004840010831")).toBe(LS_B16);
    expect(normalisieren("(01)09004840010831(10)X")).toBe(LS_B16);
  });

  it("Karton-GTIN (Kennziffer 1) bleibt 14-stellig", () => {
    const karton = `1900484001083${gtinPruefziffer("1900484001083")}`;
    expect(normalisieren(karton)).toBe(karton);
  });

  it("falsche Prüfziffer und Text bleiben, nur bereinigt", () => {
    expect(normalisieren("03600029145 3")).toBe("036000291453");
    expect(normalisieren(" AM 618116 ")).toBe("AM618116");
  });
});

describe("Varianten für die Suche", () => {
  it("zuerst der Code wie gelesen", () => {
    expect(codeVarianten(LS_B16)).toEqual([LS_B16]);
    expect(codeVarianten(` ${LS_B16} `)[0]).toBe(LS_B16);
  });

  it("UPC-A und EAN-13 finden einander", () => {
    expect(codeVarianten("036000291452")).toEqual(["036000291452", "0036000291452"]);
    expect(codeVarianten("0036000291452")).toEqual(["0036000291452", "036000291452"]);
  });

  it("eingetippt mit Leerzeichen", () => {
    expect(codeVarianten("9004 8400 10831")).toEqual(["9004 8400 10831", LS_B16]);
  });

  it("UPC-E sucht auch als UPC-A und EAN-13", () => {
    expect(codeVarianten("04252614")).toEqual(["04252614", "042100005264", "0042100005264"]);
  });

  it("GS1-Etikett sucht die Artikelnummer", () => {
    const v = codeVarianten("(01)09004840010831(10)CHARGE7");
    expect(v[0]).toBe("(01)09004840010831(10)CHARGE7");
    expect(v).toContain(LS_B16);
    expect(v).toContain("09004840010831");
  });

  it("falsche Prüfziffer: keine umgerechneten Formen", () => {
    expect(codeVarianten("036000291453")).toEqual(["036000291453"]);
  });

  it("Text und QR bleiben, wie sie sind", () => {
    expect(codeVarianten("AM618116")).toEqual(["AM618116"]);
    expect(codeVarianten("https://elektro.demo/a/1")).toEqual(["https://elektro.demo/a/1"]);
  });

  it("leer bleibt leer", () => {
    expect(codeVarianten("   ")).toEqual([]);
  });
});

describe("Verdächtige Codes", () => {
  it("falsche Prüfziffer bei EAN-Länge", () => {
    expect(codeVerdaechtig("9004840010832")).toBe(true);
    expect(codeVerdaechtig(LS_B16)).toBe(false);
    expect(codeVerdaechtig("04252614")).toBe(false); // gültiger UPC-E
    expect(codeVerdaechtig("AM618116")).toBe(false);
  });
});
