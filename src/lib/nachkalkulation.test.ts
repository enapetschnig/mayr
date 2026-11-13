import { describe, expect, it } from "vitest";
import {
  angeboteneStunden, kalkulationsAngebote, nachkalkulieren, satzAm, stundenAmpel, stundenSaetze, type Saetze,
} from "./nachkalkulation";
import { foerderFrist, foerderPille, fristText } from "./foerderung";
import { nummerText, PLATZHALTER, vorlageFuellen, vorlagenLesen, VORLAGEN_VORGABE, waLink, waNummer } from "./whatsapp";

const saetze = [
  { user_id: "max", gueltig_ab: "2026-01-01", lohnkosten: 38, verrechnungssatz: null },
  { user_id: "max", gueltig_ab: "2026-11-01", lohnkosten: 40, verrechnungssatz: null },
  { user_id: "meister", gueltig_ab: "2026-01-01", lohnkosten: 52, verrechnungssatz: 92 },
];
const basis: Saetze = {
  saetze,
  lohnartVon: { lehrling: "Lehrling" },
  lohnarten: [{ name: "Standard", satz: 72, standard: true }, { name: "Lehrling", satz: 42 }],
  standardSatz: 72,
  standardKosten: 35,
};

describe("satzAm", () => {
  it("nimmt den am Tag gültigen Satz", () => {
    expect(satzAm(saetze, "max", "2026-10-31")?.lohnkosten).toBe(38);
    expect(satzAm(saetze, "max", "2026-11-01")?.lohnkosten).toBe(40);
    expect(satzAm(saetze, "max", "2025-12-31")).toBeNull();
    expect(satzAm(saetze, "lisa", "2026-11-01")).toBeNull();
  });
});

describe("stundenSaetze", () => {
  it("eigener Satz vor Lohnart vor Standard; Lohnkosten der Person vor Betrieb", () => {
    expect(stundenSaetze(basis, "meister", "2026-05-01")).toEqual({ verrechnung: 92, kosten: 52, eigener: true });
    expect(stundenSaetze(basis, "lehrling", "2026-05-01")).toEqual({ verrechnung: 42, kosten: 35, eigener: false });
    expect(stundenSaetze(basis, "max", "2026-05-01")).toEqual({ verrechnung: 72, kosten: 38, eigener: false });
  });
  it("ohne Lohnkosten im Betrieb bleibt sie unbekannt", () => {
    expect(stundenSaetze({ ...basis, standardKosten: null }, "lisa", "2026-05-01").kosten).toBeNull();
    expect(stundenSaetze({ ...basis, standardKosten: 0 }, "lisa", "2026-05-01").kosten).toBeNull();
  });
});

describe("angeboteneStunden", () => {
  it("Arbeitszeit in h plus Montageminuten der Leistungen", () => {
    expect(angeboteneStunden([
      { art: "titel", menge: 1, einheit: "Stk", minuten: 600 },
      { art: "arbeit", menge: 16, einheit: "h", minuten: null },
      { art: "leistung", menge: 6, einheit: "Stk", minuten: 30 },
      { art: "artikel", menge: 2, einheit: "Stk", minuten: 15 },
      { art: "material", menge: 10, einheit: "m", minuten: null },
      { art: "abzug", menge: -1, einheit: "Psch", minuten: 60 },
      // Arbeit pauschal: zählt nur über die Minuten
      { art: "arbeit", menge: 1, einheit: "Psch", minuten: 120 },
    ])).toBe(16 + 3 + 0.5 + 2);
  });
});

describe("kalkulationsAngebote", () => {
  it("angenommene zuerst, sonst offene, nie Entwürfe", () => {
    const b = [{ typ: "angebot", status: "offen" }, { typ: "angebot", status: "angenommen" }, { typ: "rechnung", status: "offen" }];
    expect(kalkulationsAngebote(b)).toEqual({ angebote: [b[1]], angenommen: true });
    expect(kalkulationsAngebote([b[0], { typ: "angebot", status: "entwurf" }])).toEqual({ angebote: [b[0]], angenommen: false });
  });
});

describe("nachkalkulieren", () => {
  it("trennt Regie von der Pauschale und rechnet je Person", () => {
    const n = nachkalkulieren(
      [
        { user_id: "max", datum: "2026-10-20", stunden: 8, art: "arbeit", regiebericht_id: null },
        { user_id: "meister", datum: "2026-10-20", stunden: 2, art: "ue50", regiebericht_id: null },
        { user_id: "max", datum: "2026-10-21", stunden: 1, art: "garantie", regiebericht_id: null },
        { user_id: "lehrling", datum: "2026-10-22", stunden: 4, art: "arbeit", regiebericht_id: "rb1" },
      ],
      [
        { menge: 10, ek: 2, vk: 3, regiebericht_id: null },
        { menge: -2, ek: 2, vk: 3, regiebericht_id: null },
        { menge: 1, ek: 50, vk: 70, regiebericht_id: "rb1" },
      ],
      basis,
    );
    // Pauschale: 8 × 72 + 2 × 92 × 1,5 = 852; Garantie zählt 0
    expect(n.pauschal.stunden).toBe(11);
    expect(n.pauschal.arbeitWert).toBe(852);
    expect(n.pauschal.lohnkosten).toBe(8 * 38 + 2 * 52 * 1.5 + 38);
    expect(n.pauschal.materialEk).toBe(16);
    expect(n.pauschal.wert).toBe(852 + 24);
    expect(n.regie).toMatchObject({ stunden: 4, arbeitWert: 168, lohnkosten: 140, materialEk: 50, materialVk: 70, wert: 238, ertrag: 48 });
    expect(n.mitEigenemSatz).toBe(true);
    expect(n.ohneKosten).toBe(0);
  });
  it("zählt Stunden ohne bekannte Lohnkosten", () => {
    const n = nachkalkulieren([{ user_id: "lisa", datum: "2026-10-20", stunden: 3, art: null, regiebericht_id: null }], [], { ...basis, standardKosten: null });
    expect(n.ohneKosten).toBe(3);
    expect(n.pauschal.lohnkosten).toBe(0);
  });
});

describe("stundenAmpel", () => {
  it("grün, gelb, rot", () => {
    expect(stundenAmpel(10, 0)).toBeNull();
    expect(stundenAmpel(80, 100)?.ton).toBe("gruen");
    expect(stundenAmpel(90, 100)?.ton).toBe("gelb");
    expect(stundenAmpel(100, 100)?.ton).toBe("gelb");
    expect(stundenAmpel(112.5, 100)).toMatchObject({ ton: "rot", text: "12,5 h über dem Angebot" });
  });
});

describe("Förderung", () => {
  it("Pille nur bei erfasster Förderung", () => {
    expect(foerderPille(null)).toBeNull();
    expect(foerderPille("keine")).toBeNull();
    expect(foerderPille("zugesagt")?.text).toBe("Förderung zugesagt");
    expect(foerderPille("vorbereitet")?.text).toBe("Förderantrag vorbereitet");
  });
  it("Frist nur bei offenen Schritten und in 30 Tagen", () => {
    expect(foerderFrist({ foerder_status: "zugesagt", foerder_frist: "2026-12-01" }, "2026-11-13")).toEqual({ inTagen: 18, ueberfaellig: false });
    expect(foerderFrist({ foerder_status: "zugesagt", foerder_frist: "2027-01-01" }, "2026-11-13")).toBeNull();
    expect(foerderFrist({ foerder_status: "eingereicht", foerder_frist: "2026-11-10" }, "2026-11-13")).toEqual({ inTagen: -3, ueberfaellig: true });
    expect(foerderFrist({ foerder_status: "ausbezahlt", foerder_frist: "2026-11-10" }, "2026-11-13")).toBeNull();
    expect(foerderFrist({ foerder_status: "zugesagt", foerder_frist: null }, "2026-11-13")).toBeNull();
    // Sommerzeit-Wechsel ändert die Tage nicht
    expect(foerderFrist({ foerder_status: "zugesagt", foerder_frist: "2027-03-30" }, "2027-03-27", 30)?.inTagen).toBe(3);
  });
  it("Fristtext", () => {
    expect(fristText(0)).toBe("heute");
    expect(fristText(5)).toBe("in 5 Tagen");
    expect(fristText(-1)).toBe("seit gestern vorbei");
    expect(fristText(-4)).toBe("seit 4 Tagen vorbei");
  });
});

describe("WhatsApp", () => {
  it("normalisiert österreichische Nummern", () => {
    expect(waNummer("0664 123 45 67")).toBe("436641234567");
    expect(waNummer("+43 (0)664/123 45-67")).toBe("436641234567");
    expect(waNummer("0043 664 1234567")).toBe("436641234567");
    expect(waNummer("+49 171 1234567")).toBe("491711234567");
    expect(waNummer("664 1234567")).toBe("436641234567");
    expect(waNummer("436641234567")).toBe("436641234567");
    expect(waNummer("0316 12")).toBeNull();
    expect(waNummer("")).toBeNull();
    expect(waNummer(null)).toBeNull();
  });
  it("Anzeige und Link", () => {
    expect(nummerText("436641234567")).toBe("+43 664 1234567");
    expect(waLink("436641234567", "Grüß Gott & bis morgen")).toBe("https://wa.me/436641234567?text=Gr%C3%BC%C3%9F%20Gott%20%26%20bis%20morgen");
  });
  it("füllt Platzhalter, leere als –, fremde bleiben", () => {
    expect(vorlageFuellen("{kunde}, am {datum} um {uhrzeit} {unbekannt}", { kunde: "Familie Pichler", datum: "Di 17.11.", uhrzeit: "" }))
      .toBe("Familie Pichler, am Di 17.11. um – {unbekannt}");
  });
  it("Vorlagen des Betriebs, sonst die Vorgaben", () => {
    expect(vorlagenLesen(null)).toBe(VORLAGEN_VORGABE);
    expect(vorlagenLesen([{ name: " ", text: "x" }, "quatsch"])).toBe(VORLAGEN_VORGABE);
    expect(vorlagenLesen([{ name: "Kurz", text: "Hallo {kunde}" }])).toEqual([{ name: "Kurz", text: "Hallo {kunde}" }]);
    // die Vorgaben kennen nur bekannte Platzhalter
    expect(VORLAGEN_VORGABE.flatMap((v) => [...v.text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])).every((k) => k in PLATZHALTER)).toBe(true);
  });
});
