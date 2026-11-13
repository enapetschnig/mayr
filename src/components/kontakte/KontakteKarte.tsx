import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, LocateFixed, MapPinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AnlageMitKunde } from "@/components/anlagen/anlagenDaten";
import type { ProjektMitKunde } from "@/hooks/useDaten";
import { zahl } from "@/lib/format";
import type { Kunde, StatusTon } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useGeokodierung } from "./kontaktDaten";
import {
  adresseText, KONTAKT_ART, kontaktArt, merkmale, PUNKT_LEGENDE, punktTon, pvKurz, type KartenFilter,
} from "./kontaktLogik";

/** Punktfarbe aus den Status-Tokens — ganze Klassennamen, damit Tailwind sie findet */
const PUNKT_KLASSE: Record<StatusTon, string> = {
  grau: "bg-status-grau-fg", blau: "bg-status-blau-fg", gelb: "bg-status-gelb-fg", gruen: "bg-status-gruen-fg",
  rot: "bg-status-rot-fg", cyan: "bg-status-cyan-fg", lila: "bg-status-lila-fg", rosa: "bg-status-rosa-fg",
};

const icons = new Map<StatusTon, L.DivIcon>();
function punkt(ton: StatusTon) {
  let i = icons.get(ton);
  if (!i) {
    // 28 px Trefferfläche, sichtbar 16 px — am Handy gut zu treffen
    i = L.divIcon({
      className: "",
      html: `<span class="flex h-7 w-7 items-center justify-center"><span class="block h-4 w-4 rounded-full border-2 border-card shadow ${PUNKT_KLASSE[ton]}"></span></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -10],
    });
    icons.set(ton, i);
  }
  return i;
}

const FILTER: { wert: KartenFilter; text: string }[] = [
  { wert: "pv", text: "Mit PV" },
  { wert: "speicher", text: "Mit Speicher" },
  { wert: "wallbox", text: "Mit Wallbox" },
  { wert: "laufend", text: "Projekt läuft" },
];

/** Beim ersten Mal (und wenn sich die Auswahl ändert) alle Punkte ins Bild */
function Einpassen({ punkte }: { punkte: [number, number][] }) {
  const map = useMap();
  const schluessel = punkte.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (!punkte.length) return;
    if (punkte.length === 1) map.setView(punkte[0], 14);
    else map.fitBounds(L.latLngBounds(punkte), { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, schluessel]);
  return null;
}

/**
 * Kontakte auf der Karte (OpenStreetMap). Farbe nach Art und Status,
 * Tippen zeigt Name, Adresse und PV-Eckdaten mit „Öffnen“. Koordinaten
 * kommen aus der Datenbank; fehlende sucht „Lage suchen“ (Nominatim, 1/s).
 */
export default function KontakteKarte({
  kontakte, projekte, anlagen, onOeffnen,
}: {
  kontakte: Kunde[];
  projekte: ProjektMitKunde[];
  anlagen: AnlageMitKunde[];
  onOeffnen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Set<KartenFilter>>(new Set());
  const { fehlend, laeuft, starten } = useGeokodierung(kontakte);

  const daten = useMemo(() => {
    const laufend = new Set(projekte.filter((p) => p.status === "aktiv" && p.kunde_id).map((p) => p.kunde_id!));
    const jeKunde = new Map<string, AnlageMitKunde[]>();
    for (const a of anlagen) {
      if (!a.kunde_id || !a.aktiv) continue;
      const l = jeKunde.get(a.kunde_id);
      if (l) l.push(a);
      else jeKunde.set(a.kunde_id, [a]);
    }
    return kontakte.map((k) => {
      const al = jeKunde.get(k.id) ?? [];
      const m = merkmale(al);
      const art = kontaktArt(k.art);
      return { k, art, m, laeuft: laufend.has(k.id), ton: punktTon(art, m, laufend.has(k.id)), pv: al.flatMap(pvKurz).slice(0, 4) };
    });
  }, [kontakte, projekte, anlagen]);

  const sichtbar = daten.filter((d) => d.k.lat != null && d.k.lng != null && [...filter].every((f) =>
    f === "pv" ? d.m.pv : f === "speicher" ? d.m.speicher : f === "wallbox" ? d.m.wallbox : d.laeuft));
  const ohneLage = daten.filter((d) => d.k.lat == null || d.k.lng == null).length;
  const punkte = sichtbar.map((d) => [d.k.lat!, d.k.lng!] as [number, number]);
  const kwp = sichtbar.reduce((s, d) => s + d.m.kwp, 0);

  const umschalten = (f: KartenFilter) => setFilter((alt) => {
    const neu = new Set(alt);
    if (neu.has(f)) neu.delete(f);
    else neu.add(f);
    return neu;
  });

  const suchen = async () => {
    const r = await starten();
    if (!r) return;
    if (r.fehler) toast.error("Kartendienst gerade nicht erreichbar — später noch einmal versuchen.");
    else toast.success(`${zahl(r.gefunden)} von ${zahl(r.gesucht)} Adressen gefunden`);
  };

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTER.map((f) => (
          <button key={f.wert} type="button" aria-pressed={filter.has(f.wert)} onClick={() => umschalten(f.wert)}
            className={cn("h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
              filter.has(f.wert) ? "border-primary bg-primary-soft text-primary" : "bg-card text-muted-foreground hover:text-foreground")}>
            {f.text}
          </button>
        ))}
      </div>

      <div className="isolate overflow-hidden rounded-lg border">
        <MapContainer center={[47.41, 15.27]} zoom={10} scrollWheelZoom className="h-[calc(100dvh-17rem)] min-h-[22rem] w-full lg:h-[calc(100dvh-20rem)]">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
          <Einpassen punkte={punkte} />
          {sichtbar.map((d) => (
            <Marker key={d.k.id} position={[d.k.lat!, d.k.lng!]} icon={punkt(d.ton)} title={d.k.name}>
              <Popup>
                <div className="min-w-48 space-y-1.5 font-sans">
                  <p className="text-sm font-semibold leading-tight text-foreground">{d.k.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[d.art !== "kunde" ? KONTAKT_ART[d.art].text : null, adresseText(d.k)].filter(Boolean).join(" · ")}
                  </p>
                  {d.pv.length > 0 && <p className="text-xs text-foreground">{d.pv.join(" · ")}</p>}
                  {d.laeuft && <p className="text-xs text-foreground">Projekt läuft</p>}
                  <Button size="sm" className="mt-1 h-9 w-full" onClick={() => onOeffnen(d.k.id)}>Öffnen</Button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {PUNKT_LEGENDE.map((l) => (
          <span key={l.ton} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", PUNKT_KLASSE[l.ton])} />{l.text}
          </span>
        ))}
        <span className="ml-auto">
          {zahl(sichtbar.length)} auf der Karte{kwp > 0 && ` · ${zahl(Math.round(kwp * 10) / 10)} kWp`}
        </span>
      </div>

      {ohneLage > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm">
          <MapPinOff className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {zahl(ohneLage)} {ohneLage === 1 ? "Kontakt" : "Kontakte"} ohne Lage
            {fehlend.length < ohneLage && <span className="text-muted-foreground"> · {zahl(ohneLage - fehlend.length)} ohne Ort oder nicht gefunden</span>}
          </span>
          {fehlend.length > 0 && (
            <Button variant="outline" className="h-10" onClick={() => void suchen()} disabled={laeuft}>
              {laeuft ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              {laeuft ? "Sucht … (1 je Sekunde)" : `Lage suchen (${zahl(fehlend.length)})`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
