/**
 * „Zeigen & erklären" beim Änderung melden — übernommen aus Lengauer Stockner (11.11.2026).
 *
 * Der Melder führt in der App vor, was anders sein soll, und redet dazu.
 * Aufgenommen wird KEIN Video: Am Handy (iPhone wie Android) kann eine Web-App
 * den Bildschirm gar nicht filmen (getDisplayMedia fehlt dort). Stattdessen
 * zeichnet rrweb die Seite selbst auf (Aufbau + jede Änderung, Klick, Scrollen)
 * — das geht in jedem Browser gleich, ohne Freigabe-Dialog, und Passwortfelder
 * bleiben maskiert. Das Mikrofon läuft parallel über MediaRecorder, mit
 * derselben Formatwahl wie die Sprachnachricht (Safari: mp4).
 *
 * Nebenbei entsteht ein kurzer Ablauf (Sekunde → Seite bzw. angetippter Knopf).
 * Den bekommt die Abschrift am Server dazu: so steht bei jedem Satz, wo der
 * Melder gerade war — daraus werden die einzelnen Wünsche.
 *
 * Die Aufnahme gehört bewusst nicht dem Dialog: Der ist während des Vorführens
 * zu, und die Aufnahme muss Seitenwechsel überleben. Daher ein kleiner
 * Modul-Zustand mit useSyncExternalStore.
 *
 * Grenzfälle (29.10.2026, „dezenter & alle Edge Cases"):
 *  - Mikrofon verweigert / keins da / kein MediaRecorder → Aufnahme läuft OHNE
 *    Ton (Ergebnis `ohneTonGrund`), der Melder tippt dazu.
 *  - Mikrofon fällt weg (Handy gesperrt, Anruf, Kopfhörer ab) → Aufnahme endet
 *    sauber mit dem Bisherigen (`grund: "ton-weg"`).
 *  - 5 Minuten oder zu viel Seiteninhalt → endet von selbst (`zeit`/`groesse`).
 *  - Neuladen/Tab schließen → Browser fragt nach (beforeunload); kommt die
 *    Seite trotzdem neu, sagt aufnahmeVerlorenBeimLaden() das einmal an.
 *  - Doppeltes Beenden (Fertig + Zeitablauf) und Verwerfen während des
 *    Startens werden abgefangen.
 */

import { useSyncExternalStore } from "react";
import { gzipSync, strToU8 } from "fflate";

/** Längste Aufnahme. Danach stoppt sie von selbst (Dateigröße, Abschrift). */
export const AUFNAHME_MAX_SEKUNDEN = 5 * 60;

/**
 * Höchstens so viele Zeichen rrweb-JSON (ungepackt). gzip schafft bei rrweb
 * gut 5:1–10:1, die Datei bleibt damit um wenige MB – unter dem
 * Upload-Limit der Ablage (25 MB) und klein genug fürs Handy-Netz.
 */
export const AUFNAHME_MAX_ZEICHEN = 40_000_000;

/** Größte Datei, die wir hochzuladen versuchen (Ablage `aenderungswuensche`: 25 MB je Datei). */
export const UPLOAD_MAX_BYTES = 24 * 1024 * 1024;

/** Elemente mit dieser Klasse landen nicht in der Aufnahme (die Aufnahmeleiste). */
export const AUFNAHME_AUSBLENDEN = "aufnahme-ausblenden";

export interface AblaufSchritt {
  /** Sekunden seit Beginn */
  t: number;
  art: "seite" | "klick";
  text: string;
}

/** Warum die Aufnahme geendet hat. */
export type EndeGrund = "selbst" | "zeit" | "groesse" | "ton-weg";

/** Warum ohne Ton aufgenommen wird. */
export type OhneTonGrund = "verweigert" | "kein-mikrofon" | "nicht-unterstuetzt" | "fehler";

export interface FertigeAufnahme {
  /** rrweb-Ereignisse, gzip-gepackt (JSON) */
  bildschirm: Blob;
  ton: Blob | null;
  ablauf: AblaufSchritt[];
  sekunden: number;
  grund: EndeGrund;
}

type Zustand =
  | { stand: "aus" }
  | { stand: "startet" }
  | { stand: "laeuft"; beginn: number; mitTon: boolean }
  | { stand: "fertig"; aufnahme: FertigeAufnahme };

let zustand: Zustand = { stand: "aus" };
const hoerer = new Set<() => void>();
const setzen = (z: Zustand) => { zustand = z; hoerer.forEach((h) => h()); };

export const aufnahmeStand = (): Zustand["stand"] => zustand.stand;
/** Die fertige Aufnahme (ohne React, z. B. für Prüfskripte). */
export const fertigeAufnahme = (): FertigeAufnahme | null => (zustand.stand === "fertig" ? zustand.aufnahme : null);

export function useAufnahme(): Zustand {
  return useSyncExternalStore(
    (h) => { hoerer.add(h); return () => hoerer.delete(h); },
    () => zustand,
    () => zustand,
  );
}

/** Aufnahmeformat aushandeln — Safari kann kein webm/opus. */
export function tonAufnahmeTyp(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

/** Kann dieser Browser Ton aufnehmen? (Mikrofon-Schnittstelle + MediaRecorder) */
export function tonMoeglich(): boolean {
  return typeof window !== "undefined"
    && typeof MediaRecorder !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;
}

/** Fehler von getUserMedia in einfache Gründe übersetzen. */
export function mikrofonGrund(f: unknown): OhneTonGrund {
  const name = (f as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "verweigert";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "kein-mikrofon";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "kein-mikrofon";
  return "fehler";
}

/** Ein Satz für den Melder, warum kein Ton geht. */
export function mikrofonHinweis(grund: OhneTonGrund): string {
  switch (grund) {
    case "verweigert": return "Das Mikrofon ist für diese Seite gesperrt – in den Browser-Einstellungen freigeben.";
    case "kein-mikrofon": return "Kein Mikrofon gefunden oder es ist gerade belegt.";
    case "nicht-unterstuetzt": return "Dieser Browser kann hier keinen Ton aufnehmen.";
    default: return "Das Mikrofon ließ sich nicht starten.";
  }
}

/** Was ein Mensch auf dem angetippten Element liest — kurz. */
function beschriftung(ziel: EventTarget | null): string | null {
  if (!(ziel instanceof Element)) return null;
  if (ziel.closest(`.${AUFNAHME_AUSBLENDEN}`)) return null;
  const el = ziel.closest("button, a, [role=button], [role=tab], [role=menuitem], [role=option], label, input, select, textarea, th, td, li") ?? ziel;
  if (el instanceof HTMLInputElement && el.type === "password") return "Passwortfeld";
  const roh =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder || el.name : "") ||
    (el as HTMLElement).innerText ||
    el.textContent ||
    "";
  const text = roh.replace(/\s+/g, " ").trim().slice(0, 80);
  const tag = el.tagName.toLowerCase();
  const was = tag === "a" ? "Link" : tag === "button" || el.getAttribute("role") === "button" ? "Knopf"
    : tag === "input" || tag === "textarea" || tag === "select" ? "Feld" : "";
  if (!text) return was ? `${was} ohne Beschriftung` : null;
  return was ? `${was} „${text}"` : `„${text}"`;
}

// Laufende Aufnahme
let stopRrweb: (() => void) | undefined;
let rec: MediaRecorder | null = null;
let strom: MediaStream | null = null;
let ereignisse: unknown[] = [];
let zeichen = 0;
let tonStuecke: Blob[] = [];
let ablauf: AblaufSchritt[] = [];
let beginn = 0;
let seitenUhr: ReturnType<typeof setInterval> | null = null;
let endeUhr: ReturnType<typeof setTimeout> | null = null;
let letzteSeite = "";
/** Zählt Starts/Verwerfen – ein verspätet fertig werdender Start merkt so, dass er überholt ist. */
let lauf = 0;
let beendet = false;

const sekundeJetzt = () => Math.round((Date.now() - beginn) / 100) / 10;

const beiKlick = (e: Event) => {
  const text = beschriftung(e.target);
  if (text) ablauf.push({ t: sekundeJetzt(), art: "klick", text });
};

const seitePruefen = () => {
  const seite = location.pathname + location.search;
  if (seite !== letzteSeite) {
    letzteSeite = seite;
    ablauf.push({ t: sekundeJetzt(), art: "seite", text: seite });
  }
};

// Neuladen/Schließen während der Aufnahme: nachfragen, und merken, falls es trotzdem passiert.
const LIEF_SCHLUESSEL = "melden.aufnahme.lief";
const vorDemVerlassen = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
const merkenLaeuft = (ja: boolean) => {
  try { if (ja) sessionStorage.setItem(LIEF_SCHLUESSEL, "1"); else sessionStorage.removeItem(LIEF_SCHLUESSEL); } catch { /* privat */ }
};

/** Lief beim letzten Laden dieser Seite eine Aufnahme, die durch Neuladen verloren ging? (nur einmal wahr) */
export function aufnahmeVerlorenBeimLaden(): boolean {
  try {
    if (sessionStorage.getItem(LIEF_SCHLUESSEL) !== "1") return false;
    sessionStorage.removeItem(LIEF_SCHLUESSEL);
    return zustand.stand !== "laeuft";
  } catch { return false; }
}

function aufraeumen() {
  stopRrweb?.();
  stopRrweb = undefined;
  document.removeEventListener("click", beiKlick, true);
  window.removeEventListener("beforeunload", vorDemVerlassen);
  if (seitenUhr) clearInterval(seitenUhr);
  if (endeUhr) clearTimeout(endeUhr);
  seitenUhr = null;
  endeUhr = null;
  strom?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
  strom = null;
  merkenLaeuft(false);
}

/**
 * Startet Mikrofon + Aufzeichnung. MUSS direkt aus einem Tipp kommen
 * (iPhone gibt das Mikrofon sonst nicht frei). Geht das Mikrofon nicht,
 * läuft die Aufnahme ohne Ton weiter – der Grund kommt zurück.
 * Wirft nur, wenn rrweb nicht geladen werden kann (z. B. offline).
 */
export async function aufnahmeStarten(): Promise<{ ohneTonGrund: OhneTonGrund | null }> {
  if (zustand.stand === "laeuft" || zustand.stand === "startet") return { ohneTonGrund: null };
  const meinLauf = ++lauf;
  setzen({ stand: "startet" });
  let ohneTonGrund: OhneTonGrund | null = null;
  if (!tonMoeglich()) {
    ohneTonGrund = "nicht-unterstuetzt";
  } else {
    try {
      strom = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (f) {
      strom = null;
      ohneTonGrund = mikrofonGrund(f);
    }
  }
  // rrweb erst jetzt laden — es soll den normalen App-Start nicht bremsen.
  let record: typeof import("rrweb").record;
  try {
    ({ record } = await import("rrweb"));
  } catch (f) {
    if (meinLauf === lauf) { aufraeumen(); setzen({ stand: "aus" }); }
    throw f;
  }
  // Inzwischen verworfen (Abmelden, Abbrechen)? Dann nichts starten.
  if (meinLauf !== lauf || aufnahmeStand() !== "startet") {
    strom?.getTracks().forEach((t) => t.stop());
    strom = null;
    return { ohneTonGrund };
  }

  ereignisse = [];
  zeichen = 0;
  tonStuecke = [];
  ablauf = [];
  letzteSeite = "";
  beendet = false;
  beginn = Date.now();

  if (strom) {
    try {
      const typ = tonAufnahmeTyp();
      rec = new MediaRecorder(strom, typ ? { mimeType: typ } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size) tonStuecke.push(e.data); };
      // In Stücken: bricht etwas ab, ist wenigstens das Bisherige da.
      rec.start(1000);
      // Mikrofon weg (Handy gesperrt, Anruf, Kopfhörer ab): mit dem Bisherigen sauber beenden.
      strom.getAudioTracks().forEach((t) => { t.onended = () => { void aufnahmeBeenden("ton-weg"); }; });
    } catch {
      rec = null;
      strom.getTracks().forEach((t) => t.stop());
      strom = null;
      ohneTonGrund = "nicht-unterstuetzt";
    }
  }

  stopRrweb = record({
    emit: (e) => {
      ereignisse.push(e);
      // Grobe Größe mitzählen (Vollbild selten groß, Änderungen klein).
      try { zeichen += JSON.stringify(e).length; } catch { /* egal */ }
      if (zeichen > AUFNAHME_MAX_ZEICHEN) void aufnahmeBeenden("groesse");
    },
    blockClass: AUFNAHME_AUSBLENDEN,
    maskInputOptions: { password: true },
    sampling: { mousemove: 100, scroll: 150, input: "last" },
    recordCanvas: false,
    collectFonts: false,
    inlineImages: false,
  }) ?? undefined;

  document.addEventListener("click", beiKlick, true);
  window.addEventListener("beforeunload", vorDemVerlassen);
  merkenLaeuft(true);
  seitePruefen();
  seitenUhr = setInterval(seitePruefen, 300);
  // Im Hintergrund kann der Zeitgeber spät kommen – gemessen wird trotzdem nach der Uhr.
  endeUhr = setTimeout(() => { void aufnahmeBeenden("zeit"); }, AUFNAHME_MAX_SEKUNDEN * 1000);
  setzen({ stand: "laeuft", beginn, mitTon: !!rec });
  return { ohneTonGrund };
}

/** Stoppt und packt die Aufnahme. Danach steht sie als „fertig" bereit. */
export async function aufnahmeBeenden(grund: EndeGrund = "selbst"): Promise<void> {
  if (zustand.stand !== "laeuft" || beendet) return;
  beendet = true;
  const meinLauf = lauf;
  const sekunden = Math.min(AUFNAHME_MAX_SEKUNDEN, Math.round((Date.now() - beginn) / 1000));
  const r = rec;
  rec = null;
  const tonFertig = new Promise<void>((ok) => {
    if (!r || r.state === "inactive") return ok();
    r.onstop = () => ok();
    // Falls onstop nie kommt (Safari nach Sperre): nicht ewig warten.
    window.setTimeout(ok, 3000);
    try { r.stop(); } catch { ok(); }
  });
  stopRrweb?.();
  stopRrweb = undefined;
  await tonFertig;
  // Während des Wartens verworfen? Dann nichts mehr setzen.
  if (meinLauf !== lauf) return;
  const tonTyp = r?.mimeType || tonAufnahmeTyp() || "audio/webm";
  aufraeumen();

  const ton = tonStuecke.length ? new Blob(tonStuecke, { type: tonTyp }) : null;
  let bildschirm: Blob;
  try {
    const gepackt = gzipSync(strToU8(JSON.stringify({ version: 1, sekunden, ereignisse })), { level: 6 });
    bildschirm = new Blob([gepackt], { type: "application/gzip" });
  } catch {
    // Zu wenig Speicher am Handy: wenigstens Ablauf und Ton retten.
    const gepackt = gzipSync(strToU8(JSON.stringify({ version: 1, sekunden, ereignisse: [] })));
    bildschirm = new Blob([gepackt], { type: "application/gzip" });
  }
  ereignisse = [];
  zeichen = 0;
  tonStuecke = [];
  setzen({
    stand: "fertig",
    aufnahme: { bildschirm, ton: ton && ton.size >= 1000 ? ton : null, ablauf: ablauf.slice(0, 500), sekunden, grund },
  });
}

/** Aufnahme verwerfen (auch eine laufende oder gerade startende). */
export function aufnahmeVerwerfen(): void {
  lauf += 1;
  if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* egal */ } }
  rec = null;
  if (typeof document !== "undefined") aufraeumen();
  ereignisse = [];
  zeichen = 0;
  tonStuecke = [];
  ablauf = [];
  beendet = false;
  if (zustand.stand !== "aus") setzen({ stand: "aus" });
}

/** Kann dieser Browser überhaupt vorführen? rrweb braucht nur das DOM – Ton ist Zugabe. */
export function aufnahmeMoeglich(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Ein Satz, warum die Aufnahme von selbst geendet hat (null = vom Melder beendet). */
export function endeHinweis(grund: EndeGrund): string | null {
  switch (grund) {
    case "zeit": return `Die ${AUFNAHME_MAX_SEKUNDEN / 60} Minuten sind um – die Aufnahme ist dabei.`;
    case "groesse": return "Die Aufnahme wurde sehr groß und ist deshalb hier zu Ende – sie ist dabei.";
    case "ton-weg": return "Das Mikrofon war weg (Bildschirm gesperrt oder Anruf) – das Bisherige ist dabei.";
    default: return null;
  }
}
