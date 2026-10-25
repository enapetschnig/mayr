import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormularDialog from "@/components/FormularDialog";
import { AktionsKachel, StatusPille } from "@/components/Bausteine";
import { DiktatKnopf } from "@/components/DiktatKnopf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArtikelSuche } from "@/components/material/ArtikelSuche";
import { MengeFeld } from "@/components/material/MengeFeld";
import { useNeuLaden } from "@/hooks/useDaten";
import { zahlLesen } from "@/lib/format";
import { codeVerdaechtig, normalisieren } from "@/lib/strichcode";
import { EINHEITEN, KATEGORIEN_ARTIKEL, type Artikel } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ARTIKEL_KURZ, artikelInfo, fehlerText, runden3, type ArtikelKurz } from "./materialDaten";

type Schritt = "wahl" | "zuordnen" | "neu";

/**
 * Ein Strichcode, den die App nicht kennt. Zwei Wege, beide darf auch der
 * Monteur (RLS erlaubt das Anlegen):
 *  a) vorhandenen Artikel suchen und den Code zuordnen (artikel_codes) —
 *     mit Packungsinhalt, falls es der Karton-Code ist;
 *  b) neuen Artikel anlegen, der Code wird seine EAN.
 * Danach zählt der nächste Scan desselben Codes sofort.
 */
export function CodeUnbekanntDialog({
  code, open, onOpenChange, onFertig, lagerartikel = true, abbrechenText = "Abbrechen",
}: {
  code: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Artikel und wie viel ein Scan dieses Codes zählt (Packungsinhalt) */
  onFertig: (artikel: ArtikelKurz, menge: number) => void;
  /** neuer Artikel liegt im Lager (nicht bei „Direkt“ gekauft) */
  lagerartikel?: boolean;
  abbrechenText?: string;
}) {
  const neuLaden = useNeuLaden();
  const [schritt, setSchritt] = useState<Schritt>("wahl");
  const [gewaehlt, setGewaehlt] = useState<Artikel | null>(null);
  const [packung, setPackung] = useState("1");
  const [bezeichnung, setBezeichnung] = useState("");
  const [einheit, setEinheit] = useState("Stk");
  const [kategorie, setKategorie] = useState("");
  const [ek, setEk] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSchritt("wahl");
    setGewaehlt(null);
    setPackung("1");
    setBezeichnung("");
    setEinheit("Stk");
    setKategorie("");
    setEk("");
  }, [open, code]);

  const verdaechtig = !!code && codeVerdaechtig(code);

  const zuordnen = async () => {
    if (!code || !gewaehlt) return;
    const menge = runden3(zahlLesen(packung));
    if (!(menge > 0)) return toast.error("Der Packungsinhalt muss größer als 0 sein.");
    setSpeichert(true);
    const { error } = await supabase.from("artikel_codes").insert({ code: normalisieren(code), artikel_id: gewaehlt.id, menge });
    setSpeichert(false);
    if (error) {
      return toast.error("Code nicht zugeordnet", {
        description: error.code === "23505" ? "Dieser Code ist schon einem anderen Artikel zugeordnet." : fehlerText(error),
      });
    }
    toast.success("Code zugeordnet", { description: gewaehlt.bezeichnung });
    void neuLaden("artikel");
    onFertig(gewaehlt, menge);
  };

  const anlegen = async () => {
    if (!code) return;
    const bez = bezeichnung.trim();
    if (!bez) return toast.error("Bitte eine Bezeichnung eingeben.");
    const preis = zahlLesen(ek);
    setSpeichert(true);
    const { data, error } = await supabase.from("artikel").insert({
      bezeichnung: bez,
      einheit,
      kategorie: kategorie || null,
      ek_preis: preis > 0 ? preis : null,
      ean: normalisieren(code),
      lieferant: "Eigen",
      quelle: "manuell",
      lagerartikel,
    }).select(ARTIKEL_KURZ).single();
    setSpeichert(false);
    if (error || !data) return toast.error("Artikel nicht angelegt", { description: fehlerText(error) });
    toast.success("Artikel angelegt", { description: bez });
    void neuLaden("artikel");
    onFertig(data as ArtikelKurz, 1);
  };

  const fuss = (
    <>
      {schritt === "wahl" ? (
        <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>{abbrechenText}</Button>
      ) : (
        <Button variant="outline" className="h-11" disabled={speichert}
          onClick={() => { setSchritt("wahl"); setGewaehlt(null); }}>
          Zurück
        </Button>
      )}
      {schritt === "zuordnen" && (
        <Button className="h-11 min-w-40" onClick={zuordnen} disabled={speichert || !gewaehlt}>
          {speichert && <Loader2 className="h-4 w-4 animate-spin" />}
          {gewaehlt ? "Code zuordnen" : "Zuerst Artikel wählen"}
        </Button>
      )}
      {schritt === "neu" && (
        <Button className="h-11 min-w-40" onClick={anlegen} disabled={speichert || !bezeichnung.trim()}>
          {speichert && <Loader2 className="h-4 w-4 animate-spin" />}
          Artikel anlegen
        </Button>
      )}
    </>
  );

  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Code unbekannt"
      beschreibung="Diesen Strichcode kennt die App noch nicht."
      gesperrt={speichert}
      fuss={fuss}
    >
      <div className="max-w-xl space-y-5">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Gelesener Code</p>
          <p className="break-all font-mono text-lg font-semibold">{code}</p>
          {verdaechtig && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusPille eintrag={{ ton: "gelb", text: "Prüfziffer passt nicht" }} />
              Wahrscheinlich falsch gelesen oder vertippt — lieber noch einmal scannen.
            </p>
          )}
        </div>

        {schritt === "wahl" && (
          <div className="grid grid-cols-1 gap-3">
            <AktionsKachel icon={Link2} titel="Vorhandenen Artikel zuordnen"
              unter="Artikel suchen — der Code wird dort gespeichert" onClick={() => setSchritt("zuordnen")} />
            <AktionsKachel icon={PackagePlus} titel="Neuen Artikel anlegen"
              unter="mit diesem Code als EAN" onClick={() => setSchritt("neu")} />
          </div>
        )}

        {schritt === "zuordnen" && (gewaehlt ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary-soft p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{gewaehlt.bezeichnung}</p>
                <p className="truncate text-xs text-muted-foreground">{artikelInfo(gewaehlt) || gewaehlt.lieferant}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-9 shrink-0" onClick={() => setGewaehlt(null)}>Ändern</Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-packung">Wie viel steckt in dieser Packung?</Label>
              <div className="flex items-center gap-2">
                <MengeFeld id="cu-packung" wert={packung} onChange={setPackung} beschriftung="Packungsinhalt" />
                <span className="text-sm text-muted-foreground">{gewaehlt.einheit}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                1 = der Code steht auf einem einzelnen Stück. Karton mit 100 Stück: 100 eintragen — dann zählt jeder Scan 100.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Zu welchem Artikel gehört der Code?</Label>
            <ArtikelSuche onWahl={setGewaehlt} autoFocus listeKlasse="max-h-[52dvh]" />
          </div>
        ))}

        {schritt === "neu" && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="cu-bez">Bezeichnung</Label>
                <DiktatKnopf onText={(t) => setBezeichnung((alt) => `${alt}${alt && !alt.endsWith(" ") ? " " : ""}${t}`)} />
              </div>
              <Input id="cu-bez" className="h-12" autoFocus value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)}
                placeholder="z. B. Kabelbinder 200 mm schwarz" />
            </div>
            <div className="space-y-2">
              <Label>Einheit</Label>
              <div className="flex flex-wrap gap-2">
                {EINHEITEN.map((e) => (
                  <button key={e} type="button" onClick={() => setEinheit(e)}
                    className={cn("h-11 min-w-12 rounded-md border px-3 text-sm font-medium transition-colors",
                      einheit === e ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-kat">Kategorie <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Select value={kategorie || "keine"} onValueChange={(v) => setKategorie(v === "keine" ? "" : v)}>
                <SelectTrigger id="cu-kat" className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keine">Ohne Kategorie</SelectItem>
                  {KATEGORIEN_ARTIKEL.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-ek">Einkaufspreis netto je {einheit} <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="cu-ek" className="zahl h-12 max-w-40" inputMode="decimal" value={ek} onChange={(e) => setEk(e.target.value)}
                placeholder="0,00" />
            </div>
            <p className="text-xs text-muted-foreground">
              Hersteller, Preise und Mindestbestand kann der Chef später im Artikelstamm ergänzen.
            </p>
          </div>
        )}
      </div>
    </FormularDialog>
  );
}
