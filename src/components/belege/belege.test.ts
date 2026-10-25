import { describe, expect, it, vi } from "vitest";

// importieren.ts lädt den Supabase-Client — im Test nicht nötig (und ohne localStorage nicht ladbar)
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  duplizieren, entfernen, fertigHinweise, freierTitelName, hinzufuegen, kopfNeu, leerePosition, leistungPosition, leistungWeniger,
  mengeInGruppe, positionZuDb, positionsNummern, quelleJson, summen, titelPosition, verschieben, zwischensummen,
  type EditorPosition, type KatalogLeistung,
} from "./editor";
import { importPositionen, materialGruppen, type ImportDaten, type ImportMaterial, type ImportZeit } from "./importieren";

const FIRMA = { stundensatz: 72, material_aufschlag: 35 };

const steckdose = {
  id: "l-steckdose", kurztext: "Steckdose UP komplett", einheit: "Stk", minuten: 25, preis: null, langtext: null,
  leistung_material: [
    { menge: 1, artikel: { vk_preis: null, ek_preis: 4.2, listenpreis: null } },
    { menge: 1, artikel: { vk_preis: null, ek_preis: 0.39, listenpreis: null } },
  ],
} as unknown as KatalogLeistung;

const namen = (l: EditorPosition[]) => l.map((p) => (p.art === "titel" ? `# ${p.bezeichnung}` : `${p.bezeichnung} ${p.menge}`));

describe("Positionen", () => {
  it("Leistung kostet Material-VK plus Montagezeit", () => {
    const p = leistungPosition(steckdose, FIRMA, 72);
    // Material-VK je Artikel gerundet: 4,20 × 1,35 = 5,67 und 0,39 × 1,35 = 0,53 → 6,20
    // Montage: 25 min × 72 €/h = 30,00 → zusammen 36,20
    expect(p.einzelpreis).toBe("36,20");
    expect(p.ek_preis).toBe(4.59);
    expect(p.minuten).toBe(25);
    expect(p.leistung_id).toBe("l-steckdose");
  });

  it("dreimal antippen ergibt eine Zeile mit 3 Stück — je Raum", () => {
    let l: EditorPosition[] = [];
    const kueche = titelPosition("Küche");
    l = [kueche];
    for (let i = 0; i < 3; i++) l = hinzufuegen(l, leistungPosition(steckdose, FIRMA, 72), kueche.id).liste;
    const bad = titelPosition("Bad");
    l = [...l, bad];
    l = hinzufuegen(l, leistungPosition(steckdose, FIRMA, 72), bad.id).liste;
    // nachträglich noch eine in die Küche: landet in der Küche, nicht am Ende
    l = hinzufuegen(l, leistungPosition(steckdose, FIRMA, 72), kueche.id).liste;
    expect(namen(l)).toEqual(["# Küche", "Steckdose UP komplett 4", "# Bad", "Steckdose UP komplett 1"]);
    expect(mengeInGruppe(l, kueche.id, "l-steckdose")).toBe(4);
    l = leistungWeniger(l, bad.id, "l-steckdose");
    expect(namen(l)).toEqual(["# Küche", "Steckdose UP komplett 4", "# Bad"]);
  });

  it("anderer Preis = eigene Zeile", () => {
    const a = leistungPosition(steckdose, FIRMA, 72);
    const b = { ...leistungPosition(steckdose, FIRMA, 72), einzelpreis: "30,00" };
    const l = hinzufuegen(hinzufuegen([], a, null).liste, b, null).liste;
    expect(l).toHaveLength(2);
  });

  it("ohne Titel landet die Position vor dem ersten Titel", () => {
    const t = titelPosition("Küche");
    const l = hinzufuegen([t], leerePosition("pauschale", { bezeichnung: "Anfahrt" }), null).liste;
    expect(namen(l)).toEqual(["Anfahrt 1", "# Küche"]);
  });

  it("Titel verschiebt seinen ganzen Raum", () => {
    const k = titelPosition("Küche");
    const b = titelPosition("Bad");
    const l = [k, leerePosition("leistung", { bezeichnung: "A" }), b, leerePosition("leistung", { bezeichnung: "B" }), leerePosition("leistung", { bezeichnung: "C" })];
    expect(namen(verschieben(l, b.id, -1))).toEqual(["# Bad", "B 1", "C 1", "# Küche", "A 1"]);
    expect(namen(verschieben(l, k.id, 1))).toEqual(["# Bad", "B 1", "C 1", "# Küche", "A 1"]);
    // erster Titel kann nicht weiter hinauf, letzter nicht hinunter
    expect(verschieben(l, k.id, -1)).toBe(l);
    expect(verschieben(l, b.id, 1)).toBe(l);
    // eine Position wandert über den Titel in den Raum davor
    expect(namen(verschieben(l, l[3].id, -1))).toEqual(["# Küche", "A 1", "B 1", "# Bad", "C 1"]);
  });

  it("Raum kopieren ergibt „Kinderzimmer 2“ mit neuen IDs und ohne Herkunft", () => {
    const t = titelPosition("Kinderzimmer");
    const p = leerePosition("arbeit", { bezeichnung: "Arbeitszeit", quelle: { zeiten: ["z1"], material: [], regie: [] } });
    const { liste } = duplizieren([t, p], t.id);
    expect(namen(liste)).toEqual(["# Kinderzimmer", "Arbeitszeit 1", "# Kinderzimmer 2", "Arbeitszeit 1"]);
    expect(liste[3].id).not.toBe(p.id);
    expect(liste[3].quelle).toBeNull();
    expect(freierTitelName(liste, "Kinderzimmer")).toBe("Kinderzimmer 3");
    expect(freierTitelName(liste, "Bad")).toBe("Bad");
  });

  it("Titel löschen — allein oder mit dem Raum", () => {
    const t = titelPosition("Bad");
    const l = [leerePosition("leistung", { bezeichnung: "X" }), t, leerePosition("leistung", { bezeichnung: "Y" })];
    expect(namen(entfernen(l, t.id))).toEqual(["X 1", "Y 1"]);
    expect(namen(entfernen(l, t.id, true))).toEqual(["X 1"]);
  });

  it("Nummern: Titel 1, 2 — darunter 1.1; Text ohne Nummer", () => {
    expect(positionsNummern(["leistung", "titel", "leistung", "text", "leistung", "titel", "leistung"]))
      .toEqual(["1", "2", "2.1", "", "2.2", "3", "3.1"]);
  });

  it("Zwischensummen je Titel", () => {
    expect(zwischensummen([
      { art: "titel", gesamt: 0 }, { art: "leistung", gesamt: 10.1 }, { art: "leistung", gesamt: 0.2 },
      { art: "titel", gesamt: 0 }, { art: "text", gesamt: 0 },
    ])).toEqual({ 0: 10.3, 3: 0 });
  });

  it("Summen: Titel und Text zählen nicht, Reverse Charge ohne USt", () => {
    const l = [
      titelPosition("Küche"),
      leerePosition("leistung", { menge: "2,5", einzelpreis: "10,00" }),
      leerePosition("text", { bezeichnung: "Hinweis", menge: "5", einzelpreis: "100" }),
    ];
    expect(summen(l, 20, false)).toEqual({ netto: 25, ust: 5, brutto: 30 });
    expect(summen(l, 20, true)).toEqual({ netto: 25, ust: 0, brutto: 25 });
  });

  it("Datenbankzeile: alle Felder, Titel ohne Betrag, Herkunft nur befüllt", () => {
    const t = positionZuDb(titelPosition("Küche"), "b1", 1);
    const p = positionZuDb(leerePosition("arbeit", { menge: "3,25", einzelpreis: "72", quelle: { zeiten: ["z"], material: [], regie: [] } }), "b1", 2);
    expect(Object.keys(t).sort()).toEqual(Object.keys(p).sort());
    expect(t).toMatchObject({ art: "titel", menge: 1, einzelpreis: 0, quelle: null, pos: 1 });
    expect(p).toMatchObject({ menge: 3.25, einzelpreis: 72, einheit: "h", quelle: { zeiten: ["z"] } });
    expect("gesamt" in p).toBe(false);
    expect(quelleJson({ zeiten: [], material: [], regie: [] })).toBeNull();
  });
});

// ── Rechnung aus dem Projekt — Daten wie in der Demo (Kirchenwirt) ────────

const zeit = (id: string, datum: string, stunden: number, user: string, rb: string | null = null): ImportZeit =>
  ({ id, datum, stunden, taetigkeit: null, user_id: user, name: user === "u1" ? "Max Monteur" : "Lisa Lehrling", regiebericht_id: rb });
const mat = (id: string, art: string, menge: number, ek: number | null, artikel: string | null, bez: string, einheit = "Stk", rb: string | null = null): ImportMaterial =>
  ({ id, art, menge, ek_preis: ek, bezeichnung: bez, einheit, artikel_id: artikel, artikel: artikel ? { vk_preis: null, ek_preis: ek, listenpreis: null } : null, regiebericht_id: rb, datum: "2026-10-16" });

describe("Material zusammenfassen", () => {
  it("Rückgaben ziehen ab, VK = EK der Buchung + 35 %", () => {
    const g = materialGruppen([
      mat("m1", "ausfassung", 25, 1.27, "a-kabel", "YM-J 5x2,5", "m"),
      mat("m2", "rueckgabe", 5, 1.27, "a-kabel", "YM-J 5x2,5", "m"),
      mat("m3", "direkt", 1, 385, "a-zv", "Zählerverteiler"),
      mat("m4", "ausfassung", 2, 3.45, "a-abox", "Abzweigkasten"),
      mat("m5", "rueckgabe", 2, 3.45, "a-abox", "Abzweigkasten"),
    ], FIRMA);
    expect(g.map((x) => [x.bezeichnung, x.menge, x.vk])).toEqual([
      ["YM-J 5x2,5", 20, 1.71],
      ["Zählerverteiler", 1, 519.75],
    ]);
    expect(g[0].ids).toEqual(["m1", "m2"]);
  });

  it("freie Buchung ohne Artikel nach Bezeichnung", () => {
    const g = materialGruppen([mat("m1", "direkt", 3, 2, null, "Kleinmaterial"), mat("m2", "direkt", 1, 2, null, "kleinmaterial ")], FIRMA);
    expect(g).toHaveLength(1);
    expect(g[0].menge).toBe(4);
  });
});

describe("Rechnung aus dem Projekt", () => {
  const daten: ImportDaten = {
    angebote: [],
    regie: [{
      id: "rb2", nummer: "RB-2026-002", datum: "2026-10-21", arbeiten: "Gastgarten: zwei Wandleuchten montiert.",
      zeiten: [zeit("z1", "2026-10-21", 5, "u1", "rb2"), zeit("z2", "2026-10-21", 5, "u2", "rb2")],
      material: [mat("m1", "ausfassung", 2, 4.92, "a-leuchte", "LED-Wandleuchte", "Stk", "rb2")],
    }],
    zeiten: [zeit("z3", "2026-10-15", 8, "u1"), zeit("z4", "2026-10-16", 6, "u1"), zeit("z5", "2026-10-16", 6, "u2")],
    material: [mat("m2", "ausfassung", 10, 0.12, "a-wago", "WAGO 2273-205")],
    unsigniert: [],
  };
  const alles = { angebote: [], regie: ["rb2"], zeiten: ["z3", "z4", "z5"], material: ["a-wago"] };

  it("Regiebericht als Titel, Stunden je Mitarbeiter, Material einzeln", () => {
    const r = importPositionen(daten, alles, { stundenJeMitarbeiter: true, materialPauschale: false, stundensatz: 72 }, FIRMA, false);
    expect(r.positionen.map((p) => [p.art, p.bezeichnung, p.menge, p.einzelpreis])).toEqual([
      ["titel", "Regiebericht RB-2026-002 vom 21.10.2026", "1", "0,00"],
      ["arbeit", "Arbeitszeit Max Monteur", "5", "72,00"],
      ["arbeit", "Arbeitszeit Lisa Lehrling", "5", "72,00"],
      ["material", "LED-Wandleuchte", "2", "6,64"],
      ["titel", "Arbeitszeit und Material", "1", "0,00"],
      ["arbeit", "Arbeitszeit Max Monteur", "14", "72,00"],
      ["arbeit", "Arbeitszeit Lisa Lehrling", "6", "72,00"],
      ["material", "WAGO 2273-205", "10", "0,16"],
    ]);
    // Herkunft: Bericht am Titel, Stunden und Material an ihrer Zeile
    expect(r.positionen[0].quelle).toEqual({ zeiten: [], material: [], regie: ["rb2"] });
    expect(r.positionen[5].quelle?.zeiten).toEqual(["z3", "z4"]);
    expect(r.positionen[5].langtext).toBe("15.10.2026 – 16.10.2026");
    expect(r.positionen[7].quelle?.material).toEqual(["m2"]);
    expect([r.von, r.bis]).toEqual(["2026-10-15", "2026-10-21"]);
  });

  it("eine Zeile Arbeitszeit, Material als Pauschale — ohne Titel, wenn nur ein Block", () => {
    const r = importPositionen(daten, { ...alles, regie: [] }, { stundenJeMitarbeiter: false, materialPauschale: true, stundensatz: 80 }, FIRMA, false);
    expect(r.positionen.map((p) => [p.art, p.bezeichnung, p.menge, p.einheit, p.einzelpreis])).toEqual([
      ["arbeit", "Arbeitszeit", "20", "h", "80,00"],
      ["pauschale", "Materialpauschale", "1", "Psch", "1,60"],
    ]);
    expect(r.positionen[1].langtext).toBe("10 Stk WAGO 2273-205");
  });

  it("Angebot kommt als Auftrag zuerst; Titel trennt den Rest", () => {
    const angebot = {
      id: "an1", nummer: "AN-2026-001", betreff: "Bad", status: "angenommen", netto: 100,
      positionen: [
        { id: "p1", beleg_id: "an1", pos: 1, art: "leistung", bezeichnung: "Steckdose UP komplett", langtext: null, menge: 2, einheit: "Stk", einzelpreis: 39.07, gesamt: 78.14, ek_preis: 4.59, minuten: 25, artikel_id: null, leistung_id: "l1", quelle: null },
      ],
    };
    const r = importPositionen({ ...daten, angebote: [angebot] }, { ...alles, angebote: ["an1"], regie: [] },
      { stundenJeMitarbeiter: false, materialPauschale: false, stundensatz: 72 }, FIRMA, false);
    expect(r.positionen.map((p) => [p.art, p.bezeichnung])).toEqual([
      ["titel", "Laut Angebot AN-2026-001"],
      ["leistung", "Steckdose UP komplett"],
      ["titel", "Arbeitszeit und Material"],
      ["arbeit", "Arbeitszeit"],
      ["material", "WAGO 2273-205"],
    ]);
    expect(r.positionen[1].id).not.toBe("p1");
    expect(r.positionen[1].menge).toBe("2");
    expect(r.angebotId).toBe("an1");
  });
});

describe("Hinweise vor dem Fertigstellen", () => {
  const pos = [leerePosition("leistung", { bezeichnung: "Steckdose", menge: "1", einzelpreis: "500" })];
  const rechnung = {
    ...kopfNeu("rechnung", null, "2026-10-25"),
    empf_name: "Gasthaus", empf_strasse: "Hauptplatz 1", empf_ort: "Linz", leistung_von: "2026-10-20", leistung_bis: "2026-10-21",
  };
  const firma = { uid: "ATU12345678", kleinunternehmer: false };

  it("vollständige Rechnung: keine Hinweise", () => {
    expect(fertigHinweise(rechnung, pos, 600, firma)).toEqual([]);
  });

  it("eigene UID fehlt erst über 400 € brutto — bei Kleinunternehmern nie", () => {
    const ohne = { uid: null, kleinunternehmer: false };
    expect(fertigHinweise(rechnung, pos, 400, ohne)).toEqual([]);
    expect(fertigHinweise(rechnung, pos, 400.01, ohne)).toEqual(["Eigene UID fehlt — in Einstellungen → Betrieb eintragen."]);
    expect(fertigHinweise(rechnung, pos, 5000, { uid: "", kleinunternehmer: true })).toEqual([]);
    // Angebote brauchen das nicht
    expect(fertigHinweise({ ...rechnung, typ: "angebot" }, pos, 5000, ohne)).toEqual([]);
  });

  it("UID des Empfängers ab 10.000 € brutto, bei Reverse Charge immer", () => {
    expect(fertigHinweise(rechnung, pos, 9999.99, firma)).toEqual([]);
    expect(fertigHinweise(rechnung, pos, 10000, firma)).toEqual([
      "Bei Firmenkunden ab 10.000 € brutto gehört die UID des Empfängers auf die Rechnung.",
    ]);
    expect(fertigHinweise({ ...rechnung, empf_uid: "ATU99999999" }, pos, 12000, firma)).toEqual([]);
    expect(fertigHinweise({ ...rechnung, reverse_charge: true }, pos, 12000, firma)).toEqual(["Reverse Charge, aber keine UID des Empfängers"]);
  });

  it("Leistungszeitraum, Anschrift und Positionen ohne Betrag", () => {
    const leer = [...pos, leerePosition("leistung", { bezeichnung: "Offen", menge: "1", einzelpreis: "" }), titelPosition("Küche")];
    expect(fertigHinweise({ ...rechnung, leistung_von: "", leistung_bis: "", empf_ort: "" }, leer, 600, firma)).toEqual([
      "1 Position ohne Betrag (Menge oder Preis 0)",
      "Kein Leistungszeitraum — auf Rechnungen Pflicht (§ 11 UStG)",
      "Anschrift des Empfängers unvollständig",
    ]);
  });
});
