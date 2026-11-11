/**
 * Dateien an eine Änderungsmeldung hängen (Christoph, 05.11.2026): PDFs, Excel,
 * Word, Fotos … – damit der Kunde Beispiele und Vorlagen gleich mitschicken kann.
 *
 * Alle Dateien stehen in `anhaenge` und liegen im privaten Bucket
 * `aenderungswuensche`. Der Name bleibt lesbar im Pfad, muss aber zum Muster der
 * Edge Function `wunsch-datei` passen: `<uuid>/<Buchstaben, Ziffern, . - _>`.
 */
import { supabase } from "@/integrations/supabase/client";

export const MAX_ANHAENGE = 10;
/** Grenze des Buckets "aenderungswuensche": 25 MB. */
export const MAX_ANHANG_BYTES = 25 * 1024 * 1024;

/** Ausführbares bleibt draußen: Die Dateien werden später heruntergeladen und geöffnet. */
const GESPERRT = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|apk|dmg)$/i;

export type Pruefung = { angenommen: File[]; abgelehnt: { name: string; grund: string }[] };

/** Welche der gewählten Dateien dürfen dazu? */
export function pruefeAnhaenge(schonDa: number, neu: File[]): Pruefung {
  const angenommen: File[] = [];
  const abgelehnt: { name: string; grund: string }[] = [];
  for (const datei of neu) {
    if (GESPERRT.test(datei.name)) abgelehnt.push({ name: datei.name, grund: "dieser Dateityp geht nicht" });
    else if (datei.size === 0) abgelehnt.push({ name: datei.name, grund: "die Datei ist leer" });
    else if (datei.size > MAX_ANHANG_BYTES) abgelehnt.push({ name: datei.name, grund: "größer als 25 MB" });
    else if (schonDa + angenommen.length >= MAX_ANHAENGE) abgelehnt.push({ name: datei.name, grund: `mehr als ${MAX_ANHAENGE} Dateien` });
    else angenommen.push(datei);
  }
  return { angenommen, abgelehnt };
}

/** „Preisliste März (neu).pdf" → „Preisliste_Maerz_neu.pdf" */
export function sichererName(name: string): string {
  const umlaute: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };
  const flach = name.replace(/[äöüÄÖÜß]/g, (z) => umlaute[z]).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const teile = flach.split(".");
  const endung = teile.length > 1 ? teile.pop()!.replace(/[^\w]/g, "").slice(0, 10) : "";
  const stamm = teile.join(".").replace(/[^\w.-]+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "").slice(0, 80) || "Datei";
  return endung ? `${stamm}.${endung}` : stamm;
}

export function anhangPfad(userId: string, zeit: number, index: number, name: string): string {
  return `${userId}/${zeit}-anhang-${index + 1}-${sichererName(name)}`;
}

/** Zur Anzeige: der Dateiname aus dem Pfad. */
export function anhangName(pfad: string): string {
  const name = pfad.split("/").pop() ?? pfad;
  return name.replace(/^\d+-anhang-\d+(-|\.)/, (t, z) => (z === "." ? "Foto." : ""));
}

/** Text der Meldung, wenn nur Dateien geschickt werden – das Cockpit braucht einen. */
export const dateienText = (dateien: File[]) =>
  dateien.length ? `Datei angehängt: ${dateien.map((d) => d.name).join(", ")}` : "";

/** Lädt alle Dateien hoch. Scheitert eine, wird aufgeräumt und die Meldung bricht ab – sonst fehlte genau das Beispiel. */
export async function anhaengeHochladen(userId: string, dateien: File[]): Promise<string[]> {
  const pfade: string[] = [];
  const zeit = Date.now();
  for (let i = 0; i < dateien.length; i++) {
    const pfad = anhangPfad(userId, zeit, i, dateien[i].name);
    const { error } = await supabase.storage
      .from("aenderungswuensche")
      .upload(pfad, dateien[i], { contentType: dateien[i].type || "application/octet-stream" });
    if (error) {
      if (pfade.length) await supabase.storage.from("aenderungswuensche").remove(pfade).catch(() => {});
      throw new Error(`„${dateien[i].name}“ nicht hochgeladen: ${error.message}`);
    }
    pfade.push(pfad);
  }
  return pfade;
}
