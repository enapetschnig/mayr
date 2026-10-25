import { describe, expect, it } from "vitest";
import { authFehler, benutzerFehler, benutzername, vorlaeufigesPasswort, zuEmail } from "./konto";

describe("benutzername", () => {
  it("macht aus Namen mit Umlauten und Leerzeichen einen Benutzernamen", () => {
    expect(benutzername("  Jürgen Maier ")).toBe("juergen.maier");
    expect(benutzername("Größ  Öttl")).toBe("groess.oettl");
    expect(benutzername("max")).toBe("max");
  });
});

describe("zuEmail", () => {
  it("hängt die Domain an Benutzernamen", () => {
    expect(zuEmail("  MAX ", "firma.at")).toBe("max@firma.at");
    expect(zuEmail("Jürgen Maier", "firma.at")).toBe("juergen.maier@firma.at");
  });
  it("lässt echte E-Mail-Adressen", () => {
    expect(zuEmail(" Office@Beispiel.AT ", "firma.at")).toBe("office@beispiel.at");
  });
});

describe("benutzerFehler", () => {
  it("lässt gültige Namen durch", () => {
    expect(benutzerFehler("max")).toBeNull();
    expect(benutzerFehler("Jürgen Maier")).toBeNull();
    expect(benutzerFehler("lisa-2")).toBeNull();
    expect(benutzerFehler("office@beispiel.at")).toBeNull();
  });
  it("meldet, was nicht geht", () => {
    expect(benutzerFehler("")).toMatch(/Benutzernamen eingeben/);
    expect(benutzerFehler("x")).toMatch(/mindestens 2/);
    expect(benutzerFehler("max!")).toMatch(/nur Buchstaben/);
    expect(benutzerFehler(".max")).toMatch(/nur Buchstaben/);
    expect(benutzerFehler("max@")).toMatch(/E-Mail/);
  });
});

describe("authFehler", () => {
  it("übersetzt die häufigen Meldungen", () => {
    expect(authFehler("Invalid login credentials")).toBe("Benutzername oder Passwort falsch.");
    expect(authFehler("User already registered")).toBe("Diesen Benutzer gibt es schon.");
    expect(authFehler("Unable to validate email address: invalid format")).toMatch(/ungültig/);
    expect(authFehler("New password should be different from the old password.")).toMatch(/unterscheiden/);
    expect(authFehler("Failed to fetch")).toMatch(/Keine Verbindung/);
  });
  it("lässt Unbekanntes stehen", () => {
    expect(authFehler("Irgendwas")).toBe("Irgendwas");
  });
});

describe("vorlaeufigesPasswort", () => {
  it("ist gut anzusagen und lang genug", () => {
    const pw = vorlaeufigesPasswort(() => 0.5);
    expect(pw).toMatch(/^[A-Za-z]+-\d{4}$/);
    expect(pw.length).toBeGreaterThanOrEqual(6);
  });
});
