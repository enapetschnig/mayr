import { describe, expect, it } from "vitest";
import { abwesenheitsTage, feiertagName, feiertage, istArbeitstag, kontoRechnen, lohnSumme, sollZeitraum, taggeld } from "./zeitkonto";

describe("Feiertage Österreich", () => {
  it("kennt die 13 gesetzlichen Feiertage 2026 samt beweglichen", () => {
    const f = feiertage(2026);
    expect(f.size).toBe(13);
    expect(f.get("2026-04-06")).toBe("Ostermontag");
    expect(f.get("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(f.get("2026-05-25")).toBe("Pfingstmontag");
    expect(f.get("2026-06-04")).toBe("Fronleichnam");
    expect(f.get("2026-10-26")).toBe("Nationalfeiertag");
  });
  it("Karfreitag und Heiliger Abend sind normale Arbeitstage", () => {
    expect(feiertagName("2026-04-03")).toBeNull();
    expect(istArbeitstag("2026-12-24")).toBe(true);
  });
  it("Wochenende und Feiertag sind keine Arbeitstage", () => {
    expect(istArbeitstag("2026-11-07")).toBe(false);
    expect(istArbeitstag("2026-11-01")).toBe(false);
    expect(istArbeitstag("2026-10-26")).toBe(false);
  });
});

describe("Sollzeit und Abwesenheit", () => {
  it("Woche mit Feiertag hat einen Tag weniger Soll", () => {
    expect(sollZeitraum("2026-11-02", "2026-11-08", 38.5)).toBe(38.5);
    expect(sollZeitraum("2026-10-26", "2026-11-01", 38.5)).toBe(30.8);
  });
  it("Urlaub über Wochenende und Feiertag zählt nur Arbeitstage", () => {
    expect(abwesenheitsTage({ von: "2026-10-23", bis: "2026-10-27" })).toEqual(["2026-10-23", "2026-10-27"]);
  });
});

describe("Zeitkonto", () => {
  const p = { wochenstunden: 40, urlaub_tage: 25, konto_ab: "2026-11-02" };
  const heute = "2026-11-05"; // bis Mittwoch gerechnet: 3 Tage × 8 h Soll

  it("Überstunden = Ist − Soll, der laufende Tag zählt nicht", () => {
    const zeiten = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((datum) => ({ datum, stunden: 9 }));
    const k = kontoRechnen(p, zeiten, [], [], heute);
    expect(k.soll).toBe(24);
    expect(k.ist).toBe(27);
    expect(k.saldo).toBe(3);
  });
  it("Buchungen vor dem Kontostart zählen nicht, Anfangsbestand schon", () => {
    const k = kontoRechnen(p, [{ datum: "2026-10-30", stunden: 100 }], [], [{ art: "ueberstunden", menge: 12.5, datum: "2026-11-02" }], heute);
    expect(k.saldo).toBe(-24 + 12.5);
  });
  it("Urlaub zählt wie gearbeitet, Zeitausgleich braucht Guthaben auf", () => {
    const urlaub = { art: "urlaub", von: "2026-11-02", bis: "2026-11-04", stunden: null, status: "genehmigt" };
    expect(kontoRechnen(p, [], [urlaub], [], heute).saldo).toBe(0);
    const za = { ...urlaub, art: "zeitausgleich" };
    expect(kontoRechnen(p, [], [za], [], heute).saldo).toBe(-24);
  });
  it("nur genehmigte Abwesenheit zählt, Arzt mit Teilstunden", () => {
    const antrag = { art: "urlaub", von: "2026-11-02", bis: "2026-11-02", stunden: null, status: "beantragt" };
    const arzt = { art: "arzt", von: "2026-11-03", bis: "2026-11-03", stunden: 2, status: "genehmigt" };
    expect(kontoRechnen(p, [], [antrag, arzt], [], heute).ist).toBe(2);
  });
  it("Resturlaub: Anspruch + Übertrag − genommen − geplant, Beantragtes extra", () => {
    const a = [
      { art: "urlaub", von: "2026-11-02", bis: "2026-11-03", stunden: null, status: "genehmigt" },
      { art: "urlaub", von: "2026-11-16", bis: "2026-11-20", stunden: null, status: "genehmigt" },
      { art: "urlaub", von: "2026-12-14", bis: "2026-12-15", stunden: null, status: "beantragt" },
      { art: "urlaub", von: "2026-12-21", bis: "2026-12-22", stunden: null, status: "abgelehnt" },
    ];
    const k = kontoRechnen(p, [], a, [{ art: "urlaub", menge: 3, datum: "2026-01-01" }], heute);
    expect(k.urlaubAnspruch).toBe(28);
    expect(k.urlaubGenommen).toBe(2);
    expect(k.urlaubGeplant).toBe(5);
    expect(k.urlaubBeantragt).toBe(2);
    expect(k.urlaubRest).toBe(21);
  });
});

describe("Taggeld und Lohnsumme", () => {
  it("Taggeld: bis 3 h nichts, dann je angefangene Stunde ein Zwölftel", () => {
    expect(taggeld(3, 30)).toBe(0);
    expect(taggeld(3.5, 30)).toBe(10);
    expect(taggeld(8, 30)).toBe(20);
    expect(taggeld(13, 30)).toBe(30);
    expect(taggeld(8, 0)).toBe(0);
  });
  it("Lohnsumme trennt Arten, rechnet Abwesenheit und Kilometer", () => {
    const zeiten = [
      { datum: "2026-11-02", stunden: 8, art: "arbeit", projekt_id: "p", km: 40 },
      { datum: "2026-11-03", stunden: 8, art: "ue50", projekt_id: "p", km: null },
      { datum: "2026-11-04", stunden: 1, art: "garantie", projekt_id: "p", km: null },
    ];
    const s = lohnSumme(40, "2026-11-02", "2026-11-08", zeiten, [
      { art: "krank", von: "2026-11-05", bis: "2026-11-06", stunden: null, status: "genehmigt" },
    ], { taggeld: 30, km: 0.5 });
    expect(s).toMatchObject({ soll: 40, ist: 33, differenz: -7, arbeit: 8, ue50: 8, garantie: 1, taggeldTage: 2, taggeld: 40, km: 40, kmGeld: 20 });
    expect(s.abwesend.krank).toEqual({ tage: 2, stunden: 16 });
  });
});
