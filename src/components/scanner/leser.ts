import type { DecodeHintType as DecodeHintTyp } from "@zxing/library";

/**
 * Erkennung von Strichcodes in einem laufenden Kamerabild.
 *
 * Zwei Wege, eine Schnittstelle:
 *  - BarcodeDetector des Browsers (Chrome/Android): schnell, läuft im
 *    System. Nur, wenn er die Formate auch wirklich kann — Chrome am PC
 *    kennt die Klasse, liefert aber oft eine leere Formatliste.
 *  - Sonst ZXing (iPhone, Firefox, PC). Wird erst beim ersten Scan geladen,
 *    damit der Start der App am Handy nicht schwerer wird.
 *
 * Gelesen wird nur im Bereich des Suchrahmens. Auf einem Karton kleben oft
 * drei Codes (EAN, Seriennummer, QR) — gezählt wird der, auf den man zielt.
 */

export type Leser = {
  art: "nativ" | "zxing";
  /** Ein Code im Suchrahmen oder null. Wirft nie. */
  lesen: (video: HTMLVideoElement) => Promise<string | null>;
};

/** EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR */
const NATIV_FORMATE = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

type Rechteck = { x: number; y: number; width: number; height: number };
type NativerTreffer = { rawValue: string; boundingBox: Rechteck };
type NativerDetector = { detect: (quelle: CanvasImageSource) => Promise<NativerTreffer[]> };
type NativeKlasse = {
  new (opt: { formats: string[] }): NativerDetector;
  getSupportedFormats: () => Promise<string[]>;
};

/**
 * Der Teil des Kamerabilds, der im Suchrahmen liegt: 90 % der Breite,
 * Höhe im Seitenverhältnis 4:3 (hochkant also ein Streifen in der Mitte).
 */
export function suchbereich(breite: number, hoehe: number): Rechteck {
  const width = Math.round(breite * 0.9);
  const height = Math.round(Math.min(hoehe, width * 0.75));
  return { x: Math.round((breite - width) / 2), y: Math.round((hoehe - height) / 2), width, height };
}

/** Von mehreren Treffern den, der am nächsten an der Bildmitte im Suchbereich liegt. */
function besterTreffer(treffer: NativerTreffer[], breite: number, hoehe: number): string | null {
  const b = suchbereich(breite, hoehe);
  // etwas großzügiger als der gezeichnete Rahmen
  const rand = 0.1;
  let bester: string | null = null;
  let abstand = Infinity;
  for (const t of treffer) {
    const wert = t.rawValue?.trim();
    if (!wert) continue;
    const mx = t.boundingBox.x + t.boundingBox.width / 2;
    const my = t.boundingBox.y + t.boundingBox.height / 2;
    if (mx < b.x - b.width * rand || mx > b.x + b.width * (1 + rand)) continue;
    if (my < b.y - b.height * rand || my > b.y + b.height * (1 + rand)) continue;
    const d = (mx - breite / 2) ** 2 + (my - hoehe / 2) ** 2;
    if (d < abstand) {
      abstand = d;
      bester = wert;
    }
  }
  return bester;
}

async function nativerLeser(): Promise<Leser | null> {
  const Klasse = (globalThis as unknown as { BarcodeDetector?: NativeKlasse }).BarcodeDetector;
  if (!Klasse?.getSupportedFormats) return null;
  try {
    const kann = await Klasse.getSupportedFormats();
    const formate = NATIV_FORMATE.filter((f) => kann.includes(f));
    // Ohne EAN und Code 128 lohnt er sich nicht — dann lieber ZXing für alles
    if (!formate.includes("ean_13") || !formate.includes("code_128")) return null;
    const detector = new Klasse({ formats: formate });
    return {
      art: "nativ",
      lesen: async (video) => {
        if (!video.videoWidth || video.readyState < 2) return null;
        try {
          return besterTreffer(await detector.detect(video), video.videoWidth, video.videoHeight);
        } catch {
          return null;
        }
      },
    };
  } catch {
    return null;
  }
}

/** Größer lohnt nicht: ZXing wird nur langsamer, nicht treffsicherer. */
const ZXING_MAX_BREITE = 1280;

async function zxingLeser(): Promise<Leser> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hinweise = new Map<DecodeHintTyp, unknown>();
  hinweise.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE,
  ]);
  // Sucht mehr Zeilen ab — schräg gehaltene Codes werden so auch erkannt
  hinweise.set(DecodeHintType.TRY_HARDER, true);
  const leser = new BrowserMultiFormatReader(hinweise);
  const leinwand = document.createElement("canvas");
  const ctx = leinwand.getContext("2d", { willReadFrequently: true });

  return {
    art: "zxing",
    lesen: async (video) => {
      const vb = video.videoWidth;
      const vh = video.videoHeight;
      if (!ctx || !vb || !vh || video.readyState < 2) return null;
      const b = suchbereich(vb, vh);
      const massstab = Math.min(1, ZXING_MAX_BREITE / b.width);
      const w = Math.round(b.width * massstab);
      const h = Math.round(b.height * massstab);
      if (leinwand.width !== w) leinwand.width = w;
      if (leinwand.height !== h) leinwand.height = h;
      try {
        ctx.drawImage(video, b.x, b.y, b.width, b.height, 0, 0, w, h);
        return leser.decodeFromCanvas(leinwand).getText()?.trim() || null;
      } catch {
        // NotFoundException: in diesem Bild kein Code — der Normalfall
        return null;
      }
    },
  };
}

/** Den besten verfügbaren Leser bauen (nativ, sonst ZXing). */
export async function leserErstellen(): Promise<Leser> {
  return (await nativerLeser()) ?? (await zxingLeser());
}
