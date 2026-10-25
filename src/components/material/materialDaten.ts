import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { datum, isoTag, tageDazu, zahl } from "@/lib/format";
import type { Artikel, Lagerort, MaterialBuchung, ProjektMaterial } from "@/lib/types";

/**
 * Daten und kleine Helfer für Scanner, Lager und Projektmaterial.
 * Query-Keys beginnen mit dem Bereich ("lager", "material", "lagerorte",
 * "artikel"), damit `useNeuLaden()("material")` alles Abhängige trifft.
 */

// ── Kleinkram ──────────────────────────────────────────────────────────

/** UUID für einen Vorgang. crypto.randomUUID gibt es nur über https — im
 *  Heimnetz über die IP (http) fällt es auf getRandomValues zurück. */
export function neueId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Mengen sind numeric(12,3) — auf drei Stellen runden, sonst bleibt 0,1 + 0,2 krumm. */
export const runden3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** 25.5 → "25,5" (für Eingabefelder) */
export const mengeEingabe = (n: number) => String(runden3(n)).replace(".", ",");

/** 25.5, "m" → "25,5 m" */
export const mengeText = (n: number | null | undefined, einheit?: string | null) => `${zahl(n)} ${einheit || "Stk"}`;

/** „heute 14:32“, „gestern 09:10“, „23.10.2026 16:05“ */
export function zeitpunktText(wann: string | number): string {
  const d = new Date(wann);
  const uhr = d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const tag = isoTag(d);
  const heute = isoTag();
  if (tag === heute) return `heute ${uhr}`;
  if (tag === tageDazu(heute, -1)) return `gestern ${uhr}`;
  return `${datum(tag)} ${uhr}`;
}

/** „Schrack Technik · AM618116“ */
export function artikelInfo(a: Pick<Artikel, "hersteller" | "hersteller_nr" | "artikelnummer"> | null | undefined): string {
  if (!a) return "";
  return [a.hersteller, a.hersteller_nr ?? a.artikelnummer].filter(Boolean).join(" · ");
}

/** Fehler aus Supabase so, dass ihn jemand auf der Baustelle versteht. */
export function fehlerText(e: unknown): string {
  const f = e as { message?: string; code?: string } | null;
  const m = f?.message ?? (typeof e === "string" ? e : "");
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(m)) {
    return "Keine Verbindung zum Server. Bitte gleich noch einmal versuchen.";
  }
  if (/schon verrechnet|unterschriebenen regiebericht/i.test(m)) {
    return "Schon verrechnet oder Teil eines unterschriebenen Regieberichts — das ist festgeschrieben.";
  }
  if (/row-level security|permission denied/i.test(m)) return "Dafür fehlt die Berechtigung.";
  if (/buchung_passt/i.test(m)) return "Für diese Buchung fehlt das Projekt oder der Lagerort.";
  if (/artikel_oder_text/i.test(m)) return "Eine Position ohne Artikel braucht eine Bezeichnung.";
  if (f?.code === "23505") return "Das gibt es schon.";
  return m || "Unbekannter Fehler.";
}

// ── Artikel ────────────────────────────────────────────────────────────

export type ArtikelKurz = Pick<
  Artikel,
  "id" | "bezeichnung" | "einheit" | "ek_preis" | "hersteller" | "hersteller_nr" | "artikelnummer" | "kategorie" | "ean" | "lagerartikel"
>;
export const ARTIKEL_KURZ = "id, bezeichnung, einheit, ek_preis, hersteller, hersteller_nr, artikelnummer, kategorie, ean, lagerartikel";

/** Nur die Felder, die Liste und Entwurf brauchen — ein voller Artikel trägt Preise, Langtext … */
export function zuArtikelKurz(a: ArtikelKurz): ArtikelKurz {
  return {
    id: a.id, bezeichnung: a.bezeichnung, einheit: a.einheit, ek_preis: a.ek_preis, hersteller: a.hersteller,
    hersteller_nr: a.hersteller_nr, artikelnummer: a.artikelnummer, kategorie: a.kategorie, ean: a.ean, lagerartikel: a.lagerartikel,
  };
}

export async function artikelKurzLaden(id: string): Promise<ArtikelKurz | null> {
  const { data, error } = await supabase.from("artikel").select(ARTIKEL_KURZ).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ArtikelKurz | null) ?? null;
}

// ── Lagerorte ──────────────────────────────────────────────────────────

/** Vorbelegung: mein Bus, sonst das Hauptlager, sonst irgendeiner. */
export function standardLagerort(orte: Lagerort[], userId: string | null | undefined): Lagerort | undefined {
  return orte.find((l) => l.art === "fahrzeug" && !!userId && l.user_id === userId)
    ?? orte.find((l) => l.art === "lager")
    ?? orte[0];
}

/** Alle Lagerorte, auch die stillgelegten (Verwaltung, Namen alter Buchungen). */
export function useAlleLagerorte() {
  return useQuery({
    queryKey: ["lagerorte", "alle"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lagerorte").select("*").order("reihenfolge").order("name");
      if (error) throw error;
      return (data ?? []) as Lagerort[];
    },
  });
}

// ── Bestand ────────────────────────────────────────────────────────────

/** PostgREST liefert höchstens 1000 Zeilen am Stück — hier alle Seiten. */
export async function alleSeiten<T>(
  abfrage: (von: number, bis: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  seite = 1000,
): Promise<T[]> {
  const alle: T[] = [];
  for (let von = 0; ; von += seite) {
    const { data, error } = await abfrage(von, von + seite - 1);
    if (error) throw error;
    alle.push(...(data ?? []));
    if (!data || data.length < seite) return alle;
  }
}

export type ArtikelLager = Pick<
  Artikel,
  "id" | "bezeichnung" | "einheit" | "kategorie" | "hersteller" | "hersteller_nr" | "artikelnummer" | "ean"
  | "mindestbestand" | "lagerartikel" | "aktiv" | "ek_preis"
>;
const ARTIKEL_LAGER = "id, bezeichnung, einheit, kategorie, hersteller, hersteller_nr, artikelnummer, ean, mindestbestand, lagerartikel, aktiv, ek_preis";

export type BestandZeile = { artikel_id: string; lagerort_id: string; bestand: number; artikel: ArtikelLager | null };

/** Bestand je Artikel und Lagerort (View lagerbestand) samt Artikel. */
export function useLagerbestand() {
  return useQuery({
    queryKey: ["lager", "bestand"],
    queryFn: async () => {
      const zeilen = await alleSeiten<BestandZeile>((von, bis) =>
        supabase.from("lagerbestand")
          .select(`artikel_id, lagerort_id, bestand, artikel(${ARTIKEL_LAGER})`)
          .order("artikel_id").order("lagerort_id")
          .range(von, bis) as unknown as PromiseLike<{ data: BestandZeile[] | null; error: unknown }>);
      return zeilen.map((z) => ({ ...z, bestand: Number(z.bestand) || 0 }));
    },
  });
}

/** Lagerartikel und Artikel mit Mindestbestand — auch wenn noch nie etwas gebucht wurde. */
export function useLagerArtikel() {
  return useQuery({
    queryKey: ["artikel", "lager"],
    queryFn: async () => {
      const liste = await alleSeiten<ArtikelLager>((von, bis) =>
        supabase.from("artikel").select(ARTIKEL_LAGER)
          .or("lagerartikel.eq.true,mindestbestand.not.is.null")
          .eq("aktiv", true)
          .order("bezeichnung").order("id")
          .range(von, bis) as unknown as PromiseLike<{ data: ArtikelLager[] | null; error: unknown }>);
      return liste;
    },
  });
}

/** Bestand an EINEM Lagerort: artikel_id → Menge. */
export function useBestandAmLagerort(lagerortId: string | null | undefined) {
  return useQuery({
    queryKey: ["lager", "bestand", lagerortId],
    enabled: !!lagerortId,
    queryFn: async () => {
      const zeilen = await alleSeiten<{ artikel_id: string | null; bestand: number | null }>((von, bis) =>
        supabase.from("lagerbestand").select("artikel_id, bestand").eq("lagerort_id", lagerortId!)
          .order("artikel_id").range(von, bis) as unknown as PromiseLike<{ data: { artikel_id: string | null; bestand: number | null }[] | null; error: unknown }>);
      const karte = new Map<string, number>();
      zeilen.forEach((z) => { if (z.artikel_id) karte.set(z.artikel_id, Number(z.bestand) || 0); });
      return karte;
    },
  });
}

// ── Projektmaterial ────────────────────────────────────────────────────

export type ProjektMaterialZeile = ProjektMaterial & {
  artikel: Pick<Artikel, "id" | "vk_preis" | "ek_preis" | "listenpreis" | "hersteller" | "hersteller_nr" | "artikelnummer"> | null;
};

/** View projekt_material eines Projekts (ohne Material aus Regieberichten). */
export function useProjektMaterial(projektId: string | null | undefined) {
  return useQuery({
    queryKey: ["material", "projekt", projektId],
    enabled: !!projektId,
    queryFn: async () => {
      const { data, error } = await supabase.from("projekt_material")
        .select("*, artikel(id, vk_preis, ek_preis, listenpreis, hersteller, hersteller_nr, artikelnummer)")
        .eq("projekt_id", projektId!)
        .order("bezeichnung");
      if (error) throw error;
      return (data ?? []) as unknown as ProjektMaterialZeile[];
    },
  });
}

export type BuchungMitBezug = MaterialBuchung & {
  artikel: Pick<Artikel, "bezeichnung" | "einheit"> | null;
  projekte: { id: string; nummer: string; name: string } | null;
  lagerorte: { name: string } | null;
  profiles: { vorname: string; nachname: string } | null;
};
const BUCHUNG_MIT_BEZUG = "*, artikel(bezeichnung, einheit), projekte(id, nummer, name), lagerorte(name), profiles(vorname, nachname)";

/** Einzelbuchungen eines Projekts (ausgefasst, zurück, direkt — ohne Regieberichte). */
export function useProjektBuchungen(projektId: string | null | undefined) {
  return useQuery({
    queryKey: ["material", "buchungen", projektId],
    enabled: !!projektId,
    queryFn: async () => {
      const { data, error } = await supabase.from("material_buchungen")
        .select(BUCHUNG_MIT_BEZUG)
        .eq("projekt_id", projektId!)
        .is("regiebericht_id", null)
        .in("art", ["ausfassung", "rueckgabe", "direkt"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BuchungMitBezug[];
    },
  });
}

/** Wie viele Materialbuchungen eines Projekts in Regieberichten stecken. */
export function useRegieMaterialAnzahl(projektId: string | null | undefined) {
  return useQuery({
    queryKey: ["material", "regie-anzahl", projektId],
    enabled: !!projektId,
    queryFn: async () => {
      const { count, error } = await supabase.from("material_buchungen")
        .select("id", { count: "exact", head: true })
        .eq("projekt_id", projektId!)
        .not("regiebericht_id", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Letzte Buchungen, die ein Lager berühren (optional nur ein Lagerort). */
export function useLetzteBuchungen(lagerortId: string | null, anzahl: number) {
  return useQuery({
    queryKey: ["material", "letzte", lagerortId, anzahl],
    queryFn: async () => {
      let q = supabase.from("material_buchungen")
        .select(BUCHUNG_MIT_BEZUG)
        .not("lagerort_id", "is", null)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(anzahl);
      if (lagerortId) q = q.eq("lagerort_id", lagerortId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BuchungMitBezug[];
    },
    placeholderData: (vorher) => vorher,
  });
}

export type BuchungsGruppe = { schluessel: string; buchungen: BuchungMitBezug[] };

/** Ein Scan-Durchgang (vorgang) = eine Gruppe, wie ein Lieferschein. */
export function nachVorgang(buchungen: BuchungMitBezug[]): BuchungsGruppe[] {
  const gruppen: BuchungsGruppe[] = [];
  const index = new Map<string, BuchungsGruppe>();
  for (const b of buchungen) {
    const k = b.vorgang ?? b.id;
    let g = index.get(k);
    if (!g) {
      g = { schluessel: k, buchungen: [] };
      index.set(k, g);
      gruppen.push(g);
    }
    g.buchungen.push(b);
  }
  return gruppen;
}

/**
 * Live: bucht ein Kollege, steht es hier ohne Neuladen. Mehrere Buchungen
 * eines Sammel-Inserts kommen als einzelne Ereignisse — deshalb gebündelt.
 */
export function useMaterialLive(projektId?: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: number | undefined;
    const name = `material-${projektId ?? "alle"}-${neueId().slice(0, 8)}`;
    const kanal = supabase.channel(name)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_buchungen", ...(projektId ? { filter: `projekt_id=eq.${projektId}` } : {}) },
        () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            ["material", "lager", "projekt_zahlen"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
          }, 400);
        },
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(kanal);
    };
  }, [projektId, qc]);
}

/** Vorzeichen einer Buchung fürs Lager: + rein, − raus */
export function lagerVorzeichen(art: string): 1 | -1 | 0 {
  if (art === "zugang" || art === "rueckgabe" || art === "korrektur") return 1;
  if (art === "abgang" || art === "ausfassung") return -1;
  return 0;
}
