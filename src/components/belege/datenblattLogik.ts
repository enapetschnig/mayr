import type { EditorPosition, KatalogLeistung } from "./editor";

/**
 * Datenblätter der Artikel im Angebot — reine Logik (ohne Supabase, testbar).
 * Abgelegt werden sie am Artikel: Tabelle `artikel_dateien`, Speicher
 * `dateien`, Pfad `artikel/<artikel_id>/…`.
 */

export const DATEIEN_BUCKET = "dateien";

export type Datenblatt = { id?: string; artikel_id?: string; name: string; pfad: string; artikel?: string | null };

/** Artikel des Angebots: Artikel-Positionen und das Material der Leistungen */
export function artikelIdsVon(positionen: Pick<EditorPosition, "artikel_id" | "leistung_id">[], katalog: Pick<KatalogLeistung, "id" | "leistung_material">[]): string[] {
  const ids = new Set<string>();
  const leistungen = new Map(katalog.map((l) => [l.id, l]));
  positionen.forEach((p) => {
    if (p.artikel_id) ids.add(p.artikel_id);
    if (p.leistung_id) {
      (leistungen.get(p.leistung_id)?.leistung_material ?? []).forEach((m) => {
        const id = (m.artikel as { id?: string } | null)?.id;
        if (id) ids.add(id);
      });
    }
  });
  return [...ids].sort();
}

/** Je Pfad einmal, sortiert nach Artikel und Name */
export function datenblaetterOrdnen(liste: Datenblatt[]): Datenblatt[] {
  const gesehen = new Set<string>();
  return liste
    .filter((d) => d.pfad && !gesehen.has(d.pfad) && !!gesehen.add(d.pfad))
    .sort((a, b) => (a.artikel ?? "").localeCompare(b.artikel ?? "", "de") || a.name.localeCompare(b.name, "de"));
}

/** Dateiname im Paket: Name behalten, aber eindeutig und ohne Pfadzeichen */
export function paketNamen(liste: Datenblatt[]): string[] {
  const vergeben = new Set<string>();
  return liste.map((d) => {
    const roh = (d.name || d.pfad.split("/").pop() || "Datenblatt.pdf").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Datenblatt.pdf";
    let name = roh;
    const punkt = roh.lastIndexOf(".");
    const [stamm, endung] = punkt > 0 ? [roh.slice(0, punkt), roh.slice(punkt)] : [roh, ""];
    let n = 2;
    while (vergeben.has(name.toLowerCase())) name = `${stamm} (${n++})${endung}`;
    vergeben.add(name.toLowerCase());
    return name;
  });
}
