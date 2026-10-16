import type { Tables } from "@/integrations/supabase/types";

export type Firma = Tables<"firmen">;
export type Profil = Tables<"profiles">;
export type Projekt = Tables<"projekte">;
export type ProjektRolle = Tables<"projekt_rollen">;
export type Zeit = Tables<"zeiten">;
export type Material = Tables<"material">;
export type Datei = Tables<"dateien">;
export type Termin = Tables<"termine">;
export type Beleg = Tables<"rechnungen">;
export type Position = Tables<"rechnung_positionen">;

export type Sichtbarkeit = "privat" | "gemeinsam";

export const STATUS_TEXT: Record<string, string> = {
  entwurf: "Entwurf",
  offen: "Offen",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
};

export const STATUS_FARBE: Record<string, string> = {
  entwurf: "bg-muted text-muted-foreground",
  offen: "bg-amber-100 text-amber-800",
  bezahlt: "bg-green-100 text-green-800",
  storniert: "bg-red-100 text-red-800",
  angenommen: "bg-green-100 text-green-800",
  abgelehnt: "bg-red-100 text-red-800",
};

export const EINHEITEN = ["Stk", "m", "h", "Pkt", "Psch", "kg", "l", "m²", "Rolle", "Pkg"];
