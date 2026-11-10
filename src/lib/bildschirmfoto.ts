/**
 * Bild vom Bildschirm für einen Änderungswunsch. html2canvas zeichnet den
 * sichtbaren Ausschnitt aus dem DOM nach — ohne Freigabe-Rückfrage, auch am Handy.
 * Was nicht aufs Bild soll, trägt `data-bildschirmfoto="aus"` (der Melde-Knopf).
 */
const AUSBLENDEN = '[data-bildschirmfoto="aus"]';

export async function bildschirmfotoMachen(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const { default: html2canvas } = await import("html2canvas");
    // Volle Inhaltsbreite (breite Tabellen), senkrecht das, was man gerade sieht
    const breite = Math.min(Math.max(window.innerWidth, document.documentElement.scrollWidth || 0), 2600);
    const massstab = breite > 1600 ? 1 : Math.min(2, 1400 / Math.max(1, breite));
    const leinwand = await html2canvas(document.body, {
      x: 0,
      y: window.scrollY,
      width: breite,
      height: window.innerHeight,
      scale: Math.max(1, massstab),
      useCORS: true,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      logging: false,
      ignoreElements: (el) => el.matches?.(AUSBLENDEN) ?? false,
    });
    return leinwand.toDataURL("image/jpeg", 0.85);
  } catch (fehler) {
    // Ohne Bild geht die Meldung trotzdem
    console.warn("Bildschirmfoto nicht möglich:", fehler);
    return null;
  }
}

export function datenUrlZuBlob(datenUrl: string): Blob {
  const [kopf, inhalt] = datenUrl.split(",");
  const mime = kopf.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const roh = atob(inhalt);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
