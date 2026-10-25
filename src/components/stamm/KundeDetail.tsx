import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Mail, Navigation, Pencil, Phone } from "lucide-react";
import { Karte, Kennzahl, ProjektStatusBadge, StatusBadge } from "@/components/Bausteine";
import { Button } from "@/components/ui/button";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { datum, euro, isoTag, zahl } from "@/lib/format";
import { belegStatus, type Kunde } from "@/lib/types";
import { useKundeBelege } from "./stammDaten";

const adresse = (k: Pick<Kunde, "strasse" | "plz" | "ort">) =>
  [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** tel:-Link nur aus Ziffern und + — Leerzeichen und Schrägstriche mag nicht jedes Telefon */
export const telLink = (t: string | null | undefined) => {
  const n = (t ?? "").replace(/[^\d+]/g, "");
  return n ? `tel:${n}` : null;
};
export const mailLink = (e: string | null | undefined) => (e?.trim() ? `mailto:${e.trim()}` : null);
export const kartenLink = (k: Pick<Kunde, "strasse" | "plz" | "ort">) => {
  const a = adresse(k);
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
};

/**
 * Ein Kunde auf einen Blick: Kontakt mit Anrufen/Mail/Navigation, seine
 * Projekte und — für den Chef — Angebote und Rechnungen mit offenem Betrag.
 */
export function KundeDetail({
  kunde, projekte, istChef, onBearbeiten, mitKopf,
}: {
  kunde: Kunde;
  projekte: ProjektMitKunde[];
  istChef: boolean;
  onBearbeiten: () => void;
  /** Name und Bearbeiten oben in der Karte (PC); am Handy steht beides im Seitenkopf */
  mitKopf?: boolean;
}) {
  const { data: belege = [], isLoading: belegeLaden } = useKundeBelege(kunde.id, istChef);
  const heute = isoTag();
  const rechnungen = belege.filter((b) => b.typ === "rechnung");
  const offen = rechnungen.filter((b) => b.status === "offen");
  const ueberfaellig = offen.filter((b) => belegStatus(b, heute) === "ueberfaellig");
  const summe = (l: typeof belege) => l.reduce((s, b) => s + Number(b.brutto ?? 0), 0);
  const bezahlt = rechnungen.filter((b) => b.status === "bezahlt");
  const adr = adresse(kunde);

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-lg border bg-card p-4 lg:p-5">
        {mitKopf && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{kunde.name}</h2>
              <p className="text-sm text-muted-foreground">K{kunde.nummer}{kunde.ansprechpartner && ` · ${kunde.ansprechpartner}`}</p>
            </div>
            <Button variant="outline" className="h-11 shrink-0" onClick={onBearbeiten}>
              <Pencil className="h-4 w-4" /> Bearbeiten
            </Button>
          </div>
        )}
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {!mitKopf && kunde.ansprechpartner && <Angabe titel="Ansprechpartner">{kunde.ansprechpartner}</Angabe>}
          <Angabe titel="Adresse">
            {kunde.strasse || kunde.plz || kunde.ort ? (
              <>{kunde.strasse && <span className="block">{kunde.strasse}</span>}{[kunde.plz, kunde.ort].filter(Boolean).join(" ")}</>
            ) : null}
          </Angabe>
          <Angabe titel="Telefon">{kunde.telefon}</Angabe>
          <Angabe titel="E-Mail"><span className="break-all">{kunde.email}</span></Angabe>
          {kunde.uid && <Angabe titel="UID-Nummer"><span className="font-mono">{kunde.uid}</span></Angabe>}
        </dl>
        <div className="grid grid-cols-3 gap-2">
          <AktionsLink href={telLink(kunde.telefon)} icon={Phone} text="Anrufen" />
          <AktionsLink href={mailLink(kunde.email)} icon={Mail} text="E-Mail" />
          <AktionsLink href={kartenLink(kunde)} icon={Navigation} text="Navigation" extern titel={adr ? `Route zu ${adr}` : undefined} />
        </div>
      </section>

      {kunde.notiz && (
        <Karte titel="Notiz">
          <p className="whitespace-pre-wrap text-sm">{kunde.notiz}</p>
        </Karte>
      )}

      <Karte titel={`Projekte${projekte.length ? ` · ${zahl(projekte.length)}` : ""}`} ohnePolster>
        {projekte.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Noch keine Projekte.</p>
        ) : (
          <ul className="divide-y border-t">
            {projekte.map((p) => (
              <li key={p.id}>
                <Link to={`/projekte/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{[p.nummer, p.ort].filter(Boolean).join(" · ")}</p>
                  </div>
                  <ProjektStatusBadge status={p.status} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Karte>

      {istChef && (
        <Karte titel="Angebote & Rechnungen" ohnePolster>
          {belegeLaden ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Lädt…</p>
          ) : belege.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground lg:px-5">Noch keine Angebote oder Rechnungen.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 px-4 pb-3 lg:px-5">
                <Kennzahl titel="Offen" wert={euro(summe(offen))}
                  unter={offen.length ? `${zahl(offen.length)} Rechnung${offen.length === 1 ? "" : "en"}${ueberfaellig.length ? `, ${zahl(ueberfaellig.length)} überfällig` : ""}` : "nichts offen"} />
                <Kennzahl titel="Bezahlt" wert={euro(summe(bezahlt))} unter={`${zahl(bezahlt.length)} Rechnung${bezahlt.length === 1 ? "" : "en"}`} />
              </div>
              <ul className="divide-y border-t">
                {belege.map((b) => (
                  <li key={b.id}>
                    <Link to={`/belege/${b.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 lg:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {b.typ === "angebot" ? "Angebot" : "Rechnung"} {b.nummer ?? ""}
                          {b.betreff && <span className="font-normal text-muted-foreground"> · {b.betreff}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{datum(b.datum)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="zahl text-sm font-semibold">{euro(b.brutto)}</span>
                        <StatusBadge status={belegStatus(b, heute)} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Karte>
      )}
    </div>
  );
}

function Angabe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{titel}</dt>
      <dd className="mt-0.5">{children || <span className="text-muted-foreground">–</span>}</dd>
    </div>
  );
}

function AktionsLink({ href, icon: I, text, extern, titel }: {
  href: string | null; icon: ComponentType<{ className?: string }>; text: string; extern?: boolean; titel?: string;
}) {
  if (!href) {
    return (
      <Button variant="outline" className="h-12 flex-col gap-0.5 px-1 text-xs" disabled>
        <I className="h-4 w-4" />{text}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" className="h-12 flex-col gap-0.5 px-1 text-xs">
      <a href={href} title={titel} {...(extern ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        <I className="h-4 w-4" />{text}
      </a>
    </Button>
  );
}
