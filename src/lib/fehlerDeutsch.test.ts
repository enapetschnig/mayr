import { describe, expect, it } from "vitest";
import { fehlerDeutsch } from "./fehlerDeutsch";

describe("fehlerDeutsch", () => {
  it("Funkloch in allen Browsern", () => {
    expect(fehlerDeutsch("TypeError: Failed to fetch")).toMatch(/^Keine Verbindung/);
    expect(fehlerDeutsch("Load failed")).toMatch(/^Keine Verbindung/);
    expect(fehlerDeutsch("NetworkError when attempting to fetch resource.")).toMatch(/^Keine Verbindung/);
  });

  it("behält den deutschen Anfang der Meldung", () => {
    expect(fehlerDeutsch("Speichern fehlgeschlagen: Failed to fetch")).toBe("Speichern fehlgeschlagen: Keine Verbindung — bitte Netz prüfen und noch einmal versuchen.");
  });

  it("Datenbank-Meldungen", () => {
    expect(fehlerDeutsch('new row violates row-level security policy for table "belege"')).toBe("Dafür fehlt die Berechtigung.");
    expect(fehlerDeutsch('duplicate key value violates unique constraint "kunden_name_key"')).toBe("Das gibt es schon.");
    expect(fehlerDeutsch("JWT expired")).toMatch(/neu anmelden/);
  });

  it("deutsche Meldungen bleiben, wie sie sind", () => {
    expect(fehlerDeutsch("Nur der Chef darf das.")).toBe("Nur der Chef darf das.");
  });
});
