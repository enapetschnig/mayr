import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, ClipboardList, Loader2, PencilLine, ScanBarcode, Search, Warehouse, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seite } from "@/components/PageHeader";
import { Abschnitt, Leer, StatusPille } from "@/components/Bausteine";
import FormularDialog from "@/components/FormularDialog";
import { ProjektWahl } from "@/components/ProjektWahl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScanDialog, type ScanRueckmeldung } from "@/components/scanner/ScanDialog";
import { artikelZuCode } from "@/components/scanner/artikelZuCode";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { CodeUnbekanntDialog } from "@/components/material/CodeUnbekanntDialog";
import { FreiePositionDialog, type FreiePosition } from "@/components/material/FreiePositionDialog";
import { MengeFeld } from "@/components/material/MengeFeld";
import {
  ARTIKEL_KURZ, alleSeiten, artikelInfo, artikelKurzLaden, fehlerText, mengeEingabe, mengeText, neueId, runden3,
  standardLagerort, useBestandAmLagerort, useProjektMaterial, zeitpunktText, zuArtikelKurz, type ArtikelKurz,
} from "@/components/material/materialDaten";
import { useLagerorte, useNeuLaden, useProjekte } from "@/hooks/useDaten";
import { useSitzung } from "@/hooks/useSitzung";
import { zahl, zahlLesen } from "@/lib/format";
import { codeBereinigen } from "@/lib/strichcode";
import type { BuchungsArt } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Material scannen: ausfassen, zurückgeben, direkt gekauft — für den Chef
 * zusätzlich Wareneingang und Inventur. Ein Durchgang = eine Liste = ein
 * Vorgang: scannen (die Kamera läuft durch), Mengen anpassen, einmal buchen.
 *
 * Die Liste überlebt Neuladen und leeren Akku (localStorage), bis sie gebucht
 * oder verworfen ist. Gebucht wird in EINEM Sammel-Insert; die Vorgangs-ID
 * verhindert, dass ein zweiter Versuch nach einem Funkloch doppelt bucht.
 */

type Modus = Extract<BuchungsArt, "ausfassung" | "rueckgabe" | "direkt" | "zugang" | "korrektur">;

type ModusInfo = {
  kurz: string;
  erklaerung: string;
  projekt: boolean;
  lager: boolean;
  nurChef: boolean;
  lagerFrage: string;
  /** „5 Positionen ausfassen“ */
  verb: string;
  gebucht: string;
};

const MODI: Record<Modus, ModusInfo> = {
  ausfassung: {
    kurz: "Ausfassen", erklaerung: "Aus Lager oder Bus auf die Baustelle", projekt: true, lager: true, nurChef: false,
    lagerFrage: "Woher?", verb: "ausfassen", gebucht: "Ausgefasst",
  },
  rueckgabe: {
    kurz: "Zurück", erklaerung: "Übrig geblieben — zurück ins Lager oder in den Bus", projekt: true, lager: true, nurChef: false,
    lagerFrage: "Wohin zurück?", verb: "zurückgeben", gebucht: "Zurückgegeben",
  },
  direkt: {
    kurz: "Direkt", erklaerung: "Beim Großhändler gekauft oder geliefert — ohne Lager", projekt: true, lager: false, nurChef: false,
    lagerFrage: "", verb: "buchen", gebucht: "Direkt gebucht",
  },
  zugang: {
    kurz: "Wareneingang", erklaerung: "Lieferung ins Lager einbuchen", projekt: false, lager: true, nurChef: true,
    lagerFrage: "Wohin?", verb: "einbuchen", gebucht: "Eingebucht",
  },
  korrektur: {
    kurz: "Inventur", erklaerung: "Zählen und den Bestand richtigstellen", projekt: false, lager: true, nurChef: true,
    lagerFrage: "Was wird gezählt?", verb: "", gebucht: "Bestand korrigiert",
  },
};
const REIHENFOLGE: Modus[] = ["ausfassung", "rueckgabe", "direkt", "zugang", "korrektur"];

function modusLesen(roh: string | null | undefined, istChef: boolean): Modus | null {
  const m = REIHENFOLGE.find((x) => x === roh);
  if (!m) return null;
  return MODI[m].nurChef && !istChef ? null : m;
}

/** Eine Zeile der Liste. Menge bleibt Text, solange getippt wird („25,“). */
type Zeile = {
  /** Artikel-ID oder „frei:<uuid>“ */
  schluessel: string;
  /** null = Position ohne Artikel (nur bei „Direkt“) */
  artikel: ArtikelKurz | null;
  bezeichnung: string;
  einheit: string;
  menge: string;
  /** nur Positionen ohne Artikel; bei Artikeln gilt der EK beim Buchen */
  ek_preis: number | null;
  /** Inventur: Menge aus dem Bestand übernommen, noch nicht gezählt */
  vorbelegt?: boolean;
};

type Entwurf = {
  v: 1;
  modus: Modus;
  projektId: string;
  lagerortId: string;
  liste: Zeile[];
  notiz: string;
  vorgang: string;
  zeit: number;
};

const entwurfKey = (uid: string) => `elektro.scan.entwurf.${uid}`;
const projektKey = (uid: string) => `elektro.scan.projekt.${uid}`;

function entwurfLesen(uid: string): Entwurf | null {
  try {
    const roh = localStorage.getItem(entwurfKey(uid));
    if (!roh) return null;
    const e = JSON.parse(roh) as Partial<Entwurf> | null;
    const liste = Array.isArray(e?.liste)
      ? e!.liste.filter((z): z is Zeile =>
        !!z && typeof z.schluessel === "string" && typeof z.menge === "string" && typeof z.bezeichnung === "string")
      : [];
    const modus = REIHENFOLGE.find((m) => m === e?.modus);
    if (!e || e.v !== 1 || !liste.length || !modus) return null;
    return {
      v: 1, modus, liste,
      projektId: e.projektId ?? "", lagerortId: e.lagerortId ?? "", notiz: e.notiz ?? "",
      vorgang: e.vorgang || neueId(), zeit: Number(e.zeit) || Date.now(),
    };
  } catch {
    return null;
  }
}

/** „25,5“ ja, „“, „-3“, „abc“ nein */
const mengeGueltig = (text: string) => /^\d+([.,]\d+)?$/.test(text.trim());

type Differenz = { zeile: Zeile; ist: number; gezaehlt: number; diff: number };

type BuchungNeu = {
  art: Modus;
  artikel_id: string | null;
  bezeichnung: string | null;
  einheit: string | null;
  menge: number;
  lagerort_id: string | null;
  projekt_id: string | null;
  regiebericht_id: string | null;
  ek_preis: number | null;
  vorgang: string;
  notiz: string | null;
  user_id: string;
};

export default function Scan() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { profil, istChef } = useSitzung();
  const uid = profil?.id ?? "";
  const neuLaden = useNeuLaden();
  const { data: projekte = [], isSuccess: projekteDa } = useProjekte();
  const { data: orte = [], isLoading: orteLaden } = useLagerorte();

  // Einmal beim Öffnen: nicht gebuchte Liste > URL > zuletzt benutztes Projekt
  const [anfang] = useState(() => {
    const urlModus = modusLesen(params.get("modus"), istChef);
    const urlProjekt = params.get("projekt") ?? "";
    const urlLager = params.get("lager") ?? "";
    const entwurf = uid ? entwurfLesen(uid) : null;
    if (entwurf && !modusLesen(entwurf.modus, istChef)) entwurf.modus = "ausfassung";
    let gemerkt = "";
    try {
      gemerkt = (uid && localStorage.getItem(projektKey(uid))) || "";
    } catch {
      /* egal */
    }
    const konflikt = !!entwurf
      && ((!!urlModus && urlModus !== entwurf.modus) || (!!urlProjekt && urlProjekt !== entwurf.projektId));
    return { urlModus, urlProjekt, urlLager, entwurf, gemerkt, konflikt };
  });
  const e0 = anfang.entwurf;

  const [modus, setModus] = useState<Modus>(e0?.modus ?? anfang.urlModus ?? "ausfassung");
  const [projektId, setProjektId] = useState(e0 ? e0.projektId : anfang.urlProjekt || anfang.gemerkt);
  const [lagerortId, setLagerortId] = useState(e0?.lagerortId || anfang.urlLager);
  const [notiz, setNotiz] = useState(e0?.notiz ?? "");
  const [wiederhergestellt, setWiederhergestellt] = useState<{ zeit: number; konflikt: boolean } | null>(
    e0 ? { zeit: e0.zeit, konflikt: anfang.konflikt } : null,
  );

  // Die Liste lebt zusätzlich in einer Ref: Scans kommen schneller, als React rendert.
  const listeRef = useRef<Zeile[]>(e0?.liste ?? []);
  const [liste, setListe] = useState<Zeile[]>(listeRef.current);
  const vorgangRef = useRef(e0?.vorgang ?? neueId());
  const [markiert, setMarkiert] = useState<string | null>(null);

  const [scanOffen, setScanOffenZustand] = useState(false);
  const scanOffenRef = useRef(false);
  const [sucheOffen, setSucheOffen] = useState(false);
  const [zuletztGesucht, setZuletztGesucht] = useState("");
  const [freiOffen, setFreiOffen] = useState(false);
  const [unbekannt, setUnbekannt] = useState<string[]>([]);
  const nachUnbekanntScannen = useRef(false);
  const [wechselZu, setWechselZu] = useState<Modus | null>(null);
  const [vorschau, setVorschau] = useState<{ diffs: Differenz[]; gleich: number } | null>(null);
  const [bucht, setBucht] = useState(false);
  const [laedtBestand, setLaedtBestand] = useState(false);

  const codeCache = useRef(new Map<string, { artikel: ArtikelKurz; menge: number }>());
  const artikelCache = useRef(new Map<string, ArtikelKurz>());

  const info = MODI[modus];
  const projekt = projekte.find((p) => p.id === projektId);
  const lagerort = orte.find((o) => o.id === lagerortId);

  const bestandAbfrage = useBestandAmLagerort(info.lager && lagerortId ? lagerortId : null);
  const bestand = bestandAbfrage.data;
  const { data: projektMaterial } = useProjektMaterial(modus === "rueckgabe" && projektId ? projektId : null);
  const verbrauchtJeArtikel = useMemo(() => {
    const m = new Map<string, number>();
    (projektMaterial ?? []).forEach((z) => {
      if (z.artikel_id) m.set(z.artikel_id, (m.get(z.artikel_id) ?? 0) + Number(z.verbraucht ?? 0));
    });
    return m;
  }, [projektMaterial]);

  const setScanOffen = (o: boolean) => {
    scanOffenRef.current = o;
    setScanOffenZustand(o);
  };

  const listeAendern = useCallback((fn: (alt: Zeile[]) => Zeile[]) => {
    const neu = fn(listeRef.current);
    // leer = Durchgang zu Ende; der nächste bekommt eine neue Vorgangs-ID
    if (!neu.length && listeRef.current.length) vorgangRef.current = neueId();
    listeRef.current = neu;
    setListe(neu);
    return neu;
  }, []);

  // URL zeigt Modus und Projekt — Zurück/Neuladen landet wieder hier
  useEffect(() => {
    const neu = new URLSearchParams();
    neu.set("modus", modus);
    if (MODI[modus].projekt && projektId) neu.set("projekt", projektId);
    if (neu.toString() !== params.toString()) setParams(neu, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modus, projektId]);

  // Lagerort vorbelegen: mein Bus, sonst Hauptlager
  useEffect(() => {
    if (!orte.length) return;
    if (lagerortId && orte.some((o) => o.id === lagerortId)) return;
    const std = standardLagerort(orte, uid);
    if (std) setLagerortId(std.id);
  }, [orte, lagerortId, uid]);

  // Gemerktes Projekt nur, wenn es das noch gibt (und es nicht abgeschlossen ist)
  const projektGeprueft = useRef(false);
  useEffect(() => {
    if (projektGeprueft.current || !projekteDa) return;
    projektGeprueft.current = true;
    if (!projektId) return;
    const p = projekte.find((x) => x.id === projektId);
    const nurGemerkt = !e0 && !anfang.urlProjekt;
    if (!p || (nurGemerkt && p.status === "abgeschlossen")) setProjektId("");
  }, [projekteDa, projekte, projektId, e0, anfang.urlProjekt]);

  // Nicht gebuchte Liste sichern
  useEffect(() => {
    if (!uid) return;
    try {
      if (!liste.length) {
        localStorage.removeItem(entwurfKey(uid));
      } else {
        const e: Entwurf = { v: 1, modus, projektId, lagerortId, liste, notiz, vorgang: vorgangRef.current, zeit: Date.now() };
        localStorage.setItem(entwurfKey(uid), JSON.stringify(e));
      }
    } catch {
      /* Speicher voll oder gesperrt — dann eben ohne Sicherung */
    }
  }, [uid, liste, notiz, modus, projektId, lagerortId]);

  const projektMerken = (id: string) => {
    if (!uid || !id) return;
    try {
      localStorage.setItem(projektKey(uid), id);
    } catch {
      /* egal */
    }
  };

  // ── Liste ────────────────────────────────────────────────────────────

  /** Artikel dazu (oder Menge erhöhen). Gibt die Zeile danach zurück. */
  const artikelDazu = useCallback((a: ArtikelKurz, menge: number): Zeile => {
    const kurz = zuArtikelKurz(a);
    const alt = listeRef.current;
    const i = alt.findIndex((z) => z.schluessel === kurz.id);
    let zeile: Zeile;
    let neu: Zeile[];
    if (i < 0) {
      zeile = {
        schluessel: kurz.id, artikel: kurz, bezeichnung: kurz.bezeichnung, einheit: kurz.einheit || "Stk",
        menge: mengeEingabe(menge), ek_preis: null,
      };
      neu = [zeile, ...alt];
    } else {
      const z = alt[i];
      // Inventur: aus dem Bestand übernommen → der erste Scan zählt von vorn
      const basis = z.vorbelegt ? 0 : Math.max(0, zahlLesen(z.menge));
      zeile = {
        ...z, artikel: kurz, bezeichnung: kurz.bezeichnung, einheit: kurz.einheit || z.einheit,
        menge: mengeEingabe(runden3(basis + menge)), vorbelegt: false,
      };
      neu = alt.slice();
      neu[i] = zeile;
    }
    listeAendern(() => neu);
    setMarkiert(kurz.id);
    return zeile;
  }, [listeAendern]);

  const mengeSetzen = (schluessel: string, text: string) => {
    listeAendern((alt) => alt.map((z) => (z.schluessel === schluessel ? { ...z, menge: text, vorbelegt: false } : z)));
  };

  const entfernen = (schluessel: string) => {
    const alt = listeRef.current;
    const i = alt.findIndex((z) => z.schluessel === schluessel);
    if (i < 0) return;
    const z = alt[i];
    const vorgang = vorgangRef.current;
    listeAendern((l) => l.filter((x) => x.schluessel !== schluessel));
    toast("Entfernt", {
      description: z.bezeichnung,
      action: {
        label: "Rückgängig",
        onClick: () => {
          if (listeRef.current.some((x) => x.schluessel === z.schluessel)) return;
          const war = listeRef.current.length;
          listeAendern((l) => [...l.slice(0, i), z, ...l.slice(i)]);
          if (!war) vorgangRef.current = vorgang;
        },
      },
    });
  };

  const listeVerwerfen = () => {
    const alt = { liste: listeRef.current, notiz, vorgang: vorgangRef.current };
    if (!alt.liste.length) return;
    listeAendern(() => []);
    setNotiz("");
    setWiederhergestellt(null);
    setMarkiert(null);
    toast("Liste verworfen", {
      description: `${alt.liste.length} ${alt.liste.length === 1 ? "Position" : "Positionen"}`,
      action: {
        label: "Rückgängig",
        onClick: () => {
          if (listeRef.current.length) return;
          listeAendern(() => alt.liste);
          vorgangRef.current = alt.vorgang;
          setNotiz(alt.notiz);
        },
      },
    });
  };

  /** Banner „Liste von vorhin“: verwerfen — bei abweichendem Aufruf gilt dann die URL */
  const entwurfVerwerfen = () => {
    listeAendern(() => []);
    setNotiz("");
    setMarkiert(null);
    if (wiederhergestellt?.konflikt) {
      if (anfang.urlModus) setModus(anfang.urlModus);
      if (anfang.urlProjekt) setProjektId(anfang.urlProjekt);
    }
    setWiederhergestellt(null);
  };

  const modusWaehlen = (neu: Modus) => {
    if (neu === modus) return;
    // Inventur zählt den Bestand, sonst zählt die Liste, was bewegt wird — mischen geht nicht
    const inventurWechsel = (neu === "korrektur") !== (modus === "korrektur");
    if (inventurWechsel && listeRef.current.length) {
      setWechselZu(neu);
      return;
    }
    setModus(neu);
  };

  // ── Scannen ──────────────────────────────────────────────────────────

  const rueckmeldung = (z: Zeile, packung: number): ScanRueckmeldung => {
    const n = zahlLesen(z.menge);
    const plus = packung !== 1 ? `+${zahl(packung)} · ` : "";
    if (modus === "korrektur") return { text: z.bezeichnung, unter: `${plus}gezählt: ${mengeText(n, z.einheit)}` };
    if (modus === "rueckgabe" && z.artikel && projektId) {
      const v = verbrauchtJeArtikel.get(z.artikel.id) ?? 0;
      if (n > v) {
        return {
          text: z.bezeichnung,
          unter: `${plus}${mengeText(n, z.einheit)} — ${v > 0 ? `nur ${zahl(v)} ausgefasst` : "hier nicht ausgefasst"}`,
          ton: "warnung",
        };
      }
    }
    return { text: z.bezeichnung, unter: `${plus}jetzt ${mengeText(n, z.einheit)} in der Liste` };
  };

  const unbekanntMelden = (code: string) => {
    // Scanner zu, Dialog auf — danach geht es mit dem Scanner weiter
    if (scanOffenRef.current) {
      nachUnbekanntScannen.current = true;
      setScanOffen(false);
    }
    setUnbekannt((q) => (q.includes(code) ? q : [...q, code]));
  };

  const codeVerarbeiten = async (roh: string): Promise<ScanRueckmeldung | null> => {
    const code = codeBereinigen(roh);
    if (!code) return null;
    let treffer = codeCache.current.get(code);
    if (!treffer) {
      try {
        const gefunden = await artikelZuCode(roh);
        let a = gefunden ? artikelCache.current.get(gefunden.artikel_id) ?? null : null;
        if (gefunden && !a) {
          a = await artikelKurzLaden(gefunden.artikel_id);
          if (a) artikelCache.current.set(a.id, a);
        }
        if (!gefunden || !a) {
          unbekanntMelden(code);
          return { text: "Code unbekannt", unter: code, ton: "warnung" };
        }
        treffer = { artikel: a, menge: gefunden.menge };
        codeCache.current.set(code, treffer);
      } catch (e) {
        return { text: "Nicht erkannt", unter: fehlerText(e), ton: "warnung" };
      }
    }
    const z = artikelDazu(treffer.artikel, treffer.menge);
    return rueckmeldung(z, treffer.menge);
  };

  const unbekanntWeiter = () => {
    const rest = unbekannt.slice(1);
    setUnbekannt(rest);
    if (!rest.length && nachUnbekanntScannen.current) {
      nachUnbekanntScannen.current = false;
      // erst den Dialog zugehen lassen, sonst streiten zwei Dialoge um den Fokus
      window.setTimeout(() => setScanOffen(true), 250);
    }
  };

  const unbekanntGeloest = (a: ArtikelKurz, menge: number) => {
    const code = unbekannt[0];
    const kurz = zuArtikelKurz(a);
    if (code) codeCache.current.set(code, { artikel: kurz, menge });
    artikelCache.current.set(kurz.id, kurz);
    artikelDazu(kurz, menge);
    unbekanntWeiter();
  };

  const freiDazu = (p: FreiePosition) => {
    const schluessel = `frei:${neueId()}`;
    listeAendern((alt) => [{
      schluessel, artikel: null, bezeichnung: p.bezeichnung, einheit: p.einheit,
      menge: mengeEingabe(p.menge), ek_preis: p.ek_preis,
    }, ...alt]);
    setMarkiert(schluessel);
    setFreiOffen(false);
  };

  /** Inventur: alles, was laut App am Lagerort liegt, als Zählliste */
  const bestandLaden = async () => {
    if (!lagerortId) return toast.error("Bitte zuerst den Lagerort wählen.");
    setLaedtBestand(true);
    try {
      type Z = { artikel_id: string; bestand: number; artikel: ArtikelKurz | null };
      const zeilen = await alleSeiten<Z>((von, bis) =>
        supabase.from("lagerbestand")
          .select(`artikel_id, bestand, artikel(${ARTIKEL_KURZ})`)
          .eq("lagerort_id", lagerortId)
          .neq("bestand", 0)
          .order("artikel_id")
          .range(von, bis) as unknown as PromiseLike<{ data: Z[] | null; error: unknown }>);
      const da = new Set(listeRef.current.map((z) => z.schluessel));
      const neu: Zeile[] = zeilen
        .filter((z) => z.artikel && !da.has(z.artikel_id))
        .sort((a, b) => a.artikel!.bezeichnung.localeCompare(b.artikel!.bezeichnung, "de"))
        .map((z) => ({
          schluessel: z.artikel_id, artikel: zuArtikelKurz(z.artikel!), bezeichnung: z.artikel!.bezeichnung,
          einheit: z.artikel!.einheit || "Stk", menge: mengeEingabe(Math.max(0, Number(z.bestand) || 0)),
          ek_preis: null, vorbelegt: true,
        }));
      if (!neu.length) {
        toast.success("Nichts dazugekommen", { description: "Alle Artikel mit Bestand stehen schon in der Liste." });
        return;
      }
      listeAendern((alt) => [...alt, ...neu]);
      toast.success(`${neu.length} Artikel aus dem Bestand übernommen`, { description: "Zählen: scannen oder Menge eintippen." });
    } catch (e) {
      toast.error("Bestand nicht geladen", { description: fehlerText(e) });
    } finally {
      setLaedtBestand(false);
    }
  };

  // ── Buchen ───────────────────────────────────────────────────────────

  const pruefen = (): boolean => {
    if (info.projekt && !projektId) {
      toast.error("Bitte zuerst das Projekt wählen.");
      return false;
    }
    if (info.lager && !lagerortId) {
      toast.error("Bitte einen Lagerort wählen.");
      return false;
    }
    const l = listeRef.current;
    if (!l.length) return false;
    const frei = l.find((z) => !z.artikel);
    if (frei && modus !== "direkt") {
      toast.error("Position ohne Artikel", { description: `„${frei.bezeichnung}“ geht nur bei „Direkt“ — bitte entfernen.` });
      return false;
    }
    const falsch = l.find((z) => !mengeGueltig(z.menge) || (modus !== "korrektur" && !(runden3(zahlLesen(z.menge)) > 0)));
    if (falsch) {
      toast.error(modus === "korrektur" ? "Gezählte Menge fehlt" : "Menge fehlt", { description: falsch.bezeichnung });
      setMarkiert(falsch.schluessel);
      return false;
    }
    return true;
  };

  /** EK je Artikel: der Preis-Schnappschuss gilt beim Buchen, nicht beim Scannen. */
  const aktuelleEk = async (ids: string[]) => {
    const karte = new Map<string, number | null>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from("artikel").select("id, ek_preis").in("id", ids.slice(i, i + 100));
      if (error) break; // dann eben der EK aus der Liste
      (data ?? []).forEach((a) => karte.set(a.id, a.ek_preis));
    }
    return (z: Zeile): number | null => {
      if (!z.artikel) return z.ek_preis;
      const ek = karte.has(z.artikel.id) ? karte.get(z.artikel.id) : z.artikel.ek_preis;
      return ek ?? null;
    };
  };

  /**
   * EIN Sammel-Insert für den ganzen Durchgang. Vorher die Probe, ob der
   * Vorgang schon da ist: Funkloch nach dem Absenden → die Liste blieb
   * stehen, die Buchung ist aber angekommen. Dann nicht noch einmal.
   */
  const sammelBuchen = async (zeilen: Zeile[], bauen: (z: Zeile, ek: number | null) => BuchungNeu) => {
    const vorgang = vorgangRef.current;
    const art = modus;
    const p = projekt;
    setBucht(true);
    try {
      const ekFuer = await aktuelleEk([...new Set(zeilen.flatMap((z) => (z.artikel ? [z.artikel.id] : [])))]);
      const { count, error: pruefFehler } = await supabase.from("material_buchungen")
        .select("id", { count: "exact", head: true }).eq("vorgang", vorgang);
      if (pruefFehler) throw pruefFehler;
      if ((count ?? 0) > 0) {
        toast.success("Diese Liste ist schon gebucht", { description: "Der letzte Versuch ist doch angekommen." });
      } else {
        const { error } = await supabase.from("material_buchungen").insert(zeilen.map((z) => bauen(z, ekFuer(z))));
        if (error) throw error;
        const n = zeilen.length;
        toast.success(`${MODI[art].gebucht} · ${n} ${n === 1 ? "Position" : "Positionen"}`, {
          description: MODI[art].projekt && p ? `${p.nummer} · ${p.name}` : lagerort?.name,
          action: MODI[art].projekt && p ? { label: "Zum Projekt", onClick: () => navigate(`/projekte/${p.id}`) } : undefined,
        });
      }
      if (MODI[art].projekt && p) projektMerken(p.id);
      listeAendern(() => []);
      setNotiz("");
      setVorschau(null);
      setWiederhergestellt(null);
      setMarkiert(null);
      void neuLaden("material", "lager", "projekt_zahlen");
    } catch (e) {
      toast.error("Nicht gebucht", { description: `${fehlerText(e)} Die Liste bleibt erhalten.` });
    } finally {
      setBucht(false);
    }
  };

  const buchen = async () => {
    if (bucht || !pruefen()) return;
    if (modus === "korrektur") return inventurPruefen();
    const text = notiz.trim() || null;
    // Sammel-Insert: JEDE Zeile mit denselben Feldern (sonst NULL statt Standardwert)
    await sammelBuchen(listeRef.current, (z, ek) => ({
      art: modus,
      artikel_id: z.artikel?.id ?? null,
      bezeichnung: z.bezeichnung,
      einheit: z.einheit,
      menge: runden3(zahlLesen(z.menge)),
      lagerort_id: modus === "direkt" ? null : lagerortId,
      projekt_id: info.projekt ? projektId : null,
      regiebericht_id: null,
      ek_preis: ek,
      vorgang: vorgangRef.current,
      notiz: text,
      user_id: uid,
    }));
  };

  /** Inventur: Bestand frisch holen, Differenzen zeigen — gebucht wird erst nach Bestätigung. */
  const inventurPruefen = async () => {
    setBucht(true);
    const r = await bestandAbfrage.refetch();
    setBucht(false);
    if (r.error || !r.data) {
      toast.error("Bestand nicht geladen", { description: fehlerText(r.error) });
      return;
    }
    const karte = r.data;
    const alle = listeRef.current.filter((z) => z.artikel).map((z) => {
      const ist = runden3(karte.get(z.artikel!.id) ?? 0);
      const gezaehlt = runden3(zahlLesen(z.menge));
      return { zeile: z, ist, gezaehlt, diff: runden3(gezaehlt - ist) };
    });
    const diffs = alle.filter((d) => d.diff !== 0);
    if (!diffs.length) {
      toast.success("Alles stimmt", { description: "Gezählt = Bestand laut App. Es gibt nichts zu buchen." });
      return;
    }
    setVorschau({ diffs, gleich: alle.length - diffs.length });
  };

  const inventurBuchen = async () => {
    if (!vorschau || bucht) return;
    const text = notiz.trim() || null;
    const diffJeZeile = new Map(vorschau.diffs.map((d) => [d.zeile.schluessel, d.diff]));
    // Korrektur = gezählt − Bestand, mit Vorzeichen; nur Zeilen mit Differenz
    await sammelBuchen(vorschau.diffs.map((d) => d.zeile), (z, ek) => ({
      art: "korrektur",
      artikel_id: z.artikel!.id,
      bezeichnung: z.bezeichnung,
      einheit: z.einheit,
      menge: diffJeZeile.get(z.schluessel) ?? 0,
      lagerort_id: lagerortId,
      projekt_id: null,
      regiebericht_id: null,
      ek_preis: ek,
      vorgang: vorgangRef.current,
      notiz: text,
      user_id: uid,
    }));
  };

  // ── Anzeige ──────────────────────────────────────────────────────────

  const n = liste.length;
  const positionen = `${n} ${n === 1 ? "Position" : "Positionen"}`;
  const projektText = projekt ? `${projekt.nummer} ${projekt.name}` : "Projekt fehlt";
  const lagerText = lagerort?.name ?? "Lagerort fehlt";
  const ziel = {
    ausfassung: `${lagerText} → ${projektText}`,
    rueckgabe: `${projektText} → ${lagerText}`,
    direkt: `→ ${projektText}`,
    zugang: `→ ${lagerText}`,
    korrektur: `Inventur · ${lagerText}`,
  }[modus];
  const scanTitel = `${info.kurz}${info.projekt ? (projekt ? ` · ${projekt.nummer}` : "") : lagerort ? ` · ${lagerort.name}` : ""}`;
  const sichtbareModi = REIHENFOLGE.filter((m) => istChef || !MODI[m].nurChef);
  const zweiterKnopf = modus === "direkt" || modus === "korrektur";

  return (
    <Seite
      titel="Material"
      untertitel={info.erklaerung}
      aktionen={
        <Button asChild variant="ghost" className="h-10 gap-2 px-2.5">
          <Link to="/lager" aria-label="Lager und Bestand">
            <Warehouse className="h-5 w-5" />
            <span className="hidden sm:inline">Lager</span>
          </Link>
        </Button>
      }
    >
      {wiederhergestellt && n > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary-soft p-3">
          <p className="font-medium">Nicht gebuchte Liste von {zeitpunktText(wiederhergestellt.zeit)}</p>
          <p className="text-sm text-muted-foreground">
            {positionen} · {info.kurz}{info.projekt && projekt ? ` · ${projekt.nummer} ${projekt.name}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => setWiederhergestellt(null)}>Damit weitermachen</Button>
            <Button variant="outline" className="h-11 bg-card" onClick={entwurfVerwerfen}>
              {wiederhergestellt.konflikt ? "Verwerfen und neu beginnen" : "Verwerfen"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-5">
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Was wird gebucht?"
              className={cn("grid gap-1 rounded-lg border bg-secondary p-1", istChef ? "grid-cols-6" : "grid-cols-3")}>
              {sichtbareModi.map((m, i) => (
                <button key={m} type="button" role="radio" aria-checked={modus === m} onClick={() => modusWaehlen(m)}
                  className={cn(
                    "h-11 min-w-0 truncate rounded-md px-1 text-sm font-medium transition-colors",
                    istChef && (i < 3 ? "col-span-2" : "col-span-3"),
                    modus === m ? "bg-card font-semibold text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground",
                  )}>
                  {MODI[m].kurz}
                </button>
              ))}
            </div>
          </div>

          {info.projekt && (
            <div className="space-y-2">
              <Label htmlFor="scan-projekt">Projekt</Label>
              <ProjektWahl id="scan-projekt" wert={projektId} onChange={(id) => { setProjektId(id); projektMerken(id); }} />
            </div>
          )}

          {info.lager && (
            <div className="space-y-2">
              <Label>{info.lagerFrage}</Label>
              <div className="flex flex-wrap gap-2">
                {orte.map((o) => (
                  <button key={o.id} type="button" onClick={() => setLagerortId(o.id)} aria-pressed={lagerortId === o.id}
                    className={cn("h-11 max-w-full truncate rounded-full border px-4 text-sm font-medium transition-colors",
                      lagerortId === o.id ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                    {o.name}
                  </button>
                ))}
              </div>
              {!orte.length && !orteLaden && (
                <p className="text-sm text-muted-foreground">
                  Noch kein Lagerort angelegt{istChef ? " — unter „Lager“ anlegen." : " — der Chef legt sie unter „Lager“ an."}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Button className="h-14 w-full text-base" onClick={() => setScanOffen(true)}>
              <ScanBarcode className="mr-2 h-5 w-5" /> Scannen
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className={cn("h-12", !zweiterKnopf && "col-span-2")}
                onClick={() => { setZuletztGesucht(""); setSucheOffen(true); }}>
                <Search className="mr-2 h-4 w-4" /> Artikel suchen
              </Button>
              {modus === "direkt" && (
                <Button variant="outline" className="h-12" onClick={() => setFreiOffen(true)}>
                  <PencilLine className="mr-2 h-4 w-4" /> Ohne Artikel
                </Button>
              )}
              {modus === "korrektur" && (
                <Button variant="outline" className="h-12" onClick={() => void bestandLaden()} disabled={laedtBestand || !lagerortId}>
                  {laedtBestand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
                  Bestand laden
                </Button>
              )}
            </div>
            {modus === "korrektur" && (
              <p className="text-xs text-muted-foreground">
                In der Liste steht, was gezählt wurde. Gebucht wird nur die Differenz zum Bestand laut App.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Abschnitt
            titel={modus === "korrektur" ? `Gezählt${n ? ` · ${n}` : ""}` : `Liste${n ? ` · ${n}` : ""}`}
            aktion={n > 0 ? (
              <Button variant="ghost" className="h-11 text-muted-foreground" onClick={listeVerwerfen}>Liste verwerfen</Button>
            ) : undefined}
          >
            {n ? (
              <div className="divide-y rounded-lg border bg-card">
                {liste.map((z) => (
                  <ZeileAnzeige
                    key={z.schluessel}
                    z={z}
                    modus={modus}
                    markiert={markiert === z.schluessel}
                    bestand={z.artikel && info.lager ? bestand?.get(z.artikel.id) ?? (bestand ? 0 : undefined) : undefined}
                    verbraucht={z.artikel && modus === "rueckgabe" && projektMaterial ? verbrauchtJeArtikel.get(z.artikel.id) ?? 0 : undefined}
                    lagerName={lagerort?.name}
                    onMenge={(t) => mengeSetzen(z.schluessel, t)}
                    onEntfernen={() => entfernen(z.schluessel)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card">
                <Leer icon={ScanBarcode}
                  text={modus === "korrektur" ? "Noch nichts gezählt. Scannen oder „Bestand laden“." : "Noch nichts in der Liste. Scannen oder Artikel suchen."} />
              </div>
            )}
          </Abschnitt>

          {n > 0 && (
            <div className="space-y-2">
              <Label htmlFor="scan-notiz">Notiz <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="scan-notiz" className="h-11" value={notiz} onChange={(e) => setNotiz(e.target.value)}
                placeholder={modus === "zugang" ? "z. B. Lieferschein 4711" : modus === "korrektur" ? "z. B. Jahresinventur" : "z. B. für den Zählerkasten"} />
            </div>
          )}

          {n > 0 && (
            <div className="sticky bottom-0 z-10 -mx-3 border-t bg-background px-3 pt-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:rounded-lg lg:border lg:bg-card lg:px-4"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              <p className="mb-2 truncate text-xs text-muted-foreground">{ziel}</p>
              <Button className="h-12 w-full text-base" onClick={() => void buchen()} disabled={bucht}>
                {bucht ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
                {modus === "korrektur" ? "Differenzen prüfen" : `${positionen} ${info.verb}`}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ScanDialog
        open={scanOffen}
        onOpenChange={(o) => {
          if (!o) nachUnbekanntScannen.current = false;
          setScanOffen(o);
        }}
        onCode={codeVerarbeiten}
        dauerhaft
        titel={scanTitel}
        anzahl={n}
      />

      <CodeUnbekanntDialog
        code={unbekannt[0] ?? null}
        open={unbekannt.length > 0}
        onOpenChange={(o) => { if (!o) unbekanntWeiter(); }}
        onFertig={unbekanntGeloest}
        lagerartikel={modus !== "direkt"}
        abbrechenText="Überspringen"
      />

      <FreiePositionDialog open={freiOffen} onOpenChange={setFreiOffen} onFertig={freiDazu} />

      <FormularDialog
        open={sucheOffen}
        onOpenChange={setSucheOffen}
        titel="Artikel suchen"
        beschreibung="Antippen legt den Artikel in die Liste — mehrmals tippen zählt hoch."
        fuss={<Button className="h-11 min-w-40" onClick={() => setSucheOffen(false)}>Fertig</Button>}
      >
        <div className="max-w-2xl space-y-3">
          {zuletztGesucht && (
            <p className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft px-3 py-2 text-sm" aria-live="polite">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 truncate">{zuletztGesucht}</span>
            </p>
          )}
          <ArtikelSuche
            autoFocus
            listeKlasse="max-h-[60dvh]"
            onWahl={(a) => {
              const z = artikelDazu(a, 1);
              setZuletztGesucht(`${z.bezeichnung} · ${modus === "korrektur" ? "gezählt" : "jetzt"} ${mengeText(zahlLesen(z.menge), z.einheit)}`);
            }}
          />
        </div>
      </FormularDialog>

      <FormularDialog
        open={!!vorschau}
        onOpenChange={(o) => { if (!o && !bucht) setVorschau(null); }}
        titel="Inventur buchen"
        beschreibung={`${lagerText} · ${vorschau?.diffs.length ?? 0} ${vorschau?.diffs.length === 1 ? "Artikel weicht" : "Artikel weichen"} vom Bestand ab`}
        gesperrt={bucht}
        fuss={
          <>
            <Button variant="outline" className="h-11" onClick={() => setVorschau(null)} disabled={bucht}>Zurück</Button>
            <Button className="h-11 min-w-48" onClick={() => void inventurBuchen()} disabled={bucht}>
              {bucht && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {vorschau?.diffs.length === 1 ? "1 Korrektur buchen" : `${vorschau?.diffs.length ?? 0} Korrekturen buchen`}
            </Button>
          </>
        }
      >
        <div className="max-w-2xl space-y-3">
          <div className="divide-y rounded-lg border bg-card">
            {vorschau?.diffs.map((d) => (
              <div key={d.zeile.schluessel} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{d.zeile.bezeichnung}</p>
                  <p className="text-xs text-muted-foreground">
                    laut App <span className="zahl">{zahl(d.ist)}</span> → gezählt <span className="zahl">{zahl(d.gezaehlt)}</span> {d.zeile.einheit}
                  </p>
                </div>
                <span className={cn("zahl shrink-0 text-right font-semibold", d.diff < 0 && "text-destructive")}>
                  {d.diff > 0 ? "+" : "−"}{zahl(Math.abs(d.diff))} {d.zeile.einheit}
                </span>
              </div>
            ))}
          </div>
          {!!vorschau?.gleich && (
            <p className="text-sm text-muted-foreground">
              {vorschau.gleich} {vorschau.gleich === 1 ? "Artikel stimmt" : "Artikel stimmen"} und {vorschau.gleich === 1 ? "wird" : "werden"} nicht gebucht.
            </p>
          )}
        </div>
      </FormularDialog>

      <AlertDialog open={!!wechselZu} onOpenChange={(o) => { if (!o) setWechselZu(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{wechselZu === "korrektur" ? "Zur Inventur wechseln?" : "Inventur verlassen?"}</AlertDialogTitle>
            <AlertDialogDescription>
              Bei der Inventur steht in der Liste, was gezählt wurde — sonst, was bewegt wird. Die {positionen} in der Liste werden deshalb verworfen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => {
              if (!wechselZu) return;
              listeAendern(() => []);
              setNotiz("");
              setWiederhergestellt(null);
              setMarkiert(null);
              setModus(wechselZu);
              setWechselZu(null);
            }}>
              Liste verwerfen und wechseln
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Seite>
  );
}

/** Eine Zeile der Liste — Handy: Name oben, Menge darunter; ab Tablet in einer Reihe. */
function ZeileAnzeige({
  z, modus, markiert, bestand, verbraucht, lagerName, onMenge, onEntfernen,
}: {
  z: Zeile;
  modus: Modus;
  markiert: boolean;
  /** Bestand am gewählten Lagerort (undefined = unbekannt) */
  bestand: number | undefined;
  /** Rückgabe: was auf dem Projekt verbraucht ist */
  verbraucht: number | undefined;
  lagerName?: string;
  onMenge: (text: string) => void;
  onEntfernen: () => void;
}) {
  const n = zahlLesen(z.menge);
  let hinweis: ReactNode = null;
  if (!z.artikel && modus !== "direkt") {
    hinweis = <StatusPille eintrag={{ ton: "gelb", text: "nur bei „Direkt“ möglich" }} />;
  } else if (modus === "korrektur" && z.artikel) {
    const ist = bestand ?? 0;
    const diff = runden3(n - ist);
    hinweis = (
      <p className="text-xs text-muted-foreground">
        laut App <span className="zahl">{zahl(ist)}</span>
        {z.vorbelegt ? " · noch nicht gezählt" : diff === 0 ? " · stimmt" : (
          <> · <span className={cn("zahl font-semibold", diff < 0 ? "text-destructive" : "text-foreground")}>
            {diff > 0 ? "+" : "−"}{zahl(Math.abs(diff))}
          </span></>
        )}
      </p>
    );
  } else if (modus === "rueckgabe" && z.artikel && verbraucht !== undefined && n > verbraucht) {
    hinweis = <StatusPille eintrag={{ ton: "gelb", text: verbraucht > 0 ? `nur ${zahl(verbraucht)} ausgefasst` : "hier nicht ausgefasst" }} />;
  } else if (modus === "ausfassung" && z.artikel && bestand !== undefined && n > bestand) {
    hinweis = (
      <p className="text-xs text-muted-foreground">
        laut App {bestand > 0 ? <>nur <span className="zahl">{zahl(bestand)}</span></> : "nichts"} {lagerName ? `in „${lagerName}“` : "da"}
      </p>
    );
  }
  const info = z.artikel ? artikelInfo(z.artikel) : "ohne Artikelstamm";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 p-3 transition-colors", markiert && "bg-primary-soft")}>
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <p className="line-clamp-2 font-medium leading-snug">{z.bezeichnung}</p>
        {info && <p className="truncate text-xs text-muted-foreground">{info}</p>}
        {hinweis && <div className="mt-1">{hinweis}</div>}
      </div>
      <div className="flex items-center gap-2">
        <MengeFeld wert={z.menge} onChange={onMenge} min={modus === "korrektur" ? 0 : 1}
          beschriftung={modus === "korrektur" ? `Gezählt ${z.bezeichnung}` : `Menge ${z.bezeichnung}`} />
        <span className="w-10 truncate text-sm text-muted-foreground">{z.einheit}</span>
      </div>
      <Button variant="ghost" size="icon" className="ml-auto h-11 w-11 shrink-0 text-muted-foreground sm:ml-0"
        onClick={onEntfernen} aria-label={`${z.bezeichnung} entfernen`}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
