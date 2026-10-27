export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      artikel: {
        Row: {
          aktiv: boolean
          artikelnummer: string | null
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
          updated_at: string
          vk_preis: number | null
          warengruppe: string | null
        }
        Insert: {
          aktiv?: boolean
          artikelnummer?: string | null
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
          updated_at?: string
          vk_preis?: number | null
          warengruppe?: string | null
        }
        Update: {
          aktiv?: boolean
          artikelnummer?: string | null
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
          typ: string
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
          typ?: string
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Relationships: [
          {
            foreignKeyName: "belege_angebot_id_fkey"
            columns: ["angebot_id"]
            isOneToOne: false
            referencedRelation: "belege"
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
      eingangsrechnungen: {
        Row: {
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
          id: string
          kategorie: string
          lieferant: string
          netto: number
          notiz: string | null
          nummer: string | null
          updated_at: string
          ust: number
          ust_satz: number
        }
        Insert: {
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
          id?: string
          kategorie?: string
          lieferant: string
          netto?: number
          notiz?: string | null
          nummer?: string | null
          updated_at?: string
          ust?: number
          ust_satz?: number
        }
        Update: {
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
          id?: string
          kategorie?: string
          lieferant?: string
          netto?: number
          notiz?: string | null
          nummer?: string | null
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
          firmenbuch: string | null
          fusszeile: string | null
          iban: string | null
          id: number
          inhaber: string | null
          kleinunternehmer: boolean
          land: string
          logo_pfad: string | null
          material_aufschlag: number
          name: string
          ort: string | null
          plz: string | null
          rechnung_einleitung: string | null
          rechnung_schluss: string | null
          strasse: string | null
          stundensatz: number
          telefon: string | null
          uid: string | null
          updated_at: string
          website: string | null
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
          firmenbuch?: string | null
          fusszeile?: string | null
          iban?: string | null
          id?: number
          inhaber?: string | null
          kleinunternehmer?: boolean
          land?: string
          logo_pfad?: string | null
          material_aufschlag?: number
          name: string
          ort?: string | null
          plz?: string | null
          rechnung_einleitung?: string | null
          rechnung_schluss?: string | null
          strasse?: string | null
          stundensatz?: number
          telefon?: string | null
          uid?: string | null
          updated_at?: string
          website?: string | null
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
          firmenbuch?: string | null
          fusszeile?: string | null
          iban?: string | null
          id?: number
          inhaber?: string | null
          kleinunternehmer?: boolean
          land?: string
          logo_pfad?: string | null
          material_aufschlag?: number
          name?: string
          ort?: string | null
          plz?: string | null
          rechnung_einleitung?: string | null
          rechnung_schluss?: string | null
          strasse?: string | null
          stundensatz?: number
          telefon?: string | null
          uid?: string | null
          updated_at?: string
          website?: string | null
          zahlungsziel_tage?: number
          zusatz?: string | null
        }
        Relationships: []
      }
      kunden: {
        Row: {
          ansprechpartner: string | null
          created_at: string
          email: string | null
          id: string
          name: string
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
          created_at?: string
          email?: string | null
          id?: string
          name: string
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
          created_at?: string
          email?: string | null
          id?: string
          name?: string
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
      material_buchungen: {
        Row: {
          art: string
          artikel_id: string | null
          bezeichnung: string | null
          created_at: string
          einheit: string | null
          ek_preis: number | null
          id: string
          lagerort_id: string | null
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
          bezeichnung?: string | null
          created_at?: string
          einheit?: string | null
          ek_preis?: number | null
          id?: string
          lagerort_id?: string | null
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
          bezeichnung?: string | null
          created_at?: string
          einheit?: string | null
          ek_preis?: number | null
          id?: string
          lagerort_id?: string | null
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
            foreignKeyName: "material_buchungen_lagerort_id_fkey"
            columns: ["lagerort_id"]
            isOneToOne: false
            referencedRelation: "lagerorte"
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
      profiles: {
        Row: {
          aktiv: boolean
          created_at: string
          email: string | null
          farbe: string | null
          gesperrt: boolean
          id: string
          nachname: string
          passwort_neu: boolean
          rolle: string
          telefon: string | null
          vorname: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          email?: string | null
          farbe?: string | null
          gesperrt?: boolean
          id: string
          nachname?: string
          passwort_neu?: boolean
          rolle?: string
          telefon?: string | null
          vorname?: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          email?: string | null
          farbe?: string | null
          gesperrt?: boolean
          id?: string
          nachname?: string
          passwort_neu?: boolean
          rolle?: string
          telefon?: string | null
          vorname?: string
        }
        Relationships: []
      }
      projekte: {
        Row: {
          beschreibung: string | null
          created_at: string
          erstellt_von: string | null
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
      termine: {
        Row: {
          beschreibung: string | null
          bis: string | null
          bis_datum: string | null
          created_at: string
          datum: string
          ganztags: boolean
          id: string
          mitarbeiter: string[]
          ort: string | null
          projekt_id: string | null
          titel: string
          user_id: string | null
          von: string | null
        }
        Insert: {
          beschreibung?: string | null
          bis?: string | null
          bis_datum?: string | null
          created_at?: string
          datum: string
          ganztags?: boolean
          id?: string
          mitarbeiter?: string[]
          ort?: string | null
          projekt_id?: string | null
          titel: string
          user_id?: string | null
          von?: string | null
        }
        Update: {
          beschreibung?: string | null
          bis?: string | null
          bis_datum?: string | null
          created_at?: string
          datum?: string
          ganztags?: boolean
          id?: string
          mitarbeiter?: string[]
          ort?: string | null
          projekt_id?: string | null
          titel?: string
          user_id?: string | null
          von?: string | null
        }
        Relationships: [
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
            foreignKeyName: "termine_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zeiten: {
        Row: {
          bis: string | null
          created_at: string
          datum: string
          erstellt_von: string | null
          id: string
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
          bis?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
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
          bis?: string | null
          created_at?: string
          datum?: string
          erstellt_von?: string | null
          id?: string
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
      angebot_verrechnet: { Args: { p_id: string }; Returns: boolean }
      artikel_suchen: {
        Args: { p_anzahl?: number; p_q: string }
        Returns: {
          aktiv: boolean
          artikelnummer: string | null
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
      artikel_zu_code: {
        Args: { p_code: string }
        Returns: {
          artikel_id: string
          menge: number
        }[]
      }
      beleg_fertigstellen: { Args: { p_id: string }; Returns: string }
      beleg_stornieren: { Args: { p_id: string }; Returns: string }
      ist_aktiv: { Args: never; Returns: boolean }
      ist_chef: { Args: never; Returns: boolean }
      naechste_nummer: {
        Args: { p_datum: string; p_typ: string }
        Returns: string
      }
      passwort_setzen: {
        Args: { p_passwort: string; p_user: string }
        Returns: undefined
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

