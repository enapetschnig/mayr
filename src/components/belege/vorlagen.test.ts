import { describe, expect, it } from "vitest";
import { leerePosition, titelPosition, type EditorPosition, type KatalogLeistung } from "./editor";
import {
  ausVorlage, kategorienAus, vorlageAusEditor, vorlageEinfuegen, vorlageNetto, vorlagenFiltern, vorlagePositionenLesen, vorlageUmfang,
  type PreisArtikel, type VorlagePosition,
} from "./vorlagen";
import { inAppBrowser, linkAdresse, mailAdresse, teilenText, telefonFuerWhatsapp, tokenGueltig, unterschriftPfad, whatsappAdresse } from "./bestaetigung";
import { artikelIdsVon, datenblaetterOrdnen, paketNamen } from "./datenblattLogik";

const firma = { material_aufschlag: 30, stundensatz: 72 };

const vp = (w: Partial<VorlagePosition>): VorlagePosition => ({
  art: "artikel", bezeichnung: "x", langtext: null, menge: 1, einheit: "Stk", einzelpreis: 0, ek_preis: null, minuten: null,
  artikel_id: null, leistung_id: null, ...w,
});

describe("Vorlage aus dem Angebot", () => {
  it("nimmt keine Herkunft und keine Abzüge mit", () => {
    const p: EditorPosition[] = [
      titelPosition("Dach"),
      { ...leerePosition("artikel", { bezeichnung: " Modul ", menge: "22", einzelpreis: "119,90", artikel_id: "a1", ek_preis: 80 }), quelle: { zeiten: ["z"], material: [], regie: [] } },
      leerePosition("abzug", { bezeichnung: "1. Teilrechnung", einzelpreis: "-100" }),
      leerePosition("text", { bezeichnung: "Hinweis", menge: "0" }),
    ];
    const v = vorlageAusEditor(p);
    expect(v.map((x) => x.art)).toEqual(["titel", "artikel", "text"]);
    expect(v[1]).toMatchObject({ bezeichnung: "Modul", menge: 22, einzelpreis: 119.9, artikel_id: "a1", ek_preis: 80 });
    expect(v[1]).not.toHaveProperty("quelle");
    expect(v[2]).toMatchObject({ menge: 1, einzelpreis: 0 });
    expect(vorlageNetto(v)).toBe(2637.8);
    expect(vorlageUmfang(v)).toBe("1 Abschnitt · 1 Position");
  });

  it("liest jsonb robust", () => {
    expect(vorlagePositionenLesen(null)).toEqual([]);
    expect(vorlagePositionenLesen({ a: 1 })).toEqual([]);
    const v = vorlagePositionenLesen([{ art: "artikel", bezeichnung: "A", menge: "2", einzelpreis: 5 }, { art: "quatsch" }, 7, null]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ art: "artikel", menge: 2, einzelpreis: 5, einheit: "Stk", ek_preis: null, artikel_id: null });
  });
});

describe("Preise beim Einfügen nachziehen", () => {
  const artikel = new Map<string, PreisArtikel>([
    ["wr", { id: "wr", bezeichnung: "Symo GEN24 10.0", einheit: "Stk", vk_preis: null, ek_preis: 2000, listenpreis: 3000 }],
    ["alt", { id: "alt", bezeichnung: "Altes Modul", einheit: "Stk", vk_preis: 99, ek_preis: 50, listenpreis: null, aktiv: false }],
  ]);
  const leistung = {
    id: "l1", kurztext: "Montage", preis: null, minuten: 60, einheit: "Stk",
    leistung_material: [{ menge: 2, artikel: { vk_preis: null, ek_preis: 10, listenpreis: null } }],
  } as unknown as KatalogLeistung;
  const quellen = { artikel, leistungen: new Map([["l1", leistung]]) };
  const vorlage = [
    vp({ art: "titel", bezeichnung: "Wechselrichter" }),
    vp({ bezeichnung: "Symo GEN24 10.0", menge: 1, einzelpreis: 2500, ek_preis: 1900, artikel_id: "wr" }),
    vp({ bezeichnung: "Altes Modul", menge: 10, einzelpreis: 120, artikel_id: "alt" }),
    vp({ art: "leistung", bezeichnung: "Montage", menge: 3, einzelpreis: 90, leistung_id: "l1" }),
    vp({ art: "pauschale", bezeichnung: "Netzanmeldung", einheit: "Psch", einzelpreis: 290 }),
  ];

  it("heutige Preise: Artikel- und Leistungspreis neu, Abweichungen gemeldet", () => {
    const r = ausVorlage(vorlage, quellen, firma, 72, true);
    expect(r.positionen.map((p) => p.einzelpreis)).toEqual(["0,00", "2600,00", "120,00", "98,00", "290,00"]);
    expect(r.positionen[1].ek_preis).toBe(2000);
    expect(r.positionen[3]).toMatchObject({ ek_preis: 20, minuten: 60, menge: "3" });
    expect(r.abweichungen).toEqual([
      { bezeichnung: "Symo GEN24 10.0", alt: 2500, neu: 2600 },
      { bezeichnung: "Montage", alt: 90, neu: 98 },
    ]);
    expect(r.fehlt).toEqual(["Altes Modul"]);
    // neue IDs, keine Herkunft
    expect(new Set(r.positionen.map((p) => p.id)).size).toBe(5);
    expect(r.positionen.every((p) => p.quelle === null)).toBe(true);
  });

  it("wie in der Vorlage: Preise bleiben, Abweichungen trotzdem bekannt", () => {
    const r = ausVorlage(vorlage, quellen, firma, 72, false);
    expect(r.positionen.map((p) => p.einzelpreis)).toEqual(["0,00", "2500,00", "120,00", "90,00", "290,00"]);
    expect(r.positionen[1].ek_preis).toBe(1900);
    expect(r.abweichungen).toHaveLength(2);
  });

  it("Stundensatz des Projekts zählt bei Leistungen", () => {
    const r = ausVorlage([vorlage[3]], quellen, firma, 100, true);
    expect(r.positionen[0].einzelpreis).toBe("126,00");
  });
});

describe("Vorlage einfügen", () => {
  const a = titelPosition("Dach");
  const a1 = leerePosition("artikel", { bezeichnung: "a1" });
  const b = titelPosition("Keller");
  const b1 = leerePosition("artikel", { bezeichnung: "b1" });
  const liste = [a, a1, b, b1];

  it("ans Ende der Gruppe des aktiven Titels, Titel der Vorlage folgen", () => {
    const n1 = leerePosition("artikel", { bezeichnung: "n1" });
    const nt = titelPosition("Dach");
    const n2 = leerePosition("artikel", { bezeichnung: "n2" });
    const r = vorlageEinfuegen(liste, [n1, nt, n2], a.id);
    expect(r.liste.map((p) => p.bezeichnung)).toEqual(["Dach", "a1", "n1", "Dach 2", "n2", "Keller", "b1"]);
    expect(r.letzterTitel).toBe(nt.id);
  });

  it("ohne Titel in der Vorlage: kein neuer aktiver Titel", () => {
    const n1 = leerePosition("artikel", { bezeichnung: "n1" });
    const r = vorlageEinfuegen(liste, [n1], b.id);
    expect(r.liste.map((p) => p.bezeichnung)).toEqual(["Dach", "a1", "Keller", "b1", "n1"]);
    expect(r.letzterTitel).toBeNull();
  });

  it("leeres Angebot: genau die Vorlage", () => {
    const n = [titelPosition("PV"), leerePosition("artikel", { bezeichnung: "m" })];
    expect(vorlageEinfuegen([], n, null).liste).toEqual(n);
  });
});

describe("Suche und Kategorien", () => {
  const v = [
    { name: "PV 10 kWp Aufdach", kategorie: "PV-Anlage", betreff: null, positionen: [vp({ bezeichnung: "Fronius Symo GEN24" })] },
    { name: "Wallbox 11 kW", kategorie: "Wallbox", betreff: "Ladestation", positionen: [] },
    { name: "E-Befund EFH", kategorie: "e-befund", betreff: null, positionen: [] },
  ];
  it("findet über Positionen, ohne Akzente, nach Kategorie", () => {
    expect(vorlagenFiltern(v, "fronius", null).map((x) => x.name)).toEqual(["PV 10 kWp Aufdach"]);
    expect(vorlagenFiltern(v, "ladestation", null)).toHaveLength(1);
    expect(vorlagenFiltern(v, "", "E-Befund")).toHaveLength(1);
    expect(vorlagenFiltern(v, "pv", "Wallbox")).toHaveLength(0);
  });
  it("Kategorien einmal, mit Vorschlägen", () => {
    expect(kategorienAus(v)).toEqual(["e-befund", "PV-Anlage", "Wallbox"]);
    const mit = kategorienAus(v, true);
    expect(mit.filter((k) => k.toLowerCase() === "wallbox")).toHaveLength(1);
    expect(mit).toContain("Speicher");
  });
});

describe("Bestätigungslink", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  it("Token und Pfad der Unterschrift", () => {
    expect(tokenGueltig(token)).toBe(true);
    expect(tokenGueltig("kurz")).toBe(false);
    expect(tokenGueltig(`${token}/../x`)).toBe(false);
    expect(unterschriftPfad(token, "12ab-34cd.png")).toBe(`${token}/12ab-34cdpng.png`);
    expect(linkAdresse("https://app.at/", token)).toBe(`https://app.at/angebot/${token}`);
  });
  it("Texte für Mail und WhatsApp", () => {
    const t = teilenText({ firma: "SETEC GmbH", nummer: "AN-2026-007", betreff: "PV 9,9 kWp", link: "https://x/angebot/t", giltBis: "11.12.2026" });
    expect(t).toContain("Angebot AN-2026-007 „PV 9,9 kWp“.");
    expect(t.split("\n")).toContain("https://x/angebot/t");
    expect(t).toContain("Gültig bis 11.12.2026.");
    expect(mailAdresse("a@b.at", "Angebot", "Hallo du")).toBe("mailto:a%40b.at?subject=Angebot&body=Hallo%20du");
    expect(whatsappAdresse("Hi", "0664 123 45 67")).toBe("https://wa.me/436641234567?text=Hi");
    expect(whatsappAdresse("Hi", null)).toBe("https://wa.me/?text=Hi");
  });
  it("Telefonnummern für WhatsApp", () => {
    expect(telefonFuerWhatsapp("+43 664 88228429")).toBe("4366488228429");
    expect(telefonFuerWhatsapp("0049 171 1234567")).toBe("491711234567");
    expect(telefonFuerWhatsapp("12")).toBeNull();
  });
});

describe("Datenblätter", () => {
  it("Artikel aus Positionen und dem Material der Leistungen", () => {
    const katalog = [{ id: "l1", leistung_material: [{ menge: 1, artikel: { id: "m1", vk_preis: null, ek_preis: 1, listenpreis: null } }] }] as unknown as KatalogLeistung[];
    expect(artikelIdsVon([{ artikel_id: "b", leistung_id: null }, { artikel_id: null, leistung_id: "l1" }, { artikel_id: "b", leistung_id: null }], katalog)).toEqual(["b", "m1"]);
  });
  it("je Pfad einmal, Namen im Paket eindeutig", () => {
    const l = datenblaetterOrdnen([
      { name: "Datenblatt.pdf", pfad: "artikel/2/a.pdf", artikel: "Wechselrichter" },
      { name: "Datenblatt.pdf", pfad: "artikel/1/a.pdf", artikel: "Modul" },
      { name: "Datenblatt.pdf", pfad: "artikel/1/a.pdf", artikel: "Modul" },
    ]);
    expect(l.map((d) => d.artikel)).toEqual(["Modul", "Wechselrichter"]);
    expect(paketNamen(l)).toEqual(["Datenblatt.pdf", "Datenblatt (2).pdf"]);
    expect(paketNamen([{ name: "a/b:c.pdf", pfad: "x" }])).toEqual(["a-b-c.pdf"]);
  });
});

describe("inAppBrowser", () => {
  it("erkennt WhatsApp, Facebook, Instagram und Android-WebView", () => {
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.22.79")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]")).toBe(true);
    expect(inAppBrowser("Mozilla/5.0 (iPhone) AppleWebKit Mobile Instagram 300.0")).toBe(true);
  });
  it("normale Browser nicht", () => {
    expect(inAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36")).toBe(false);
    expect(inAppBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")).toBe(false);
  });
});
