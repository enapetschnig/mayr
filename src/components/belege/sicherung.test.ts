import { beforeEach, describe, expect, it } from "vitest";
import { kopfNeu, leerePosition } from "./editor";
import { alleSicherungenLoeschen, sicherungLesen, sicherungLoeschen, sicherungSchreiben, sicherungsSchluessel } from "./sicherung";

// Im Test gibt es kein localStorage — ein Map-Ersatz mit derselben Schnittstelle
const speicher = new Map<string, string>();
const ersatz = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k),
  clear: () => speicher.clear(),
  key: (i: number) => [...speicher.keys()][i] ?? null,
  get length() { return speicher.size; },
};
Object.defineProperty(globalThis, "localStorage", { value: new Proxy(ersatz, { ownKeys: () => [...speicher.keys()], getOwnPropertyDescriptor: (_t, k) => (speicher.has(String(k)) ? { enumerable: true, configurable: true, value: speicher.get(String(k)) } : undefined) }), configurable: true });

const sicherung = () => ({
  zeit: "2026-10-25T13:32:00.000Z",
  basis: "[]",
  kopf: { ...kopfNeu("angebot", null, "2026-10-25"), empf_name: "Familie Huber" },
  positionen: [leerePosition("leistung", { bezeichnung: "Steckdose", menge: "3", einzelpreis: "45" })],
});

describe("Sicherung im Gerät", () => {
  beforeEach(() => speicher.clear());

  it("neue Belege je Art, vorhandene je ID", () => {
    expect(sicherungsSchluessel("abc", true, "angebot")).toBe("mayr.belegsicherung.neu.angebot");
    expect(sicherungsSchluessel("abc", false, "angebot")).toBe("mayr.belegsicherung.abc");
  });

  it("schreibt, liest und löscht", () => {
    const k = sicherungsSchluessel("abc", false, "rechnung");
    sicherungSchreiben(k, sicherung());
    expect(sicherungLesen(k)?.kopf.empf_name).toBe("Familie Huber");
    expect(sicherungLesen(k)?.positionen[0].bezeichnung).toBe("Steckdose");
    sicherungLoeschen(k);
    expect(sicherungLesen(k)).toBeNull();
  });

  it("Kaputtes zählt nicht", () => {
    speicher.set("mayr.belegsicherung.x", "{kein json");
    speicher.set("mayr.belegsicherung.y", JSON.stringify({ zeit: "x" }));
    expect(sicherungLesen("mayr.belegsicherung.x")).toBeNull();
    expect(sicherungLesen("mayr.belegsicherung.y")).toBeNull();
  });

  it("Abmelden löscht alle Sicherungen, sonst nichts", () => {
    sicherungSchreiben(sicherungsSchluessel("a", false, "angebot"), sicherung());
    sicherungSchreiben(sicherungsSchluessel("b", true, "rechnung"), sicherung());
    speicher.set("mayr.installhinweis", "x");
    alleSicherungenLoeschen();
    expect([...speicher.keys()]).toEqual(["mayr.installhinweis"]);
  });
});
