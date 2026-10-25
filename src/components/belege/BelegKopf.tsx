import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, FolderKanban, Info, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormularDialog } from "@/components/FormularDialog";
import { KundeWahl } from "@/components/KundeWahl";
import { ProjektWahl } from "@/components/ProjektWahl";
import { useKunden, useProjekte } from "@/hooks/useDaten";
import { datum } from "@/lib/format";
import { TON_KLASSE, type Firma } from "@/lib/types";
import { cn } from "@/lib/utils";
import { empfaengerAusKunde, type Kopf } from "./editor";

/**
 * Kopfdaten eines Angebots/einer Rechnung: Kunde (Anschrift wird kopiert),
 * Projekt, Betreff, Daten, Reverse Charge. Am Handy zusammenklappbar.
 */
export function BelegKopf({
  kopf, aendern, bearbeitbar, firma, pc, startOffen,
}: {
  kopf: Kopf;
  aendern: (werte: Partial<Kopf>) => void;
  bearbeitbar: boolean;
  firma: Firma | null;
  pc: boolean;
  startOffen: boolean;
}) {
  const { data: kunden = [] } = useKunden();
  const { data: projekte = [] } = useProjekte();
  const [offen, setOffen] = useState(startOffen);
  const [anschriftOffen, setAnschriftOffen] = useState(false);
  const projekt = projekte.find((p) => p.id === kopf.projekt_id);
  const angebot = kopf.typ === "angebot";
  const klein = !!firma?.kleinunternehmer;
  const ort = [kopf.empf_plz, kopf.empf_ort].filter(Boolean).join(" ");

  const anschrift = (
    <div className="text-sm leading-relaxed">
      {kopf.empf_zusatz && <p className="text-muted-foreground">{kopf.empf_zusatz}</p>}
      <p className="font-semibold">{kopf.empf_name || <span className="font-normal text-muted-foreground">Noch kein Empfänger</span>}</p>
      {kopf.empf_strasse && <p>{kopf.empf_strasse}</p>}
      {ort && <p>{ort}</p>}
      {kopf.empf_uid && <p className="text-xs text-muted-foreground">UID {kopf.empf_uid}</p>}
    </div>
  );

  // ── nur lesen ──
  if (!bearbeitbar) {
    return (
      <section className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Empfänger</p>
          {anschrift}
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Datum</dt><dd className="zahl">{datum(kopf.datum)}</dd>
          {!angebot && (kopf.leistung_von || kopf.leistung_bis) && (
            <>
              <dt className="text-muted-foreground">Leistung</dt>
              <dd className="zahl">
                {kopf.leistung_von && kopf.leistung_bis && kopf.leistung_von !== kopf.leistung_bis
                  ? `${datum(kopf.leistung_von)} – ${datum(kopf.leistung_bis)}`
                  : datum(kopf.leistung_von || kopf.leistung_bis)}
              </dd>
            </>
          )}
          {!angebot && kopf.faellig_am && <><dt className="text-muted-foreground">Fällig am</dt><dd className="zahl">{datum(kopf.faellig_am)}</dd></>}
          {angebot && kopf.gueltig_bis && <><dt className="text-muted-foreground">Gültig bis</dt><dd className="zahl">{datum(kopf.gueltig_bis)}</dd></>}
          {angebot && <><dt className="text-muted-foreground">Kosten&shy;voranschlag</dt><dd>{kopf.kv_verbindlich ? "verbindlich" : "unverbindlich"}</dd></>}
          {projekt && (
            <>
              <dt className="text-muted-foreground">Projekt</dt>
              <dd className="min-w-0 truncate">
                <Link to={`/projekte/${projekt.id}`} className="font-medium text-primary hover:underline">{projekt.nummer}</Link> {projekt.name}
              </dd>
            </>
          )}
          {kopf.betreff && <><dt className="text-muted-foreground">Betreff</dt><dd>{kopf.betreff}</dd></>}
          {kopf.reverse_charge && <><dt className="text-muted-foreground">USt</dt><dd>Reverse Charge (§ 19 Abs. 1a UStG)</dd></>}
        </dl>
      </section>
    );
  }

  // ── zugeklappt (Handy) ──
  if (!pc && !offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="flex w-full items-center gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors hover:border-primary/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{kopf.empf_name || "Noch kein Empfänger"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[projekt ? `${projekt.nummer} ${projekt.name}` : angebot ? "Projekt wird angelegt" : "ohne Projekt", datum(kopf.datum), kopf.betreff].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
          <Pencil className="h-4 w-4" /> Kopf
        </span>
      </button>
    );
  }

  const datumFeld = (feld: keyof Kopf, label: string, hilfe?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`k-${feld}`}>{label}</Label>
      <Input
        id={`k-${feld}`}
        type="date"
        className="h-12"
        value={String(kopf[feld] ?? "")}
        onChange={(e) => aendern({ [feld]: e.target.value } as Partial<Kopf>)}
      />
      {hilfe && <p className="text-xs text-muted-foreground">{hilfe}</p>}
    </div>
  );

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 lg:p-5">
      {!pc && (
        <div className="-mb-1 flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold">Kopfdaten</h2>
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={() => setOffen(false)}>
            Zuklappen <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Empfänger */}
        <div className="space-y-2">
          <Label>Kunde</Label>
          <KundeWahl
            wert={kopf.kunde_id}
            onChange={(k) => aendern(k ? empfaengerAusKunde(k) : { kunde_id: null })}
          />
          {(kopf.empf_name || kopf.kunde_id) && (
            <div className="flex items-start justify-between gap-3 rounded-md bg-muted/60 p-3">
              {anschrift}
              <Button variant="ghost" size="sm" className="h-9 shrink-0 gap-1 text-primary" onClick={() => setAnschriftOffen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Anschrift
              </Button>
            </div>
          )}
          {!kopf.empf_name && !kopf.kunde_id && (
            <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setAnschriftOffen(true)}>
              Anschrift ohne Kundenstamm eingeben
            </button>
          )}
        </div>

        {/* Projekt */}
        <div className="space-y-2">
          <Label>Projekt</Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <ProjektWahl
                wert={kopf.projekt_id ?? ""}
                leerText={angebot ? "Neues Projekt beim Speichern" : "Projekt wählen (optional)"}
                onChange={(id, p) => {
                  const werte: Partial<Kopf> = { projekt_id: id };
                  if (!kopf.kunde_id && !kopf.empf_name && p?.kunde_id) {
                    const k = kunden.find((x) => x.id === p.kunde_id);
                    if (k) Object.assign(werte, empfaengerAusKunde(k));
                  }
                  if (!kopf.betreff.trim() && p) werte.betreff = p.name;
                  aendern(werte);
                }}
              />
            </div>
            {kopf.projekt_id && (
              <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" aria-label="Projekt entfernen" onClick={() => aendern({ projekt_id: null })}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {!kopf.projekt_id && angebot && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <FolderKanban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Beim ersten Speichern wird ein Projekt mit Status „Angebot“ angelegt.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="k-betreff">Betreff</Label>
        <Input
          id="k-betreff"
          className="h-12"
          value={kopf.betreff}
          placeholder={angebot ? "z. B. Elektroinstallation Küche und Bad" : "z. B. Zählerplatz erneuert"}
          onChange={(e) => aendern({ betreff: e.target.value })}
        />
      </div>

      <div className={cn("grid gap-3", angebot ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
        {datumFeld("datum", angebot ? "Datum" : "Rechnungsdatum")}
        {angebot
          ? datumFeld("gueltig_bis", "Gültig bis", kopf.gueltig_bis ? undefined : `leer = ${firma?.angebot_gueltig_tage ?? 30} Tage`)
          : (
            <>
              {datumFeld("faellig_am", "Fällig am", kopf.faellig_am ? undefined : `leer = ${firma?.zahlungsziel_tage ?? 14} Tage`)}
              {datumFeld("leistung_von", "Leistung von")}
              {datumFeld("leistung_bis", "Leistung bis")}
            </>
          )}
      </div>

      {angebot && (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="k-kv" className="cursor-pointer">
            <span className="block font-medium">Verbindlicher Kostenvoranschlag</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {kopf.kv_verbindlich
                ? "Preise mit Gewähr — keine Nachforderung, auch wenn es mehr wird (§ 1170a Abs. 1 ABGB)."
                : "Aus = unverbindlich: Wird es beträchtlich mehr, vorher Bescheid geben (§ 1170a Abs. 2 ABGB). Steht so im PDF."}
            </span>
          </Label>
          <Switch id="k-kv" checked={kopf.kv_verbindlich} onCheckedChange={(v) => aendern({ kv_verbindlich: v })} />
        </div>
      )}

      {klein ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Kleinunternehmer — Beleg ohne USt (§ 6 Abs. 1 Z 27 UStG).
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="k-rc" className="cursor-pointer">
              <span className="block font-medium">Reverse Charge</span>
              <span className="block text-xs font-normal text-muted-foreground">Bauleistung an ein Unternehmen — ohne USt</span>
            </Label>
            <Switch id="k-rc" checked={kopf.reverse_charge} onCheckedChange={(v) => aendern({ reverse_charge: v })} />
          </div>
          {kopf.reverse_charge && (
            <p className={cn("rounded-md p-2.5 text-xs", kopf.empf_uid ? "bg-muted/60 text-muted-foreground" : TON_KLASSE.gelb)}>
              Die Steuerschuld geht auf den Leistungsempfänger über (§ 19 Abs. 1a UStG).
              {kopf.empf_uid ? ` UID des Empfängers: ${kopf.empf_uid}.` : " Bitte die UID des Empfängers in der Anschrift eintragen."}
            </p>
          )}
        </div>
      )}

      <AnschriftDialog open={anschriftOffen} onOpenChange={setAnschriftOffen} kopf={kopf} aendern={aendern} />
    </section>
  );
}

/** Einleitung und Schlusstext — vorbelegt aus den Einstellungen */
export function BelegTexte({ kopf, aendern, bearbeitbar, pc }: { kopf: Kopf; aendern: (w: Partial<Kopf>) => void; bearbeitbar: boolean; pc: boolean }) {
  const [offen, setOffen] = useState(pc);
  if (!bearbeitbar && !kopf.einleitung && !kopf.schlusstext) return null;
  return (
    <section className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOffen(!offen)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left lg:px-5">
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold">Einleitung und Schlusstext</span>
          {!offen && <span className="block truncate text-xs text-muted-foreground">{kopf.einleitung || kopf.schlusstext || "leer"}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", offen && "rotate-180")} />
      </button>
      {offen && (
        <div className="space-y-3 px-4 pb-4 lg:px-5">
          {bearbeitbar ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="k-einl">Einleitung (über den Positionen)</Label>
                <Textarea id="k-einl" rows={3} value={kopf.einleitung} onChange={(e) => aendern({ einleitung: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="k-schluss">Schlusstext (unter den Summen)</Label>
                <Textarea id="k-schluss" rows={3} value={kopf.schlusstext} onChange={(e) => aendern({ schlusstext: e.target.value })} />
              </div>
            </>
          ) : (
            <div className="space-y-2 whitespace-pre-line text-sm">
              {kopf.einleitung && <p>{kopf.einleitung}</p>}
              {kopf.schlusstext && <p className="text-muted-foreground">{kopf.schlusstext}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AnschriftDialog({ open, onOpenChange, kopf, aendern }: { open: boolean; onOpenChange: (o: boolean) => void; kopf: Kopf; aendern: (w: Partial<Kopf>) => void }) {
  const feld = (k: keyof Kopf, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`a-${k}`}>{label}</Label>
      <Input id={`a-${k}`} className="h-12" value={String(kopf[k] ?? "")} onChange={(e) => aendern({ [k]: e.target.value } as Partial<Kopf>)} {...props} />
    </div>
  );
  return (
    <FormularDialog
      open={open}
      onOpenChange={onOpenChange}
      titel="Anschrift auf dem Beleg"
      beschreibung="Gilt nur für diesen Beleg — der Kundenstamm bleibt, wie er ist."
      fuss={<Button className="h-12 sm:min-w-40" onClick={() => onOpenChange(false)}>Fertig</Button>}
    >
      {feld("empf_zusatz", "Zeile über dem Namen (optional)", { placeholder: "z. B. Herrn / Frau / z. H." })}
      {feld("empf_name", "Name / Firma")}
      {feld("empf_strasse", "Straße")}
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
        {feld("empf_plz", "PLZ", { inputMode: "numeric" })}
        {feld("empf_ort", "Ort")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {feld("empf_uid", "UID (bei Firmen, Pflicht für Reverse Charge)", { placeholder: "ATU…" })}
        {feld("empf_email", "E-Mail", { type: "email", inputMode: "email" })}
      </div>
    </FormularDialog>
  );
}
