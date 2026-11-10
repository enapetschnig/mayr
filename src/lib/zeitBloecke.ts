/**
 * Mehrere Von–Bis-Blöcke an einem Tag („7:00–11:30 Huber, 12:00–15:30 Gruber“):
 * Folgeblock vorschlagen, Überschneidungen finden. Getestet in zeitBloecke.test.ts.
 */

export type Block = { von: string; bis: string };

const minuten = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Nächster Block: eine halbe Stunde nach dem Ende des letzten, 3,5 Stunden lang — nie über Mitternacht */
export function naechsterBlock(letzter: Block): Block {
  const start = Math.min(minuten(letzter.bis.slice(0, 5)) + 30, 23 * 60);
  return { von: hhmm(start), bis: hhmm(Math.min(start + 210, 23 * 60 + 59)) };
}

/** Von–Bis als Minutenspanne; über Mitternacht reicht bis in den nächsten Tag */
function spanne(b: Block): [number, number] {
  const v = minuten(b.von.slice(0, 5));
  let e = minuten(b.bis.slice(0, 5));
  if (e <= v) e += 24 * 60;
  return [v, e];
}

/** Überschneiden sich zwei Blöcke? Berühren („bis 11:30“, „von 11:30“) ist erlaubt. */
export function ueberschneiden(a: Block, b: Block): boolean {
  const [av, ae] = spanne(a);
  const [bv, be] = spanne(b);
  return av < be && bv < ae;
}

/** Erstes Paar (Indizes), das sich überschneidet — sonst null */
export function ersteUeberschneidung(bloecke: Block[]): [number, number] | null {
  for (let i = 0; i < bloecke.length; i++) {
    for (let k = i + 1; k < bloecke.length; k++) {
      if (bloecke[i].von && bloecke[i].bis && bloecke[k].von && bloecke[k].bis && ueberschneiden(bloecke[i], bloecke[k])) return [i, k];
    }
  }
  return null;
}
