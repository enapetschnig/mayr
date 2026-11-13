/**
 * „Zu erledigen“ auf der Startseite: erst was ganz oben gehört (`oben`, z. B.
 * ein online angenommenes Angebot), dann Dringendes (rot markiert), sonst
 * die Reihenfolge der Liste. Angezeigt werden höchstens `max` Punkte — der
 * Rest steht hinter „Alle … anzeigen“, damit die Startseite am Handy das Menü
 * bleibt und keine lange Liste wird.
 */
export function ordneZuErledigen<T extends { warn?: boolean; oben?: boolean }>(punkte: T[], max: number): { sichtbar: T[]; rest: number } {
  const stufe = (p: T) => (p.oben ? 0 : p.warn ? 1 : 2);
  const sortiert = [0, 1, 2].flatMap((s) => punkte.filter((p) => stufe(p) === s));
  // Ein einzelner versteckter Punkt lohnt keinen eigenen Knopf
  if (sortiert.length <= max + 1) return { sichtbar: sortiert, rest: 0 };
  return { sichtbar: sortiert.slice(0, max), rest: sortiert.length - max };
}
