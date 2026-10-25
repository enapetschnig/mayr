/**
 * Strichcodes lesbar machen — ohne Datenbank, damit es sich testen lässt
 * (src/lib/strichcode.test.ts). Die Suche in der Datenbank steht in
 * components/scanner/artikelZuCode.ts.
 *
 * Warum Varianten? Derselbe Artikel kommt je nach Scanner und Packung in
 * mehreren Schreibweisen an: ein amerikanischer Code als UPC-A (12 Stellen)
 * oder als EAN-13 mit führender 0, ein Karton-Etikett als GS1-128 mit
 * „(01)“ vor der Artikelnummer, ein eingetippter Code mit Leerzeichen.
 */

/** Steuerzeichen (FNC1/GS aus GS1-Codes, Zeilenumbruch vom Handscanner) und Leerzeichen raus. */
export function codeBereinigen(roh: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  return String(roh ?? "").replace(/[\s\u0000-\u001f\u007f]+/g, "");
}

const nurZiffern = (s: string) => /^\d+$/.test(s);

/** Länge einer GTIN (EAN-8, UPC-A, EAN-13, GTIN-14)? */
export const istGtinLaenge = (s: string) => nurZiffern(s) && [8, 12, 13, 14].includes(s.length);

/** GS1-Prüfziffer (Modulo 10, Gewichte 3/1 von rechts) für die Ziffern OHNE Prüfziffer. */
export function gtinPruefziffer(ohnePruefziffer: string): number {
  let summe = 0;
  for (let i = 0; i < ohnePruefziffer.length; i++) {
    const ziffer = ohnePruefziffer.charCodeAt(ohnePruefziffer.length - 1 - i) - 48;
    summe += ziffer * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (summe % 10)) % 10;
}

/** Stimmt die Prüfziffer einer GTIN (8, 12, 13 oder 14 Stellen)? Andere Codes: false. */
export function pruefzifferOk(code: string): boolean {
  const c = codeBereinigen(code);
  if (!istGtinLaenge(c)) return false;
  return gtinPruefziffer(c.slice(0, -1)) === Number(c[c.length - 1]);
}

/**
 * UPC-E (8 Stellen: Zahlensystem 0/1, sechs Ziffern, Prüfziffer) → UPC-A.
 * null, wenn es kein gültiger UPC-E ist — dieselben 8 Ziffern können auch
 * ein EAN-8 sein, deshalb ist das nur eine zusätzliche Variante.
 */
export function upcEZuUpcA(code: string): string | null {
  const c = codeBereinigen(code);
  if (!/^[01]\d{7}$/.test(c)) return null;
  const ns = c[0];
  const d = c.slice(1, 7);
  const letzte = d[5];
  let rumpf: string;
  if (letzte <= "2") rumpf = `${d[0]}${d[1]}${letzte}0000${d[2]}${d[3]}${d[4]}`;
  else if (letzte === "3") rumpf = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (letzte === "4") rumpf = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else rumpf = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${letzte}`;
  const ohne = ns + rumpf;
  return gtinPruefziffer(ohne) === Number(c[7]) ? ohne + c[7] : null;
}

/**
 * Artikelnummer (GTIN-14) aus einem GS1-Etikett: „(01)09004840010831(10)…“,
 * „0109004840010831…“ oder mit Kennung „]C1…“ vom Handscanner.
 */
export function gs1Gtin(roh: string): string | null {
  // Kennung der Symbologie (AIM, z. B. ]C1 = GS1-128, ]Q3 = GS1-QR) und FNC1 vorne weg
  // eslint-disable-next-line no-control-regex
  const s = String(roh ?? "").trim().replace(/^\][A-Za-z]\d/, "").replace(/^[\u001d\s]+/, "");
  const m = /^\(01\)\s*(\d{14})/.exec(s) ?? (/^01(\d{14})/.test(s) && s.length >= 16 ? /^01(\d{14})/.exec(s) : null);
  if (!m) return null;
  return pruefzifferOk(m[1]) ? m[1] : null;
}

/** Kürzere Schreibweisen einer GTIN-14: führende Nullen = derselbe Artikel als EAN-13, UPC-A, EAN-8. */
function gtin14Kurzformen(gtin14: string): string[] {
  const aus: string[] = [gtin14];
  if (gtin14.startsWith("0")) aus.push(gtin14.slice(1));
  if (gtin14.startsWith("00")) aus.push(gtin14.slice(2));
  if (gtin14.startsWith("000000")) aus.push(gtin14.slice(6));
  return aus;
}

/**
 * Die eine Schreibweise, in der ein Code gespeichert wird (neuer Artikel,
 * zugeordneter Code): bereinigt, UPC-A als EAN-13 mit führender 0, GS1-Etikett
 * als seine Artikelnummer. So steht derselbe Code nie zweimal in der Tabelle.
 */
export function normalisieren(roh: string): string {
  const c = codeBereinigen(roh);
  const gs1 = !istGtinLaenge(c) ? gs1Gtin(roh) : null;
  const basis = gs1 ?? c;
  if (basis.length === 12 && pruefzifferOk(basis)) return `0${basis}`;
  if (basis.length === 14 && pruefzifferOk(basis) && basis.startsWith("0")) return basis.slice(1);
  return basis;
}

/**
 * Alle Schreibweisen, unter denen ein Artikel zu diesem Code gespeichert
 * sein kann — in der Reihenfolge, in der gesucht wird: zuerst der Code
 * genau wie gelesen, dann die bereinigten und umgerechneten Formen.
 */
export function codeVarianten(roh: string): string[] {
  const liste: string[] = [];
  const dazu = (s: string | null | undefined) => {
    if (s && !liste.includes(s)) liste.push(s);
  };
  const gelesen = String(roh ?? "").trim();
  const c = codeBereinigen(roh);
  dazu(gelesen);
  dazu(c);
  if (!c) return liste;
  dazu(normalisieren(c));

  if (nurZiffern(c)) {
    if (c.length === 12 && pruefzifferOk(c)) dazu(`0${c}`);
    if (c.length === 13 && c.startsWith("0") && pruefzifferOk(c)) dazu(c.slice(1));
    if (c.length === 14 && pruefzifferOk(c)) gtin14Kurzformen(c).forEach(dazu);
    if (c.length === 8) {
      const upcA = upcEZuUpcA(c);
      if (upcA) {
        dazu(upcA);
        dazu(`0${upcA}`);
      }
    }
  } else {
    const gtin = gs1Gtin(roh);
    if (gtin) gtin14Kurzformen(gtin).forEach(dazu);
  }
  return liste;
}

/**
 * Hinweis für einen Code, den niemand kennt: Sieht er aus wie eine EAN, hat
 * aber eine falsche Prüfziffer, ist er wahrscheinlich falsch gelesen oder
 * vertippt — das soll man sehen, bevor man ihn einem Artikel zuordnet.
 */
export function codeVerdaechtig(roh: string): boolean {
  const c = codeBereinigen(roh);
  return istGtinLaenge(c) && !pruefzifferOk(c) && !upcEZuUpcA(c);
}
