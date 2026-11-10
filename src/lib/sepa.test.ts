import { describe, expect, it } from "vitest";
import { ibanPruefen, sepaText, sepaXml } from "./sepa";

describe("SEPA", () => {
  it("prüft IBANs", () => {
    expect(ibanPruefen("AT61 1904 3002 3457 3201")).toBe("AT611904300234573201");
    expect(ibanPruefen("AT61 1904 3002 3457 3202")).toBeNull();
    expect(ibanPruefen("DE89370400440532013000")).toBe("DE89370400440532013000");
    expect(ibanPruefen("")).toBeNull();
  });
  it("schreibt Umlaute um und kürzt", () => {
    expect(sepaText("Müller & Söhne GmbH", 70)).toBe("Mueller Soehne GmbH");
    expect(sepaText("x".repeat(200), 140)).toHaveLength(140);
  });
  it("Datei mit Summe und Anzahl", () => {
    const x = sepaXml({ name: "Elektro Muster GmbH", iban: "AT611904300234573201", bic: "BKAUATWW" }, [
      { id: "1", empfaenger: "Großhandel Süd", iban: "DE89370400440532013000", betrag: 1000.1, zweck: "RE 4711" },
      { id: "2", empfaenger: "Kabel & Co", iban: "AT611904300234573201", betrag: 0.2, zweck: "RE 12" },
    ], "2026-11-12", new Date("2026-11-10T10:00:00Z"));
    expect(x).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(x).toContain("<CtrlSum>1000.30</CtrlSum>");
    expect(x).toContain("<ReqdExctnDt>2026-11-12</ReqdExctnDt>");
    expect(x).toContain("<Nm>Grosshandel Sued</Nm>");
    expect(x).toContain("<Nm>Kabel Co</Nm>");
    expect(x).toContain("<BIC>BKAUATWW</BIC>");
  });
});
