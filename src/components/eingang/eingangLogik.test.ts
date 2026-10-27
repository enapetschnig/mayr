import { describe, expect, it } from "vitest";
import { dezimalLesen } from "@/lib/format";
import { aufteilungFehler, bruttoAusNetto, nettoAusBrutto, rest, zahlung, zuordnung, type AnteilEntwurf } from "./eingangLogik";

const anteil = (projekt_id: string, betrag: string): AnteilEntwurf => ({ id: null, schluessel: projekt_id + betrag, projekt_id, betrag, text: "", rechnung_id: null });

describe("Eingangsrechnungen", () => {
  it("rechnet Netto und Brutto", () => {
    expect(bruttoAusNetto(100, 20)).toBe(120);
    expect(nettoAusBrutto(120, 20)).toBe(100);
    expect(nettoAusBrutto(99.99, 20)).toBe(83.33);
    expect(bruttoAusNetto(50, 0)).toBe(50);
  });

  it("Rest und Zuordnung", () => {
    expect(rest(100, [{ betrag: 60 }, { betrag: 15.5 }])).toBe(24.5);
    expect(zuordnung({ netto: 100, betrieb: false }, [])).toBe("zuzuordnen");
    expect(zuordnung({ netto: 100, betrieb: false }, [{ betrag: 40 }])).toBe("teilweise");
    expect(zuordnung({ netto: 100, betrieb: false }, [{ betrag: 40 }, { betrag: 60 }])).toBe("zugeordnet");
    // Rest gehört dem Betrieb
    expect(zuordnung({ netto: 100, betrieb: true }, [{ betrag: 40 }])).toBe("zugeordnet");
    expect(zuordnung({ netto: 0, betrieb: false }, [])).toBe("zugeordnet");
    // Rundung: 33,33 × 3 = 99,99 bei 99,99 netto
    expect(zuordnung({ netto: 99.99, betrieb: false }, [{ betrag: 33.33 }, { betrag: 33.33 }, { betrag: 33.33 }])).toBe("zugeordnet");
  });

  it("Zahlstatus", () => {
    expect(zahlung({ bezahlt_am: "2026-10-01", faellig_am: "2026-09-01" }, "2026-10-27")).toBe("bezahlt");
    expect(zahlung({ bezahlt_am: null, faellig_am: "2026-10-26" }, "2026-10-27")).toBe("ueberfaellig");
    expect(zahlung({ bezahlt_am: null, faellig_am: "2026-10-27" }, "2026-10-27")).toBe("offen");
    expect(zahlung({ bezahlt_am: null, faellig_am: null }, "2026-10-27")).toBe("offen");
  });

  it("prüft die Aufteilung", () => {
    expect(aufteilungFehler(100, [anteil("p1", "60"), anteil("p2", "40,00")], dezimalLesen)).toBeNull();
    expect(aufteilungFehler(100, [anteil("p1", "60"), anteil("p2", "40,01")], dezimalLesen)).toMatch(/mehr als/);
    expect(aufteilungFehler(100, [anteil("", "60")], dezimalLesen)).toMatch(/Projekt/);
    expect(aufteilungFehler(100, [anteil("p1", "")], dezimalLesen)).toMatch(/Betrag/);
    expect(aufteilungFehler(100, [anteil("p1", "-5")], dezimalLesen)).toMatch(/negativ/);
    // Gutschrift: alles negativ
    expect(aufteilungFehler(-50, [anteil("p1", "-50")], dezimalLesen)).toBeNull();
  });
});
