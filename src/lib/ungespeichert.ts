/**
 * Wo gerade etwas nicht gespeichert ist — damit „Jetzt aktualisieren“ vorher
 * nachfragt, statt Eingaben wegzuladen. Editoren melden sich mit
 * `ungespeichertMelden("das Angebot")` an und mit der Rückgabe wieder ab.
 */
const offen = new Map<number, string>();
let naechste = 1;

export function ungespeichertMelden(was: string): () => void {
  const id = naechste++;
  offen.set(id, was);
  return () => { offen.delete(id); };
}

export const ungespeichertListe = (): string[] => [...new Set(offen.values())];
