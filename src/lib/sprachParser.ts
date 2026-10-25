/**
 * Spracheingabe → Angebotspositionen („Angebot vor Ort“).
 *
 *   „Küche: 6 Steckdosen, 2 Wechselschalter, 1 Herdanschluss. Wohnzimmer drei
 *    Doppelsteckdosen und eine Netzwerkdose, 20 Meter Leerrohr“
 *
 *   → Küche       6 × Steckdose UP komplett, 2 × Wechselschalter, 1 × Herdanschluss
 *     Wohnzimmer  3 × Doppelsteckdose, 1 × Netzwerkdose, 20 m Leerverrohrung
 *
 * Bewusst ohne KI und ohne Server: Zahlwörter, Einheiten, Raumwörter und eine
 * Punktwertung gegen Kurztext + Suchwörter des Leistungskatalogs. Das Ergebnis
 * ist immer nur ein Vorschlag — übernommen wird erst, wenn der Chef bestätigt.
 *
 * Die Spracherkennung liefert meist keine Satzzeichen. Deshalb beginnt jede
 * gesagte Menge einen neuen Posten, und ein Raumwort vor einer Menge beginnt
 * einen neuen Raum — auch mitten im Satz.
 */

export type KatalogEintrag = {
  id: string;
  kurztext: string;
  suchwoerter?: string | null;
  einheit?: string | null;
  reihenfolge?: number | null;
};

export type SprachPosten = {
  /** stabil, solange sich der Text davor nicht ändert */
  key: string;
  /** Raum/Titel, unter dem der Posten landet */
  raum: string | null;
  menge: number;
  /** false = keine Menge gesagt, 1 angenommen */
  mengeGesagt: boolean;
  /** gesagte Einheit (m, Stk, h, Psch, m²) */
  einheit: string | null;
  /** was gesagt wurde, z. B. „6 Steckdosen“ */
  text: string;
  /** dasselbe ohne Menge und Einheit („Steckdosen“) — Bezeichnung einer freien Position */
  beschreibung: string;
  /** erkannte Leistung — null = nicht erkannt */
  leistungId: string | null;
  punkte: number;
  /** weitere passende Leistungen, beste zuerst */
  alternativen: string[];
};

// ── Wörter vereinheitlichen ─────────────────────────────────────────────

/** Kleinschreibung, Umlaute ausgeschrieben, ß → ss: „Küche“ und „Kueche“ sind gleich. */
export function normalisieren(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Grober Wortstamm für den Vergleich: „Steckdosen“ = „Steckdose“,
 * „Schaltern“ = „Schalter“, „Anschlüsse“ = „Anschluss“. Wird auf beiden
 * Seiten (Gesagtes und Katalog) gleich angewendet — es muss nur gleich
 * falsch sein, nicht sprachlich richtig.
 */
export function stamm(wort: string): string {
  const w = normalisieren(wort).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
  if (w.length <= 4 || /\d/.test(w)) return w;
  for (const s of ["ern", "en", "er", "es", "e", "n", "s"]) {
    if (!w.endsWith(s) || w.length - s.length < 4) continue;
    if (s === "s" && w.endsWith("ss")) continue;
    return w.slice(0, -s.length);
  }
  return w;
}

// ── Zahlwörter ──────────────────────────────────────────────────────────

const EIN_WOERTER = new Set(["ein", "eine", "einen", "einem", "einer", "eins"]);
const EINER: Record<string, number> = {
  null: 0, ein: 1, eins: 1, eine: 1, einen: 1, einem: 1, einer: 1,
  zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
};
const BIS_NEUNZEHN: Record<string, number> = {
  zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15,
  sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
};
const ZEHNER: Record<string, number> = {
  zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};

function unterHundert(w: string): number | null {
  if (w in EINER) return EINER[w];
  if (w in BIS_NEUNZEHN) return BIS_NEUNZEHN[w];
  if (w in ZEHNER) return ZEHNER[w];
  const und = w.indexOf("und");
  if (und > 0) {
    const e = EINER[w.slice(0, und)];
    const z = ZEHNER[w.slice(und + 3)];
    if (e != null && e > 0 && z != null) return e + z;
  }
  return null;
}

function unterTausend(w: string): number | null {
  const h = w.indexOf("hundert");
  if (h < 0) return unterHundert(w);
  const links = w.slice(0, h);
  const rechts = w.slice(h + 7).replace(/^und/, "");
  const l = links ? unterHundert(links) : 1;
  const r = rechts ? unterHundert(rechts) : 0;
  if (l == null || r == null || l < 1 || l > 9) return null;
  return l * 100 + r;
}

/** „sechs“ → 6, „einundzwanzig“ → 21, „zweihundertfünfzig“ → 250, „eineinhalb“ → 1,5 — sonst null. */
export function zahlwortLesen(wort: string): number | null {
  const w = normalisieren(wort).trim();
  if (!w) return null;
  if (w === "halb" || w === "halbe" || w === "halben") return 0.5;
  if (w === "anderthalb") return 1.5;
  if (w.endsWith("einhalb") && w.length > 7) {
    const v = zahlwortLesen(w.slice(0, -7));
    return v == null ? null : v + 0.5;
  }
  const t = w.indexOf("tausend");
  if (t >= 0) {
    const links = w.slice(0, t);
    const rechts = w.slice(t + 7).replace(/^und/, "");
    const l = links ? unterTausend(links) : 1;
    const r = rechts ? unterTausend(rechts) : 0;
    if (l == null || r == null || l < 1) return null;
    return l * 1000 + r;
  }
  return unterTausend(w);
}

// ── Einheiten, Füllwörter, Räume ────────────────────────────────────────

const EINHEITEN: Record<string, string> = {
  m: "m", meter: "m", metern: "m", lfm: "m", laufmeter: "m", laufmetern: "m",
  stk: "Stk", stueck: "Stk", st: "Stk",
  h: "h", std: "h", stunde: "h", stunden: "h",
  psch: "Psch", pauschal: "Psch", pauschale: "Psch", pauschalen: "Psch",
  m2: "m²", "m²": "m²", qm: "m²", quadratmeter: "m²",
};

/** Wort, mit dem die Einheit in der Suche mitzählt, wenn sonst nichts gesagt wurde („3 Stunden“). */
const EINHEIT_WORT: Record<string, string> = { h: "stunde", m: "meter", Stk: "stueck", Psch: "pauschale", "m²": "quadratmeter" };

/** Zahl davor/danach ist eine technische Angabe, keine Menge: „400 Volt“, „Typ 2“, „B 16“ */
const ELEKTRO_EINHEIT = new Set([
  "volt", "v", "ampere", "a", "kw", "kilowatt", "watt", "w", "mm", "mm2", "ma", "milliampere",
  "polig", "fach", "adrig", "grad", "kelvin", "k", "lumen", "prozent", "zoll",
]);
const TECHNIK_VOR = new Set(["typ", "cat", "kat", "klasse", "ip", "b", "c", "nr", "nummer", "kategorie"]);

/** Wörter, die eine Raumbezeichnung mit Nummer bilden: „Raum 3“, „Top 2“ */
const RAUM_MIT_NUMMER: Record<string, string> = {
  raum: "Raum", zimmer: "Zimmer", top: "Top", wohnung: "Wohnung", stiege: "Stiege", geschoss: "Geschoss",
};

const RAEUME: [string, string][] = [
  ["kueche", "Küche"], ["wohnkueche", "Wohnküche"], ["kochnische", "Kochnische"],
  ["bad", "Bad"], ["badezimmer", "Badezimmer"], ["wc", "WC"], ["gaestewc", "Gäste-WC"], ["toilette", "WC"], ["klo", "WC"],
  ["wohnzimmer", "Wohnzimmer"], ["esszimmer", "Esszimmer"], ["essbereich", "Essbereich"], ["wohnbereich", "Wohnbereich"],
  ["schlafzimmer", "Schlafzimmer"], ["kinderzimmer", "Kinderzimmer"], ["gaestezimmer", "Gästezimmer"],
  ["arbeitszimmer", "Arbeitszimmer"], ["zimmer", "Zimmer"], ["buero", "Büro"],
  ["vorraum", "Vorraum"], ["flur", "Flur"], ["gang", "Gang"], ["diele", "Diele"], ["windfang", "Windfang"],
  ["eingang", "Eingang"], ["eingangsbereich", "Eingangsbereich"], ["stiegenhaus", "Stiegenhaus"], ["treppenhaus", "Treppenhaus"],
  ["keller", "Keller"], ["kellerraum", "Kellerraum"], ["garage", "Garage"], ["carport", "Carport"],
  ["garten", "Garten"], ["terrasse", "Terrasse"], ["balkon", "Balkon"], ["aussenbereich", "Außenbereich"],
  ["abstellraum", "Abstellraum"], ["technikraum", "Technikraum"], ["heizraum", "Heizraum"],
  ["hauswirtschaftsraum", "Hauswirtschaftsraum"], ["waschkueche", "Waschküche"], ["waschraum", "Waschraum"],
  ["speis", "Speis"], ["speisekammer", "Speisekammer"], ["dachboden", "Dachboden"], ["werkstatt", "Werkstatt"],
  ["lager", "Lager"], ["ankleide", "Ankleide"], ["schrankraum", "Schrankraum"], ["galerie", "Galerie"], ["sauna", "Sauna"],
  ["erdgeschoss", "Erdgeschoss"], ["obergeschoss", "Obergeschoss"], ["dachgeschoss", "Dachgeschoss"],
  ["untergeschoss", "Untergeschoss"], ["kellergeschoss", "Kellergeschoss"],
  ["verkaufsraum", "Verkaufsraum"], ["backstube", "Backstube"], ["gastraum", "Gastraum"], ["schank", "Schank"],
  ["besprechungsraum", "Besprechungsraum"],
];
const RAUM_INDEX = new Map<string, string>();
RAEUME.forEach(([k, anzeige]) => {
  RAUM_INDEX.set(k, anzeige);
  if (!RAUM_INDEX.has(stamm(k))) RAUM_INDEX.set(stamm(k), anzeige);
});
const RAUM_STAEMME = new Set(RAEUME.map(([k]) => stamm(k)));

/** Füllwörter: zählen weder als Raum noch als Leistung */
const FUELLER = new Set([
  "und", "oder", "mit", "ohne", "im", "in", "ins", "der", "die", "das", "den", "dem", "des",
  "noch", "bitte", "dann", "also", "auch", "ausserdem", "zusaetzlich", "dazu", "plus", "sowie", "weiters",
  "je", "pro", "fuer", "fuers", "von", "vom", "zum", "zur", "am", "an", "auf", "bei", "beim", "aus", "nach",
  "neben", "hinter", "vor", "unter", "ueber", "zwischen", "neue", "neu", "neuer", "neuen", "neues",
  "weitere", "weiterer", "weiteren", "circa", "ca", "etwa", "ungefaehr", "rund", "insgesamt", "gesamt",
  "x", "mal", "ja", "nein", "so", "hier", "da", "dort", "wir", "ich", "brauchen", "braucht", "brauche",
  "kommen", "kommt", "kommt", "soll", "sollen", "wird", "werden", "machen", "mache", "gemacht", "haben", "hat",
  "gibt", "es", "ah", "aeh", "oeh", "hm", "okay", "ok", "jetzt", "weiter", "gehts", "geht", "danach", "zuerst",
  "dort", "drin", "rein", "hinein", "stueck", "stk", "st", "davon", "alle", "allen", "jeweils",
]);
const ARTIKEL = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines"]);
const WEICHE_TRENNER = new Set(["und", "sowie", "plus", "dazu", "ausserdem", "zusaetzlich", "weiters", "danach", "dann"]);
const RAUM_PRAEPOSITION = new Set(["im", "ins", "in", "zum", "zur", "fuers"]);
/** „für eine Waschmaschine“ — hier ist „eine“ keine Menge */
const KEINE_MENGE_NACH = new Set([
  "fuer", "mit", "an", "auf", "ueber", "unter", "von", "aus", "bei", "zu", "nach", "neben", "hinter", "vor",
  "zwischen", "pro", "je", "durch", "ohne", "in", "im",
]);

/** Elektro-Fachbegriffe, die Spracherkennung und Katalog verschieden schreiben */
const ERSETZUNGEN: [RegExp, string][] = [
  [/(\d)\s*[x×]\s*(\d)/g, "$1x$2"],
  [/\bfi[\s-]*(?:schutz)?schalter(?:n)?\b/gi, "Fehlerstromschutzschalter"],
  [/\bls[\s-]*schalter(?:n)?\b/gi, "Leitungsschutzschalter"],
  [/\bsicherungsautomat(?:en)?\b/gi, "Leitungsschutzschalter"],
  [/\b(?:e[\s-]*herd|elektroherd)(?:e)?\b/gi, "Herd"],
  [/\be[\s-]*autos?\b/gi, "Elektroauto"],
  [/\b(?:cat|kat)[\s-]*([5-8])\b/gi, "cat$1"],
  [/\blan[\s-]*dosen?\b/gi, "Netzwerkdose"],
];

// ── Zerlegen in Wörter ──────────────────────────────────────────────────

type Token = {
  roh: string;
  norm: string;
  start: number;
  ende: number;
  art: "wort" | "zahl" | "trenner";
  wert?: number;
  einheit?: string | null;
  technisch?: boolean;
};

const TOKEN = /(\d+(?:[.,]\d+)?(?:[x×]\d+(?:[.,]\d+)?)?)([a-zA-ZäöüÄÖÜß²]*)|([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß0-9²]*(?:[-/][a-zA-ZäöüÄÖÜß0-9²]+)*)|([,;.:!?\n–—]|\s-\s)/g;

function zerlegen(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    const roh = m[0];
    const ende = start + roh.length;
    if (m[4]) {
      tokens.push({ roh, norm: roh.trim() || "\n", start, ende, art: "trenner" });
    } else if (m[1]) {
      const rest = m[2] ?? "";
      if (/[x×]/.test(m[1])) {
        tokens.push({ roh, norm: normalisieren(roh).replace(/\./g, ","), start, ende, art: "wort", technisch: true });
        continue;
      }
      const wert = Number(m[1].replace(",", "."));
      const einheit = rest ? EINHEITEN[normalisieren(rest)] : null;
      if (!rest || einheit) tokens.push({ roh, norm: m[1], start, ende, art: "zahl", wert, einheit: einheit ?? null });
      else tokens.push({ roh, norm: normalisieren(roh), start, ende, art: "wort", technisch: true });
    } else {
      const norm = normalisieren(roh);
      tokens.push({ roh, norm, start, ende, art: "wort", technisch: /\d/.test(norm) });
    }
  }
  return tokens;
}

// ── Mengen und Räume erkennen ───────────────────────────────────────────

type Menge = { menge: number; einheit: string | null; letzter: number };

function mengeLesen(t: Token[], i: number): Menge | null {
  const tok = t[i];
  if (!tok || tok.art === "trenner" || tok.technisch) return null;
  const vor = t[i - 1];
  if (vor?.art === "wort" && TECHNIK_VOR.has(vor.norm)) return null;

  let wert: number | null = null;
  let einheit: string | null = null;
  if (tok.art === "zahl") {
    wert = tok.wert ?? null;
    einheit = tok.einheit ?? null;
  } else {
    wert = zahlwortLesen(tok.norm);
    if (wert == null) return null;
    if (EIN_WOERTER.has(tok.norm)) {
      // „ein/eine“ ist nur eine Menge, wenn ein Wort folgt und keine Präposition davor steht
      if (vor?.art === "wort" && KEINE_MENGE_NACH.has(vor.norm)) return null;
      const nach = t[i + 1];
      if (!nach || nach.art !== "wort") return null;
    }
  }
  if (wert == null || !isFinite(wert)) return null;

  let j = i + 1;
  // „zwei Komma fünf“, „2 Komma 5“
  if (t[j]?.norm === "komma" && t[j + 1]) {
    const n = t[j + 1];
    const nk = n.art === "zahl" && Number.isInteger(n.wert) ? n.wert : n.art === "wort" ? zahlwortLesen(n.norm) : null;
    if (nk != null && Number.isInteger(nk) && nk >= 0) {
      wert = Number(`${Math.trunc(wert)}.${nk}`);
      j += 2;
    }
  }
  // „400 Volt“, „16 Ampere“ — technische Angabe
  if (t[j]?.art === "wort" && ELEKTRO_EINHEIT.has(t[j].norm)) return null;
  if (!einheit && t[j]?.art === "wort" && EINHEITEN[t[j].norm]) {
    einheit = EINHEITEN[t[j].norm];
    j++;
  }
  // „6 mal Steckdose“, „6 x Steckdose“
  if (t[j]?.art === "wort" && (t[j].norm === "mal" || t[j].norm === "x")) j++;
  return { menge: wert, einheit, letzter: j - 1 };
}

type Raum = { name: string; letzter: number };

function raumWortAn(t: Token[], i: number): { name: string; laenge: number } | null {
  const tok = t[i];
  if (!tok || tok.art !== "wort") return null;
  const n = tok.norm.replace(/[-/]/g, "");
  const nach = t[i + 1];
  if (nach?.art === "wort") {
    const zwei = RAUM_INDEX.get(n + nach.norm.replace(/[-/]/g, ""));
    if (zwei) return { name: zwei, laenge: 2 };
  }
  const eins = RAUM_INDEX.get(n) ?? RAUM_INDEX.get(stamm(n));
  return eins ? { name: eins, laenge: 1 } : null;
}

function raumLesen(t: Token[], i: number, segmentAnfang: boolean): Raum | null {
  const tok = t[i];
  if (!tok || tok.art !== "wort") return null;
  const vor = t[i - 1];

  // „Raum 3“, „Top 2:“, „Zimmer eins: …“ — die Zahl gehört zum Namen, wenn
  // danach ein Doppelpunkt, eine Menge oder nichts mehr kommt
  const mitNummer = RAUM_MIT_NUMMER[tok.norm];
  if (mitNummer && (segmentAnfang || t[i + 2]?.norm === ":")) {
    const nr = raumNummer(t[i + 1]);
    const danach = t[i + 2];
    if (nr != null && (!danach || danach.art === "trenner" || mengeLesen(t, i + 2) != null)) {
      return { name: `${mitNummer} ${nr}`, letzter: danach?.norm === ":" ? i + 2 : i + 1 };
    }
  }
  // „Raum Werkstatt:“ — alles bis zum Doppelpunkt ist der Name
  if (tok.norm === "raum") {
    for (let j = i + 1; j < Math.min(t.length, i + 5); j++) {
      if (t[j].art === "trenner") {
        if (t[j].norm === ":" && j > i + 1) return { name: grossAnfang(t.slice(i + 1, j)), letzter: j };
        break;
      }
    }
  }
  // Getippte Überschrift „Verteiler: 1 Unterverteiler, …“ — bis zu drei Wörter,
  // dann Doppelpunkt, dann eine Menge mit Wort
  if (segmentAnfang && !raumWortAn(t, i)) {
    for (let j = i; j < Math.min(t.length, i + 4); j++) {
      if (t[j].art !== "wort" || mengeLesen(t, j) != null) {
        const m = t[j]?.norm === ":" && j > i ? mengeLesen(t, j + 1) : null;
        if (m && t[m.letzter + 1]?.art === "wort") return { name: grossAnfang(t.slice(i, j)), letzter: j };
        break;
      }
    }
  }

  const r = raumWortAn(t, i);
  if (!r) return null;
  let j = i + r.laenge;
  const naechster = t[j]?.norm === "noch" ? j + 1 : j;
  const istRaum = segmentAnfang
    || (vor?.art === "wort" && RAUM_PRAEPOSITION.has(vor.norm))
    || t[j]?.norm === ":"
    || (t[naechster] != null && mengeLesen(t, naechster) != null);
  if (!istRaum) return null;

  let name = r.name;
  // „Kinderzimmer 2:“ oder „Kinderzimmer zwei, 3 Steckdosen“ → die Zahl gehört zum Raum
  const nr = raumNummer(t[j]);
  if (nr != null && (t[j + 1]?.norm === ":" || (t[j + 1] != null && mengeLesen(t, j + 1) != null))) {
    name = `${name} ${nr}`;
    j++;
  }
  if (t[j]?.norm === ":") return { name, letzter: j };
  return { name, letzter: j - 1 };
}

function grossAnfang(tokens: Token[]): string {
  const name = tokens.map((x) => x.roh).join(" ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function raumNummer(tok: Token | undefined): string | null {
  if (!tok) return null;
  if (tok.art === "zahl" && !tok.einheit && Number.isInteger(tok.wert)) return tok.roh;
  if (tok.art === "wort") {
    const z = zahlwortLesen(tok.norm);
    if (z != null && Number.isInteger(z) && z > 0 && z < 100) return String(z);
  }
  return null;
}

// ── Leistungskatalog als Suchindex ──────────────────────────────────────

/** Katalogwörter, die nichts unterscheiden („Steckdose UP komplett“ → „komplett“) */
const KATALOG_FUELLER = new Set([
  "komplett", "inkl", "inklusive", "liefern", "verlegen", "montieren", "montage", "einbauen", "setzen",
  "anschliessen", "herstellen", "mit", "und", "fuer", "pro", "je", "oder", "der", "die", "das", "den", "dem",
]);

type IndexEintrag = {
  e: KatalogEintrag;
  reihenfolge: number;
  einheit: string | null;
  /** alle Stämme aus Kurztext und Suchwörtern */
  woerter: string[];
  /** Kurztext ohne Füll- und Technikwörter — wie genau trifft das Gesagte die Leistung? */
  kern: string[];
  /** Bausteine für zusammengesetzte Wörter („Feuchtraumsteckdose“) */
  teile: string[];
};

function katalogWoerter(text: string | null | undefined): { stamm: string; technisch: boolean }[] {
  if (!text) return [];
  return normalisieren(text)
    .split(/\s+/)
    .flatMap((w) => w.split(/[-/()+]/))
    .map((w) => w.replace(/^[.,;:]+|[.,;:]+$/g, ""))
    .filter((w) => w.length >= 2 && !KATALOG_FUELLER.has(w))
    .map((w) => ({ stamm: /\d/.test(w) ? w.replace(/\./g, ",") : stamm(w), technisch: /\d/.test(w) }));
}

const indexCache = new WeakMap<KatalogEintrag[], IndexEintrag[]>();

function indexBauen(katalog: KatalogEintrag[]): IndexEintrag[] {
  const vorhanden = indexCache.get(katalog);
  if (vorhanden) return vorhanden;
  const roh = katalog.map((e) => {
    const kurz = katalogWoerter(e.kurztext);
    const such = katalogWoerter(e.suchwoerter);
    const woerter = [...new Set([...kurz, ...such].map((w) => w.stamm))];
    return {
      e,
      reihenfolge: e.reihenfolge ?? 0,
      einheit: e.einheit ?? null,
      woerter,
      kern: [...new Set(kurz.filter((w) => !w.technisch).map((w) => w.stamm))],
      teile: [] as string[],
    };
  });
  // Teile für Komposita: eigene Wörter plus jedes Katalogwort, das als
  // Wortende in einem eigenen Wort steckt („doppelsteckdos“ → „steckdos“)
  const alle = [...new Set(roh.flatMap((r) => r.woerter.filter((w) => !/\d/.test(w) && w.length >= 4)))];
  roh.forEach((r) => {
    const teile = new Set(r.woerter.filter((w) => !/\d/.test(w) && w.length >= 3));
    r.woerter.forEach((w) => alle.forEach((a) => { if (a.length < w.length && w.endsWith(a)) teile.add(a); }));
    // kurze Wörter auch ohne Endung: „dose“ → „dos“ (passt als Wortende in „antennendos“)
    [...teile].forEach((w) => { if (w.length === 4 && /[en]$/.test(w)) teile.add(w.slice(0, 3)); });
    r.teile = [...teile].sort((a, b) => b.length - a.length);
  });
  indexCache.set(katalog, roh);
  return roh;
}

// ── Ähnlichkeit ─────────────────────────────────────────────────────────

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    let kleinst = i;
    for (let j = 1; j <= b.length; j++) {
      jetzt[j] = Math.min(vorher[j] + 1, jetzt[j - 1] + 1, vorher[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      kleinst = Math.min(kleinst, jetzt[j]);
    }
    if (kleinst > max) return max + 1;
    vorher = jetzt;
  }
  return vorher[b.length];
}

function wortAehnlich(q: string, w: string): number {
  if (q === w) return 1;
  if (/\d/.test(q) || /\d/.test(w)) return 0;
  if (q.length >= 5 && w.length >= 5) {
    const d = levenshtein(q, w, 2);
    if (d === 1) return 0.85;
    if (d === 2 && Math.min(q.length, w.length) >= 9) return 0.75;
  }
  // Gesagtes steckt in einem längeren Katalogwort: „schalter“ in „wechselschalter“
  if (q.length >= 4 && w.length > q.length && w.includes(q)) return 0.4 + 0.5 * (q.length / w.length);
  return 0;
}

/** Wie gut decken Katalogwörter ein zusammengesetztes gesagtes Wort ab? Das Wortende zählt am meisten. */
function kompositum(q: string, teile: string[]): number {
  if (q.length < 6 || /\d/.test(q)) return 0;
  const gedeckt = new Array<boolean>(q.length).fill(false);
  let kopf = false;
  for (const w of teile) {
    if (w.length >= q.length) continue;
    if (w.length < 4 && !q.endsWith(w)) continue;
    let i = q.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) gedeckt[k] = true;
      if (i + w.length === q.length) kopf = true;
      i = q.indexOf(w, i + 1);
    }
  }
  const anteil = gedeckt.filter(Boolean).length / q.length;
  if (anteil === 0) return 0;
  return kopf ? Math.min(0.95, 0.6 + 0.4 * anteil) : Math.min(0.9, anteil);
}

function tokenWert(q: string, e: IndexEintrag): number {
  let best = 0;
  for (const w of e.woerter) {
    best = Math.max(best, wortAehnlich(q, w));
    if (best === 1) return 1;
  }
  return Math.max(best, kompositum(q, e.teile));
}

function spezifitaet(q: string[], e: IndexEintrag): number {
  if (!e.kern.length) return 0;
  let summe = 0;
  for (const k of e.kern) {
    let b = 0;
    for (const w of q) {
      if (w === k) { b = 1; break; }
      if (/\d/.test(w)) continue;
      if (k.length >= 4 && w.length > k.length && w.includes(k)) b = 1;
      else if (w.length >= 4 && k.includes(w)) b = Math.max(b, w.length / k.length);
      else if (w.length >= 5 && k.length >= 5 && levenshtein(w, k, 1) === 1) b = Math.max(b, 0.85);
    }
    summe += b;
  }
  return summe / e.kern.length;
}

function einheitGleich(a: string, b: string): boolean {
  const n = (s: string) => normalisieren(s).replace("stueck", "stk").replace("²", "2");
  return n(a) === n(b);
}

type Bewertung = { e: KatalogEintrag; punkte: number; max: number; werte: number[]; reihenfolge: number };

function bewerten(q: string[], e: IndexEintrag, einheit: string | null, raumStamm: string | null): Bewertung {
  const werte = q.map((w) => tokenWert(w, e));
  const max = Math.max(0, ...werte);
  if (max < 0.5) return { e: e.e, punkte: 0, max, werte, reihenfolge: e.reihenfolge };
  const deckung = werte.reduce((s, x) => s + x, 0) / q.length;
  let punkte = 0.6 * max + 0.25 * deckung + 0.15 * spezifitaet(q, e);
  if (einheit && e.einheit) punkte += einheitGleich(einheit, e.einheit) ? 0.05 : -0.25;
  // Raum als Zusammenhang: „Garten: Steckdose“ → die Feuchtraum-Steckdose
  if (raumStamm && max >= 0.8 && e.woerter.includes(raumStamm)) punkte += 0.15;
  return { e: e.e, punkte, max, werte, reihenfolge: e.reihenfolge };
}

const SCHWELLE = 0.55;

function suchen(q: string[], index: IndexEintrag[], einheit: string | null, raumStamm: string | null) {
  if (!q.length) return { beste: null as Bewertung | null, liste: [] as Bewertung[] };
  const liste = index
    .map((e) => bewerten(q, e, einheit, raumStamm))
    .filter((b) => b.punkte >= 0.35)
    .sort((a, b) => b.punkte - a.punkte || a.reihenfolge - b.reihenfolge);
  const beste = liste[0] && liste[0].punkte >= SCHWELLE && liste[0].max >= 0.6 ? liste[0] : null;
  return { beste, liste };
}

/** Die passende Leistung zu einer kurzen Beschreibung („Doppelsteckdosen“), oder null. */
export function leistungFinden(
  beschreibung: string,
  katalog: KatalogEintrag[],
  einheit: string | null = null,
): { leistungId: string | null; punkte: number; alternativen: string[] } {
  const q = beschreibungsStaemme(zerlegen(vorbereiten(beschreibung)).filter((t) => t.art !== "trenner"));
  const { beste, liste } = suchen(q.map((x) => x.stamm), indexBauen(katalog), einheit, null);
  return {
    leistungId: beste?.e.id ?? null,
    punkte: beste?.punkte ?? 0,
    alternativen: liste.filter((b) => b !== beste).slice(0, 4).map((b) => b.e.id),
  };
}

// ── Zerlegen in Posten ──────────────────────────────────────────────────

function vorbereiten(text: string): string {
  return ERSETZUNGEN.reduce((s, [re, ersatz]) => s.replace(re, ersatz), text);
}

type QStamm = { stamm: string; token: Token };

function beschreibungsStaemme(tokens: Token[]): QStamm[] {
  const aus: QStamm[] = [];
  tokens.forEach((t, i) => {
    if (t.art === "trenner") return;
    if (t.art === "zahl") {
      aus.push({ stamm: t.norm.replace(/\./g, ","), token: t });
      return;
    }
    if (FUELLER.has(t.norm) || ELEKTRO_EINHEIT.has(t.norm)) return;
    if (t.technisch) {
      aus.push({ stamm: t.norm.replace(/\./g, ","), token: t });
      return;
    }
    const teile = t.norm.split(/[-/]/).filter((x) => x.length >= 2);
    teile.forEach((teil, k) => {
      // „LS“ allein ist der Leitungsschutzschalter, „FI/LS“ der Kombischalter
      const vorher = k > 0 ? teile[k - 1] : tokens[i - 1]?.norm;
      if (teil === "ls" && vorher !== "fi") {
        aus.push({ stamm: stamm("leitungsschutzschalter"), token: t });
        return;
      }
      aus.push({ stamm: stamm(teil), token: t });
    });
  });
  return aus;
}

/** Steht vor dem Wort (über Artikel hinweg) eine Präposition — „für den Herd“? */
function nachPraeposition(t: Token[], k: number): boolean {
  let j = k - 1;
  while (j >= 0 && t[j].art === "wort" && ARTIKEL.has(t[j].norm)) j--;
  return j >= 0 && j < k && t[j].art === "wort" && KEINE_MENGE_NACH.has(t[j].norm);
}

type RohPosten = {
  raum: string | null;
  menge: number | null;
  einheit: string | null;
  start: number;
  ende: number;
  woerter: Token[];
};

/**
 * Gesagten Text in Posten zerlegen und jedem die passende Leistung
 * zuordnen. Posten ohne Treffer haben `leistungId: null` und werden in der
 * Ansicht als „nicht erkannt“ gezeigt.
 */
export function sprachZerlegen(text: string, katalog: KatalogEintrag[]): SprachPosten[] {
  const vorbereitet = vorbereiten(text);
  const t = zerlegen(vorbereitet);
  const position = new Map(t.map((x, k) => [x, k]));
  const index = indexBauen(katalog);
  const roh: RohPosten[] = [];
  let raum: string | null = null;
  let aktuell: RohPosten | null = null;
  let segmentAnfang = true;

  const abschliessen = () => {
    if (aktuell && (aktuell.woerter.length || aktuell.menge != null)) roh.push(aktuell);
    aktuell = null;
  };

  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    if (tok.art === "trenner") {
      abschliessen();
      segmentAnfang = true;
      continue;
    }

    const r = raumLesen(t, i, segmentAnfang);
    if (r) {
      // „… ein Bewegungsmelder im Gang“ — der Raum hinten gilt für das eben Gesagte
      const vor = t[i - 1];
      const fuerDavor = aktuell?.woerter.length && vor?.art === "wort" && RAUM_PRAEPOSITION.has(vor.norm);
      if (fuerDavor) aktuell!.raum = r.name;
      abschliessen();
      raum = r.name;
      i = r.letzter;
      segmentAnfang = true;
      continue;
    }

    const m = mengeLesen(t, i);
    if (m) {
      abschliessen();
      aktuell = { raum, menge: m.menge, einheit: m.einheit, start: tok.start, ende: t[m.letzter].ende, woerter: [] };
      i = m.letzter;
      segmentAnfang = false;
      continue;
    }

    if (tok.art === "wort" && WEICHE_TRENNER.has(tok.norm)) {
      // „… Doppelsteckdosen und eine Netzwerkdose“ — „und“ trennt nur, wenn danach Neues beginnt
      if (mengeLesen(t, i + 1) || raumWortAn(t, i + 1)) abschliessen();
      continue;
    }
    if (tok.art === "wort" && !tok.technisch && FUELLER.has(tok.norm)) continue;

    if (!aktuell) aktuell = { raum, menge: null, einheit: null, start: tok.start, ende: tok.ende, woerter: [] };
    aktuell.woerter.push(tok);
    aktuell.ende = tok.ende;
    segmentAnfang = false;
  }
  abschliessen();

  // „Steckdosen sechs“ — die Menge danach gehört zum Posten davor
  const zusammen: RohPosten[] = [];
  roh.forEach((p) => {
    const vorher = zusammen[zusammen.length - 1];
    if (!p.woerter.length && p.menge != null && vorher && vorher.menge == null && vorher.raum === p.raum) {
      vorher.menge = p.menge;
      vorher.einheit = vorher.einheit ?? p.einheit;
      vorher.ende = p.ende;
      return;
    }
    zusammen.push(p);
  });

  const ergebnis: SprachPosten[] = [];
  const ausschnitt = (von: number, bis: number) => vorbereitet.slice(von, bis).replace(/\s+/g, " ").trim();

  zusammen.forEach((p) => {
    const raumStamm = p.raum ? stamm(normalisieren(p.raum.split(" ")[0])) : null;
    let q = beschreibungsStaemme(p.woerter);
    if (!q.length && p.einheit && EINHEIT_WORT[p.einheit]) {
      q = [{ stamm: stamm(EINHEIT_WORT[p.einheit]), token: p.woerter[0] }];
    }
    let { beste, liste } = suchen(q.map((x) => x.stamm), index, p.einheit, raumStamm);
    // Nichts gefunden, aber eine Einheit gesagt: „3 Stunden Fehlersuche“ → mit „Stunde“ suchen
    if (!beste && p.einheit && EINHEIT_WORT[p.einheit] && q.length) {
      const zweiter = suchen([...q.map((x) => x.stamm), stamm(EINHEIT_WORT[p.einheit])], index, p.einheit, raumStamm);
      if (zweiter.beste) ({ beste, liste } = zweiter);
    }

    // Eine Leistung, die alle Wörter deutlich besser erklärt, schlägt eine
    // knapp höher bewertete: „zwölf LED Leuchten“ sind zwölf Leuchten — nicht
    // zwölf LED-Panels und dazu eine Leuchte (Funktionstest)
    if (beste && q.length >= 2) {
      const summe = (b: Bewertung) => b.werte.reduce((s, w) => s + w, 0);
      const ganz = liste.find((b) => b !== beste && b.max >= 0.6 && b.werte.every((w) => w >= 0.5)
        && summe(b) >= summe(beste!) + 0.2 && b.punkte >= beste!.punkte - 0.05);
      if (ganz) beste = ganz;
    }

    // Zwei Dinge ohne Menge dazwischen („Steckdose und Schalter“): was die
    // beste Leistung nicht erklärt, aber selbst klar etwas anderes ist, wird
    // ein eigener Posten mit Menge 1.
    const abgespalten: { q: QStamm[]; b: Bewertung }[] = [];
    if (beste && q.length >= 2) {
      // „Kabel für den Herd“: was nach einer Präposition steht, beschreibt nur näher
      const kandidat = (x: QStamm) =>
        !RAUM_STAEMME.has(x.stamm) && !/\d/.test(x.stamm) && !nachPraeposition(t, position.get(x.token) ?? -1);
      const rest = q.filter((x, k) => beste!.werte[k] < 0.5 && kandidat(x));
      if (rest.length) {
        const r2 = suchen(rest.map((x) => x.stamm), index, null, raumStamm);
        if (r2.beste && r2.beste.e.id !== beste.e.id && r2.beste.max >= 0.9 && r2.beste.punkte >= 0.75) {
          abgespalten.push({ q: rest, b: r2.beste });
        }
      }
      // „Wechselschalter und Kreuzschalter“: die beste Leistung trifft ein Wort
      // nur ungefähr, eine andere genau → auch das wird ein eigener Posten
      q.forEach((x, k) => {
        const w = beste!.werte[k];
        if (w >= 1 || w < 0.5 || !kandidat(x) || q.filter((y) => y.token === x.token).length > 1) return;
        const r3 = suchen([x.stamm], index, null, raumStamm).beste;
        if (r3 && r3.e.id !== beste!.e.id && r3.max >= 1 && r3.punkte >= 0.75
          && !abgespalten.some((a) => a.b.e.id === r3.e.id || a.q.some((y) => y.token === x.token))) {
          abgespalten.push({ q: [x], b: r3 });
        }
      });
    }
    const abgespalteneTokens = new Set(abgespalten.flatMap((a) => a.q.map((x) => x.token)));
    const eigene = p.woerter.filter((w) => !abgespalteneTokens.has(w));
    const ende = eigene.length ? eigene[eigene.length - 1].ende : p.ende;
    const start = p.menge != null ? p.start : eigene[0]?.start ?? p.start;

    ergebnis.push({
      key: "",
      raum: p.raum,
      menge: p.menge ?? 1,
      mengeGesagt: p.menge != null,
      einheit: p.einheit,
      text: ausschnitt(start, Math.max(ende, start)),
      beschreibung: eigene.length ? ausschnitt(eigene[0].start, Math.max(ende, eigene[0].start)) : "",
      leistungId: beste?.e.id ?? null,
      punkte: Math.round((beste?.punkte ?? 0) * 100) / 100,
      alternativen: liste.filter((b) => b !== beste).slice(0, 4).map((b) => b.e.id),
    });
    abgespalten.forEach(({ q: teil, b }) => {
      const tokens = [...new Set(teil.map((x) => x.token))];
      ergebnis.push({
        key: "",
        raum: p.raum,
        menge: 1,
        mengeGesagt: false,
        einheit: null,
        text: tokens.map((x) => x.roh).join(" "),
        beschreibung: tokens.map((x) => x.roh).join(" "),
        leistungId: b.e.id,
        punkte: Math.round(b.punkte * 100) / 100,
        alternativen: [],
      });
    });
  });

  ergebnis.forEach((p, i) => { p.key = `${i}:${normalisieren(p.text)}`; });
  return ergebnis;
}

/** Raumname der Liste — für die Schnellwahl beim Anlegen von Titeln */
export const RAUM_VORSCHLAEGE = [
  "Küche", "Wohnzimmer", "Esszimmer", "Bad", "WC", "Schlafzimmer", "Kinderzimmer", "Büro",
  "Vorraum", "Gang", "Abstellraum", "Keller", "Technikraum", "Garage", "Terrasse", "Garten",
];
