import { supabase } from "@/integrations/supabase/client";

/**
 * Handyfotos haben 5–10 MB. Für die Baustellendoku reichen 2400 px an der
 * langen Seite völlig — das spart Speicher und vor allem Wartezeit beim
 * Hochladen im Funkloch.
 */
export async function bildVerkleinern(datei: File, maxKante = 2400): Promise<File> {
  if (!datei.type.startsWith("image/") || datei.type === "image/gif") return datei;
  try {
    const bitmap = await createImageBitmap(datei);
    const faktor = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height));
    if (faktor === 1 && datei.size < 1.5 * 1024 * 1024) return datei;
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * faktor);
    c.height = Math.round(bitmap.height * faktor);
    c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((f) => c.toBlob(f, "image/jpeg", 0.85));
    if (!blob) return datei;
    return new File([blob], datei.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return datei; // z. B. HEIC in einem Browser, der es nicht lesen kann
  }
}

export function sichererDateiname(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
}

/**
 * Lädt Dateien zu einem Projekt hoch und legt je eine Zeile in `dateien` an.
 * Ein Fehler bei einer Datei stoppt die anderen nicht.
 */
export async function dateienHochladen(
  projektId: string,
  dateien: File[],
  beschreibung?: string,
  /** "dokument": landet im Ordner Dokumente, auch wenn es ein Bild ist (z. B. abfotografierter Lieferschein) */
  art?: "foto" | "dokument",
): Promise<{ ok: number; fehler: string[] }> {
  let ok = 0;
  const fehler: string[] = [];
  for (const roh of dateien) {
    // Dokumente bleiben im Original (Pläne müssen lesbar bleiben), Fotos werden verkleinert
    const datei = art === "dokument" ? roh : await bildVerkleinern(roh);
    const pfad = `${projektId}/${crypto.randomUUID().slice(0, 8)}-${sichererDateiname(datei.name)}`;
    const { error: e1 } = await supabase.storage
      .from("projekt-dateien")
      .upload(pfad, datei, { contentType: datei.type || "application/octet-stream" });
    if (e1) { fehler.push(`${roh.name}: ${e1.message}`); continue; }
    const { error: e2 } = await supabase.from("dateien").insert({
      projekt_id: projektId,
      pfad,
      name: roh.name,
      mime: datei.type,
      groesse: datei.size,
      art: art ?? (datei.type.startsWith("image/") ? "foto" : "dokument"),
      beschreibung: beschreibung || null,
    });
    if (e2) {
      await supabase.storage.from("projekt-dateien").remove([pfad]);
      fehler.push(`${roh.name}: ${e2.message}`);
      continue;
    }
    ok++;
  }
  return { ok, fehler };
}

/** Signierte Adressen für viele Dateien auf einmal (1 Stunde gültig). */
export async function signierteAdressen(pfade: string[]): Promise<Record<string, string>> {
  if (pfade.length === 0) return {};
  const { data } = await supabase.storage.from("projekt-dateien").createSignedUrls(pfade, 3600);
  const aus: Record<string, string> = {};
  (data ?? []).forEach((d) => { if (d.path && d.signedUrl) aus[d.path] = d.signedUrl; });
  return aus;
}

export function logoAdresse(pfad: string | null | undefined): string | null {
  if (!pfad) return null;
  return supabase.storage.from("firmen-logos").getPublicUrl(pfad).data.publicUrl;
}
