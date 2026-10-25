import { supabase } from "@/integrations/supabase/client";
import { belegSummen } from "@/lib/preise";
import type { Beleg, Firma, Position } from "@/lib/types";
import {
  kopfZuDb, neueId, ohneUstFuer, positionZuDb, quelleJson, quellenIds, summen,
  type BelegTyp, type EditorPosition, type Kopf, type Quelle,
} from "./editor";

/**
 * Schreiben in die Datenbank. Bewusst ohne eigene RPC: jeder Schritt ist
 * wiederholbar (feste IDs, Upsert, bedingtes Markieren), ein zweites
 * „Speichern“ heilt einen abgebrochenen ersten Versuch.
 *
 * Reihenfolge beim Speichern:
 *  1. Angebot ohne Projekt → Projekt (Status „Angebot“) anlegen
 *  2. Kopf mit Netto/USt/Brutto schreiben
 *  3. entfernte Positionen löschen → Trigger gibt deren Quellen frei
 *  4. alle Positionen upserten (immer alle Felder, nie `gesamt`)
 *  5. Rechnung: Quellen (Stunden, Material, Regieberichte) als verrechnet
 *     markieren — nur wenn noch frei; was schon woanders hängt, wird gezählt
 */

const fehler = (text: string, e: { message: string } | null | undefined) =>
  new Error(e?.message ? `${text}: ${e.message}` : text);

export type SpeicherErgebnis = {
  beleg: Beleg;
  positionen: Position[];
  /** Quellen, die schon in einer anderen Rechnung stecken oder fehlen */
  konflikte: number;
};

export async function belegSpeichern({
  id, neu, kopf, positionen, geloescht, firma, onProjektAngelegt,
}: {
  id: string;
  neu: boolean;
  kopf: Kopf;
  positionen: EditorPosition[];
  geloescht: string[];
  firma: Firma | null;
  onProjektAngelegt?: (projektId: string) => void;
}): Promise<SpeicherErgebnis> {
  let k = kopf;

  if (!k.projekt_id && k.typ === "angebot") {
    const name = (k.betreff.trim() || k.empf_name.trim() || "Angebot").slice(0, 120);
    const { data, error } = await supabase
      .from("projekte")
      .insert({
        name,
        kunde_id: k.kunde_id,
        status: "angebot",
        strasse: k.empf_strasse.trim() || null,
        plz: k.empf_plz.trim() || null,
        ort: k.empf_ort.trim() || null,
      })
      .select("id")
      .single();
    if (error) throw fehler("Projekt konnte nicht angelegt werden", error);
    k = { ...k, projekt_id: data.id };
    onProjektAngelegt?.(data.id);
  }

  const s = summen(positionen, k.ust_satz, ohneUstFuer(k, firma));
  const zeile = { ...kopfZuDb(k), netto: s.netto, ust: s.ust, brutto: s.brutto };
  // Neu: Upsert statt Insert — scheitert ein erster Versuch nach dem Kopf,
  // legt das nächste „Speichern“ nicht doppelt an, sondern schreibt drüber.
  const antwort = neu
    ? await supabase.from("belege").upsert({ id, ...zeile }, { onConflict: "id" }).select("*").single()
    : await supabase.from("belege").update(zeile).eq("id", id).select("*").maybeSingle();
  if (antwort.error) throw fehler("Beleg konnte nicht gespeichert werden", antwort.error);
  if (!antwort.data) throw new Error("Beleg nicht gefunden — wurde er inzwischen gelöscht?");

  if (geloescht.length) {
    const { error } = await supabase.from("beleg_positionen").delete().in("id", geloescht);
    if (error) throw fehler("Positionen konnten nicht entfernt werden", error);
  }

  let gespeichert: Position[] = [];
  if (positionen.length) {
    const { data, error } = await supabase
      .from("beleg_positionen")
      .upsert(positionen.map((p, i) => positionZuDb(p, id, i + 1)), { onConflict: "id" })
      .select("*");
    if (error) throw fehler("Positionen konnten nicht gespeichert werden", error);
    gespeichert = [...(data ?? [])].sort((a, b) => a.pos - b.pos);
  }

  let konflikte = 0;
  if (k.typ === "rechnung") {
    konflikte = await quellenBinden(id, quellenIds(positionen));
    if (k.angebot_id) {
      await supabase.from("belege").update({ status: "angenommen" }).eq("id", k.angebot_id).eq("status", "offen");
    }
  }
  // Ein Projekt ohne Kunde bekommt den Kunden seines Belegs
  if (k.projekt_id && k.kunde_id) {
    await supabase.from("projekte").update({ kunde_id: k.kunde_id }).eq("id", k.projekt_id).is("kunde_id", null);
  }

  return { beleg: antwort.data, positionen: gespeichert, konflikte };
}

/**
 * Stunden, Materialbuchungen und Regieberichte an die Rechnung hängen —
 * nur, wenn sie noch frei sind. Gibt zurück, wie viele schon an einer
 * anderen Rechnung hängen (oder nicht mehr existieren).
 */
export async function quellenBinden(belegId: string, q: Quelle): Promise<number> {
  const teile: [string, string[]][] = [["zeiten", q.zeiten], ["material_buchungen", q.material], ["regieberichte", q.regie]];
  let konflikte = 0;
  for (const [tabelle, ids] of teile) {
    for (let i = 0; i < ids.length; i += 100) {
      const stueck = ids.slice(i, i + 100);
      // Alle drei Tabellen haben `id` und `rechnung_id` — derselbe Aufruf passt
      const t = tabelle as "zeiten";
      const { error } = await supabase.from(t).update({ rechnung_id: belegId }).in("id", stueck).is("rechnung_id", null);
      if (error) throw fehler("Stunden und Material konnten nicht als verrechnet markiert werden", error);
      const { data, error: e2 } = await supabase.from(t).select("id, rechnung_id").in("id", stueck);
      if (e2) throw fehler("Verrechnung konnte nicht geprüft werden", e2);
      konflikte += stueck.length - (data ?? []).filter((r) => r.rechnung_id === belegId).length;
    }
  }
  return konflikte;
}

/** Nummer vergeben, Summen festschreiben — Rechnungen sind danach unveränderbar */
export async function fertigstellen(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("beleg_fertigstellen", { p_id: id });
  if (error) throw fehler("Fertigstellen nicht möglich", error);
  return data;
}

/** Rechnung stornieren — Nummer bleibt, Stunden/Material/Regieberichte sind wieder frei */
export async function stornieren(id: string): Promise<void> {
  const { error } = await supabase.rpc("beleg_stornieren", { p_id: id });
  if (error) throw fehler("Stornieren nicht möglich", error);
}

export async function statusSetzen(id: string, status: string, bezahltAm: string | null = null): Promise<void> {
  const { data, error } = await supabase.from("belege").update({ status, bezahlt_am: bezahltAm }).eq("id", id).select("id");
  if (error) throw fehler("Status konnte nicht geändert werden", error);
  if (!data?.length) throw new Error("Status konnte nicht geändert werden.");
}

/** Angebot angenommen → Projekt geht von „Angebot“ auf „In Arbeit“. Gibt zurück, ob es umgestellt wurde. */
export async function projektAktivieren(projektId: string | null): Promise<boolean> {
  if (!projektId) return false;
  const { data } = await supabase.from("projekte").update({ status: "aktiv" }).eq("id", projektId).eq("status", "angebot").select("id");
  return !!data?.length;
}

/** Entwurf oder Angebot löschen (RLS lässt fertige Rechnungen nicht zu) */
export async function belegLoeschen(id: string): Promise<void> {
  const { data, error } = await supabase.from("belege").delete().eq("id", id).select("id");
  if (error) throw fehler("Löschen nicht möglich", error);
  if (!data?.length) throw new Error("Löschen nicht möglich — fertige Rechnungen bleiben erhalten (stornieren statt löschen).");
}

/** Hängt außer diesem Beleg nichts am Projekt — keine weiteren Belege, Stunden, Material, Regieberichte, Dateien, Termine? */
async function sonstNichtsAmProjekt(projektId: string, belegId: string): Promise<boolean> {
  const zaehlen = (tabelle: string) =>
    supabase.from(tabelle as "zeiten").select("id", { count: "exact", head: true }).eq("projekt_id", projektId);
  const antworten = await Promise.all([
    supabase.from("belege").select("id", { count: "exact", head: true }).eq("projekt_id", projektId).neq("id", belegId),
    zaehlen("zeiten"), zaehlen("material_buchungen"), zaehlen("regieberichte"), zaehlen("dateien"), zaehlen("termine"),
  ]);
  return antworten.every((a) => !a.error && (a.count ?? 0) === 0);
}

/**
 * Wurde das Projekt nur für dieses Angebot angelegt? Status „Angebot“ und
 * sonst nichts daran. Nur dann darf es beim Löschen des Angebots mit weg.
 */
export async function projektNurFuerBeleg(projektId: string, belegId: string): Promise<boolean> {
  const { data: p, error } = await supabase.from("projekte").select("id, status").eq("id", projektId).maybeSingle();
  if (error || !p || p.status !== "angebot") return false;
  return sonstNichtsAmProjekt(projektId, belegId);
}

/**
 * Angebot wieder „offen“ (z. B. „Angenommen“ versehentlich gedrückt): das
 * Projekt, das dabei auf „In Arbeit“ ging, zurück auf „Angebot“ — aber nur,
 * wenn noch nichts daran hängt. Gibt zurück, ob es zurückgestellt wurde.
 */
export async function projektZurueckAufAngebot(projektId: string | null, belegId: string): Promise<boolean> {
  if (!projektId) return false;
  const { data: p } = await supabase.from("projekte").select("id, status").eq("id", projektId).maybeSingle();
  if (p?.status !== "aktiv" || !(await sonstNichtsAmProjekt(projektId, belegId))) return false;
  const { data } = await supabase.from("projekte").update({ status: "angebot" }).eq("id", projektId).eq("status", "aktiv").select("id");
  return !!data?.length;
}

export async function projektLoeschen(projektId: string): Promise<void> {
  const { data, error } = await supabase.from("projekte").delete().eq("id", projektId).select("id");
  if (error) throw fehler("Projekt konnte nicht gelöscht werden", error);
  if (!data?.length) throw new Error("Projekt konnte nicht gelöscht werden.");
}

/**
 * Neuer Entwurf aus einem bestehenden Beleg: Angebot → Rechnung, Kopie,
 * Korrektur einer stornierten Rechnung (dann mit Herkunft — die Quellen sind
 * durch das Storno wieder frei und werden neu gebunden).
 */
export async function belegKopieren({
  quelle, positionen, typ, firma, heute, mitHerkunft = false,
}: {
  quelle: Beleg;
  positionen: Position[];
  typ: BelegTyp;
  firma: Firma | null;
  heute: string;
  mitHerkunft?: boolean;
}): Promise<{ id: string; konflikte: number }> {
  const id = neueId();
  const gleicherTyp = quelle.typ === typ;
  const ohneUst = !!quelle.reverse_charge || !!firma?.kleinunternehmer;
  const s = belegSummen(positionen.map((p) => ({ art: p.art, menge: Number(p.menge), einzelpreis: Number(p.einzelpreis) })), Number(quelle.ust_satz), ohneUst);
  const { error } = await supabase.from("belege").insert({
    id,
    typ,
    status: "entwurf",
    projekt_id: quelle.projekt_id,
    kunde_id: quelle.kunde_id,
    angebot_id: typ === "rechnung" ? (quelle.typ === "angebot" ? quelle.id : quelle.angebot_id) : null,
    empf_name: quelle.empf_name,
    empf_zusatz: quelle.empf_zusatz,
    empf_strasse: quelle.empf_strasse,
    empf_plz: quelle.empf_plz,
    empf_ort: quelle.empf_ort,
    empf_uid: quelle.empf_uid,
    empf_email: quelle.empf_email,
    datum: heute,
    leistung_von: gleicherTyp ? quelle.leistung_von : null,
    leistung_bis: gleicherTyp ? quelle.leistung_bis : null,
    betreff: quelle.betreff,
    einleitung: gleicherTyp ? quelle.einleitung : (typ === "angebot" ? firma?.angebot_einleitung : firma?.rechnung_einleitung) ?? null,
    schlusstext: gleicherTyp ? quelle.schlusstext : (typ === "angebot" ? firma?.angebot_schluss : firma?.rechnung_schluss) ?? null,
    ust_satz: quelle.ust_satz,
    reverse_charge: quelle.reverse_charge,
    kv_verbindlich: typ === "angebot" && quelle.kv_verbindlich,
    netto: s.netto,
    ust: s.ust,
    brutto: s.brutto,
  });
  if (error) throw fehler("Neuer Beleg konnte nicht angelegt werden", error);

  if (positionen.length) {
    const zeilen = positionen.map((p, i) => ({
      id: neueId(),
      beleg_id: id,
      pos: i + 1,
      art: p.art,
      bezeichnung: p.bezeichnung,
      langtext: p.langtext,
      menge: p.menge,
      einheit: p.einheit,
      einzelpreis: p.einzelpreis,
      ek_preis: p.ek_preis,
      minuten: p.minuten,
      artikel_id: p.artikel_id,
      leistung_id: p.leistung_id,
      quelle: mitHerkunft ? p.quelle : null,
    }));
    const { error: e2 } = await supabase.from("beleg_positionen").insert(zeilen);
    if (e2) {
      await supabase.from("belege").delete().eq("id", id);
      throw fehler("Positionen konnten nicht übernommen werden", e2);
    }
  }

  let konflikte = 0;
  if (mitHerkunft && typ === "rechnung") {
    const q = quellenIds(positionen.map((p) => ({ quelle: quelleAusJson(p.quelle) })));
    konflikte = await quellenBinden(id, q);
  }
  return { id, konflikte };
}

function quelleAusJson(j: Position["quelle"]): Quelle | null {
  const o = (j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Record<string, unknown>;
  const liste = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
  const q = { zeiten: liste(o.zeiten), material: liste(o.material), regie: liste(o.regie) };
  return quelleJson(q) ? q : null;
}

/** Angebot → Rechnung: Positionen kopieren, Angebot angenommen, Projekt in Arbeit */
export async function inRechnungUmwandeln(angebot: Beleg, positionen: Position[], firma: Firma | null, heute: string): Promise<string> {
  const { id } = await belegKopieren({ quelle: angebot, positionen, typ: "rechnung", firma, heute });
  if (angebot.status === "offen") await statusSetzen(angebot.id, "angenommen");
  await projektAktivieren(angebot.projekt_id);
  return id;
}
