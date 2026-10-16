#!/usr/bin/env node
/**
 * Wächter gegen Absturz-Fehler ("Hoppla — ein Fehler").
 *
 * Hintergrund: Zwei Produktionsausfälle hintereinander hatten dieselbe
 * Ursache — eine Variable, die es zur Laufzeit nicht gibt:
 *   • Stundenauswertung: `beschaeftigung` vor der Deklaration benutzt
 *   • Rechnung speichern: `saveBrutto` existierte nicht mehr
 *
 * Beide hätte TypeScript gemeldet — aber `npx tsc --noEmit` prüfte wegen
 * "files: []" in der Wurzel-tsconfig GAR NICHTS, und tsconfig.app.json
 * scheiterte an einer beschädigten types.ts. Der Type-Check war also faktisch
 * abgeschaltet.
 *
 * Dieses Skript prüft die App wirklich und schlägt NUR bei den Fehlerklassen
 * an, die zur Laufzeit zum Absturz führen. Die übrigen (vorbestehenden)
 * Typ-Warnungen werden gezählt, blockieren aber nicht — sonst wäre der
 * Wächter vom ersten Tag an rot und würde ignoriert.
 */
import { execSync } from "node:child_process";

// Fehlerklassen, die zur Laufzeit garantiert knallen:
const FATAL = {
  TS2304: "Name existiert nicht (Cannot find name)",
  TS2448: "Variable vor ihrer Deklaration benutzt",
  TS2454: "Variable benutzt, bevor sie zugewiesen wurde",
  TS2552: "Name existiert nicht (Tippfehler?)",
  TS18004: "Kurzschreibweise ohne passende Variable",
};

let out = "";
try {
  execSync("npx tsc -p tsconfig.app.json --noEmit", { encoding: "utf8", stdio: "pipe" });
} catch (e) {
  out = `${e.stdout || ""}${e.stderr || ""}`;
}

const zeilen = out.split("\n").filter((l) => /error TS\d+/.test(l));
const fatale = zeilen.filter((l) => Object.keys(FATAL).some((c) => l.includes(`error ${c}:`)));

if (fatale.length > 0) {
  console.error("\n❌ ABSTURZ-RISIKO — diese Fehler führen zur Laufzeit zu 'Hoppla — ein Fehler':\n");
  for (const f of fatale) console.error("   " + f.trim());
  console.error(`\n   ${fatale.length} kritische(r) Fehler. Bitte vor dem Ausliefern beheben.\n`);
  process.exit(1);
}

const rest = zeilen.length;
console.log(`✅ Keine Absturz-Risiken gefunden.${rest ? ` (${rest} sonstige Typ-Hinweise — nicht blockierend)` : ""}`);
