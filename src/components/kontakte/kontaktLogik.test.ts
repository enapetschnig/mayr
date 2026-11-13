import { describe, expect, it } from "vitest";
import {
  belegPille, belegSummen, brauchtGeo, einspeisungText, geoAnfrage, istLieferant, kontaktArt, linkSauber, lieferantSchluessel,
  merkmale, namenLesen, nominatimLesen, punktTon, pvKurz, type LieferantBeleg,
} from "./kontaktLogik";

describe("Lieferanten-Namen", () => {
  it("Schlüssel wie in der Datenbank", () => {
    expect(lieferantSchluessel("  Sonepar   Österreich ")).toBe("sonepar österreich");
    expect(lieferantSchluessel(null)).toBe("");
  });
  it("weitere Schreibweisen: trennen, doppelte und der Name selbst fallen weg", () => {
    expect(namenLesen("Sonepar Österreich GmbH, SONEPAR;\n sonepar österreich gmbh ,  ", "Sonepar"))
      .toEqual(["Sonepar Österreich GmbH"]);
    expect(namenLesen("", "X")).toEqual([]);
  });
  it("Beleg gehört zum Lieferanten über Name oder Schreibweise", () => {
    const k = { name: "Sonepar", namen: ["Sonepar Österreich GmbH"] };
    expect(istLieferant(k, "SONEPAR")).toBe(true);
    expect(istLieferant(k, "sonepar  österreich gmbh")).toBe(true);
    expect(istLieferant(k, "Rexel")).toBe(false);
    expect(istLieferant(k, "")).toBe(false);
  });
  it("Art: unbekannt = Kunde", () => {
    expect(kontaktArt("lieferant")).toBe("lieferant");
    expect(kontaktArt(null)).toBe("kunde");
    expect(kontaktArt("xyz")).toBe("kunde");
  });
});

describe("Koordinaten", () => {
  it("ohne Ort und PLZ wird nicht gefragt", () => {
    expect(geoAnfrage({ strasse: "Hauptstraße 1" })).toBeNull();
    expect(geoAnfrage({ strasse: "Hauptstraße 1", plz: "8605", ort: "Kapfenberg" })).toBe("Hauptstraße 1, 8605 Kapfenberg, Österreich");
  });
  it("nur neu suchen, wenn sich die Adresse geändert hat", () => {
    const k = { strasse: "Hauptstraße 1", plz: "8605", ort: "Kapfenberg", geo_adresse: null as string | null };
    expect(brauchtGeo(k)).toBe(true);
    k.geo_adresse = "Hauptstraße 1, 8605 Kapfenberg, Österreich";
    expect(brauchtGeo(k)).toBe(false);
    expect(brauchtGeo({ ...k, strasse: "Hauptstraße 2" })).toBe(true);
    expect(brauchtGeo({ geo_adresse: null })).toBe(false);
  });
  it("Antwort von Nominatim lesen", () => {
    expect(nominatimLesen([{ lat: "47.44", lon: "15.29" }])).toEqual({ lat: 47.44, lng: 15.29 });
    expect(nominatimLesen([])).toBeNull();
    expect(nominatimLesen({ error: "x" })).toBeNull();
    expect(nominatimLesen([{ lat: "abc", lon: "1" }])).toBeNull();
  });
});

describe("PV-Anlage", () => {
  it("Link bekommt https und nur http(s) ist erlaubt", () => {
    expect(linkSauber("www.solarweb.com/PvSystems/PvSystem?pvSystemId=1")).toBe("https://www.solarweb.com/PvSystems/PvSystem?pvSystemId=1");
    expect(linkSauber("http://beispiel.at")).toBe("http://beispiel.at/");
    expect(linkSauber("javascript:alert(1)")).toBeNull();
    expect(linkSauber("file:///c:/x.pdf")).toBeNull();
    expect(linkSauber("hallo")).toBeNull();
    expect(linkSauber("  ")).toBeNull();
  });
  it("Einspeisung in Prozent, kW oder beides", () => {
    expect(einspeisungText({ einspeisung_prozent: 70 })).toBe("70 %");
    expect(einspeisungText({ einspeisung_kw: 4 })).toBe("4 kW");
    expect(einspeisungText({ einspeisung_prozent: 70, einspeisung_kw: 6.3 })).toBe("70 % · max. 6,3 kW");
    expect(einspeisungText({})).toBeNull();
  });
  it("Eckdaten in einer Zeile", () => {
    expect(pvKurz({ pv_kwp: 9.8, speicher_kwh: 10, wallbox: "Wattpilot 11 kW", einspeisung_prozent: 70, ueberschuss: true }))
      .toEqual(["9,8 kWp", "Speicher 10 kWh", "Wallbox", "Einspeisung 70 %", "Überschussregelung"]);
    expect(pvKurz({ speicher_typ: "BYD HVS" })).toEqual(["Speicher"]);
    expect(pvKurz({})).toEqual([]);
  });
  it("Merkmale über alle Anlagen eines Kunden", () => {
    expect(merkmale([{ art: "pv", pv_kwp: 9.8 }, { art: "ladestation" }, { art: "verteiler" }]))
      .toEqual({ pv: true, speicher: false, wallbox: true, kwp: 9.8 });
    expect(merkmale([])).toEqual({ pv: false, speicher: false, wallbox: false, kwp: 0 });
  });
  it("Punktfarbe", () => {
    expect(punktTon("kunde", { pv: true }, true)).toBe("blau");
    expect(punktTon("kunde", { pv: true }, false)).toBe("gruen");
    expect(punktTon("kunde", { pv: false }, false)).toBe("grau");
    expect(punktTon("lieferant", { pv: false }, true)).toBe("lila");
  });
});

describe("Belege eines Lieferanten", () => {
  const b = (quelle: string, status: string, betrag: number | null): LieferantBeleg =>
    ({ quelle, status, betrag, id: "x", nummer: null, datum: "2026-11-01", projekt_id: null, projekt: null });
  it("Summen: offen = weder überwiesen noch abgelehnt, stornierte Bestellungen zählen nicht", () => {
    const s = belegSummen([
      b("rechnung", "bezahlt", 100.1), b("rechnung", "offen", 50.2), b("rechnung", "freigegeben", 10), b("rechnung", "abgelehnt", 999),
      b("bestellung", "bestellt", 30), b("bestellung", "storniert", 500), b("lieferschein", "offen", null),
    ]);
    expect(s).toEqual({
      rechnungen: 4, rechnungenSumme: 1159.3, offen: 2, offenSumme: 60.2, bestellungen: 1, bestellungenSumme: 30, lieferscheine: 1,
    });
  });
  it("Pillen je Belegart", () => {
    expect(belegPille({ quelle: "rechnung", status: "bezahlt" }).text).toBe("Überwiesen");
    expect(belegPille({ quelle: "rechnung", status: "offen" }).text).toBe("Zu prüfen");
    expect(belegPille({ quelle: "lieferschein", status: "offen" }).text).toBe("Ohne Rechnung");
    expect(belegPille({ quelle: "bestellung", status: "geliefert" }).text).toBe("Geliefert");
  });
});
