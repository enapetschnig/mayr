import { describe, expect, it } from "vitest";
import { dezimalLesen } from "@/lib/format";
import {
  ablauf, abgleich, anteileAusPositionen, aufteilungFehler, bruttoAusNetto, nettoAusBrutto, rest, textAehnlich, zahlung, zuordnung, zuZahlen,
  type AnteilEntwurf,
} from "./eingangLogik";

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

describe("Freigabe und Zahlung", () => {
  it("Ablauf", () => {
    expect(ablauf({ freigabe: "offen", bezahlt_am: null })).toBe("pruefen");
    expect(ablauf({ freigabe: "freigegeben", bezahlt_am: null })).toBe("freigegeben");
    expect(ablauf({ freigabe: "freigegeben", bezahlt_am: "2026-11-02" })).toBe("ueberwiesen");
    expect(ablauf({ freigabe: "abgelehnt", bezahlt_am: null })).toBe("abgelehnt");
  });
  it("Skonto bis einschließlich Skontotag", () => {
    const r = { brutto: 1200, skonto_prozent: 3, skonto_bis: "2026-11-10" };
    expect(zuZahlen(r, "2026-11-10")).toEqual({ betrag: 1164, skonto: 36, bis: "2026-11-10" });
    expect(zuZahlen(r, "2026-11-11")).toEqual({ betrag: 1200, skonto: 0, bis: null });
    expect(zuZahlen({ brutto: 99.99, skonto_prozent: null, skonto_bis: null }, "2026-11-10").betrag).toBe(99.99);
  });
});

describe("Positionen", () => {
  it("Anteile je Projekt, ohne Projekt bleibt Rest, in Cent", () => {
    expect(anteileAusPositionen([
      { gesamt: 0.1, projekt_id: "p1" }, { gesamt: 0.2, projekt_id: "p1" },
      { gesamt: 50, projekt_id: "p2" }, { gesamt: 99, projekt_id: null },
    ])).toEqual([{ projekt_id: "p1", betrag: 0.3 }, { projekt_id: "p2", betrag: 50 }]);
  });
});

describe("Abgleich Lieferschein", () => {
  it("Textähnlichkeit", () => {
    expect(textAehnlich("Hebelklemme 221-413 3-polig", "WAGO Hebelklemme 3-polig 221-413")).toBe(1);
    expect(textAehnlich("NYM-J 3x1,5", "Abzweigdose")).toBe(0);
  });
  it("Nummer, Text, Menge, fehlend und zu viel", () => {
    const rechnung = [
      { artikelnummer: "0001234", bezeichnung: "NYM-J 3x1,5 Ring 100", menge: 200 },
      { artikelnummer: null, bezeichnung: "WAGO Hebelklemme 221-413", menge: 100 },
      { artikelnummer: "999", bezeichnung: "Fracht", menge: 1 },
    ];
    const geliefert = [
      { artikelnummer: "1234", bezeichnung: "Mantelleitung", menge: 100 },
      { artikelnummer: "1234", bezeichnung: "Mantelleitung", menge: 100 },
      { artikelnummer: "", bezeichnung: "Hebelklemme 221-413", menge: 50 },
      { artikelnummer: "777", bezeichnung: "Abzweigdose AP", menge: 10 },
    ];
    expect(abgleich(rechnung, geliefert).map((z) => [z.bezeichnung, z.status, z.verrechnet, z.geliefert])).toEqual([
      ["NYM-J 3x1,5 Ring 100", "passt", 200, 200],
      ["WAGO Hebelklemme 221-413", "menge", 100, 50],
      ["Fracht", "nicht_geliefert", 1, null],
      ["Abzweigdose AP", "nicht_verrechnet", null, 10],
    ]);
  });
});
