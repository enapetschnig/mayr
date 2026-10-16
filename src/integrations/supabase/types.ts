export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      dateien: {
        Row: {
          art: string
          beschreibung: string | null
          created_at: string
          firma_id: string
          groesse: number | null
          id: string
          mime: string | null
          name: string
          pfad: string
          projekt_id: string
          sichtbarkeit: string
          user_id: string
        }
        Insert: {
          art?: string
          beschreibung?: string | null
          created_at?: string
          firma_id?: string
          groesse?: number | null
          id?: string
          mime?: string | null
          name: string
          pfad: string
          projekt_id: string
          sichtbarkeit?: string
          user_id?: string
        }
        Update: {
          art?: string
          beschreibung?: string | null
          created_at?: string
          firma_id?: string
          groesse?: number | null
          id?: string
          mime?: string | null
          name?: string
          pfad?: string
          projekt_id?: string
          sichtbarkeit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dateien_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dateien_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      firmen: {
        Row: {
          angebot_praefix: string
          bank_name: string | null
          bic: string | null
          created_at: string
          email: string | null
          farbe: string
          firmenbuch: string | null
          fusszeile: string | null
          iban: string | null
          id: string
          inhaber: string | null
          ist_demo: boolean
          kleinunternehmer: boolean
          kontoinhaber: string | null
          kurzname: string
          land: string
          logo_pfad: string | null
          material_aufschlag: number
          name: string
          ort: string | null
          plz: string | null
          rechnung_praefix: string
          strasse: string | null
          stundensatz: number
          telefon: string | null
          uid: string | null
          updated_at: string
          website: string | null
          zahlungsziel_tage: number
        }
        Insert: {
          angebot_praefix?: string
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          email?: string | null
          farbe?: string
          firmenbuch?: string | null
          fusszeile?: string | null
          iban?: string | null
          id?: string
          inhaber?: string | null
          ist_demo?: boolean
          kleinunternehmer?: boolean
          kontoinhaber?: string | null
          kurzname: string
          land?: string
          logo_pfad?: string | null
          material_aufschlag?: number
          name: string
          ort?: string | null
          plz?: string | null
          rechnung_praefix?: string
          strasse?: string | null
          stundensatz?: number
          telefon?: string | null
          uid?: string | null
          updated_at?: string
          website?: string | null
          zahlungsziel_tage?: number
        }
        Update: {
          angebot_praefix?: string
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          email?: string | null
          farbe?: string
          firmenbuch?: string | null
          fusszeile?: string | null
          iban?: string | null
          id?: string
          inhaber?: string | null
          ist_demo?: boolean
          kleinunternehmer?: boolean
          kontoinhaber?: string | null
          kurzname?: string
          land?: string
          logo_pfad?: string | null
          material_aufschlag?: number
          name?: string
          ort?: string | null
          plz?: string | null
          rechnung_praefix?: string
          strasse?: string | null
          stundensatz?: number
          telefon?: string | null
          uid?: string | null
          updated_at?: string
          website?: string | null
          zahlungsziel_tage?: number
        }
        Relationships: []
      }
      material: {
        Row: {
          bezeichnung: string
          created_at: string
          datum: string
          einheit: string
          ek_preis: number | null
          firma_id: string
          id: string
          menge: number
          notiz: string | null
          projekt_id: string
          rechnung_id: string | null
          sichtbarkeit: string
          user_id: string
        }
        Insert: {
          bezeichnung: string
          created_at?: string
          datum?: string
          einheit?: string
          ek_preis?: number | null
          firma_id?: string
          id?: string
          menge?: number
          notiz?: string | null
          projekt_id: string
          rechnung_id?: string | null
          sichtbarkeit?: string
          user_id?: string
        }
        Update: {
          bezeichnung?: string
          created_at?: string
          datum?: string
          einheit?: string
          ek_preis?: number | null
          firma_id?: string
          id?: string
          menge?: number
          notiz?: string | null
          projekt_id?: string
          rechnung_id?: string | null
          sichtbarkeit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "rechnungen"
            referencedColumns: ["id"]
          },
        ]
      }
      nummernkreise: {
        Row: {
          firma_id: string
          jahr: number
          letzte: number
          typ: string
        }
        Insert: {
          firma_id: string
          jahr: number
          letzte?: number
          typ: string
        }
        Update: {
          firma_id?: string
          jahr?: number
          letzte?: number
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "nummernkreise_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          firma_id: string | null
          id: string
          ist_admin: boolean
          ist_aktiv: boolean
          nachname: string
          vorname: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          firma_id?: string | null
          id: string
          ist_admin?: boolean
          ist_aktiv?: boolean
          nachname?: string
          vorname?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          firma_id?: string | null
          id?: string
          ist_admin?: boolean
          ist_aktiv?: boolean
          nachname?: string
          vorname?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
        ]
      }
      projekt_rollen: {
        Row: {
          firma_id: string
          projekt_id: string
          rolle: string
        }
        Insert: {
          firma_id: string
          projekt_id: string
          rolle: string
        }
        Update: {
          firma_id?: string
          projekt_id?: string
          rolle?: string
        }
        Relationships: [
          {
            foreignKeyName: "projekt_rollen_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projekt_rollen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      projekte: {
        Row: {
          adresse: string | null
          beschreibung: string | null
          created_at: string
          end_datum: string | null
          erstellt_von: string | null
          firma_id: string
          id: string
          kunde_email: string | null
          kunde_name: string | null
          kunde_ort: string | null
          kunde_plz: string | null
          kunde_strasse: string | null
          kunde_telefon: string | null
          kunde_uid: string | null
          name: string
          ort: string | null
          plz: string | null
          sichtbarkeit: string
          start_datum: string | null
          status: string
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          beschreibung?: string | null
          created_at?: string
          end_datum?: string | null
          erstellt_von?: string | null
          firma_id?: string
          id?: string
          kunde_email?: string | null
          kunde_name?: string | null
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_strasse?: string | null
          kunde_telefon?: string | null
          kunde_uid?: string | null
          name: string
          ort?: string | null
          plz?: string | null
          sichtbarkeit?: string
          start_datum?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          beschreibung?: string | null
          created_at?: string
          end_datum?: string | null
          erstellt_von?: string | null
          firma_id?: string
          id?: string
          kunde_email?: string | null
          kunde_name?: string | null
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_strasse?: string | null
          kunde_telefon?: string | null
          kunde_uid?: string | null
          name?: string
          ort?: string | null
          plz?: string | null
          sichtbarkeit?: string
          start_datum?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projekte_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
        ]
      }
      rechnung_positionen: {
        Row: {
          art: string
          beschreibung: string | null
          bezeichnung: string
          einheit: string
          einzelpreis: number
          gesamt: number | null
          id: string
          menge: number
          pos: number
          rechnung_id: string
        }
        Insert: {
          art?: string
          beschreibung?: string | null
          bezeichnung?: string
          einheit?: string
          einzelpreis?: number
          gesamt?: number | null
          id?: string
          menge?: number
          pos?: number
          rechnung_id: string
        }
        Update: {
          art?: string
          beschreibung?: string | null
          bezeichnung?: string
          einheit?: string
          einzelpreis?: number
          gesamt?: number | null
          id?: string
          menge?: number
          pos?: number
          rechnung_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rechnung_positionen_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "rechnungen"
            referencedColumns: ["id"]
          },
        ]
      }
      rechnungen: {
        Row: {
          angebot_id: string | null
          betreff: string | null
          bezahlt_am: string | null
          brutto: number
          created_at: string
          datum: string
          empfaenger_art: string
          empfaenger_firma_id: string | null
          erstellt_von: string | null
          faellig_am: string | null
          fertig_am: string | null
          firma_id: string
          gueltig_bis: string | null
          id: string
          kunde_email: string | null
          kunde_name: string | null
          kunde_ort: string | null
          kunde_plz: string | null
          kunde_strasse: string | null
          kunde_uid: string | null
          kunde_zusatz: string | null
          leistung_bis: string | null
          leistung_von: string | null
          netto: number
          notizen: string | null
          nummer: string | null
          projekt_id: string | null
          reverse_charge: boolean
          status: string
          typ: string
          updated_at: string
          ust: number
          ust_satz: number
        }
        Insert: {
          angebot_id?: string | null
          betreff?: string | null
          bezahlt_am?: string | null
          brutto?: number
          created_at?: string
          datum?: string
          empfaenger_art?: string
          empfaenger_firma_id?: string | null
          erstellt_von?: string | null
          faellig_am?: string | null
          fertig_am?: string | null
          firma_id?: string
          gueltig_bis?: string | null
          id?: string
          kunde_email?: string | null
          kunde_name?: string | null
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_strasse?: string | null
          kunde_uid?: string | null
          kunde_zusatz?: string | null
          leistung_bis?: string | null
          leistung_von?: string | null
          netto?: number
          notizen?: string | null
          nummer?: string | null
          projekt_id?: string | null
          reverse_charge?: boolean
          status?: string
          typ?: string
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Update: {
          angebot_id?: string | null
          betreff?: string | null
          bezahlt_am?: string | null
          brutto?: number
          created_at?: string
          datum?: string
          empfaenger_art?: string
          empfaenger_firma_id?: string | null
          erstellt_von?: string | null
          faellig_am?: string | null
          fertig_am?: string | null
          firma_id?: string
          gueltig_bis?: string | null
          id?: string
          kunde_email?: string | null
          kunde_name?: string | null
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_strasse?: string | null
          kunde_uid?: string | null
          kunde_zusatz?: string | null
          leistung_bis?: string | null
          leistung_von?: string | null
          netto?: number
          notizen?: string | null
          nummer?: string | null
          projekt_id?: string | null
          reverse_charge?: boolean
          status?: string
          typ?: string
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Relationships: [
          {
            foreignKeyName: "rechnungen_angebot_id_fkey"
            columns: ["angebot_id"]
            isOneToOne: false
            referencedRelation: "rechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rechnungen_empfaenger_firma_id_fkey"
            columns: ["empfaenger_firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rechnungen_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rechnungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      termine: {
        Row: {
          beschreibung: string | null
          bis: string | null
          bis_datum: string | null
          created_at: string
          datum: string
          firma_id: string
          firmen: string[]
          ganztags: boolean
          id: string
          ort: string | null
          projekt_id: string | null
          sichtbarkeit: string
          titel: string
          user_id: string
          von: string | null
        }
        Insert: {
          beschreibung?: string | null
          bis?: string | null
          bis_datum?: string | null
          created_at?: string
          datum: string
          firma_id?: string
          firmen?: string[]
          ganztags?: boolean
          id?: string
          ort?: string | null
          projekt_id?: string | null
          sichtbarkeit?: string
          titel: string
          user_id?: string
          von?: string | null
        }
        Update: {
          beschreibung?: string | null
          bis?: string | null
          bis_datum?: string | null
          created_at?: string
          datum?: string
          firma_id?: string
          firmen?: string[]
          ganztags?: boolean
          id?: string
          ort?: string | null
          projekt_id?: string | null
          sichtbarkeit?: string
          titel?: string
          user_id?: string
          von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termine_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      zeiten: {
        Row: {
          bis: string | null
          created_at: string
          datum: string
          firma_id: string
          id: string
          pause_minuten: number
          projekt_id: string
          rechnung_id: string | null
          sichtbarkeit: string
          stunden: number
          taetigkeit: string | null
          user_id: string
          von: string | null
        }
        Insert: {
          bis?: string | null
          created_at?: string
          datum?: string
          firma_id?: string
          id?: string
          pause_minuten?: number
          projekt_id: string
          rechnung_id?: string | null
          sichtbarkeit?: string
          stunden: number
          taetigkeit?: string | null
          user_id?: string
          von?: string | null
        }
        Update: {
          bis?: string | null
          created_at?: string
          datum?: string
          firma_id?: string
          id?: string
          pause_minuten?: number
          projekt_id?: string
          rechnung_id?: string | null
          sichtbarkeit?: string
          stunden?: number
          taetigkeit?: string | null
          user_id?: string
          von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zeiten_firma_id_fkey"
            columns: ["firma_id"]
            isOneToOne: false
            referencedRelation: "firmen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zeiten_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zeiten_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "rechnungen"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      beleg_fertigstellen: { Args: { p_id: string }; Returns: string }
      datei_sichtbar: { Args: { p_pfad: string }; Returns: boolean }
      firmen_auswahl: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      ist_admin: { Args: never; Returns: boolean }
      ist_aktiv: { Args: never; Returns: boolean }
      meine_firma: { Args: never; Returns: string }
      projekt_gemeinsam: { Args: { p: string }; Returns: boolean }
      projekt_sichtbar: { Args: { p: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
