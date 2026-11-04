import { describe, expect, it } from "vitest";
import {
  bmdAusgang, bmdEingang, buchungenText, kontrolle, personenkontenText, rzlAusgang, rzlEingang, windows1252,
  type FibuBeleg, type FibuEingang, type FibuKonten,
} from "./fibu";

const konten: FibuKonten = {
  erloes20: 4120, erloes13: 4005, erloes10: 4010, erloes0: 4100, erloesBau: 4106,
  material: 5100, fremdleistung: 5110, werkzeug: 5200, fahrzeug: 7320, buero: 7600, sonstiges: 7800,
};
const kunde = { nummer: 100, name: "Muster", strasse: "Weg 1", plz: "4020", ort: "Linz", uid: null };
const beleg = (x: Partial<FibuBeleg> = {}): FibuBeleg => ({
  id: "b1", nummer: "100", datum: "2025-01-15", faellig_am: null, status: "offen", netto: 10000, ust: 2000, brutto: 12000, ust_satz: 20,
  reverse_charge: false, empf_name: "Muster", empf_uid: null, teil_nr: null, storno_von: null, kunde, ...x,
});
const eingang = (x: Partial<FibuEingang> = {}): FibuEingang => ({
  id: "abcdef12-0000-0000-0000-000000000000", lieferant: "Lieferant", nummer: "101", datum: "2025-01-17", faellig_am: null, netto: 10000, ust: 2000, brutto: 12000,
  ust_satz: 20, reverse_charge: false, kategorie: "material", datei_pfad: "x.pdf", kreditor: 30100, ...x,
});
/** Die Felder bis zur Buchungsart, die die Hersteller-Beispiele festlegen */
const kern = (z: string) => z.split(";").slice(0, 20).join(";");

describe("RZL: Satzaufbau wie im Handbuch Datenimport", () => {
  it("Ausgangsrechnung Inland (Beispiel 1)", () => {
    const [kundeZeile, erloes] = rzlAusgang(beleg(), konten, false);
    expect(kern(kundeZeile)).toBe("20100;4120;100;15012025;;EUR;12000,00;0,00;0,00;;0,00;0,00;0;AR;100;1;20;2;0;1");
    expect(kern(erloes)).toBe("4120;20100;100;15012025;;EUR;0,00;10000,00;2000,00;;0,00;0,00;0;AR;100;1;20;2;0;1");
    expect(kundeZeile.split(";")).toHaveLength(37);
  });
  it("Gutschrift (Beispiel 7): Erlös im Soll, Steuer negativ, Kunde im Haben", () => {
    const [erloes, kundeZeile] = rzlAusgang(beleg({ nummer: "101", datum: "2025-01-17", netto: -1000, ust: -200, brutto: -1200 }), konten, false);
    expect(kern(erloes)).toBe("4120;20100;101;17012025;;EUR;1000,00;0,00;-200,00;;0,00;0,00;0;AR;101;1;20;2;0;1");
    expect(kern(kundeZeile)).toBe("20100;4120;101;17012025;;EUR;0,00;1200,00;0,00;;0,00;0,00;0;AR;101;1;20;2;0;1");
  });
  it("Bauleistung (Beispiel 6) mit UID, Kleinunternehmer (Beispiel 18)", () => {
    const bau = rzlAusgang(beleg({ nummer: "105", datum: "2025-01-27", netto: 10000, ust: 0, brutto: 10000, reverse_charge: true, empf_uid: "ATU 12345678", kunde: { ...kunde, nummer: 600 } }), konten, false);
    expect(kern(bau[0])).toBe("20600;4106;105;27012025;;EUR;10000,00;0,00;0,00;;0,00;0,00;0;AR;105;1;1;2;14;1");
    expect(kern(bau[1])).toBe("4106;20600;105;27012025;;EUR;0,00;10000,00;0,00;;0,00;0,00;0;AR;105;1;1;2;14;1");
    expect(bau[0].split(";")[25]).toBe("ATU12345678");
    const klein = rzlAusgang(beleg({ nummer: "200", datum: "2025-05-15", netto: 1000, ust: 0, brutto: 1000, kunde: { ...kunde, nummer: 0 } }), konten, true);
    expect(kern(klein[0])).toBe("20000;4100;200;15052025;;EUR;1000,00;0,00;0,00;;0,00;0,00;0;AR;200;1;1;2;22;1");
  });
  it("Eingangsrechnung, ER-Gutschrift (Beispiel 25), Bauleistung (Beispiel 27)", () => {
    const [auf, lief] = rzlEingang(eingang(), konten);
    expect(kern(auf)).toBe("5100;30100;101;17012025;;EUR;10000,00;0,00;2000,00;;0,00;0,00;0;ER;101;1;20;1;0;1");
    expect(kern(lief)).toBe("30100;5100;101;17012025;;EUR;0,00;12000,00;0,00;;0,00;0,00;0;ER;101;1;20;1;0;1");
    const gut = rzlEingang(eingang({ netto: -1000, ust: -200, brutto: -1200 }), konten);
    expect(kern(gut[0])).toBe("30100;5100;101;17012025;;EUR;1200,00;0,00;0,00;;0,00;0,00;0;ER;101;1;20;1;0;1");
    expect(kern(gut[1])).toBe("5100;30100;101;17012025;;EUR;0,00;1000,00;-200,00;;0,00;0,00;0;ER;101;1;20;1;0;1");
    const rc = rzlEingang(eingang({ kategorie: "fremdleistung", datum: "2025-01-07", ust: 0, brutto: 10000, reverse_charge: true }), konten);
    expect(kern(rc[0])).toBe("5110;30100;101;07012025;;EUR;10000,00;0,00;2000,00;;0,00;0,00;0;ER;101;1;20;1;15;1");
    expect(kern(rc[1])).toBe("30100;5110;101;07012025;;EUR;0,00;10000,00;0,00;;0,00;0,00;0;ER;101;1;20;1;15;1");
  });
  it("Belegpfad steht im Feld 37, das letzte ohne Strichpunkt danach", () => {
    const z = rzlAusgang(beleg({ datei: "Ausgangsrechnungen/RE-1.pdf" }), konten, false)[0];
    expect(z.split(";")[36]).toBe("\\Ausgangsrechnungen\\RE-1.pdf");
    expect(z.endsWith(";")).toBe(false);
  });
  it("Nummer ohne Ziffern-Ballast: OP numerisch, Belegnummer wie gedruckt", () => {
    const f = rzlAusgang(beleg({ nummer: "RE-2026-002" }), konten, false)[0].split(";");
    expect(f[2]).toBe("2026002");
    expect(f[14]).toBe("RE-2026-002");
  });
});

describe("BMD: wie „Verbuchen Erfassungsfile“", () => {
  const felder = (z: string) => {
    const f = z.split(";");
    return { konto: f[1], gkto: f[2], bucod: f[6], steucod: f[7], betrag: f[8], mwst: f[9], steuer: f[10] };
  };
  it("Rechnung und Gutschrift: Kundenkonto bleibt im Soll, nur die Vorzeichen drehen", () => {
    expect(felder(bmdAusgang(beleg({ netto: 1000, ust: 200, brutto: 1200, kunde: { ...kunde, nummer: 1001 } }), { ...konten, erloes20: 4020 }, false)))
      .toEqual({ konto: "21001", gkto: "4020", bucod: "1", steucod: "03", betrag: "1200,00", mwst: "20", steuer: "-200,00" });
    expect(felder(bmdAusgang(beleg({ netto: -1000, ust: -200, brutto: -1200, kunde: { ...kunde, nummer: 1001 } }), { ...konten, erloes20: 4020 }, false)))
      .toEqual({ konto: "21001", gkto: "4020", bucod: "1", steucod: "03", betrag: "-1200,00", mwst: "20", steuer: "200,00" });
  });
  it("Eingangsrechnung und Gutschrift: Lieferant im Haben", () => {
    expect(felder(bmdEingang(eingang({ netto: 1000, ust: 200, brutto: 1200, kreditor: 30100, kategorie: "material" }), { ...konten, material: 5000 })))
      .toEqual({ konto: "30100", gkto: "5000", bucod: "2", steucod: "00", betrag: "-1200,00", mwst: "20", steuer: "200,00" });
    expect(felder(bmdEingang(eingang({ netto: -1000, ust: -200, brutto: -1200, kreditor: 30100 }), { ...konten, material: 5000 })))
      .toEqual({ konto: "30100", gkto: "5000", bucod: "2", steucod: "00", betrag: "1200,00", mwst: "20", steuer: "-200,00" });
  });
  it("Bausteuer: netto, Steuercode 29, Steuer minus; Bauleistung an Kunden: Steuercode 17", () => {
    expect(felder(bmdEingang(eingang({ netto: 1000, ust: 0, brutto: 1000, reverse_charge: true }), konten)))
      .toMatchObject({ bucod: "2", steucod: "29", betrag: "-1000,00", mwst: "20", steuer: "-200,00" });
    expect(felder(bmdAusgang(beleg({ netto: 1000, ust: 0, brutto: 1000, reverse_charge: true, empf_uid: "ATU1" }), konten, false)))
      .toMatchObject({ gkto: "4106", steucod: "17", betrag: "1000,00", mwst: "0", steuer: "0,00" });
  });
  it("Kopfzeile benennt die Spalten, das Datum ist JJJJMMTT, BMD macht die Gegenbuchung", () => {
    const [kopf, z] = buchungenText("bmd", [beleg({ nummer: "RE-2026-002", datum: "2026-11-04", faellig_am: "2026-11-18" })], [], konten, false).split("\r\n");
    expect(kopf.split(";").slice(0, 4)).toEqual(["satzart", "konto", "gkto", "belegnr"]);
    const f = z.split(";");
    expect([f[3], f[4], f[13], f[14], f[15], f[16]]).toEqual(["2026002", "20261104", "RE-2026-002", "14", "A", "E"]);
  });
});

describe("Dateien", () => {
  it("Strichpunkt im Namen bricht keine Zeile", () => {
    const z = rzlAusgang(beleg({ kunde: { ...kunde, name: "Müller; Söhne" } }), konten, false)[0];
    expect(z.split(";")).toHaveLength(37);
    expect(z).toContain("Müller Söhne");
  });
  it("Windows-1252: Umlaute und Euro als ein Byte", () => {
    expect([...windows1252("Ä€ß")]).toEqual([0xc4, 0x80, 0xdf]);
    expect([...windows1252("😀")]).toEqual([0x3f]);
  });
  it("Personenkonten: RZL mit 19 Feldern und Kontenart, jedes Konto einmal", () => {
    const zeilen = personenkontenText("rzl", [beleg(), beleg({ id: "b2" })], [eingang()]).trim().split("\r\n");
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].split(";")).toHaveLength(19);
    expect(zeilen[0].split(";").slice(0, 2)).toEqual(["20100", "5"]);
    expect(zeilen[1].split(";").slice(0, 2)).toEqual(["30100", "7"]);
  });
});

describe("Kontrollliste", () => {
  it("stört sich nicht an sauberen Belegen", () => {
    expect(kontrolle([beleg()], [eingang()], false)).toEqual([]);
  });
  it("findet, was die Kanzlei zurückschicken würde", () => {
    const t = kontrolle(
      [beleg({ kunde: null, nummer: "A" }), beleg({ nummer: "B", reverse_charge: true, ust: 0, brutto: 10000 }), beleg({ nummer: "C", brutto: 1 }), beleg({ nummer: "D", ust: 0, brutto: 10000 })],
      [eingang({ nummer: null, datei_pfad: null, ust: 0, brutto: 10000 })], false, 2,
    ).map((h) => h.text).join("\n");
    expect(t).toMatch(/A: kein Kunde/);
    expect(t).toMatch(/B: Reverse Charge ohne UID/);
    expect(t).toMatch(/C: Netto und USt/);
    expect(t).toMatch(/D: keine USt/);
    expect(t).toMatch(/Rechnungsnummer fehlt/);
    expect(t).toMatch(/kein Foto oder PDF/);
    expect(t).toMatch(/ohne Vorsteuer/);
    expect(t).toMatch(/2 Rechnungen sind noch Entwurf/);
  });
});
