import { describe, expect, it } from "vitest";
import {
  darfMaterialAendern, darfZeitAendern, filterAusUrl, hatInhalt, inhaltsRahmen, kurzText, materialFehler,
  materialGeaendert, materialZusammenfassen, mengeSchritt, neueId, passtFilter, passtSuche, pdfText, schnappschuss,
  summeStunden, textAnhaengen, zeileFehler, zeileLeer, zeileStunden, zeitGeaendert, zeitSpanne, zeitWerte,
  type Entwurf, type MaterialZeile, type ZeitZeile,
} from "./regieLogik";

const zeile = (z: Partial<ZeitZeile>): ZeitZeile => ({
  key: "k", id: null, herkunft: "neu", userId: "u1", modus: "stunden", stunden: "", von: "07:00", bis: "15:30",
  pause: "30", aenderbar: true, basis: null, ...z,
});

const mat = (m: Partial<MaterialZeile>): MaterialZeile => ({
  key: "m", id: null, artikelId: "a1", bezeichnung: "Wago 221-413", einheit: "Stk", menge: "1", quelle: "direkt",
  ekPreis: 0.5, aenderbar: true, basis: null, userId: "u1", ...m,
});

describe("Stunden der Partie", () => {
  it("rechnet Stunden direkt oder aus Von–Bis mit Pause", () => {
    expect(zeileStunden(zeile({ stunden: "7,5" }))).toBe(7.5);
    expect(zeileStunden(zeile({ modus: "vonbis" }))).toBe(8);
    expect(zeileStunden(zeile({ modus: "vonbis", von: "08:00", bis: "13:30", pause: "30" }))).toBe(5);
  });

  it("eine neue Zeile ohne Eingabe ist leer und kein Fehler", () => {
    const z = zeile({});
    expect(zeileLeer(z)).toBe(true);
    expect(zeileFehler(z)).toBeNull();
    expect(zeileLeer(zeile({ herkunft: "bericht" }))).toBe(false);
  });

  it("meldet unmögliche Zeiten", () => {
    expect(zeileFehler(zeile({ stunden: "0" }))).toBe("Stunden eintragen");
    expect(zeileFehler(zeile({ stunden: "25" }))).toBe("Höchstens 24 Stunden");
    expect(zeileFehler(zeile({ modus: "vonbis", von: "15:00", bis: "15:00" }))).toBe("Von und Bis sind gleich");
    expect(zeileFehler(zeile({ modus: "vonbis", von: "08:00", bis: "12:00", pause: "-30" }))).toBe("Die Pause kann nicht negativ sein");
    expect(zeileFehler(zeile({ modus: "vonbis", von: "08:00", bis: "08:20", pause: "30" }))).toBe("Die Pause ist länger als die Arbeitszeit");
    expect(zeileFehler(zeile({ stunden: "4" }))).toBeNull();
  });

  it("Störungsdienst über Mitternacht", () => {
    const nacht = zeile({ modus: "vonbis", von: "22:00", bis: "06:00", pause: "30" });
    expect(zeileFehler(nacht)).toBeNull();
    expect(zeileStunden(nacht)).toBe(7.5);
  });

  it("speichert Von/Bis nur im Von–Bis-Modus", () => {
    expect(zeitWerte(zeile({ stunden: "4" }))).toEqual({ stunden: 4, von: null, bis: null, pause_minuten: 0 });
    expect(zeitWerte(zeile({ modus: "vonbis" }))).toEqual({ stunden: 8, von: "07:00", bis: "15:30", pause_minuten: 30 });
  });

  it("erkennt Änderungen gegenüber der Datenbank, auch ein neues Datum", () => {
    const basis = { stunden: 8, von: "07:00", bis: "15:30", pause: 30, datum: "2026-10-25" };
    const z = zeile({ herkunft: "bericht", id: "z1", modus: "vonbis", basis });
    expect(zeitGeaendert(z, "2026-10-25")).toBe(false);
    expect(zeitGeaendert(z, "2026-10-24")).toBe(true);
    expect(zeitGeaendert({ ...z, bis: "16:00" }, "2026-10-25")).toBe(true);
  });

  it("summiert die Partie", () => {
    expect(summeStunden([zeile({ stunden: "4" }), zeile({ modus: "vonbis" }), zeile({})])).toBe(12);
  });

  it("zeigt die Spanne nur mit Uhrzeit", () => {
    expect(zeitSpanne("07:00:00", "15:30:00", 30)).toBe("07:00–15:30 · 30 Min. Pause");
    expect(zeitSpanne("08:00", "11:00", 0)).toBe("08:00–11:00");
    expect(zeitSpanne(null, null, 0)).toBe("");
  });
});

describe("Ungespeicherte Änderungen", () => {
  const entwurf = (e: Partial<Entwurf>): Entwurf => ({
    berichtId: "r1", nummer: "RB-2026-009", projektId: "p1", datum: "2026-10-25", arbeiten: "FI getauscht",
    kopfBasis: { datum: "2026-10-25", arbeiten: "FI getauscht" }, zeilen: [], material: [],
    entfernt: { zeiten: [], material: [] }, ...e,
  });

  it("vergleicht Werte statt Eingabetext und ohne Reihenfolge", () => {
    const a = zeile({ id: "z1", herkunft: "bericht", userId: "max", stunden: "6.5" });
    const b = zeile({ id: "z2", herkunft: "bericht", userId: "lisa", stunden: "4" });
    const db = entwurf({ zeilen: [{ ...b }, { ...a, stunden: "6,5" }], material: [mat({ id: "m1", menge: "2" })] });
    const editor = entwurf({ zeilen: [a, b, zeile({ key: "leer" })], material: [mat({ id: "m1", menge: "2,0" })] });
    expect(schnappschuss(editor)).toBe(schnappschuss(db));
    expect(schnappschuss({ ...editor, arbeiten: "FI getauscht." })).not.toBe(schnappschuss(db));
    expect(schnappschuss({ ...editor, entfernt: { zeiten: [{ id: "z9", behalten: true }], material: [] } })).not.toBe(schnappschuss(db));
  });

  it("ein neuer Bericht hat erst mit Text, Stunden oder Material Inhalt", () => {
    const neu = entwurf({ berichtId: null, kopfBasis: null, arbeiten: "", zeilen: [zeile({})] });
    expect(hatInhalt(neu)).toBe(false);
    expect(hatInhalt({ ...neu, zeilen: [zeile({ stunden: "8" })] })).toBe(true);
    expect(hatInhalt({ ...neu, arbeiten: "Licht" })).toBe(true);
  });
});

describe("Rechte wie in der Datenbank", () => {
  it("Stunden: eigene, selbst angelegte oder Chef — verrechnet nie", () => {
    const z = { user_id: "lisa", erstellt_von: "lisa", rechnung_id: null };
    expect(darfZeitAendern(z, "max", false)).toBe(false);
    expect(darfZeitAendern(z, "lisa", false)).toBe(true);
    expect(darfZeitAendern({ ...z, erstellt_von: "max" }, "max", false)).toBe(true);
    expect(darfZeitAendern(z, "chef", true)).toBe(true);
    expect(darfZeitAendern({ ...z, rechnung_id: "re" }, "chef", true)).toBe(false);
  });

  it("Material: nur wer gebucht hat oder der Chef", () => {
    expect(darfMaterialAendern({ user_id: "max", rechnung_id: null }, "lisa", false)).toBe(false);
    expect(darfMaterialAendern({ user_id: "max", rechnung_id: null }, "max", false)).toBe(true);
    expect(darfMaterialAendern({ user_id: "max", rechnung_id: null }, "chef", true)).toBe(true);
  });
});

describe("Material", () => {
  it("prüft Menge und Bezeichnung", () => {
    expect(materialFehler(mat({}))).toBeNull();
    expect(materialFehler(mat({ menge: "0" }))).toBe("Menge muss größer als 0 sein");
    expect(materialFehler(mat({ artikelId: null, bezeichnung: " " }))).toBe("Bezeichnung fehlt");
  });

  it("erkennt geänderte Menge oder Herkunft", () => {
    const m = mat({ id: "b1", menge: "2", basis: { menge: 2, quelle: "direkt" } });
    expect(materialGeaendert(m)).toBe(false);
    expect(materialGeaendert({ ...m, menge: "3" })).toBe(true);
    expect(materialGeaendert({ ...m, quelle: "bus1" })).toBe(true);
  });

  it("zählt ohne Rundungsreste und nie unter 0", () => {
    expect(mengeSchritt("0,1", 0.2)).toBe("0,3");
    expect(mengeSchritt("1", -1)).toBe("0");
    expect(mengeSchritt("0", -1)).toBe("0");
    expect(mengeSchritt("2,5", 1)).toBe("3,5");
  });

  it("fasst gleiche Artikel für den Kunden zusammen", () => {
    const liste = materialZusammenfassen([
      { artikelId: "a1", bezeichnung: "Wago", einheit: "Stk", menge: 4 },
      { artikelId: null, bezeichnung: "Kabelkanal weiß ", einheit: "m", menge: 2 },
      { artikelId: "a1", bezeichnung: "Wago", einheit: "Stk", menge: 2 },
      { artikelId: null, bezeichnung: "kabelkanal weiß", einheit: "m", menge: 1.5 },
    ]);
    expect(liste).toEqual([
      { artikelId: "a1", bezeichnung: "Wago", einheit: "Stk", menge: 6 },
      { artikelId: null, bezeichnung: "Kabelkanal weiß", einheit: "m", menge: 3.5 },
    ]);
  });
});

describe("Texte", () => {
  it("hängt Diktat an und schreibt am Satzanfang groß", () => {
    expect(textAnhaengen("", "steckdosen getauscht")).toBe("Steckdosen getauscht");
    expect(textAnhaengen("Steckdosen getauscht", "im gastraum")).toBe("Steckdosen getauscht im gastraum");
    expect(textAnhaengen("Steckdosen getauscht.", "fi geprüft")).toBe("Steckdosen getauscht. Fi geprüft");
    expect(textAnhaengen("Zeile 1\n", "zeile 2")).toBe("Zeile 1\nZeile 2");
    expect(textAnhaengen("abc", "  ")).toBe("abc");
  });

  it("kürzt auf die erste Zeile", () => {
    expect(kurzText("Erste Zeile\nZweite")).toBe("Erste Zeile");
    expect(kurzText("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
    expect(kurzText(null)).toBe("");
  });

  it("macht Text fürs PDF druckbar", () => {
    expect(pdfText("Größe 3x1,5 mm² – „gut“ € 12")).toBe("Größe 3x1,5 mm² – „gut“ € 12");
    expect(pdfText("Fertig 👍 → passt")).toBe("Fertig  -> passt");
    expect(pdfText("a\r\nb\tc")).toBe("a\nb c");
    expect(pdfText(null)).toBe("");
  });
});

describe("Liste", () => {
  it("liest den Filter aus der Adresse", () => {
    expect(filterAusUrl("offen")).toBe("offen");
    expect(filterAusUrl("quatsch")).toBe("alle");
    expect(filterAusUrl(null)).toBe("alle");
  });

  it("„Nicht verrechnet“ heißt unterschrieben ohne Rechnung", () => {
    expect(passtFilter({ status: "unterschrieben", rechnung_id: null }, "offen")).toBe(true);
    expect(passtFilter({ status: "unterschrieben", rechnung_id: "re" }, "offen")).toBe(false);
    expect(passtFilter({ status: "entwurf", rechnung_id: null }, "offen")).toBe(false);
    expect(passtFilter({ status: "unterschrieben", rechnung_id: "re" }, "unterschrieben")).toBe(true);
    expect(passtFilter({ status: "entwurf", rechnung_id: null }, "entwurf")).toBe(true);
  });

  it("sucht mit allen Wörtern", () => {
    expect(passtSuche(["RB-2026-002", "Kirchenwirt", "Gastgarten"], "kirchen gast")).toBe(true);
    expect(passtSuche(["RB-2026-002", "Kirchenwirt"], "kirchen huber")).toBe(false);
    expect(passtSuche(["x"], "  ")).toBe(true);
  });
});

describe("Unterschrift", () => {
  it("findet den Rahmen um die Striche", () => {
    const b = 6, h = 4;
    const px = new Uint8ClampedArray(b * h * 4).fill(255);
    const setze = (x: number, y: number) => { const i = (y * b + x) * 4; px[i] = 10; px[i + 1] = 10; px[i + 2] = 10; };
    setze(1, 1);
    setze(4, 2);
    expect(inhaltsRahmen(px, b, h)).toEqual({ x: 1, y: 1, breite: 4, hoehe: 2 });
    expect(inhaltsRahmen(new Uint8ClampedArray(b * h * 4).fill(255), b, h)).toBeNull();
  });

  it("erzeugt gültige UUIDs", () => {
    expect(neueId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
