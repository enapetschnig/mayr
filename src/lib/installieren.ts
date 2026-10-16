/**
 * Installation der App — Erkennung und das Auffangen des Browser-Angebots.
 *
 * Der entscheidende Punkt: Chrome feuert `beforeinstallprompt` genau EINMAL,
 * und zwar kurz nach dem Laden der Seite. Wer erst beim Öffnen eines Dialogs
 * zuzuhören beginnt, hat das Ereignis längst verpasst — und dann steht dort
 * „Auf diesem Gerät nicht verfügbar“, obwohl die Installation ginge.
 *
 * Deshalb wird hier bereits beim Start zugehört, das Ereignis aufgehoben und
 * später verwendet.
 */

type InstallEreignis = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let angebot: InstallEreignis | null = null;
let installiert = false;
const zuhoerer = new Set<() => void>();

/**
 * Merker im Gerät. Der Browser verrät nur, ob die Seite GERADE als App läuft —
 * ruft derselbe Mensch sie später im Browser auf, sieht alles wieder aus wie
 * beim ersten Mal und die App fragt erneut nach der Installation. Der Merker
 * überlebt das, weil installierte App und Browser sich denselben Speicher
 * teilen (auf Android und am PC; auf dem iPhone nicht immer — deshalb wird der
 * Zeitpunkt zusätzlich im Profil festgehalten).
 */
const MERKER = "app.installiert";

function merken(): void {
  try { localStorage.setItem(MERKER, new Date().toISOString()); } catch { /* egal */ }
}

/** Wurde die App auf diesem Gerät schon einmal als App gestartet? */
export function schonEinmalInstalliert(): boolean {
  try { return localStorage.getItem(MERKER) !== null; } catch { return false; }
}

function melden() {
  zuhoerer.forEach((f) => f());
}

/** Einmal beim Start aufrufen, vor allem anderen. */
export function installationBeobachten(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    angebot = e as InstallEreignis;
    melden();
  });

  window.addEventListener("appinstalled", () => {
    installiert = true;
    angebot = null;
    merken();
    melden();
  });

  // Läuft die App gerade als App, ist die Frage ein für alle Mal beantwortet.
  if (laeuftAlsApp()) merken();
}

export function aufAenderung(f: () => void): () => void {
  zuhoerer.add(f);
  return () => zuhoerer.delete(f);
}

export function angebotVorhanden(): boolean {
  return angebot !== null;
}

/** Läuft die App schon als installierte App? */
export function laeuftAlsApp(): boolean {
  if (typeof window === "undefined") return false;
  if (installiert) return true;
  const alsApp = window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: window-controls-overlay)").matches;
  // Safari auf dem iPhone kennt display-mode nicht und meldet es hier.
  const iosApp = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return alsApp || iosApp;
}

/** Das Angebot des Browsers annehmen. Gibt zurück, ob installiert wurde. */
export async function jetztInstallieren(): Promise<boolean> {
  if (!angebot) return false;
  await angebot.prompt();
  const { outcome } = await angebot.userChoice;
  // Chrome gibt das Ereignis nicht zweimal her.
  angebot = null;
  melden();
  return outcome === "accepted";
}

export type Geraet =
  | "ios-safari" | "ios-chrome" | "ios-edge" | "ios-firefox" | "ios-opera"
  | "android-chrome" | "android-samsung" | "android-firefox" | "android-anderer"
  | "pc-chrome" | "pc-edge" | "pc-firefox" | "mac-safari" | "mac-firefox"
  | "pc-anderer";

/**
 * Welches Gerät und welcher Browser?
 *
 * Die Anleitung unterscheidet sich stark, und eine falsche Anleitung ist
 * schlimmer als keine. Deshalb wird hier genauer unterschieden als früher —
 * insbesondere wird Chrome am iPhone nicht mehr mit „geht nicht" abgespeist:
 * Seit iOS 16.4 (Frühjahr 2023) legen auch Chrome, Edge und Firefox eine
 * Web-App auf den Home-Bildschirm. Der Satz „Am iPhone kann nur Safari das"
 * stand hier jahrelang und war schlicht falsch.
 */
export function geraetErkennen(): Geraet {
  if (typeof navigator === "undefined") return "pc-anderer";
  const ua = navigator.userAgent;

  // iPadOS meldet sich seit Jahren als Macintosh — nur der Touch verrät es.
  const istIOS = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  if (istIOS) {
    if (/CriOS\//.test(ua)) return "ios-chrome";
    if (/EdgiOS\//.test(ua)) return "ios-edge";
    if (/FxiOS\//.test(ua)) return "ios-firefox";
    if (/OPT\//.test(ua)) return "ios-opera";
    return "ios-safari";
  }

  if (/Android/.test(ua)) {
    if (/SamsungBrowser\//.test(ua)) return "android-samsung";
    if (/Firefox\//.test(ua)) return "android-firefox";
    if (/EdgA\//.test(ua) || /OPR\//.test(ua)) return "android-anderer";
    if (/Chrome|Chromium/.test(ua)) return "android-chrome";
    return "android-anderer";
  }

  const amMac = /Macintosh/.test(ua);
  if (/Firefox\//.test(ua)) return amMac ? "mac-firefox" : "pc-firefox";
  if (/Edg\//.test(ua)) return "pc-edge";
  if (/Chrome|Chromium/.test(ua)) return "pc-chrome";
  if (amMac && /Safari/.test(ua)) return "mac-safari";
  return "pc-anderer";
}

export type Anleitung = {
  titel: string;
  schritte: string[];
  /** Hinweis, wenn es Fallstricke gibt oder der Browser es nicht kann. */
  hinweis?: string;
  /** Gibt es einen Knopf, der es direkt erledigt? */
  direkt: boolean;
};

/**
 * Der Ausweichweg über Safari. Steht bei jedem iPhone-Browser dabei, bei dem
 * der Punkt je nach Version fehlen kann — dann scheitert niemand.
 */
const SAFARI_AUSWEG =
  "Findest du den Punkt nicht, mach die Seite in Safari auf — dort geht es sicher.";

export function anleitungFuer(geraet: Geraet, angebotDa: boolean): Anleitung {
  switch (geraet) {
    case "ios-safari":
      return {
        titel: "iPhone oder iPad mit Safari",
        direkt: false,
        schritte: [
          "Unten in der Mitte auf das Teilen-Zeichen tippen — das Quadrat mit dem Pfeil nach oben. Am iPad sitzt es oben rechts.",
          "In der Liste nach unten wischen, bis „Zum Home-Bildschirm“ kommt, und drauftippen.",
          "Oben rechts auf „Hinzufügen“ tippen. Fertig.",
        ],
      };

    case "ios-chrome":
      return {
        titel: "iPhone oder iPad mit Chrome",
        direkt: false,
        schritte: [
          "Neben der Adresszeile auf das Teilen-Zeichen tippen — das Quadrat mit dem Pfeil nach oben. Hast du die Adresszeile unten, sitzt es auch unten.",
          "„Zum Startbildschirm hinzufügen“ auswählen.",
          "Den Namen so lassen und oben rechts auf „Hinzufügen“ tippen.",
        ],
        hinweis: `Das geht mit Chrome seit iOS 16.4. Chrome sollte aktuell sein. ${SAFARI_AUSWEG}`,
      };

    case "ios-edge":
      return {
        titel: "iPhone oder iPad mit Edge",
        direkt: false,
        schritte: [
          "Unten auf das Menü mit den drei Strichen tippen.",
          "„Teilen“ antippen.",
          "Nach unten wischen bis „Zum Home-Bildschirm“ und drauftippen.",
          "Oben rechts auf „Hinzufügen“ tippen.",
        ],
        hinweis: `Bei Edge fehlt dieser Punkt je nach Version. ${SAFARI_AUSWEG}`,
      };

    case "ios-firefox":
      return {
        titel: "iPhone oder iPad mit Firefox",
        direkt: false,
        schritte: [
          "Rechts unten auf das Menü mit den drei Strichen tippen.",
          "„Teilen“ antippen.",
          "Nach unten wischen bis „Zum Home-Bildschirm“ und drauftippen.",
          "Namen bestätigen und auf „Hinzufügen“ tippen.",
        ],
        hinweis: `Bei Firefox fehlt dieser Punkt je nach Version. ${SAFARI_AUSWEG}`,
      };

    case "ios-opera":
      return {
        titel: "iPhone oder iPad mit Opera",
        direkt: false,
        schritte: [
          "Die Seite in Safari aufmachen.",
          "Unten auf das Teilen-Zeichen tippen — das Quadrat mit dem Pfeil nach oben.",
          "„Zum Home-Bildschirm“ wählen und mit „Hinzufügen“ bestätigen.",
        ],
        hinweis: "Opera am iPhone kann keine App auf den Startbildschirm legen. Mit Safari geht es.",
      };

    case "android-chrome":
      return {
        titel: "Android mit Chrome",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „Jetzt installieren“ tippen und mit „Installieren“ bestätigen."]
          : [
              "Rechts oben neben der Adresszeile auf die drei Punkte tippen.",
              "„Installieren und Verknüpfung erstellen“ antippen. Bei älteren Versionen heisst es „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
              "Auf „Installieren“ tippen.",
            ],
        hinweis: angebotDa
          ? undefined
          : "Oft blendet Chrome von selbst unten einen Balken „App installieren“ ein — da kannst du gleich drauftippen.",
      };

    case "android-samsung":
      return {
        titel: "Android mit Samsung Internet",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „Jetzt installieren“ tippen und bestätigen."]
          : [
              "Rechts unten auf das Menü mit den drei Strichen tippen.",
              "„Seite hinzufügen zu“ antippen.",
              "„Startbildschirm“ auswählen und bestätigen.",
            ],
        hinweis: "Manchmal steht in der Adresszeile schon ein kleines Installieren-Zeichen — das geht schneller.",
      };

    case "android-firefox":
      return {
        titel: "Android mit Firefox",
        direkt: false,
        schritte: [
          "Auf das Menü mit den drei Punkten tippen — je nach Einstellung oben oder unten neben der Adresszeile.",
          "„Installieren“ antippen. Steht dort „Zum Startbildschirm hinzufügen“, nimm das.",
          "Auf „Automatisch hinzufügen“ tippen.",
        ],
      };

    case "android-anderer":
      return {
        titel: "Android",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „Jetzt installieren“ tippen und bestätigen."]
          : [
              "Das Menü des Browsers öffnen — meist drei Punkte oder drei Striche.",
              "„App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.",
              "Bestätigen.",
            ],
        hinweis: "Am zuverlässigsten geht es mit Chrome. In anderen Browsern heisst der Punkt manchmal anders.",
      };

    case "pc-chrome":
      return {
        titel: "Computer mit Chrome",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „Jetzt installieren“ klicken und mit „Installieren“ bestätigen."]
          : [
              "Rechts in der Adresszeile auf das Installieren-Zeichen klicken — ein kleiner Bildschirm mit einem Pfeil.",
              "Ist es nicht da: rechts oben die drei Punkte, dann „Streamen, speichern und teilen“ und „Seite als App installieren…“.",
              "Auf „Installieren“ klicken.",
            ],
        hinweis: "Danach liegt die App am Desktop und im Startmenü. Am Mac im Programme-Ordner und im Dock.",
      };

    case "pc-edge":
      return {
        titel: "Computer mit Edge",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „Jetzt installieren“ klicken und mit „Installieren“ bestätigen."]
          : [
              "Rechts oben auf die drei Punkte klicken.",
              "„Apps“ anklicken.",
              "„Diese Website als App installieren“ wählen.",
              "Namen so lassen und auf „Installieren“ klicken.",
            ],
        hinweis: "Taucht rechts in der Adresszeile ein Installieren-Zeichen auf, geht es damit schneller.",
      };

    case "pc-firefox":
      return {
        titel: "Windows-PC mit Firefox",
        direkt: false,
        schritte: [
          "Rechts in der Adresszeile auf das Web-App-Zeichen klicken — beim Draufbleiben steht dort „Tab zur Taskleiste hinzufügen“.",
          "Bestätigen. Die Seite hängt danach in der Taskleiste und im Startmenü.",
        ],
        hinweis: "Geht ab Firefox 143 und nur unter Windows. Siehst du das Zeichen nicht, nimm Chrome oder Edge — dort ist es auch näher an einer echten App.",
      };

    case "mac-safari":
      return {
        titel: "Mac mit Safari",
        direkt: false,
        schritte: [
          "Oben in der Menüleiste auf „Ablage“ klicken.",
          "„Zum Dock hinzufügen…“ anklicken.",
          "Namen so lassen und auf „Hinzufügen“ klicken.",
        ],
        hinweis: "Geht ab macOS Sonoma. Wenn du beim Anlegen angemeldet warst, bleibst du es auch in der App.",
      };

    case "mac-firefox":
      return {
        titel: "Mac mit Firefox",
        direkt: false,
        schritte: [
          "Die Seite in Safari aufmachen, dann „Ablage“ → „Zum Dock hinzufügen…“.",
          "Oder Chrome nehmen und dort in der Adresszeile auf das Installieren-Zeichen klicken.",
        ],
        hinweis: "Firefox kann am Mac keine Web-App anlegen — die Funktion gibt es dort bisher nur unter Windows.",
      };

    default:
      return {
        titel: "Installieren",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „Jetzt installieren“ tippen und bestätigen."]
          : [
              "Das Menü des Browsers öffnen.",
              "„App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.",
            ],
      };
  }
}
