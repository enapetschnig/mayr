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
      abwesenheiten: {
        Row: {
          art: string
          bis: string
          created_at: string
          entschieden_am: string | null
          entschieden_von: string | null
          erstellt_von: string | null
          id: string
          notiz: string | null
          status: string
          stunden: number | null
          user_id: string
          von: string
        }
        Insert: {
          art: string
          bis: string
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          erstellt_von?: string | null
          id?: string
          notiz?: string | null
          status?: string
          stunden?: number | null
          user_id?: string
          von: string
        }
        Update: {
          art?: string
          bis?: string
          created_at?: string
          entschieden_am?: string | null
          entschieden_von?: string | null
          erstellt_von?: string | null
          id?: string
          notiz?: string | null
          status?: string
          stunden?: number | null
          user_id?: string
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "abwesenheiten_entschieden_von_fkey"
            columns: ["entschieden_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abwesenheiten_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aenderungswuensche: {
        Row: {
          abschrift: string
          abschrift_fehler: string | null
          anhaenge: string[]
          antwort: string | null
          app_version: string | null
          art: string
          audio_pfad: string | null
          aufnahme_ablauf: Json | null
          aufnahme_pfad: string | null
          bild_pfad: string | null
          created_at: string
          erstellt_von: string | null
          id: string
          seite: string | null
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          abschrift?: string
          abschrift_fehler?: string | null
          anhaenge?: string[]
          antwort?: string | null
          app_version?: string | null
          art?: string
          audio_pfad?: string | null
          aufnahme_ablauf?: Json | null
          aufnahme_pfad?: string | null
          bild_pfad?: string | null
          created_at?: string
          erstellt_von?: string | null
          id?: string
          seite?: string | null
          status?: string
          text?: string
          updated_at?: string
        }
        Update: {
          abschrift?: string
          abschrift_fehler?: string | null
          anhaenge?: string[]
          antwort?: string | null
          app_version?: string | null
          art?: string
          audio_pfad?: string | null
          aufnahme_ablauf?: Json | null
          aufnahme_pfad?: string | null
          bild_pfad?: string | null
          created_at?: string
          erstellt_von?: string | null
          id?: string
          seite?: string | null
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      angebot_links: {
        Row: {
          ablauf: string
          beleg_id: string
          created_at: string
          erstellt_von: string | null
          geoeffnet_am: string | null
          gesperrt_am: string | null
          id: string
          token: string
        }
        Insert: {
          ablauf: string
          beleg_id: string
          created_at?: string
          erstellt_von?: string | null
          geoeffnet_am?: string | null
          gesperrt_am?: string | null
          id?: string
          token: string
        }
        Update: {
          ablauf?: string
          beleg_id?: string
          created_at?: string
          erstellt_von?: string | null
          geoeffnet_am?: string | null
          gesperrt_am?: string | null
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "angebot_links_beleg_id_fkey"
            columns: ["beleg_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      angebot_verlauf: {
        Row: {
          art: string
          beleg_id: string
          betrag: number | null
          created_at: string
          gelesen: boolean
          id: string
          name: string | null
          text: string | null
          unterschrift_pfad: string | null
          wer: string | null
        }
        Insert: {
          art: string
          beleg_id: string
          betrag?: number | null
          created_at?: string
          gelesen?: boolean
          id?: string
          name?: string | null
          text?: string | null
          unterschrift_pfad?: string | null
          wer?: string | null
        }
        Update: {
          art?: string
          beleg_id?: string
          betrag?: number | null
          created_at?: string
          gelesen?: boolean
          id?: string
          name?: string | null
          text?: string | null
          unterschrift_pfad?: string | null
          wer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "angebot_verlauf_beleg_id_fkey"
            columns: ["beleg_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      angebot_vorlagen: {
        Row: {
          betreff: string | null
          created_at: string
          einleitung: string | null
          erstellt_von: string | null
          id: string
          kategorie: string | null
          name: string
          netto: number
          positionen: Json
          schlusstext: string | null
          updated_at: string
        }
        Insert: {
          betreff?: string | null
          created_at?: string
          einleitung?: string | null
          erstellt_von?: string | null
          id?: string
          kategorie?: string | null
          name: string
          netto?: number
          positionen?: Json
          schlusstext?: string | null
          updated_at?: string
        }
        Update: {
          betreff?: string | null
          created_at?: string
          einleitung?: string | null
          erstellt_von?: string | null
          id?: string
          kategorie?: string | null
          name?: string
          netto?: number
          positionen?: Json
          schlusstext?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      anlagen: {
        Row: {
          aktiv: boolean
          art: string
          baujahr: number | null
          bezeichnung: string
          created_at: string
          einspeisung_kw: number | null
          einspeisung_prozent: number | null
          erstellt_von: string | null
          hersteller: string | null
          id: string
          inbetriebnahme: string | null
          intervall_monate: number | null
          kunde_id: string | null
          letzte_pruefung: string | null
          module_anzahl: number | null
          module_typ: string | null
          naechste_pruefung: string | null
          notiz: string | null
          nummer: number
          ort: string | null
          planung_link: string | null
          plz: string | null
          preis: number | null
          projekt_id: string | null
          pv_kwp: number | null
          speicher_kwh: number | null
          speicher_typ: string | null
          standort: string | null
          strasse: string | null
          typ: string | null
          ueberschuss: boolean | null
          ueberschuss_wie: string | null
          ueberwachung: string | null
          ueberwachung_link: string | null
          updated_at: string
          wallbox: string | null
          wechselrichter: string | null
          zaehlpunkt: string | null
        }
        Insert: {
          aktiv?: boolean
          art?: string
          baujahr?: number | null
          bezeichnung: string
          created_at?: string
          einspeisung_kw?: number | null
          einspeisung_prozent?: number | null
          erstellt_von?: string | null
          hersteller?: string | null
          id?: string
          inbetriebnahme?: string | null
          intervall_monate?: number | null
          kunde_id?: string | null
          letzte_pruefung?: string | null
          module_anzahl?: number | null
          module_typ?: string | null
          naechste_pruefung?: string | null
          notiz?: string | null
          nummer?: number
          ort?: string | null
          planung_link?: string | null
          plz?: string | null
          preis?: number | null
          projekt_id?: string | null
          pv_kwp?: number | null
          speicher_kwh?: number | null
          speicher_typ?: string | null
          standort?: string | null
          strasse?: string | null
          typ?: string | null
          ueberschuss?: boolean | null
          ueberschuss_wie?: string | null
          ueberwachung?: string | null
          ueberwachung_link?: string | null
          updated_at?: string
          wallbox?: string | null
          wechselrichter?: string | null
          zaehlpunkt?: string | null
        }
        Update: {
          aktiv?: boolean
          art?: string
          baujahr?: number | null
          bezeichnung?: string
          created_at?: string
          einspeisung_kw?: number | null
          einspeisung_prozent?: number | null
          erstellt_von?: string | null
          hersteller?: string | null
          id?: string
          inbetriebnahme?: string | null
          intervall_monate?: number | null
          kunde_id?: string | null
          letzte_pruefung?: string | null
          module_anzahl?: number | null
          module_typ?: string | null
          naechste_pruefung?: string | null
          notiz?: string | null
          nummer?: number
          ort?: string | null
          planung_link?: string | null
          plz?: string | null
          preis?: number | null
          projekt_id?: string | null
          pv_kwp?: number | null
          speicher_kwh?: number | null
          speicher_typ?: string | null
          standort?: string | null
          strasse?: string | null
          typ?: string | null
          ueberschuss?: boolean | null
          ueberschuss_wie?: string | null
          ueberwachung?: string | null
          ueberwachung_link?: string | null
          updated_at?: string
          wallbox?: string | null
          wechselrichter?: string | null
          zaehlpunkt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anlagen_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anlagen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "anlagen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      artikel: {
        Row: {
          aktiv: boolean
          artikelnummer: string | null
          aufschlag: number | null
          bestell_vpe: number | null
          bezeichnung: string
          created_at: string
          ean: string | null
          einheit: string
          ek_preis: number | null
          hersteller: string | null
          hersteller_nr: string | null
          id: string
          kategorie: string | null
          lagerartikel: boolean
          langtext: string | null
          lieferant: string
          listenpreis: number | null
          mindestbestand: number | null
          quelle: string
          rabattgruppe: string | null
          suchtext: string | null
          unterkategorie: string | null
          updated_at: string
          vk_preis: number | null
          warengruppe: string | null
        }
        Insert: {
          aktiv?: boolean
          artikelnummer?: string | null
          aufschlag?: number | null
          bestell_vpe?: number | null
          bezeichnung: string
          created_at?: string
          ean?: string | null
          einheit?: string
          ek_preis?: number | null
          hersteller?: string | null
          hersteller_nr?: string | null
          id?: string
          kategorie?: string | null
          lagerartikel?: boolean
          langtext?: string | null
          lieferant?: string
          listenpreis?: number | null
          mindestbestand?: number | null
          quelle?: string
          rabattgruppe?: string | null
          suchtext?: string | null
          unterkategorie?: string | null
          updated_at?: string
          vk_preis?: number | null
          warengruppe?: string | null
        }
        Update: {
          aktiv?: boolean
          artikelnummer?: string | null
          aufschlag?: number | null
          bestell_vpe?: number | null
          bezeichnung?: string
          created_at?: string
          ean?: string | null
          einheit?: string
          ek_preis?: number | null
          hersteller?: string | null
          hersteller_nr?: string | null
          id?: string
          kategorie?: string | null
          lagerartikel?: boolean
          langtext?: string | null
          lieferant?: string
          listenpreis?: number | null
          mindestbestand?: number | null
          quelle?: string
          rabattgruppe?: string | null
          suchtext?: string | null
          unterkategorie?: string | null
          updated_at?: string
          vk_preis?: number | null
          warengruppe?: string | null
        }
        Relationships: []
      }
      artikel_codes: {
        Row: {
          artikel_id: string
          code: string
          created_at: string
          menge: number
        }
        Insert: {
          artikel_id: string
          code: string
          created_at?: string
          menge?: number
        }
        Update: {
          artikel_id?: string
          code?: string
          created_at?: string
          menge?: number
        }
        Relationships: [
          {
            foreignKeyName: "artikel_codes_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
        ]
      }
      artikel_dateien: {
        Row: {
          art: string
          artikel_id: string
          created_at: string
          id: string
          name: string | null
          pfad: string
        }
        Insert: {
          art: string
          artikel_id: string
          created_at?: string
          id?: string
          name?: string | null
          pfad: string
        }
        Update: {
          art?: string
          artikel_id?: string
          created_at?: string
          id?: string
          name?: string | null
          pfad?: string
        }
        Relationships: [
          {
            foreignKeyName: "artikel_dateien_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
        ]
      }
      artikel_lagerplaetze: {
        Row: {
          artikel_id: string
          lagerort_id: string
          platz: string
          updated_at: string
        }
        Insert: {
          artikel_id: string
          lagerort_id: string
          platz: string
          updated_at?: string
        }
        Update: {
          artikel_id?: string
          lagerort_id?: string
          platz?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artikel_lagerplaetze_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artikel_lagerplaetze_lagerort_id_fkey"
            columns: ["lagerort_id"]
            isOneToOne: false
            referencedRelation: "lagerorte"
            referencedColumns: ["id"]
          },
        ]
      }
      artikel_lieferanten: {
        Row: {
          artikel_id: string
          bevorzugt: boolean
          created_at: string
          ek_preis: number | null
          id: string
          lieferant: string
          lieferanten_nr: string | null
          lieferzeit_tage: number | null
          listenpreis: number | null
          notiz: string | null
          rabatt: number | null
          updated_at: string
        }
        Insert: {
          artikel_id: string
          bevorzugt?: boolean
          created_at?: string
          ek_preis?: number | null
          id?: string
          lieferant: string
          lieferanten_nr?: string | null
          lieferzeit_tage?: number | null
          listenpreis?: number | null
          notiz?: string | null
          rabatt?: number | null
          updated_at?: string
        }
        Update: {
          artikel_id?: string
          bevorzugt?: boolean
          created_at?: string
          ek_preis?: number | null
          id?: string
          lieferant?: string
          lieferanten_nr?: string | null
          lieferzeit_tage?: number | null
          listenpreis?: number | null
          notiz?: string | null
          rabatt?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artikel_lieferanten_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
        ]
      }
      aufgabe_verlauf: {
        Row: {
          art: string
          aufgabe_id: string
          created_at: string
          foto_pfad: string | null
          id: string
          text: string | null
          user_id: string | null
        }
        Insert: {
          art: string
          aufgabe_id: string
          created_at?: string
          foto_pfad?: string | null
          id?: string
          text?: string | null
          user_id?: string | null
        }
        Update: {
          art?: string
          aufgabe_id?: string
          created_at?: string
          foto_pfad?: string | null
          id?: string
          text?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aufgabe_verlauf_aufgabe_id_fkey"
            columns: ["aufgabe_id"]
            isOneToOne: false
            referencedRelation: "aufgaben"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aufgabe_verlauf_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aufgaben: {
        Row: {
          beschreibung: string | null
          created_at: string
          erledigt_am: string | null
          erledigt_von: string | null
          erstellt_von: string | null
          faellig_am: string | null
          id: string
          kunde_id: string | null
          prioritaet: string
          projekt_id: string | null
          status: string
          titel: string
          updated_at: string
          wiederholung: string | null
          zustaendig: string[]
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          erledigt_am?: string | null
          erledigt_von?: string | null
          erstellt_von?: string | null
          faellig_am?: string | null
          id?: string
          kunde_id?: string | null
          prioritaet?: string
          projekt_id?: string | null
          status?: string
          titel: string
          updated_at?: string
          wiederholung?: string | null
          zustaendig?: string[]
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          erledigt_am?: string | null
          erledigt_von?: string | null
          erstellt_von?: string | null
          faellig_am?: string | null
          id?: string
          kunde_id?: string | null
          prioritaet?: string
          projekt_id?: string | null
          status?: string
          titel?: string
          updated_at?: string
          wiederholung?: string | null
          zustaendig?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "aufgaben_erledigt_von_fkey"
            columns: ["erledigt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aufgaben_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aufgaben_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aufgaben_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "aufgaben_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      beleg_positionen: {
        Row: {
          art: string
          artikel_id: string | null
          beleg_id: string
          bezeichnung: string
          einheit: string
          einzelpreis: number
          ek_preis: number | null
          gesamt: number | null
          id: string
          langtext: string | null
          leistung_id: string | null
          menge: number
          minuten: number | null
          pos: number
          quelle: Json | null
        }
        Insert: {
          art?: string
          artikel_id?: string | null
          beleg_id: string
          bezeichnung?: string
          einheit?: string
          einzelpreis?: number
          ek_preis?: number | null
          gesamt?: number | null
          id?: string
          langtext?: string | null
          leistung_id?: string | null
          menge?: number
          minuten?: number | null
          pos?: number
          quelle?: Json | null
        }
        Update: {
          art?: string
          artikel_id?: string | null
          beleg_id?: string
          bezeichnung?: string
          einheit?: string
          einzelpreis?: number
          ek_preis?: number | null
          gesamt?: number | null
          id?: string
          langtext?: string | null
          leistung_id?: string | null
          menge?: number
          minuten?: number | null
          pos?: number
          quelle?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "beleg_positionen_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beleg_positionen_beleg_id_fkey"
            columns: ["beleg_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beleg_positionen_leistung_id_fkey"
            columns: ["leistung_id"]
            isOneToOne: false
            referencedRelation: "leistungen"
            referencedColumns: ["id"]
          },
        ]
      }
      belege: {
        Row: {
          abgezogen_in: string | null
          altbestand: boolean
          angebot_id: string | null
          betreff: string | null
          bezahlt_am: string | null
          brutto: number
          created_at: string
          datum: string
          einleitung: string | null
          empf_email: string | null
          empf_name: string | null
          empf_ort: string | null
          empf_plz: string | null
          empf_strasse: string | null
          empf_uid: string | null
          empf_zusatz: string | null
          erstellt_von: string | null
          faellig_am: string | null
          fertig_am: string | null
          gueltig_bis: string | null
          id: string
          kategorie_id: string | null
          korrektur_von: string | null
          kunde_id: string | null
          kv_verbindlich: boolean
          leistung_bis: string | null
          leistung_von: string | null
          netto: number
          nummer: string | null
          projekt_id: string | null
          reverse_charge: boolean
          schlusstext: string | null
          status: string
          storno_von: string | null
          teil_nr: number | null
          typ: string
          updated_at: string
          ust: number
          ust_satz: number
        }
        Insert: {
          abgezogen_in?: string | null
          altbestand?: boolean
          angebot_id?: string | null
          betreff?: string | null
          bezahlt_am?: string | null
          brutto?: number
          created_at?: string
          datum?: string
          einleitung?: string | null
          empf_email?: string | null
          empf_name?: string | null
          empf_ort?: string | null
          empf_plz?: string | null
          empf_strasse?: string | null
          empf_uid?: string | null
          empf_zusatz?: string | null
          erstellt_von?: string | null
          faellig_am?: string | null
          fertig_am?: string | null
          gueltig_bis?: string | null
          id?: string
          kategorie_id?: string | null
          korrektur_von?: string | null
          kunde_id?: string | null
          kv_verbindlich?: boolean
          leistung_bis?: string | null
          leistung_von?: string | null
          netto?: number
          nummer?: string | null
          projekt_id?: string | null
          reverse_charge?: boolean
          schlusstext?: string | null
          status?: string
          storno_von?: string | null
          teil_nr?: number | null
          typ: string
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Update: {
          abgezogen_in?: string | null
          altbestand?: boolean
          angebot_id?: string | null
          betreff?: string | null
          bezahlt_am?: string | null
          brutto?: number
          created_at?: string
          datum?: string
          einleitung?: string | null
          empf_email?: string | null
          empf_name?: string | null
          empf_ort?: string | null
          empf_plz?: string | null
          empf_strasse?: string | null
          empf_uid?: string | null
          empf_zusatz?: string | null
          erstellt_von?: string | null
          faellig_am?: string | null
          fertig_am?: string | null
          gueltig_bis?: string | null
          id?: string
          kategorie_id?: string | null
          korrektur_von?: string | null
          kunde_id?: string | null
          kv_verbindlich?: boolean
          leistung_bis?: string | null
          leistung_von?: string | null
          netto?: number
          nummer?: string | null
          projekt_id?: string | null
          reverse_charge?: boolean
          schlusstext?: string | null
          status?: string
          storno_von?: string | null
          teil_nr?: number | null
          typ?: string
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Relationships: [
          {
            foreignKeyName: "belege_abgezogen_in_fkey"
            columns: ["abgezogen_in"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belege_angebot_id_fkey"
            columns: ["angebot_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belege_kategorie_id_fkey"
            columns: ["kategorie_id"]
            isOneToOne: false
            referencedRelation: "rechnung_kategorien"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belege_korrektur_von_fkey"
            columns: ["korrektur_von"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belege_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belege_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "belege_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belege_storno_von_fkey"
            columns: ["storno_von"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      bestell_positionen: {
        Row: {
          artikel_id: string
          bestellung_id: string
          created_at: string
          ek_preis: number | null
          geliefert: number
          id: string
          menge: number
          pos: number
        }
        Insert: {
          artikel_id: string
          bestellung_id: string
          created_at?: string
          ek_preis?: number | null
          geliefert?: number
          id?: string
          menge: number
          pos?: number
        }
        Update: {
          artikel_id?: string
          bestellung_id?: string
          created_at?: string
          ek_preis?: number | null
          geliefert?: number
          id?: string
          menge?: number
          pos?: number
        }
        Relationships: [
          {
            foreignKeyName: "bestell_positionen_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestell_positionen_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      bestellungen: {
        Row: {
          bestellt_am: string | null
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          lagerort_id: string | null
          lieferant: string
          liefertermin: string | null
          notiz: string | null
          nummer: string | null
          projekt_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bestellt_am?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          lagerort_id?: string | null
          lieferant: string
          liefertermin?: string | null
          notiz?: string | null
          nummer?: string | null
          projekt_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bestellt_am?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          lagerort_id?: string | null
          lieferant?: string
          liefertermin?: string | null
          notiz?: string | null
          nummer?: string | null
          projekt_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bestellungen_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestellungen_lagerort_id_fkey"
            columns: ["lagerort_id"]
            isOneToOne: false
            referencedRelation: "lagerorte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestellungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "bestellungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      cockpit_verbindung: {
        Row: {
          app_key: string
          einzig: boolean
          secret: string
          url: string
        }
        Insert: {
          app_key?: string
          einzig?: boolean
          secret: string
          url: string
        }
        Update: {
          app_key?: string
          einzig?: boolean
          secret?: string
          url?: string
        }
        Relationships: []
      }
      dateien: {
        Row: {
          art: string
          beschreibung: string | null
          created_at: string
          groesse: number | null
          id: string
          mime: string | null
          name: string
          pfad: string
          planung: boolean
          projekt_id: string
          user_id: string | null
        }
        Insert: {
          art?: string
          beschreibung?: string | null
          created_at?: string
          groesse?: number | null
          id?: string
          mime?: string | null
          name: string
          pfad: string
          planung?: boolean
          projekt_id: string
          user_id?: string | null
        }
        Update: {
          art?: string
          beschreibung?: string | null
          created_at?: string
          groesse?: number | null
          id?: string
          mime?: string | null
          name?: string
          pfad?: string
          planung?: boolean
          projekt_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dateien_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "dateien_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dateien_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      einladungen: {
        Row: {
          created_at: string
          eingeloest_am: string | null
          eingeloest_von: string | null
          erstellt_von: string | null
          gueltig_bis: string
          id: string
          nachname: string
          profil_id: string | null
          rolle: string
          team_id: string | null
          token_hash: string
          vorname: string
          zurueckgezogen_am: string | null
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }
      eingang_anteile: {
        Row: {
          betrag: number
          created_at: string
          eingangsrechnung_id: string
          id: string
          projekt_id: string
          rechnung_id: string | null
          text: string | null
        }
        Insert: {
          betrag: number
          created_at?: string
          eingangsrechnung_id: string
          id?: string
          projekt_id: string
          rechnung_id?: string | null
          text?: string | null
        }
        Update: {
          betrag?: number
          created_at?: string
          eingangsrechnung_id?: string
          id?: string
          projekt_id?: string
          rechnung_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eingang_anteile_eingangsrechnung_id_fkey"
            columns: ["eingangsrechnung_id"]
            isOneToOne: false
            referencedRelation: "eingangsrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eingang_anteile_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "eingang_anteile_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eingang_anteile_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      eingang_positionen: {
        Row: {
          artikelnummer: string | null
          bezeichnung: string
          created_at: string
          eingangsrechnung_id: string
          einheit: string | null
          einzelpreis: number | null
          gesamt: number
          id: string
          lieferschein_nr: string | null
          menge: number | null
          pos: number
          projekt_id: string | null
        }
        Insert: {
          artikelnummer?: string | null
          bezeichnung: string
          created_at?: string
          eingangsrechnung_id: string
          einheit?: string | null
          einzelpreis?: number | null
          gesamt?: number
          id?: string
          lieferschein_nr?: string | null
          menge?: number | null
          pos?: number
          projekt_id?: string | null
        }
        Update: {
          artikelnummer?: string | null
          bezeichnung?: string
          created_at?: string
          eingangsrechnung_id?: string
          einheit?: string | null
          einzelpreis?: number | null
          gesamt?: number
          id?: string
          lieferschein_nr?: string | null
          menge?: number | null
          pos?: number
          projekt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eingang_positionen_eingangsrechnung_id_fkey"
            columns: ["eingangsrechnung_id"]
            isOneToOne: false
            referencedRelation: "eingangsrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eingang_positionen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "eingang_positionen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      eingangsrechnungen: {
        Row: {
          abgelehnt_grund: string | null
          betrieb: boolean
          bezahlt_am: string | null
          brutto: number
          created_at: string
          datei_mime: string | null
          datei_name: string | null
          datei_pfad: string | null
          datum: string
          erstellt_von: string | null
          faellig_am: string | null
          freigabe: string
          freigegeben_am: string | null
          freigegeben_von: string | null
          iban: string | null
          id: string
          kategorie: string
          kategorie_id: string | null
          lieferant: string
          lieferschein_nummern: string[]
          netto: number
          notiz: string | null
          nummer: string | null
          reverse_charge: boolean
          skonto_bis: string | null
          skonto_prozent: number | null
          updated_at: string
          ust: number
          ust_satz: number
        }
        Insert: {
          abgelehnt_grund?: string | null
          betrieb?: boolean
          bezahlt_am?: string | null
          brutto?: number
          created_at?: string
          datei_mime?: string | null
          datei_name?: string | null
          datei_pfad?: string | null
          datum?: string
          erstellt_von?: string | null
          faellig_am?: string | null
          freigabe?: string
          freigegeben_am?: string | null
          freigegeben_von?: string | null
          iban?: string | null
          id?: string
          kategorie?: string
          kategorie_id?: string | null
          lieferant: string
          lieferschein_nummern?: string[]
          netto?: number
          notiz?: string | null
          nummer?: string | null
          reverse_charge?: boolean
          skonto_bis?: string | null
          skonto_prozent?: number | null
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Update: {
          abgelehnt_grund?: string | null
          betrieb?: boolean
          bezahlt_am?: string | null
          brutto?: number
          created_at?: string
          datei_mime?: string | null
          datei_name?: string | null
          datei_pfad?: string | null
          datum?: string
          erstellt_von?: string | null
          faellig_am?: string | null
          freigabe?: string
          freigegeben_am?: string | null
          freigegeben_von?: string | null
          iban?: string | null
          id?: string
          kategorie?: string
          kategorie_id?: string | null
          lieferant?: string
          lieferschein_nummern?: string[]
          netto?: number
          notiz?: string | null
          nummer?: string | null
          reverse_charge?: boolean
          skonto_bis?: string | null
          skonto_prozent?: number | null
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Relationships: [
          {
            foreignKeyName: "eingangsrechnungen_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eingangsrechnungen_freigegeben_von_fkey"
            columns: ["freigegeben_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eingangsrechnungen_kategorie_id_fkey"
            columns: ["kategorie_id"]
            isOneToOne: false
            referencedRelation: "rechnung_kategorien"
            referencedColumns: ["id"]
          },
        ]
      }
      fahrzeug_eintraege: {
        Row: {
          art: string
          created_at: string
          datum: string
          erledigt: boolean
          erstellt_von: string | null
          fahrzeug_id: string
          id: string
          km: number | null
          kosten: number | null
          text: string
        }
        Insert: {
          art?: string
          created_at?: string
          datum?: string
          erledigt?: boolean
          erstellt_von?: string | null
          fahrzeug_id: string
          id?: string
          km?: number | null
          kosten?: number | null
          text: string
        }
        Update: {
          art?: string
          created_at?: string
          datum?: string
          erledigt?: boolean
          erstellt_von?: string | null
          fahrzeug_id?: string
          id?: string
          km?: number | null
          kosten?: number | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "fahrzeug_eintraege_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fahrzeug_eintraege_fahrzeug_id_fkey"
            columns: ["fahrzeug_id"]
            isOneToOne: false
            referencedRelation: "fahrzeuge"
            referencedColumns: ["id"]
          },
        ]
      }
      fahrzeuge: {
        Row: {
          aktiv: boolean
          art: string
          baujahr: number | null
          created_at: string
          gemietet: boolean
          id: string
          kennzeichen: string | null
          km_stand: number | null
          lagerort_id: string | null
          name: string
          notiz: string | null
          pickerl_bis: string | null
          pruefung_bis: string | null
          reihenfolge: number
          service_bis: string | null
          typ: string | null
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          art?: string
          baujahr?: number | null
          created_at?: string
          gemietet?: boolean
          id?: string
          kennzeichen?: string | null
          km_stand?: number | null
          lagerort_id?: string | null
          name: string
          notiz?: string | null
          pickerl_bis?: string | null
          pruefung_bis?: string | null
          reihenfolge?: number
          service_bis?: string | null
          typ?: string | null
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          art?: string
          baujahr?: number | null
          created_at?: string
          gemietet?: boolean
          id?: string
          kennzeichen?: string | null
          km_stand?: number | null
          lagerort_id?: string | null
          name?: string
          notiz?: string | null
          pickerl_bis?: string | null
          pruefung_bis?: string | null
          reihenfolge?: number
          service_bis?: string | null
          typ?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fahrzeuge_lagerort_id_fkey"
            columns: ["lagerort_id"]
            isOneToOne: false
            referencedRelation: "lagerorte"
            referencedColumns: ["id"]
          },
        ]
      }
      fibu_uebergabe_belege: {
        Row: {
          beleg_id: string | null
          eingang_id: string | null
          uebergabe_id: string
        }
        Insert: {
          beleg_id?: string | null
          eingang_id?: string | null
          uebergabe_id: string
        }
        Update: {
          beleg_id?: string | null
          eingang_id?: string | null
          uebergabe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fibu_uebergabe_belege_beleg_id_fkey"
            columns: ["beleg_id"]
            isOneToOne: true
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fibu_uebergabe_belege_eingang_id_fkey"
            columns: ["eingang_id"]
            isOneToOne: true
            referencedRelation: "eingangsrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fibu_uebergabe_belege_uebergabe_id_fkey"
            columns: ["uebergabe_id"]
            isOneToOne: false
            referencedRelation: "fibu_uebergaben"
            referencedColumns: ["id"]
          },
        ]
      }
      fibu_uebergaben: {
        Row: {
          bis: string
          created_at: string
          erstellt_von: string | null
          format: string
          id: string
          von: string
        }
        Insert: {
          bis: string
          created_at?: string
          erstellt_von?: string | null
          format: string
          id?: string
          von: string
        }
        Update: {
          bis?: string
          created_at?: string
          erstellt_von?: string | null
          format?: string
          id?: string
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "fibu_uebergaben_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      firma: {
        Row: {
          angebot_einleitung: string | null
          angebot_gueltig_tage: number
          angebot_schluss: string | null
          bank_name: string | null
          bic: string | null
          email: string | null
          farbe: string
          fibu_format: string
          fibu_konten: Json
          firmenbuch: string | null
          fusszeile: string | null
          iban: string | null
          id: number
          inhaber: string | null
          intern_arten: string[]
          kleinunternehmer: boolean
          km_satz: number | null
          kostensatz: number | null
          land: string
          logo_pfad: string | null
          mahn_frist_tage: number
          mahn_spesen: Json
          material_aufschlag: number
          name: string
          ort: string | null
          plz: string | null
          rechnung_einleitung: string | null
          rechnung_schluss: string | null
          strasse: string | null
          stundensaetze: Json
          stundensatz: number
          taggeld_satz: number | null
          telefon: string | null
          uid: string | null
          updated_at: string
          verzugszinsen: number
          website: string | null
          whatsapp_vorlagen: Json | null
          zahlungsziel_tage: number
          zusatz: string | null
        }
        Insert: {
          angebot_einleitung?: string | null
          angebot_gueltig_tage?: number
          angebot_schluss?: string | null
          bank_name?: string | null
          bic?: string | null
          email?: string | null
          farbe?: string
          fibu_format?: string
          fibu_konten?: Json
          firmenbuch?: string | null
          fusszeile?: string | null
          iban?: string | null
          id?: number
          inhaber?: string | null
          intern_arten?: string[]
          kleinunternehmer?: boolean
          km_satz?: number | null
          kostensatz?: number | null
          land?: string
          logo_pfad?: string | null
          mahn_frist_tage?: number
          mahn_spesen?: Json
          material_aufschlag?: number
          name: string
          ort?: string | null
          plz?: string | null
          rechnung_einleitung?: string | null
          rechnung_schluss?: string | null
          strasse?: string | null
          stundensaetze?: Json
          stundensatz?: number
          taggeld_satz?: number | null
          telefon?: string | null
          uid?: string | null
          updated_at?: string
          verzugszinsen?: number
          website?: string | null
          whatsapp_vorlagen?: Json | null
          zahlungsziel_tage?: number
          zusatz?: string | null
        }
        Update: {
          angebot_einleitung?: string | null
          angebot_gueltig_tage?: number
          angebot_schluss?: string | null
          bank_name?: string | null
          bic?: string | null
          email?: string | null
          farbe?: string
          fibu_format?: string
          fibu_konten?: Json
          firmenbuch?: string | null
          fusszeile?: string | null
          iban?: string | null
          id?: number
          inhaber?: string | null
          intern_arten?: string[]
          kleinunternehmer?: boolean
          km_satz?: number | null
          kostensatz?: number | null
          land?: string
          logo_pfad?: string | null
          mahn_frist_tage?: number
          mahn_spesen?: Json
          material_aufschlag?: number
          name?: string
          ort?: string | null
          plz?: string | null
          rechnung_einleitung?: string | null
          rechnung_schluss?: string | null
          strasse?: string | null
          stundensaetze?: Json
          stundensatz?: number
          taggeld_satz?: number | null
          telefon?: string | null
          uid?: string | null
          updated_at?: string
          verzugszinsen?: number
          website?: string | null
          whatsapp_vorlagen?: Json | null
          zahlungsziel_tage?: number
          zusatz?: string | null
        }
        Relationships: []
      }
      firmen_dokumente: {
        Row: {
          beschreibung: string | null
          created_at: string
          groesse: number | null
          gueltig_bis: string | null
          hochgeladen_von: string | null
          id: string
          mime: string | null
          name: string
          nur_chef: boolean
          ordner: string
          pfad: string
          titel: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          groesse?: number | null
          gueltig_bis?: string | null
          hochgeladen_von?: string | null
          id?: string
          mime?: string | null
          name: string
          nur_chef?: boolean
          ordner?: string
          pfad: string
          titel: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          groesse?: number | null
          gueltig_bis?: string | null
          hochgeladen_von?: string | null
          id?: string
          mime?: string | null
          name?: string
          nur_chef?: boolean
          ordner?: string
          pfad?: string
          titel?: string
        }
        Relationships: [
          {
            foreignKeyName: "firmen_dokumente_hochgeladen_von_fkey"
            columns: ["hochgeladen_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      konto_buchungen: {
        Row: {
          art: string
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          menge: number
          text: string
          user_id: string
        }
        Insert: {
          art: string
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          menge: number
          text: string
          user_id: string
        }
        Update: {
          art?: string
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          menge?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "konto_buchungen_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kreditor_konten: {
        Row: {
          created_at: string
          konto: number
          name: string
          schluessel: string
        }
        Insert: {
          created_at?: string
          konto?: number
          name: string
          schluessel: string
        }
        Update: {
          created_at?: string
          konto?: number
          name?: string
          schluessel?: string
        }
        Relationships: []
      }
      kunden: {
        Row: {
          ansprechpartner: string | null
          art: string
          created_at: string
          email: string | null
          geo_adresse: string | null
          id: string
          kundennummer_extern: string | null
          lat: number | null
          lng: number | null
          name: string
          namen: string[]
          notiz: string | null
          nummer: number
          ort: string | null
          plz: string | null
          strasse: string | null
          telefon: string | null
          uid: string | null
          updated_at: string
        }
        Insert: {
          ansprechpartner?: string | null
          art?: string
          created_at?: string
          email?: string | null
          geo_adresse?: string | null
          id?: string
          kundennummer_extern?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          namen?: string[]
          notiz?: string | null
          nummer?: number
          ort?: string | null
          plz?: string | null
          strasse?: string | null
          telefon?: string | null
          uid?: string | null
          updated_at?: string
        }
        Update: {
          ansprechpartner?: string | null
          art?: string
          created_at?: string
          email?: string | null
          geo_adresse?: string | null
          id?: string
          kundennummer_extern?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          namen?: string[]
          notiz?: string | null
          nummer?: number
          ort?: string | null
          plz?: string | null
          strasse?: string | null
          telefon?: string | null
          uid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lagerorte: {
        Row: {
          aktiv: boolean
          art: string
          created_at: string
          id: string
          name: string
          reihenfolge: number
          user_id: string | null
        }
        Insert: {
          aktiv?: boolean
          art?: string
          created_at?: string
          id?: string
          name: string
          reihenfolge?: number
          user_id?: string | null
        }
        Update: {
          aktiv?: boolean
          art?: string
          created_at?: string
          id?: string
          name?: string
          reihenfolge?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lagerorte_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leistung_material: {
        Row: {
          artikel_id: string
          leistung_id: string
          menge: number
        }
        Insert: {
          artikel_id: string
          leistung_id: string
          menge?: number
        }
        Update: {
          artikel_id?: string
          leistung_id?: string
          menge?: number
        }
        Relationships: [
          {
            foreignKeyName: "leistung_material_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leistung_material_leistung_id_fkey"
            columns: ["leistung_id"]
            isOneToOne: false
            referencedRelation: "leistungen"
            referencedColumns: ["id"]
          },
        ]
      }
      leistungen: {
        Row: {
          aktiv: boolean
          created_at: string
          einheit: string
          id: string
          kategorie: string
          kurztext: string
          langtext: string | null
          minuten: number
          nummer: string | null
          preis: number | null
          reihenfolge: number
          suchwoerter: string | null
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          einheit?: string
          id?: string
          kategorie?: string
          kurztext: string
          langtext?: string | null
          minuten?: number
          nummer?: string | null
          preis?: number | null
          reihenfolge?: number
          suchwoerter?: string | null
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          einheit?: string
          id?: string
          kategorie?: string
          kurztext?: string
          langtext?: string | null
          minuten?: number
          nummer?: string | null
          preis?: number | null
          reihenfolge?: number
          suchwoerter?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lieferscheine: {
        Row: {
          created_at: string
          datei_mime: string | null
          datei_pfad: string
          datum: string
          eingangsrechnung_id: string | null
          eingebucht_am: string | null
          eingebucht_von: string | null
          erstellt_von: string | null
          gelesen_am: string | null
          id: string
          lieferant: string | null
          notiz: string | null
          nummer: string | null
          positionen: Json
          projekt_id: string | null
        }
        Insert: {
          created_at?: string
          datei_mime?: string | null
          datei_pfad: string
          datum?: string
          eingangsrechnung_id?: string | null
          eingebucht_am?: string | null
          eingebucht_von?: string | null
          erstellt_von?: string | null
          gelesen_am?: string | null
          id?: string
          lieferant?: string | null
          notiz?: string | null
          nummer?: string | null
          positionen?: Json
          projekt_id?: string | null
        }
        Update: {
          created_at?: string
          datei_mime?: string | null
          datei_pfad?: string
          datum?: string
          eingangsrechnung_id?: string | null
          eingebucht_am?: string | null
          eingebucht_von?: string | null
          erstellt_von?: string | null
          gelesen_am?: string | null
          id?: string
          lieferant?: string | null
          notiz?: string | null
          nummer?: string | null
          positionen?: Json
          projekt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lieferscheine_eingangsrechnung_id_fkey"
            columns: ["eingangsrechnung_id"]
            isOneToOne: false
            referencedRelation: "eingangsrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferscheine_eingebucht_von_fkey"
            columns: ["eingebucht_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferscheine_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferscheine_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "lieferscheine_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      mahnungen: {
        Row: {
          beleg_id: string
          created_at: string
          datum: string
          erstellt_von: string | null
          frist_bis: string
          id: string
          offen: number
          spesen: number
          stufe: number
          zinsen: number
        }
        Insert: {
          beleg_id: string
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          frist_bis: string
          id?: string
          offen: number
          spesen?: number
          stufe: number
          zinsen?: number
        }
        Update: {
          beleg_id?: string
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          frist_bis?: string
          id?: string
          offen?: number
          spesen?: number
          stufe?: number
          zinsen?: number
        }
        Relationships: [
          {
            foreignKeyName: "mahnungen_beleg_id_fkey"
            columns: ["beleg_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mahnungen_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_buchungen: {
        Row: {
          art: string
          artikel_id: string | null
          bestellposition_id: string | null
          bezeichnung: string | null
          created_at: string
          einheit: string | null
          ek_preis: number | null
          id: string
          lagerort_id: string | null
          lieferschein_id: string | null
          menge: number
          notiz: string | null
          projekt_id: string | null
          rechnung_id: string | null
          regiebericht_id: string | null
          user_id: string | null
          vorgang: string | null
        }
        Insert: {
          art: string
          artikel_id?: string | null
          bestellposition_id?: string | null
          bezeichnung?: string | null
          created_at?: string
          einheit?: string | null
          ek_preis?: number | null
          id?: string
          lagerort_id?: string | null
          lieferschein_id?: string | null
          menge: number
          notiz?: string | null
          projekt_id?: string | null
          rechnung_id?: string | null
          regiebericht_id?: string | null
          user_id?: string | null
          vorgang?: string | null
        }
        Update: {
          art?: string
          artikel_id?: string | null
          bestellposition_id?: string | null
          bezeichnung?: string | null
          created_at?: string
          einheit?: string | null
          ek_preis?: number | null
          id?: string
          lagerort_id?: string | null
          lieferschein_id?: string | null
          menge?: number
          notiz?: string | null
          projekt_id?: string | null
          rechnung_id?: string | null
          regiebericht_id?: string | null
          user_id?: string | null
          vorgang?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_buchungen_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_bestellposition_id_fkey"
            columns: ["bestellposition_id"]
            isOneToOne: false
            referencedRelation: "bestell_positionen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_lagerort_id_fkey"
            columns: ["lagerort_id"]
            isOneToOne: false
            referencedRelation: "lagerorte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_lieferschein_id_fkey"
            columns: ["lieferschein_id"]
            isOneToOne: false
            referencedRelation: "lieferscheine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "material_buchungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_regiebericht_id_fkey"
            columns: ["regiebericht_id"]
            isOneToOne: false
            referencedRelation: "regieberichte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mitarbeiter_saetze: {
        Row: {
          created_at: string
          gueltig_ab: string
          id: string
          lohnkosten: number | null
          user_id: string
          verrechnungssatz: number | null
        }
        Insert: {
          created_at?: string
          gueltig_ab?: string
          id?: string
          lohnkosten?: number | null
          user_id: string
          verrechnungssatz?: number | null
        }
        Update: {
          created_at?: string
          gueltig_ab?: string
          id?: string
          lohnkosten?: number | null
          user_id?: string
          verrechnungssatz?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mitarbeiter_saetze_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nummernkreise: {
        Row: {
          jahr: number
          letzte: number
          typ: string
        }
        Insert: {
          jahr: number
          letzte?: number
          typ: string
        }
        Update: {
          jahr?: number
          letzte?: number
          typ?: string
        }
        Relationships: []
      }
      personal_dokumente: {
        Row: {
          art: string
          created_at: string
          gelesen_am: string | null
          groesse: number | null
          hochgeladen_von: string | null
          id: string
          mime: string | null
          monat: string | null
          name: string
          pfad: string
          titel: string | null
          user_id: string
        }
        Insert: {
          art: string
          created_at?: string
          gelesen_am?: string | null
          groesse?: number | null
          hochgeladen_von?: string | null
          id?: string
          mime?: string | null
          monat?: string | null
          name: string
          pfad: string
          titel?: string | null
          user_id: string
        }
        Update: {
          art?: string
          created_at?: string
          gelesen_am?: string | null
          groesse?: number | null
          hochgeladen_von?: string | null
          id?: string
          mime?: string | null
          monat?: string | null
          name?: string
          pfad?: string
          titel?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_dokumente_hochgeladen_von_fkey"
            columns: ["hochgeladen_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_dokumente_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aktiv: boolean
          created_at: string
          email: string | null
          farbe: string | null
          gesperrt: boolean
          gruppe: string | null
          id: string
          konto_ab: string
          lohnart: string | null
          nachname: string
          passwort_neu: boolean
          rolle: string
          telefon: string | null
          urlaub_tage: number
          vorname: string
          wochenstunden: number
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          email?: string | null
          farbe?: string | null
          gesperrt?: boolean
          gruppe?: string | null
          id: string
          konto_ab?: string
          lohnart?: string | null
          nachname?: string
          passwort_neu?: boolean
          rolle?: string
          telefon?: string | null
          urlaub_tage?: number
          vorname?: string
          wochenstunden?: number
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          email?: string | null
          farbe?: string | null
          gesperrt?: boolean
          gruppe?: string | null
          id?: string
          konto_ab?: string
          lohnart?: string | null
          nachname?: string
          passwort_neu?: boolean
          rolle?: string
          telefon?: string | null
          urlaub_tage?: number
          vorname?: string
          wochenstunden?: number
        }
        Relationships: []
      }
      projekt_verlauf: {
        Row: {
          an: string | null
          art: string
          created_at: string
          id: string
          projekt_id: string
          text: string
          user_id: string | null
        }
        Insert: {
          an?: string | null
          art: string
          created_at?: string
          id?: string
          projekt_id: string
          text: string
          user_id?: string | null
        }
        Update: {
          an?: string | null
          art?: string
          created_at?: string
          id?: string
          projekt_id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projekt_verlauf_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "projekt_verlauf_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projekt_verlauf_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projekte: {
        Row: {
          beschreibung: string | null
          created_at: string
          erstellt_von: string | null
          foerder_betrag: number | null
          foerder_datum: string | null
          foerder_frist: string | null
          foerder_notiz: string | null
          foerder_status: string | null
          foerder_stelle: string | null
          id: string
          kunde_id: string | null
          name: string
          nummer: string
          ort: string | null
          plz: string | null
          status: string
          strasse: string | null
          stundensatz: number | null
          updated_at: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          erstellt_von?: string | null
          foerder_betrag?: number | null
          foerder_datum?: string | null
          foerder_frist?: string | null
          foerder_notiz?: string | null
          foerder_status?: string | null
          foerder_stelle?: string | null
          id?: string
          kunde_id?: string | null
          name: string
          nummer?: string
          ort?: string | null
          plz?: string | null
          status?: string
          strasse?: string | null
          stundensatz?: number | null
          updated_at?: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          erstellt_von?: string | null
          foerder_betrag?: number | null
          foerder_datum?: string | null
          foerder_frist?: string | null
          foerder_notiz?: string | null
          foerder_status?: string | null
          foerder_stelle?: string | null
          id?: string
          kunde_id?: string | null
          name?: string
          nummer?: string
          ort?: string | null
          plz?: string | null
          status?: string
          strasse?: string | null
          stundensatz?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projekte_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "kunden"
            referencedColumns: ["id"]
          },
        ]
      }
      pruefungen: {
        Row: {
          anlage_id: string
          art: string
          bemerkung: string | null
          besichtigung: Json
          created_at: string
          datum: string
          erder_ohm: number | null
          ergebnis: string | null
          erstellt_von: string | null
          id: string
          maengel: string | null
          messgeraet: string | null
          messungen: Json
          netz: string | null
          nummer: string | null
          rechnung_id: string | null
          status: string
          unterschrieben_am: string | null
          unterschrift_name: string | null
          unterschrift_pfad: string | null
          updated_at: string
        }
        Insert: {
          anlage_id: string
          art?: string
          bemerkung?: string | null
          besichtigung?: Json
          created_at?: string
          datum?: string
          erder_ohm?: number | null
          ergebnis?: string | null
          erstellt_von?: string | null
          id?: string
          maengel?: string | null
          messgeraet?: string | null
          messungen?: Json
          netz?: string | null
          nummer?: string | null
          rechnung_id?: string | null
          status?: string
          unterschrieben_am?: string | null
          unterschrift_name?: string | null
          unterschrift_pfad?: string | null
          updated_at?: string
        }
        Update: {
          anlage_id?: string
          art?: string
          bemerkung?: string | null
          besichtigung?: Json
          created_at?: string
          datum?: string
          erder_ohm?: number | null
          ergebnis?: string | null
          erstellt_von?: string | null
          id?: string
          maengel?: string | null
          messgeraet?: string | null
          messungen?: Json
          netz?: string | null
          nummer?: string | null
          rechnung_id?: string | null
          status?: string
          unterschrieben_am?: string | null
          unterschrift_name?: string | null
          unterschrift_pfad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pruefungen_anlage_id_fkey"
            columns: ["anlage_id"]
            isOneToOne: false
            referencedRelation: "anlagen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pruefungen_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pruefungen_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      rabatte: {
        Row: {
          created_at: string
          hersteller: string | null
          id: string
          lieferant: string
          notiz: string | null
          rabatt: number
          rabattgruppe: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hersteller?: string | null
          id?: string
          lieferant: string
          notiz?: string | null
          rabatt: number
          rabattgruppe?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hersteller?: string | null
          id?: string
          lieferant?: string
          notiz?: string | null
          rabatt?: number
          rabattgruppe?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rechnung_kategorien: {
        Row: {
          art: string | null
          created_at: string
          id: string
          konto: number | null
          name: string
          richtung: string
          sortierung: number
          stichworte: string
        }
        Insert: {
          art?: string | null
          created_at?: string
          id?: string
          konto?: number | null
          name: string
          richtung: string
          sortierung?: number
          stichworte?: string
        }
        Update: {
          art?: string | null
          created_at?: string
          id?: string
          konto?: number | null
          name?: string
          richtung?: string
          sortierung?: number
          stichworte?: string
        }
        Relationships: []
      }
      regieberichte: {
        Row: {
          arbeiten: string
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          nummer: string | null
          projekt_id: string
          rechnung_id: string | null
          status: string
          unterschrieben_am: string | null
          unterschrift_name: string | null
          unterschrift_pfad: string | null
          updated_at: string
        }
        Insert: {
          arbeiten?: string
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          nummer?: string | null
          projekt_id: string
          rechnung_id?: string | null
          status?: string
          unterschrieben_am?: string | null
          unterschrift_name?: string | null
          unterschrift_pfad?: string | null
          updated_at?: string
        }
        Update: {
          arbeiten?: string
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          nummer?: string | null
          projekt_id?: string
          rechnung_id?: string | null
          status?: string
          unterschrieben_am?: string | null
          unterschrift_name?: string | null
          unterschrift_pfad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regieberichte_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regieberichte_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "regieberichte_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regieberichte_rechnung_id_fkey"
            columns: ["rechnung_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          aktiv: boolean
          created_at: string
          fahrzeug_id: string | null
          farbe: string
          id: string
          leiter_id: string | null
          mitglieder: string[]
          name: string
          reihenfolge: number
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          fahrzeug_id?: string | null
          farbe?: string
          id?: string
          leiter_id?: string | null
          mitglieder?: string[]
          name: string
          reihenfolge?: number
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          fahrzeug_id?: string | null
          farbe?: string
          id?: string
          leiter_id?: string | null
          mitglieder?: string[]
          name?: string
          reihenfolge?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_fahrzeug_id_fkey"
            columns: ["fahrzeug_id"]
            isOneToOne: false
            referencedRelation: "fahrzeuge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_leiter_id_fkey"
            columns: ["leiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      termine: {
        Row: {
          begonnen_am: string | null
          beschreibung: string | null
          bis: string | null
          bis_datum: string | null
          created_at: string
          datum: string
          dringend: boolean
          erledigt_am: string | null
          erledigt_von: string | null
          fahrzeuge: string[]
          ganztags: boolean
          geaendert_am: string | null
          geaendert_von: string | null
          id: string
          mitarbeiter: string[]
          ort: string | null
          projekt_id: string | null
          status: string
          team_id: string | null
          titel: string
          user_id: string | null
          von: string | null
        }
        Insert: {
          begonnen_am?: string | null
          beschreibung?: string | null
          bis?: string | null
          bis_datum?: string | null
          created_at?: string
          datum: string
          dringend?: boolean
          erledigt_am?: string | null
          erledigt_von?: string | null
          fahrzeuge?: string[]
          ganztags?: boolean
          geaendert_am?: string | null
          geaendert_von?: string | null
          id?: string
          mitarbeiter?: string[]
          ort?: string | null
          projekt_id?: string | null
          status?: string
          team_id?: string | null
          titel: string
          user_id?: string | null
          von?: string | null
        }
        Update: {
          begonnen_am?: string | null
          beschreibung?: string | null
          bis?: string | null
          bis_datum?: string | null
          created_at?: string
          datum?: string
          dringend?: boolean
          erledigt_am?: string | null
          erledigt_von?: string | null
          fahrzeuge?: string[]
          ganztags?: boolean
          geaendert_am?: string | null
          geaendert_von?: string | null
          id?: string
          mitarbeiter?: string[]
          ort?: string | null
          projekt_id?: string | null
          status?: string
          team_id?: string | null
          titel?: string
          user_id?: string | null
          von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termine_erledigt_von_fkey"
            columns: ["erledigt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_geaendert_von_fkey"
            columns: ["geaendert_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "termine_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termine_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zahlungen: {
        Row: {
          art: string
          beleg_id: string
          betrag: number
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          notiz: string | null
        }
        Insert: {
          art?: string
          beleg_id: string
          betrag: number
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          notiz?: string | null
        }
        Update: {
          art?: string
          beleg_id?: string
          betrag?: number
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          notiz?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zahlungen_beleg_id_fkey"
            columns: ["beleg_id"]
            isOneToOne: false
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zahlungen_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zeiten: {
        Row: {
          art: string
          bis: string | null
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
          intern: string | null
          km: number | null
          pause_minuten: number
          projekt_id: string | null
          rechnung_id: string | null
          regiebericht_id: string | null
          stunden: number
          taetigkeit: string | null
          user_id: string
          von: string | null
        }
        Insert: {
          art?: string
          bis?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          intern?: string | null
          km?: number | null
          pause_minuten?: number
          projekt_id?: string | null
          rechnung_id?: string | null
          regiebericht_id?: string | null
          stunden: number
          taetigkeit?: string | null
          user_id?: string
          von?: string | null
        }
        Update: {
          art?: string
          bis?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
          intern?: string | null
          km?: number | null
          pause_minuten?: number
          projekt_id?: string | null
          rechnung_id?: string | null
          regiebericht_id?: string | null
          stunden?: number
          taetigkeit?: string | null
          user_id?: string
          von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zeiten_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
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
            referencedRelation: "belege"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zeiten_regiebericht_id_fkey"
            columns: ["regiebericht_id"]
            isOneToOne: false
            referencedRelation: "regieberichte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zeiten_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      abwesenheit_kalender: {
        Row: {
          art: string | null
          bis: string | null
          id: string | null
          stunden: number | null
          user_id: string | null
          von: string | null
        }
        Insert: {
          art?: never
          bis?: string | null
          id?: string | null
          stunden?: number | null
          user_id?: string | null
          von?: string | null
        }
        Update: {
          art?: never
          bis?: string | null
          id?: string | null
          stunden?: number | null
          user_id?: string | null
          von?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abwesenheiten_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lagerbestand: {
        Row: {
          artikel_id: string | null
          bestand: number | null
          lagerort_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_buchungen_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_lagerort_id_fkey"
            columns: ["lagerort_id"]
            isOneToOne: false
            referencedRelation: "lagerorte"
            referencedColumns: ["id"]
          },
        ]
      }
      projekt_material: {
        Row: {
          artikel_id: string | null
          ausgefasst: number | null
          bezeichnung: string | null
          direkt: number | null
          einheit: string | null
          offen: number | null
          projekt_id: string | null
          verbraucht: number | null
          zuletzt: string | null
          zurueck: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_buchungen_artikel_id_fkey"
            columns: ["artikel_id"]
            isOneToOne: false
            referencedRelation: "artikel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_buchungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekt_zahlen"
            referencedColumns: ["projekt_id"]
          },
          {
            foreignKeyName: "material_buchungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
        ]
      }
      projekt_zahlen: {
        Row: {
          material_offen_ek: number | null
          projekt_id: string | null
          regie_entwurf: number | null
          regie_offen: number | null
          stunden: number | null
          stunden_offen: number | null
        }
        Insert: {
          material_offen_ek?: never
          projekt_id?: string | null
          regie_entwurf?: never
          regie_offen?: never
          stunden?: never
          stunden_offen?: never
        }
        Update: {
          material_offen_ek?: never
          projekt_id?: string | null
          regie_entwurf?: never
          regie_offen?: never
          stunden?: never
          stunden_offen?: never
        }
        Relationships: []
      }
    }
    Functions: {
      einladung_erstellen: {
        Args: { p_nachname: string; p_profil?: string | null; p_rolle?: string; p_team?: string | null; p_vorname: string }
        Returns: Json
      }
      einladung_lesen: { Args: { p_token: string }; Returns: Json }
      einladung_neu: { Args: { p_id: string }; Returns: string }
      einladung_zurueckziehen: { Args: { p_id: string }; Returns: undefined }
      altrechnung_pruefen: {
        Args: { b: Database["public"]["Tables"]["belege"]["Row"] }
        Returns: undefined
      }
      angebot_annehmen: {
        Args: {
          p_akzeptiert: boolean
          p_name: string
          p_stand: string
          p_token: string
          p_unterschrift: string
        }
        Returns: Json
      }
      angebot_datenblaetter: { Args: { p_beleg: string }; Returns: Json }
      angebot_link_erstellen: { Args: { p_beleg: string }; Returns: string }
      angebot_link_sperren: { Args: { p_beleg: string }; Returns: undefined }
      angebot_link_zu: {
        Args: { p_token: string }
        Returns: {
          ablauf: string
          beleg_id: string
          created_at: string
          erstellt_von: string | null
          geoeffnet_am: string | null
          gesperrt_am: string | null
          id: string
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "angebot_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      angebot_link_zustand: {
        Args: { p_link: Database["public"]["Tables"]["angebot_links"]["Row"] }
        Returns: string
      }
      angebot_material: { Args: { p_projekt: string }; Returns: Json }
      angebot_oeffentlich: { Args: { p_token: string }; Returns: Json }
      angebot_rueckfrage: {
        Args: { p_name: string; p_text: string; p_token: string }
        Returns: undefined
      }
      angebot_upload_erlaubt: { Args: { p_name: string }; Returns: boolean }
      angebot_verrechnet: { Args: { p_id: string }; Returns: boolean }
      artikel_aufschlag_setzen: {
        Args: {
          p_aufschlag: number
          p_hersteller?: string
          p_kategorie?: string
          p_lieferant?: string
          p_max?: number
        }
        Returns: number
      }
      artikel_einordnen: {
        Args: { hersteller: string; wg: string }
        Returns: string
      }
      artikel_gruppen: {
        Args: { p_lieferant?: string }
        Returns: {
          anzahl: number
          hersteller: string
          rabattgruppe: string
        }[]
      }
      artikel_katalog: {
        Args: never
        Returns: {
          anzahl: number
          hersteller: string
          kategorie: string
          unterkategorie: string
        }[]
      }
      artikel_suchen: {
        Args: {
          p_anzahl?: number
          p_hersteller?: string
          p_lieferant?: string
          p_q: string
          p_unscharf?: boolean
        }
        Returns: {
          aktiv: boolean
          artikelnummer: string | null
          aufschlag: number | null
          bestell_vpe: number | null
          bezeichnung: string
          created_at: string
          ean: string | null
          einheit: string
          ek_preis: number | null
          hersteller: string | null
          hersteller_nr: string | null
          id: string
          kategorie: string | null
          lagerartikel: boolean
          langtext: string | null
          lieferant: string
          listenpreis: number | null
          mindestbestand: number | null
          quelle: string
          rabattgruppe: string | null
          suchtext: string | null
          unterkategorie: string | null
          updated_at: string
          vk_preis: number | null
          warengruppe: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "artikel"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      artikel_unterkategorie: { Args: { wg: string }; Returns: string }
      artikel_zu_code: {
        Args: { p_code: string }
        Returns: {
          artikel_id: string
          menge: number
        }[]
      }
      beleg_fertigstellen: { Args: { p_id: string }; Returns: string }
      beleg_stornieren: { Args: { p_id: string }; Returns: string }
      datenblatt_oeffentlich: { Args: { p_name: string }; Returns: boolean }
      fibu_uebergeben: {
        Args: {
          p_belege: string[]
          p_bis: string
          p_eingaenge: string[]
          p_format: string
          p_von: string
        }
        Returns: string
      }
      ist_aktiv: { Args: never; Returns: boolean }
      ist_chef: { Args: never; Returns: boolean }
      kontakt_belege: {
        Args: { p_kontakt: string }
        Returns: {
          betrag: number
          datum: string
          id: string
          nummer: string
          projekt: string
          projekt_id: string
          quelle: string
          status: string
        }[]
      }
      kreditor_konten_holen: {
        Args: { p_namen: string[] }
        Returns: {
          konto: number
          schluessel: string
        }[]
      }
      leitet_team_von: { Args: { p_user: string }; Returns: boolean }
      lieferant_schluessel: { Args: { p: string }; Returns: string }
      lieferschein_einbuchen: {
        Args: { p_lieferschein: string; p_zeilen: Json }
        Returns: number
      }
      naechste_nummer: {
        Args: { p_datum: string; p_typ: string }
        Returns: string
      }
      passwort_setzen: {
        Args: { p_passwort: string; p_user: string }
        Returns: undefined
      }
      personal_dokument_gelesen: { Args: { p_id: string }; Returns: undefined }
      rabatte_anwenden: {
        Args: { p_lieferant: string; p_max?: number }
        Returns: number
      }
      regie_unterschrieben: { Args: { p_id: string }; Returns: boolean }
      regie_zeiten_zuordnen: {
        Args: { p_dazu?: string[]; p_regie: string; p_weg?: string[] }
        Returns: string[]
      }
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
