import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isoTag, stundenAusVonBis } from "@/lib/format";
import { materialText, regieberichtLaden, type RegieMaterial, type RegieVoll } from "@/lib/regiePdf";
import type { Profil, Regiebericht, Zeit } from "@/lib/types";
import {
  DIREKT, darfMaterialAendern, darfZeitAendern, materialFehler, materialGeaendert, materialMenge, neueId, zeileFehler,
  zeileLeer, zeitBasisAusDb, zeitGeaendert, zeitWerte,
  type Entwurf, type MaterialZeile, type ZeitModus, type ZeitZeile,
} from "./regieLogik";

/**
 * Regieberichte: Abfragen und Speichern. Query-Keys beginnen mit
 * „regieberichte“ bzw. „zeiten“, damit neuLaden(...) alles Abhängige trifft.
 */

export type RegieListenEintrag = Pick<Regiebericht,
  "id" | "nummer" | "datum" | "status" | "arbeiten" | "rechnung_id" | "unterschrift_name" | "unterschrieben_am" | "erstellt_von" | "created_at" | "projekt_id"> & {
  projekte: { id: string; nummer: string; name: string; ort: string | null; kunden: { name: string } | null } | null;
  zeiten: { stunden: number }[];
};

const LISTEN_FELDER = "id, nummer, datum, status, arbeiten, rechnung_id, unterschrift_name, unterschrieben_am, erstellt_von, created_at, projekt_id, projekte(id, nummer, name, ort, kunden(name)), zeiten(stunden)";

/** Alle Regieberichte (oder die eines Projekts), neueste zuerst */
export function useRegieberichte(projektId?: string) {
  return useQuery({
    queryKey: projektId ? ["regieberichte", "projekt", projektId] : ["regieberichte", "liste"],
    queryFn: async () => {
      let q = supabase.from("regieberichte").select(LISTEN_FELDER);
      if (projektId) q = q.eq("projekt_id", projektId);
      const { data, error } = await q.order("datum", { ascending: false }).order("nummer", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RegieListenEintrag[];
    },
  });
}

export const stundenSumme = (r: Pick<RegieListenEintrag, "zeiten">) =>
  Math.round(r.zeiten.reduce((s, z) => s + Number(z.stunden), 0) * 100) / 100;

export function useRegiebericht(id: string | undefined) {
  return useQuery({
    queryKey: ["regieberichte", "detail", id],
    enabled: !!id,
    queryFn: () => regieberichtLaden(id!),
  });
}

export type StundenVorschlag = Zeit & { profiles: Pick<Profil, "vorname" | "nachname" | "farbe"> | null };

/** Stunden am Projekt und Tag, die noch in keinem Regiebericht und keiner Rechnung stecken */
export function useStundenVorschlaege(projektId: string, datum: string, aktiv: boolean) {
  return useQuery({
    queryKey: ["zeiten", "regie-vorschlag", projektId, datum],
    enabled: aktiv && !!projektId && !!datum,
    queryFn: async () => {
      const { data, error } = await supabase.from("zeiten").select("*, profiles(vorname, nachname, farbe)")
        .eq("projekt_id", projektId).eq("datum", datum).is("regiebericht_id", null).is("rechnung_id", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as StundenVorschlag[];
    },
  });
}

/** Wer hat am Projekt zuletzt unterschrieben? Beim Stammkunden meist derselbe. */
export function useLetzterUnterzeichner(projektId: string | undefined) {
  return useQuery({
    queryKey: ["regieberichte", "unterzeichner", projektId],
    enabled: !!projektId,
    queryFn: async () => {
      const { data } = await supabase.from("regieberichte").select("unterschrift_name")
        .eq("projekt_id", projektId!).eq("status", "unterschrieben").not("unterschrift_name", "is", null)
        .order("unterschrieben_am", { ascending: false }).limit(1).maybeSingle();
      return data?.unterschrift_name ?? "";
    },
  });
}

// ── Editor-Zeilen aus der Datenbank ─────────────────────────────────────

const alsEingabe = (n: number) => String(Number(n)).replace(".", ",");

export function zeileAusDb(z: Zeit, ich: string, istChef: boolean, herkunft: ZeitZeile["herkunft"] = "bericht"): ZeitZeile {
  // Von–Bis nur, wenn es zu den Stunden passt — sonst gelten die Stunden
  // (und eine Änderung würde die unpassende Spanne entfernen)
  const vonbis = !!(z.von && z.bis)
    && Math.abs(stundenAusVonBis(z.von.slice(0, 5), z.bis.slice(0, 5), Number(z.pause_minuten) || 0) - Number(z.stunden)) < 0.01;
  const basis = zeitBasisAusDb(z);
  return {
    key: z.id,
    id: z.id,
    herkunft,
    userId: z.user_id,
    modus: vonbis ? "vonbis" : "stunden",
    stunden: alsEingabe(z.stunden),
    von: vonbis ? basis.von ?? "" : "",
    bis: vonbis ? basis.bis ?? "" : "",
    pause: vonbis ? String(basis.pause) : "30",
    aenderbar: darfZeitAendern(z, ich, istChef),
    basis: vonbis ? basis : { ...basis, von: null, bis: null, pause: 0 },
    verrechnet: !!z.rechnung_id,
  };
}

export function neueZeile(userId: string, modus: ZeitModus): ZeitZeile {
  return {
    key: neueId(), id: null, herkunft: "neu", userId, modus, stunden: "", von: "", bis: "", pause: "30",
    aenderbar: true, basis: null,
  };
}

export function materialAusDb(m: RegieMaterial, ich: string, istChef: boolean): MaterialZeile {
  const { bezeichnung, einheit } = materialText(m);
  const quelle = m.art === "direkt" || !m.lagerort_id ? DIREKT : m.lagerort_id;
  return {
    key: m.id,
    id: m.id,
    artikelId: m.artikel_id,
    bezeichnung,
    einheit,
    menge: alsEingabe(m.menge),
    quelle,
    ekPreis: m.ek_preis,
    aenderbar: darfMaterialAendern(m, ich, istChef),
    basis: { menge: Number(m.menge), quelle },
    userId: m.user_id,
    verrechnet: !!m.rechnung_id,
  };
}

/** Editor-Stand genau so, wie der Bericht in der Datenbank steht */
export function entwurfAus(voll: RegieVoll, ich: string, istChef: boolean): Entwurf {
  return {
    berichtId: voll.id,
    nummer: voll.nummer,
    projektId: voll.projekt_id,
    datum: voll.datum,
    arbeiten: voll.arbeiten,
    kopfBasis: { datum: voll.datum, arbeiten: voll.arbeiten },
    zeilen: voll.zeiten.map((z) => zeileAusDb(z, ich, istChef)),
    material: voll.material.map((m) => materialAusDb(m, ich, istChef)),
    entfernt: { zeiten: [], material: [] },
  };
}

/** Neuer Bericht: heute, eine leere Zeile für mich */
export function neuerEntwurf(projektId: string, ich: string, modus: ZeitModus): Entwurf {
  return {
    berichtId: null, nummer: null, projektId, datum: isoTag(), arbeiten: "", kopfBasis: null,
    zeilen: [neueZeile(ich, modus)], material: [], entfernt: { zeiten: [], material: [] },
  };
}

// ── Fehlertexte ──────────────────────────────────────────────────────────

type DbFehler = { message: string; code?: string };

export function fehlerText(e: DbFehler): string {
  // .single() ohne Treffer: RLS hat die Zeile ausgefiltert oder sie ist weg
  if (e.code === "PGRST116") return "Nicht gefunden oder keine Berechtigung.";
  return e.message;
}

// ── Stunden einem Bericht zuordnen ──────────────────────────────────────

/**
 * Vorhandene Stunden in den Bericht holen (dazu) oder wieder herausnehmen
 * (weg). Über regie_zeiten_zuordnen() geht das auch mit den Stunden eines
 * Kollegen — die Partie schreibt den Bericht meist auf einem Handy.
 */
export async function zeitenZuordnen(berichtId: string, dazu: string[], weg: string[]): Promise<{ ok: Set<string>; fehler?: string }> {
  const ok = new Set<string>();
  if (!dazu.length && !weg.length) return { ok };
  const { data, error } = await supabase.rpc("regie_zeiten_zuordnen", { p_regie: berichtId, p_dazu: dazu, p_weg: weg });
  if (error) return { ok, fehler: error.message };
  (data ?? []).forEach((id) => ok.add(id));
  return { ok };
}

// ── Speichern ────────────────────────────────────────────────────────────

export type SpeicherErgebnis = {
  /** Editor-Stand nach dem Speichern (neue IDs, übernommene Zeilen) — auch bei Teilfehlern */
  zustand: Entwurf;
  fehler: string[];
  /** true = nichts gespeichert (Prüfung oder Bericht selbst fehlgeschlagen) */
  abbruch: boolean;
};

/**
 * Speichert den ganzen Entwurf: Bericht, Stunden der Partie, Material.
 * Reihenfolge: erst der Bericht (die Nummer vergibt der Trigger), dann
 * Entferntes, Übernommenes, Geändertes, Neues. Jeder Schritt schreibt sein
 * Ergebnis in den Zustand zurück, damit ein zweiter Versuch nichts doppelt bucht.
 */
export async function regieSpeichern(
  e0: Entwurf,
  ctx: { ich: string; namen: (userId: string) => string },
): Promise<SpeicherErgebnis> {
  const abbruch = (text: string): SpeicherErgebnis => ({ zustand: e0, fehler: [text], abbruch: true });

  if (!e0.projektId) return abbruch("Bitte zuerst das Projekt wählen.");
  if (!e0.datum) return abbruch("Bitte ein Datum wählen.");
  for (const z of e0.zeilen) {
    const f = zeileFehler(z);
    if (f) return abbruch(`Arbeitszeit ${ctx.namen(z.userId)}: ${f}`);
  }
  for (const m of e0.material) {
    const f = materialFehler(m);
    if (f) return abbruch(`${m.bezeichnung || "Material"}: ${f}`);
  }
  if (e0.kopfBasis && e0.kopfBasis.datum !== e0.datum) {
    const fremd = e0.zeilen.find((z) => z.herkunft === "bericht" && !z.aenderbar);
    if (fremd) {
      const wer = ctx.namen(fremd.userId);
      return abbruch(`Das Datum lässt sich nicht ändern: Die Stunden von ${wer} kann nur ${wer} selbst oder der Chef ändern.`);
    }
  }

  const e: Entwurf = {
    ...e0,
    zeilen: e0.zeilen.map((z) => ({ ...z })),
    material: e0.material.map((m) => ({ ...m })),
    entfernt: { zeiten: [...e0.entfernt.zeiten], material: [...e0.entfernt.material] },
  };
  const fehler: string[] = [];

  // 1. Der Bericht selbst
  if (!e.berichtId) {
    const { data, error } = await supabase.from("regieberichte")
      .insert({ projekt_id: e.projektId, datum: e.datum, arbeiten: e.arbeiten })
      .select("id, nummer").single();
    if (error) return abbruch(`Bericht nicht angelegt: ${error.message}`);
    e.berichtId = data.id;
    e.nummer = data.nummer;
    e.kopfBasis = { datum: e.datum, arbeiten: e.arbeiten };
  } else if (!e.kopfBasis || e.kopfBasis.datum !== e.datum || e.kopfBasis.arbeiten !== e.arbeiten) {
    const { error } = await supabase.from("regieberichte")
      .update({ datum: e.datum, arbeiten: e.arbeiten })
      .eq("id", e.berichtId).eq("status", "entwurf").select("id").single();
    if (error) return abbruch(`Bericht nicht gespeichert: ${fehlerText(error)}`);
    e.kopfBasis = { datum: e.datum, arbeiten: e.arbeiten };
  }
  const berichtId = e.berichtId;

  // 2a. Entfernte Stunden löschen
  const loeschen = e.entfernt.zeiten.filter((x) => !x.behalten).map((x) => x.id);
  if (loeschen.length) {
    const { data, error } = await supabase.from("zeiten").delete().in("id", loeschen).select("id");
    const weg = new Set((data ?? []).map((d) => d.id));
    if (error) fehler.push(`Stunden nicht gelöscht: ${error.message}`);
    else if (weg.size < loeschen.length) fehler.push(`${loeschen.length - weg.size} Stundenzeile(n) nicht gelöscht — fremde Stunden löscht nur der Chef.`);
    e.entfernt.zeiten = e.entfernt.zeiten.filter((x) => x.behalten || !weg.has(x.id));
  }

  // 2b. Stunden aus dem Bericht nehmen (bleiben als Projektstunden) und vorhandene übernehmen
  const loesen = e.entfernt.zeiten.filter((x) => x.behalten).map((x) => x.id);
  const dazu = e.zeilen.filter((z) => z.herkunft === "uebernehmen" && z.id).map((z) => z.id as string);
  if (loesen.length || dazu.length) {
    const r = await zeitenZuordnen(berichtId, dazu, loesen);
    if (r.fehler) fehler.push(`Stunden nicht zugeordnet: ${r.fehler}`);
    // Ohne Fehler steckt danach keine der Zeilen mehr im Bericht — auch die,
    // die schon vorher draußen waren
    else e.entfernt.zeiten = e.entfernt.zeiten.filter((x) => !x.behalten);
    const nichtUebernommen = new Set<string>();
    e.zeilen = e.zeilen.filter((z) => {
      if (z.herkunft !== "uebernehmen") return true;
      if (z.id && r.ok.has(z.id)) { z.herkunft = "bericht"; return true; }
      nichtUebernommen.add(ctx.namen(z.userId));
      return false;
    });
    if (!r.fehler && nichtUebernommen.size) {
      fehler.push(`Nicht übernommen: Stunden von ${[...nichtUebernommen].join(", ")} — schon in einem anderen Bericht oder verrechnet.`);
    }
  }

  // 2c. Geänderte Stunden (auch: neues Datum des Berichts)
  for (const z of e.zeilen) {
    if (z.herkunft !== "bericht" || !z.id || !z.aenderbar || !zeitGeaendert(z, e.datum)) continue;
    const w = zeitWerte(z);
    const { error } = await supabase.from("zeiten").update({ ...w, datum: e.datum }).eq("id", z.id).select("id").single();
    if (error) { fehler.push(`Arbeitszeit ${ctx.namen(z.userId)}: ${fehlerText(error)}`); continue; }
    z.basis = { stunden: w.stunden, von: w.von, bis: w.bis, pause: w.pause_minuten, datum: e.datum };
  }

  // 2d. Neue Stunden — Sammel-Insert, jede Zeile mit denselben Feldern
  const neue = e.zeilen.filter((z) => z.herkunft === "neu" && !zeileLeer(z));
  if (neue.length) {
    const daten = neue.map((z) => ({
      id: neueId(),
      user_id: z.userId,
      projekt_id: e.projektId,
      datum: e.datum,
      ...zeitWerte(z),
      taetigkeit: `Regiebericht ${e.nummer ?? ""}`.trim(),
      regiebericht_id: berichtId,
    }));
    const { error } = await supabase.from("zeiten").insert(daten);
    if (error) fehler.push(`Stunden nicht gebucht: ${error.message}`);
    else {
      neue.forEach((z, i) => {
        const d = daten[i];
        z.id = d.id;
        z.herkunft = "bericht";
        z.aenderbar = true;
        z.basis = { stunden: d.stunden, von: d.von, bis: d.bis, pause: d.pause_minuten, datum: e.datum };
      });
    }
  }

  // 3a. Entferntes Material löschen
  if (e.entfernt.material.length) {
    const ids = e.entfernt.material;
    const { data, error } = await supabase.from("material_buchungen").delete().in("id", ids).select("id");
    const weg = new Set((data ?? []).map((d) => d.id));
    if (error) fehler.push(`Material nicht gelöscht: ${error.message}`);
    else if (weg.size < ids.length) fehler.push(`${ids.length - weg.size} Materialbuchung(en) nicht gelöscht — fremde Buchungen löscht nur der Chef.`);
    e.entfernt.material = ids.filter((id) => !weg.has(id));
  }

  // 3b. Geändertes Material
  for (const m of e.material) {
    if (!m.id || !m.aenderbar || !materialGeaendert(m)) continue;
    const menge = materialMenge(m);
    const direkt = m.quelle === DIREKT || !m.artikelId;
    const { error } = await supabase.from("material_buchungen")
      .update({ menge, art: direkt ? "direkt" : "ausfassung", lagerort_id: direkt ? null : m.quelle })
      .eq("id", m.id).select("id").single();
    if (error) { fehler.push(`${m.bezeichnung}: ${fehlerText(error)}`); continue; }
    m.basis = { menge, quelle: m.quelle };
  }

  // 3c. Neues Material — aus dem Lager/Bus ausgefasst oder direkt; Sammel-Insert mit gleichen Feldern
  const neuesMaterial = e.material.filter((m) => !m.id);
  if (neuesMaterial.length) {
    const daten = neuesMaterial.map((m) => {
      const direkt = m.quelle === DIREKT || !m.artikelId;
      return {
        id: neueId(),
        art: direkt ? "direkt" : "ausfassung",
        artikel_id: m.artikelId,
        bezeichnung: m.artikelId ? null : m.bezeichnung.trim(),
        einheit: m.artikelId ? null : m.einheit,
        menge: materialMenge(m),
        lagerort_id: direkt ? null : m.quelle,
        projekt_id: e.projektId,
        regiebericht_id: berichtId,
        ek_preis: m.ekPreis,
        vorgang: berichtId,
        user_id: ctx.ich,
      };
    });
    const { error } = await supabase.from("material_buchungen").insert(daten);
    if (error) fehler.push(`Material nicht gebucht: ${error.message}`);
    else {
      neuesMaterial.forEach((m, i) => {
        m.id = daten[i].id;
        m.aenderbar = true;
        m.userId = ctx.ich;
        if (!m.artikelId) m.quelle = DIREKT;
        m.basis = { menge: daten[i].menge, quelle: m.quelle };
      });
    }
  }

  return { zustand: e, fehler, abbruch: false };
}

// ── Löschen ──────────────────────────────────────────────────────────────

/**
 * Entwurf löschen. Erst der Bericht — die Fremdschlüssel lösen Stunden und
 * Material vom Bericht (on delete set null), sie bleiben Projektbuchungen.
 * Mit `mitBuchungen` werden sie danach gelöscht, soweit die RLS es zulässt.
 */
export async function regieLoeschen(r: RegieVoll, mitBuchungen: boolean): Promise<{ fehler?: string; uebrig: number }> {
  const { error } = await supabase.from("regieberichte").delete().eq("id", r.id).eq("status", "entwurf").select("id").single();
  if (error) {
    return { fehler: error.code === "PGRST116" ? "Löschen darf nur, wer den Bericht angelegt hat, oder der Chef." : error.message, uebrig: 0 };
  }
  if (!mitBuchungen) return { uebrig: 0 };
  let uebrig = 0;
  const zeitIds = r.zeiten.map((z) => z.id);
  if (zeitIds.length) {
    const { data } = await supabase.from("zeiten").delete().in("id", zeitIds).select("id");
    uebrig += zeitIds.length - (data?.length ?? 0);
  }
  const matIds = r.material.map((m) => m.id);
  if (matIds.length) {
    const { data } = await supabase.from("material_buchungen").delete().in("id", matIds).select("id");
    uebrig += matIds.length - (data?.length ?? 0);
  }
  return { uebrig };
}
