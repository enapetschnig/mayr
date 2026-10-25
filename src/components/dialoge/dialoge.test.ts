import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { stundensatzLesen } from "./ProjektDialog";
import { terminFehler } from "./TerminDialog";
import { stundensatzFuer } from "@/lib/preise";
import { kundePasst } from "@/components/KundeWahl";

describe("Eigener Stundensatz am Projekt", () => {
  it("leer heißt: der des Betriebs", () => {
    expect(stundensatzLesen("")).toBeNull();
    expect(stundensatzLesen("   ")).toBeNull();
  });

  it("liest Komma, Punkt und Tausender", () => {
    expect(stundensatzLesen("68,50")).toBe(68.5);
    expect(stundensatzLesen("72")).toBe(72);
    expect(stundensatzLesen("1.234,5")).toBe(1234.5);
    expect(stundensatzLesen("68,505")).toBe(68.51);
  });

  it("kein Satz: 0, negativ, Text", () => {
    expect(stundensatzLesen("0")).toBeUndefined();
    expect(stundensatzLesen("-50")).toBeUndefined();
    expect(stundensatzLesen("abc")).toBeUndefined();
  });

  it("nur ein Satz über 0 € ersetzt den des Betriebs", () => {
    const firma = { stundensatz: 72 };
    expect(stundensatzFuer({ stundensatz: 68.5 }, firma)).toBe(68.5);
    expect(stundensatzFuer({ stundensatz: null }, firma)).toBe(72);
    expect(stundensatzFuer({ stundensatz: 0 }, firma)).toBe(72);
    expect(stundensatzFuer({ stundensatz: -50 }, firma)).toBe(72);
    expect(stundensatzFuer(null, firma)).toBe(72);
    expect(stundensatzFuer(null, null)).toBe(0);
  });
});

describe("Termin prüfen", () => {
  const t = { titel: "Abnahme", datum: "2026-10-26", bisDatum: "", ganztags: false, von: "07:00", bis: "15:30" };

  it("ein normaler Termin passt", () => {
    expect(terminFehler(t)).toBeNull();
    expect(terminFehler({ ...t, bis: "" })).toBeNull();
    expect(terminFehler({ ...t, ganztags: true, von: "", bis: "" })).toBeNull();
  });

  it("Titel, Datum und Uhrzeit fehlen", () => {
    expect(terminFehler({ ...t, titel: "  " })).toMatch(/Titel/);
    expect(terminFehler({ ...t, datum: "" })).toMatch(/Datum/);
    expect(terminFehler({ ...t, von: "" })).toMatch(/Uhrzeit/);
  });

  it("Ende vor Beginn — auch wenn „Bis“ derselbe Tag ist", () => {
    expect(terminFehler({ ...t, von: "15:00", bis: "07:00" })).toMatch(/Ende/);
    expect(terminFehler({ ...t, von: "15:00", bis: "07:00", bisDatum: "2026-10-26" })).toMatch(/Ende/);
    expect(terminFehler({ ...t, von: "08:00", bis: "08:00" })).toMatch(/Ende/);
  });

  it("mehrtägig: am letzten Tag darf früher Schluss sein", () => {
    expect(terminFehler({ ...t, von: "15:00", bis: "07:00", bisDatum: "2026-10-28" })).toBeNull();
  });

  it("„Bis“ vor dem Datum wird gemeldet statt still verworfen", () => {
    expect(terminFehler({ ...t, bisDatum: "2026-10-20" })).toMatch(/vor dem Datum/);
  });
});

describe("Kunde suchen", () => {
  const k = { name: "Bauträger Nord GmbH", ort: "Villach", strasse: "Hauptplatz 1", nummer: 1004, uid: "ATU12345678" };

  it("findet über Name, Ort, Nummer und UID — alle Wörter müssen passen", () => {
    expect(kundePasst(k, "")).toBe(true);
    expect(kundePasst(k, "nord villach")).toBe(true);
    expect(kundePasst(k, "K1004")).toBe(true);
    expect(kundePasst(k, "atu12345678")).toBe(true);
    expect(kundePasst(k, "ATU1234")).toBe(true);
    expect(kundePasst(k, "nord graz")).toBe(false);
    expect(kundePasst({ ...k, uid: null }, "ATU")).toBe(false);
  });
});
