import { describe, expect, it } from "vitest";
import {
  leistungFinden, normalisieren, sprachZerlegen, stamm, zahlwortLesen, type KatalogEintrag, type SprachPosten,
} from "./sprachParser";

// Leistungskatalog der Demo (supabase/demo/01-stamm.sql) — id = Leistungsnummer
const K = (id: string, kurztext: string, einheit: string, suchwoerter: string, reihenfolge: number): KatalogEintrag =>
  ({ id, kurztext, einheit, suchwoerter, reihenfolge });

const KATALOG: KatalogEintrag[] = [
  K("01.01", "Steckdose UP komplett", "Stk", "steckdose schuko dose", 101),
  K("01.02", "Doppelsteckdose UP komplett", "Stk", "doppelsteckdose zweifach 2fach", 102),
  K("01.03", "Steckdose Feuchtraum AP IP44", "Stk", "feuchtraum nassraum aufputz ip44 garten", 103),
  K("01.04", "Ausschalter UP komplett", "Stk", "schalter ausschalter lichtschalter", 104),
  K("01.05", "Wechselschalter UP komplett", "Stk", "wechselschalter wechsel", 105),
  K("01.06", "Kreuzschalter UP komplett", "Stk", "kreuzschalter kreuz", 106),
  K("01.07", "Serienschalter UP komplett", "Stk", "serienschalter serie", 107),
  K("01.08", "Taster UP komplett", "Stk", "taster", 108),
  K("01.09", "Bewegungsmelder UP", "Stk", "bewegungsmelder präsenzmelder melder", 109),
  K("02.01", "Leerverrohrung Flexrohr M20", "m", "rohr flexrohr verrohrung leerrohr", 201),
  K("02.02", "Mantelleitung 3x1,5 verlegen", "m", "leitung kabel ym nym 3x1,5", 202),
  K("02.03", "Mantelleitung 5x2,5 verlegen", "m", "leitung kabel ym nym 5x2,5 drehstrom", 203),
  K("02.04", "Schlitz stemmen und verputzen", "m", "stemmen schlitz verputzen", 204),
  K("02.05", "Hohlwanddose setzen", "Stk", "dose hohlwanddose rigips", 205),
  K("03.01", "Kleinverteiler 3-reihig komplett", "Stk", "verteiler unterverteiler kleinverteiler", 301),
  K("03.02", "Leitungsschutzschalter B16", "Stk", "ls sicherung leitungsschutzschalter b16 automat", 302),
  K("03.03", "FI-Schutzschalter 40A/30mA", "Stk", "fi fehlerstromschutzschalter rcd", 303),
  K("03.04", "FI/LS-Schalter einbauen", "Stk", "fi/ls fi-ls kombi", 304),
  K("03.05", "Überspannungsschutz Typ 2", "Stk", "überspannung überspannungsschutz spd", 305),
  K("04.01", "Deckenauslass mit Leuchtenmontage", "Stk", "lampe leuchte deckenauslass auslass deckenlampe", 401),
  K("04.02", "LED-Einbauspot komplett", "Stk", "spot einbauspot downlight strahler", 402),
  K("04.03", "LED-Panel 60x60 montieren", "Stk", "panel ledpanel rasterleuchte büroleuchte", 403),
  K("05.01", "Netzwerkdose Cat6 komplett", "Stk", "netzwerk lan cat6 dose datendose", 501),
  K("05.02", "Netzwerkkabel Cat7 verlegen", "m", "netzwerkkabel cat7 datenkabel lan", 502),
  K("05.03", "TV/SAT-Dose komplett", "Stk", "tv sat antenne fernseher dose", 503),
  K("06.01", "Herdanschluss 400 V", "Stk", "herd herdanschluss eherd kochfeld ceran", 601),
  K("06.02", "Geräteanschluss Küche/Bad", "Stk", "geschirrspüler waschmaschine trockner anschluss", 602),
  K("06.03", "Boiler anschließen", "Stk", "boiler durchlauferhitzer warmwasser speicher", 603),
  K("06.04", "Wallbox 11 kW montieren", "Stk", "wallbox ladestation eauto elektroauto laden", 604),
  K("06.05", "Badlüfter anschließen", "Stk", "lüfter ventilator badlüfter abluft", 605),
  K("07.01", "Rauchwarnmelder montieren", "Stk", "rauchmelder rauchwarnmelder brandmelder", 701),
  K("07.02", "Potentialausgleich Bad", "Psch", "potentialausgleich erdung pa bad", 702),
  K("08.01", "Anlagenprüfung mit Messprotokoll", "Psch", "prüfung messung protokoll befund e8101", 801),
  K("08.02", "Anfahrt", "Psch", "anfahrt fahrt fahrtkosten", 802),
  K("08.03", "Regiestunde Elektriker", "h", "regie stunde arbeitsstunde aufwand", 803),
];

/** Kurzform zum Vergleichen: [Raum, Menge, Leistung] */
const kurz = (p: SprachPosten[]) => p.map((x) => [x.raum, x.menge, x.leistungId]);
const zerlegt = (text: string) => sprachZerlegen(text, KATALOG);
const leistung = (text: string, einheit: string | null = null) => leistungFinden(text, KATALOG, einheit).leistungId;

describe("Wörter vereinheitlichen", () => {
  it("Umlaute und ß", () => {
    expect(normalisieren("Küche")).toBe("kueche");
    expect(normalisieren("Kueche")).toBe("kueche");
    expect(normalisieren("Dreißig")).toBe("dreissig");
    expect(normalisieren("ÜBERSPANNUNG")).toBe("ueberspannung");
  });
  it("Einzahl und Mehrzahl haben denselben Stamm", () => {
    expect(stamm("Steckdosen")).toBe(stamm("Steckdose"));
    expect(stamm("Schaltern")).toBe(stamm("Schalter"));
    expect(stamm("Wechselschaltern")).toBe(stamm("Wechselschalter"));
    expect(stamm("Anschlüsse")).toBe(stamm("Anschluss"));
    expect(stamm("Lampen")).toBe(stamm("Lampe"));
    expect(stamm("Spots")).toBe(stamm("Spot"));
    expect(stamm("Leerrohre")).toBe(stamm("Leerrohr"));
    expect(stamm("Wallboxen")).toBe(stamm("Wallbox"));
    expect(stamm("Küchen")).toBe(stamm("Küche"));
  });
});

describe("Zahlwörter", () => {
  it("einfache und zusammengesetzte", () => {
    expect(zahlwortLesen("eins")).toBe(1);
    expect(zahlwortLesen("eine")).toBe(1);
    expect(zahlwortLesen("einen")).toBe(1);
    expect(zahlwortLesen("zwo")).toBe(2);
    expect(zahlwortLesen("sechs")).toBe(6);
    expect(zahlwortLesen("zwölf")).toBe(12);
    expect(zahlwortLesen("siebzehn")).toBe(17);
    expect(zahlwortLesen("zwanzig")).toBe(20);
    expect(zahlwortLesen("dreißig")).toBe(30);
    expect(zahlwortLesen("dreissig")).toBe(30);
    expect(zahlwortLesen("einundzwanzig")).toBe(21);
    expect(zahlwortLesen("fünfundvierzig")).toBe(45);
    expect(zahlwortLesen("hundert")).toBe(100);
    expect(zahlwortLesen("einhundertzwanzig")).toBe(120);
    expect(zahlwortLesen("zweihundertfünfzig")).toBe(250);
    expect(zahlwortLesen("tausend")).toBe(1000);
    expect(zahlwortLesen("zweitausendfünfhundert")).toBe(2500);
  });
  it("halbe", () => {
    expect(zahlwortLesen("eineinhalb")).toBe(1.5);
    expect(zahlwortLesen("zweieinhalb")).toBe(2.5);
    expect(zahlwortLesen("anderthalb")).toBe(1.5);
  });
  it("keine Zahl", () => {
    expect(zahlwortLesen("Steckdose")).toBeNull();
    expect(zahlwortLesen("zweifach")).toBeNull();
    expect(zahlwortLesen("Dreifachsteckdose")).toBeNull();
    expect(zahlwortLesen("")).toBeNull();
  });
});

describe("Leistung finden", () => {
  it("Steckdosen und Schalter", () => {
    expect(leistung("Steckdose")).toBe("01.01");
    expect(leistung("Steckdosen")).toBe("01.01");
    expect(leistung("Doppelsteckdosen")).toBe("01.02");
    expect(leistung("Zweifachsteckdose")).toBe("01.02");
    expect(leistung("Feuchtraumsteckdose")).toBe("01.03");
    expect(leistung("Steckdose Feuchtraum")).toBe("01.03");
    expect(leistung("Aufputzsteckdose")).toBe("01.03");
    expect(leistung("Schalter")).toBe("01.04");
    expect(leistung("Schaltern")).toBe("01.04");
    expect(leistung("Lichtschalter")).toBe("01.04");
    expect(leistung("Wechselschalter")).toBe("01.05");
    expect(leistung("Kreuzschalter")).toBe("01.06");
    expect(leistung("Serienschalter")).toBe("01.07");
    expect(leistung("Taster")).toBe("01.08");
    expect(leistung("Bewegungsmelder")).toBe("01.09");
    expect(leistung("Präsenzmelder")).toBe("01.09");
  });
  it("Leitungen und Verrohrung", () => {
    expect(leistung("Leerrohr", "m")).toBe("02.01");
    expect(leistung("Flexrohr")).toBe("02.01");
    expect(leistung("Kabel")).toBe("02.02");
    expect(leistung("NYM 3x1,5")).toBe("02.02");
    expect(leistung("Kabel 5x2,5")).toBe("02.03");
    expect(leistung("Schlitz stemmen und verputzen")).toBe("02.04");
    expect(leistung("Hohlwanddosen")).toBe("02.05");
  });
  it("Verteiler", () => {
    expect(leistung("Unterverteiler")).toBe("03.01");
    expect(leistung("Sicherung")).toBe("03.02");
    expect(leistung("Sicherungsautomaten")).toBe("03.02");
    expect(leistung("LS")).toBe("03.02");
    expect(leistung("FI")).toBe("03.03");
    expect(leistung("FI-Schalter")).toBe("03.03");
    expect(leistung("Fehlerstromschutzschalter")).toBe("03.03");
    expect(leistung("FI/LS")).toBe("03.04");
    expect(leistung("Überspannungsschutz")).toBe("03.05");
  });
  it("Licht, Netzwerk, Anschlüsse, Sicherheit", () => {
    expect(leistung("Lampe")).toBe("04.01");
    expect(leistung("Deckenlampen")).toBe("04.01");
    expect(leistung("Lichtauslass")).toBe("04.01");
    expect(leistung("Spots")).toBe("04.02");
    expect(leistung("Einbaustrahler")).toBe("04.02");
    expect(leistung("LED-Panel")).toBe("04.03");
    expect(leistung("Netzwerkdose")).toBe("05.01");
    expect(leistung("LAN-Dose")).toBe("05.01");
    expect(leistung("Netzwerkkabel")).toBe("05.02");
    expect(leistung("SAT-Dose")).toBe("05.03");
    expect(leistung("Antennendose")).toBe("05.03");
    expect(leistung("Herdanschluss")).toBe("06.01");
    expect(leistung("E-Herd")).toBe("06.01");
    expect(leistung("Geschirrspüler")).toBe("06.02");
    expect(leistung("Boiler")).toBe("06.03");
    expect(leistung("Wallbox")).toBe("06.04");
    expect(leistung("Ladestation")).toBe("06.04");
    expect(leistung("Lüfter")).toBe("06.05");
    expect(leistung("Badlüfter")).toBe("06.05");
    expect(leistung("Rauchmelder")).toBe("07.01");
    expect(leistung("Potentialausgleich")).toBe("07.02");
    expect(leistung("Potenzialausgleich")).toBe("07.02");
    expect(leistung("Messprotokoll")).toBe("08.01");
    expect(leistung("Anfahrt")).toBe("08.02");
    expect(leistung("Regiestunden")).toBe("08.03");
  });
  it("findet nichts, wo nichts ist", () => {
    expect(leistung("Blumentopf")).toBeNull();
    expect(leistung("Kabelkanal")).toBeNull();
    expect(leistung("Fenster")).toBeNull();
  });
  it("liefert Alternativen", () => {
    const r = leistungFinden("Steckdose", KATALOG);
    expect(r.alternativen.length).toBeGreaterThan(0);
    expect(r.alternativen).toContain("01.03");
  });
});

describe("Sätze zerlegen", () => {
  it("das Beispiel aus dem Konzept", () => {
    const p = zerlegt("Küche: 6 Steckdosen, 2 Wechselschalter, 1 Herdanschluss. Wohnzimmer drei Doppelsteckdosen und eine Netzwerkdose, 20 Meter Leerrohr");
    expect(kurz(p)).toEqual([
      ["Küche", 6, "01.01"],
      ["Küche", 2, "01.05"],
      ["Küche", 1, "06.01"],
      ["Wohnzimmer", 3, "01.02"],
      ["Wohnzimmer", 1, "05.01"],
      ["Wohnzimmer", 20, "02.01"],
    ]);
    expect(p[5].einheit).toBe("m");
    expect(p[0].text).toBe("6 Steckdosen");
    expect(p[3].text).toBe("drei Doppelsteckdosen");
  });

  it("so wie die Spracherkennung es liefert — ohne Satzzeichen", () => {
    const p = zerlegt("Küche sechs Steckdosen zwei Wechselschalter ein Herdanschluss Wohnzimmer drei Doppelsteckdosen eine Netzwerkdose zwanzig Meter Leerrohr");
    expect(kurz(p)).toEqual([
      ["Küche", 6, "01.01"],
      ["Küche", 2, "01.05"],
      ["Küche", 1, "06.01"],
      ["Wohnzimmer", 3, "01.02"],
      ["Wohnzimmer", 1, "05.01"],
      ["Wohnzimmer", 20, "02.01"],
    ]);
  });

  it("Zeile für Zeile, wie der Diktatknopf sie anhängt", () => {
    const p = zerlegt("in der Küche sechs Steckdosen\nzwei Wechselschalter\nim Bad zwei Steckdosen und ein Lüfter\nPotentialausgleich");
    expect(kurz(p)).toEqual([
      ["Küche", 6, "01.01"],
      ["Küche", 2, "01.05"],
      ["Bad", 2, "01.01"],
      ["Bad", 1, "06.05"],
      ["Bad", 1, "07.02"],
    ]);
    expect(p[4].mengeGesagt).toBe(false);
  });

  it("Startseiten-Beispiel ohne Raum", () => {
    expect(kurz(zerlegt("3 Steckdosen, 2 Schalter, 1 FI"))).toEqual([
      [null, 3, "01.01"],
      [null, 2, "01.04"],
      [null, 1, "03.03"],
    ]);
  });

  it("Füllwörter stören nicht", () => {
    expect(kurz(zerlegt("Also in der Küche bitte noch zwei Steckdosen und dann noch einen Herdanschluss"))).toEqual([
      ["Küche", 2, "01.01"],
      ["Küche", 1, "06.01"],
    ]);
    expect(kurz(zerlegt("Im Wohnzimmer brauchen wir sechs Steckdosen neben dem Fenster"))).toEqual([
      ["Wohnzimmer", 6, "01.01"],
    ]);
  });

  it("Kommazahlen, Einheiten und Querschnitte", () => {
    const a = zerlegt("2,5 Meter Kabel");
    expect(kurz(a)).toEqual([[null, 2.5, "02.02"]]);
    expect(a[0].einheit).toBe("m");
    expect(kurz(zerlegt("zwei Komma fünf Meter Leerrohr"))).toEqual([[null, 2.5, "02.01"]]);
    expect(kurz(zerlegt("15 Meter Kabel 3x1,5"))).toEqual([[null, 15, "02.02"]]);
    expect(kurz(zerlegt("10 m Kabel 5 x 2,5"))).toEqual([[null, 10, "02.03"]]);
    expect(kurz(zerlegt("20m Leerrohr"))).toEqual([[null, 20, "02.01"]]);
    const s = zerlegt("6 Stück Steckdosen");
    expect(kurz(s)).toEqual([[null, 6, "01.01"]]);
    expect(s[0].einheit).toBe("Stk");
    expect(kurz(zerlegt("eineinhalb Stunden Regie"))).toEqual([[null, 1.5, "08.03"]]);
  });

  it("technische Zahlen sind keine Mengen", () => {
    expect(kurz(zerlegt("1 Herdanschluss 400 Volt"))).toEqual([[null, 1, "06.01"]]);
    expect(kurz(zerlegt("ein Überspannungsschutz Typ 2"))).toEqual([[null, 1, "03.05"]]);
    expect(kurz(zerlegt("vier Netzwerkdosen Cat 6"))).toEqual([[null, 4, "05.01"]]);
  });

  it("Stunden ohne weiteres Wort", () => {
    const p = zerlegt("drei Stunden");
    expect(kurz(p)).toEqual([[null, 3, "08.03"]]);
    expect(p[0].einheit).toBe("h");
    expect(kurz(zerlegt("2 Stunden Fehlersuche"))).toEqual([[null, 2, "08.03"]]);
  });

  it("Raumnamen mit Nummer und eigene Räume", () => {
    expect(kurz(zerlegt("Kinderzimmer 2: 3 Steckdosen"))).toEqual([["Kinderzimmer 2", 3, "01.01"]]);
    expect(kurz(zerlegt("Kinderzimmer 2 Steckdosen"))).toEqual([["Kinderzimmer", 2, "01.01"]]);
    expect(kurz(zerlegt("Raum Werkstatt: 4 Doppelsteckdosen"))).toEqual([["Werkstatt", 4, "01.02"]]);
    expect(kurz(zerlegt("Raum 3: zwei Spots"))).toEqual([["Raum 3", 2, "04.02"]]);
    expect(kurz(zerlegt("Top 2 sechs Rauchmelder"))).toEqual([["Top 2", 6, "07.01"]]);
    expect(kurz(zerlegt("Badezimmer: 1 Badlüfter"))).toEqual([["Badezimmer", 1, "06.05"]]);
    expect(kurz(zerlegt("Stiegenhaus drei Lampen und zwei Bewegungsmelder"))).toEqual([
      ["Stiegenhaus", 3, "04.01"],
      ["Stiegenhaus", 2, "01.09"],
    ]);
    expect(kurz(zerlegt("Speis eine Lampe"))).toEqual([["Speis", 1, "04.01"]]);
    expect(kurz(zerlegt("Gäste-WC: ein Lüfter"))).toEqual([["Gäste-WC", 1, "06.05"]]);
  });

  it("Umlaute ausgeschrieben", () => {
    expect(kurz(zerlegt("Kueche: 2 Steckdosen. Bad: 1 Luefter"))).toEqual([
      ["Küche", 2, "01.01"],
      ["Bad", 1, "06.05"],
    ]);
  });

  it("Raum hinten gilt für das eben Gesagte", () => {
    expect(kurz(zerlegt("zwei Steckdosen im Bad und eine Lampe im Gang"))).toEqual([
      ["Bad", 2, "01.01"],
      ["Gang", 1, "04.01"],
    ]);
    // und der Garten macht die Steckdose zur Feuchtraumsteckdose
    expect(kurz(zerlegt("eine Steckdose im Garten"))).toEqual([["Garten", 1, "01.03"]]);
  });

  it("getippte Überschrift mit Doppelpunkt wird ein Titel", () => {
    expect(kurz(zerlegt("Verteiler: 1 Unterverteiler, 10 Sicherungen, 2 FI"))).toEqual([
      ["Verteiler", 1, "03.01"],
      ["Verteiler", 10, "03.02"],
      ["Verteiler", 2, "03.03"],
    ]);
    // aber „Anfahrt: 1“ ist eine Leistung mit Menge
    expect(kurz(zerlegt("Anfahrt: 1"))).toEqual([[null, 1, "08.02"]]);
  });

  it("zwei Leistungen hintereinander ohne Menge", () => {
    expect(kurz(zerlegt("Vorraum Wechselschalter und Kreuzschalter"))).toEqual([
      ["Vorraum", 1, "01.05"],
      ["Vorraum", 1, "01.06"],
    ]);
    // „für den Herd“ beschreibt nur näher
    expect(kurz(zerlegt("5 Meter Kabel für den Herd"))).toEqual([[null, 5, "02.02"]]);
  });

  it("Raumwort in der Beschreibung bleibt Beschreibung", () => {
    expect(kurz(zerlegt("1 Potentialausgleich Bad"))).toEqual([[null, 1, "07.02"]]);
  });

  it("der Raum gibt Zusammenhang: Garten-Steckdose ist eine Feuchtraumsteckdose", () => {
    expect(kurz(zerlegt("Garten: zwei Steckdosen"))).toEqual([["Garten", 2, "01.03"]]);
  });

  it("zwei Dinge ohne Menge dazwischen werden getrennt", () => {
    expect(kurz(zerlegt("Vorraum: Steckdose und Schalter"))).toEqual([
      ["Vorraum", 1, "01.01"],
      ["Vorraum", 1, "01.04"],
    ]);
    // aber ein Kurztext mit „und“ bleibt ganz
    expect(kurz(zerlegt("5 Meter Schlitz stemmen und verputzen"))).toEqual([[null, 5, "02.04"]]);
  });

  it("Menge nach dem Wort", () => {
    expect(kurz(zerlegt("Steckdosen sechs"))).toEqual([[null, 6, "01.01"]]);
  });

  it("nicht Erkanntes bleibt sichtbar — mit Menge", () => {
    const p = zerlegt("Küche 2 Steckdosen und 3 Blumentöpfe");
    expect(kurz(p)).toEqual([
      ["Küche", 2, "01.01"],
      ["Küche", 3, null],
    ]);
    expect(p[1].text).toBe("3 Blumentöpfe");
    expect(p[1].beschreibung).toBe("Blumentöpfe");
    expect(zerlegt("15 Meter Kabel für den Herd")[0].beschreibung).toBe("Kabel für den Herd");
  });

  it("„eine“ nach einer Präposition ist keine Menge", () => {
    expect(kurz(zerlegt("1 Geräteanschluss für eine Waschmaschine"))).toEqual([[null, 1, "06.02"]]);
  });

  it("leere und sinnlose Eingaben", () => {
    expect(zerlegt("")).toEqual([]);
    expect(zerlegt("äh, also, ja.")).toEqual([]);
    expect(zerlegt("Küche:")).toEqual([]);
  });

  it("Schlüssel sind eindeutig", () => {
    const p = zerlegt("2 Steckdosen, 2 Steckdosen");
    expect(new Set(p.map((x) => x.key)).size).toBe(2);
  });
});
