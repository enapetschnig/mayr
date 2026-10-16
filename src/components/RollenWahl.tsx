import { useSitzung } from "@/hooks/useSitzung";
import { FirmaBadge } from "@/components/Bausteine";
import { cn } from "@/lib/utils";

export type RollenMap = Record<string, "GU" | "SU" | null>;

/**
 * Je Firma: GU, SU oder nicht dabei. Es gibt höchstens einen GU — wer neu
 * GU wird, macht den bisherigen automatisch zum SU.
 */
export function RollenWahl({ rollen, onChange }: { rollen: RollenMap; onChange: (r: RollenMap) => void }) {
  const { firmen, firma: meine } = useSitzung();

  const setze = (firmaId: string, rolle: "GU" | "SU" | null) => {
    const neu: RollenMap = { ...rollen };
    if (rolle === "GU") {
      Object.keys(neu).forEach((k) => { if (neu[k] === "GU") neu[k] = "SU"; });
    }
    neu[firmaId] = rolle;
    onChange(neu);
  };

  return (
    <div className="rounded-lg border divide-y">
      {firmen.map((f) => {
        const r = rollen[f.id] ?? null;
        return (
          <div key={f.id} className="flex items-center justify-between gap-2 p-2.5">
            <div className="min-w-0 flex items-center gap-2">
              <FirmaBadge firma={f} />
              <span className="text-sm truncate hidden sm:inline">{f.name}</span>
              {f.id === meine?.id && <span className="text-xs text-muted-foreground">(ich)</span>}
            </div>
            <div className="flex rounded-md border overflow-hidden shrink-0">
              {([["GU", "GU"], ["SU", "SU"], [null, "—"]] as const).map(([wert, text], i) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => setze(f.id, wert)}
                  title={wert === "GU" ? "Generalunternehmer" : wert === "SU" ? "Subunternehmer" : "nicht beteiligt"}
                  className={cn("px-3 py-1.5 text-sm font-medium min-w-11", i > 0 && "border-l",
                    r === wert ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="p-2.5 text-xs text-muted-foreground">
        GU = rechnet mit dem Kunden ab · SU = stellt die Rechnung an den GU
      </p>
    </div>
  );
}
