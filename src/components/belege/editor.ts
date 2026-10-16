import { zahlLesen } from "@/lib/format";

/** Eine Position im Editor — Zahlen als Text, damit "7," beim Tippen nicht verschwindet. */
export interface EditorPosition {
  key: string;
  art: string;
  bezeichnung: string;
  beschreibung: string;
  menge: string;
  einheit: string;
  einzelpreis: string;
}

export const zahlText = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
export const preisText = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");

export function neuePosition(teil: Partial<EditorPosition> = {}): EditorPosition {
  return {
    key: crypto.randomUUID(),
    art: "leistung",
    bezeichnung: "",
    beschreibung: "",
    menge: "1",
    einheit: "Stk",
    einzelpreis: "0,00",
    ...teil,
  };
}

export const positionGesamt = (p: EditorPosition) =>
  p.art === "text" ? 0 : Math.round(zahlLesen(p.menge) * zahlLesen(p.einzelpreis) * 100) / 100;
