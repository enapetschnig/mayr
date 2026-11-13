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

/*
  Das Ereignis kann schon kommen, bevor das App-Bündel geladen ist — am
  Handy mit schwachem Netz dauert das Laden Sekunden. Ein kleines Skript in
  index.html fängt es deshalb sofort ab und legt es hier ab (wie in der
  Installateur-Demo). installationBeobachten() übernimmt es von dort.
*/
declare global {
  interface Window { __installPrompt?: InstallEreignis | null }
}

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

  angebot = window.__installPrompt ?? null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    angebot = e as InstallEreignis;
    window.__installPrompt = angebot;
    melden();
  });

  window.addEventListener("appinstalled", () => {
    installiert = true;
    angebot = null;
    window.__installPrompt = null;
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
  const ereignis = angebot;
  try {
    await ereignis.prompt();
    const { outcome } = await ereignis.userChoice;
    if (outcome === "accepted") merken();
    return outcome === "accepted";
  } finally {
    // Chrome gibt das Ereignis nicht zweimal her. appinstalled kann schon
    // während prompt() feuern — ein inzwischen neues Angebot behalten.
    if (angebot === ereignis) angebot = null;
    if (window.__installPrompt === ereignis) window.__installPrompt = null;
    melden();
  }
}

export type Geraet =
  | "ios-safari" | "ios-chrome" | "ios-edge" | "ios-firefox" | "ios-opera"
  | "android-chrome" | "android-samsung" | "android-firefox" | "android-anderer"
  | "pc-chrome" | "pc-edge" | "pc-firefox" | "mac-safari" | "mac-firefox"
  | "pc-anderer" | "inapp" | "android-edge" | "android-opera";

/** iPhone oder iPad (auch iPadOS, das sich als Mac meldet)? */
export function istIOS(geraet: Geraet = geraetErkennen()): boolean {
  return geraet.startsWith("ios-");
}

/** Handy oder Tablet — dort erinnert die App an die Installation. */
export function istMobil(geraet: Geraet = geraetErkennen()): boolean {
  return geraet.startsWith("ios-") || geraet.startsWith("android-") || geraet === "inapp";
}

/** Link innerhalb von WhatsApp, Instagram, Facebook …? Dort lässt sich nichts installieren. */
export function inAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): string | null {
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/TikTok|BytedanceWebview|musical_ly/i.test(ua)) return "TikTok";
  if (/Line\//i.test(ua)) return "LINE";
  if (/Twitter/i.test(ua)) return "X";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Telegram/i.test(ua)) return "Telegram";
  if (/GSA\//.test(ua) && /iPhone|iPad/.test(ua)) return "Google-App";
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return "einer App";
  /*
    iOS-Webviews nennen ihre Ursprungs-App oft nicht — ihnen fehlt aber
    „Safari/". Genauso fehlt es aber der eigenen Home-App (standalone)!
    Die ist natürlich kein fremdes Fenster.
  */
  const standalone = typeof navigator !== "undefined"
    && (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!standalone && /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)
    && !/CriOS|FxiOS|EdgiOS|OPT\//.test(ua)) return "einer App";
  return null;
}

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
export function geraetErkennen(
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
  touch = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
): Geraet {
  if (!ua) return "pc-anderer";
  if (inAppBrowser(ua)) return "inapp";

  // iPadOS meldet sich seit Jahren als Macintosh — nur der Touch verrät es.
  const aufIOS = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && touch > 1);

  if (aufIOS) {
    if (/CriOS\//.test(ua)) return "ios-chrome";
    if (/EdgiOS\//.test(ua)) return "ios-edge";
    if (/FxiOS\//.test(ua)) return "ios-firefox";
    if (/OPT\//.test(ua)) return "ios-opera";
    return "ios-safari";
  }

  if (/Android/.test(ua)) {
    if (/SamsungBrowser\//.test(ua)) return "android-samsung";
    if (/Firefox\//.test(ua)) return "android-firefox";
    if (/EdgA\//.test(ua)) return "android-edge";
    if (/OPR\/|Opera/.test(ua)) return "android-opera";
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
  /** Platzhalter [teilen] [punkte] [mehr] [plus] werden als Bild des Zeichens gezeigt (Bedienzeichen.tsx). */
  schritte: string[];
  /** Hinweis, wenn es Fallstricke gibt oder der Browser es nicht kann. */
  hinweis?: string;
  /** Gibt es einen Knopf, der es direkt erledigt? */
  direkt: boolean;
  /** Android-Browser, in dem es mit Chrome besser geht: Knopf „In Chrome öffnen“ zeigen. */
  chromeKnopf?: boolean;
};

/** Diese Seite in Chrome öffnen (Android) — aus Samsung Internet, Firefox oder einem In-App-Browser. */
export function chromeLink(adresse: string): string {
  const u = new URL(adresse);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(adresse)};end`;
}

/**
 * Der Ausweichweg über Safari. Steht bei jedem iPhone-Browser dabei, bei dem
 * der Punkt je nach Version fehlen kann — dann scheitert niemand.
 */
const SAFARI_AUSWEG =
  "Findest du den Punkt nicht, mach die Seite in Safari auf — dort geht es sicher.";

/**
 * Hauptversion von Safari. Seit iOS 26 steht im User-Agent als Systemversion
 * eingefroren „18_6" — verlässlich ist nur „Version/26".
 */
export function safariVersion(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): number | null {
  const m = ua.match(/Version\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function anleitungFuer(
  geraet: Geraet,
  angebotDa: boolean,
  ua = typeof navigator === "undefined" ? "" : navigator.userAgent,
): Anleitung {
  switch (geraet) {
    case "inapp":
      return {
        titel: "Der Link ist in einer anderen App aufgegangen",
        direkt: false,
        schritte: [
          "Oben oder unten auf das Menü tippen — meist drei Punkte (⋯ oder ⋮) oder ein Kompass.",
          "„Im Browser öffnen“, „In Safari öffnen“ oder „In Chrome öffnen“ wählen.",
          "Im Browser geht es genau hier weiter.",
        ],
        hinweis: "Fehlt der Menüpunkt: unten auf „Link kopieren“ tippen und die Adresse in Safari (iPhone) oder Chrome (Android) einfügen. In diesem Fenster lässt sich die App nicht installieren.",
      };

    case "ios-safari":
      /*
        iOS 26 hat das Teilen-Menü umgebaut (Gerätetest Christoph, 27.09.2026):
        Das Teilen-Zeichen sitzt bei der kompakten Leiste hinter den drei
        Punkten, und „Zum Home-Bildschirm" erscheint erst nach „Mehr anzeigen".
        Die alte Anleitung („nach unten wischen") führte dort ins Leere.
      */
      if ((safariVersion(ua) ?? 26) >= 26) {
        return {
          titel: "iPhone oder iPad mit Safari",
          direkt: false,
          schritte: [
            "Unten rechts neben der Adresse auf die drei Punkte [punkte] tippen, dann auf „Teilen“ [teilen]. Siehst du das Teilen-Zeichen [teilen] schon direkt, tipp gleich darauf. Am iPad sitzt es oben rechts.",
            "Im Teilen-Menü auf „Mehr anzeigen“ [mehr] tippen.",
            "Auf „Zum Home-Bildschirm“ [plus] tippen (kann auch „Zum Startbildschirm hinzufügen“ heissen).",
            "„Als Web-App öffnen“ eingeschaltet lassen und oben rechts auf „Hinzufügen“ tippen. Fertig.",
          ],
          hinweis: "Fehlt „Zum Home-Bildschirm“ [plus] auch nach „Mehr anzeigen“? Dann ganz unten auf „Aktionen bearbeiten“ tippen und es dazunehmen.",
        };
      }
      return {
        titel: "iPhone oder iPad mit Safari",
        direkt: false,
        schritte: [
          "Unten in der Mitte auf das Teilen-Zeichen [teilen] tippen. Am iPad sitzt es oben rechts neben der Adresse.",
          "In der Liste nach unten wischen, bis „Zum Home-Bildschirm“ [plus] kommt, und drauftippen. Steht dort „Mehr anzeigen“ [mehr], zuerst darauf tippen.",
          "Oben rechts auf „Hinzufügen“ tippen. Fertig.",
        ],
        hinweis: "Fehlt „Zum Home-Bildschirm“ [plus]? Ganz unten im Teilen-Menü auf „Aktionen bearbeiten“ tippen und es dazunehmen.",
      };

    case "ios-chrome":
      return {
        titel: "iPhone oder iPad mit Chrome",
        direkt: false,
        schritte: [
          "Neben der Adresszeile auf das Teilen-Zeichen [teilen] tippen. Hast du die Adresszeile unten, sitzt es auch unten.",
          "„Zum Home-Bildschirm“ [plus] auswählen (kann auch „Zum Startbildschirm hinzufügen“ heissen). Steht dort zuerst „Mehr anzeigen“ [mehr], vorher darauf tippen.",
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
          "Nach unten wischen bis „Zum Home-Bildschirm“ [plus] und drauftippen. Steht dort „Mehr anzeigen“ [mehr], zuerst darauf tippen.",
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
          "Nach unten wischen bis „Zum Home-Bildschirm“ [plus] und drauftippen. Steht dort „Mehr anzeigen“ [mehr], zuerst darauf tippen.",
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
          "Unten auf das Teilen-Zeichen [teilen] tippen — bei neuem iOS zuerst die drei Punkte [punkte], dann „Teilen“.",
          "„Mehr anzeigen“ [mehr], dann „Zum Home-Bildschirm“ [plus] wählen und mit „Hinzufügen“ bestätigen.",
        ],
        hinweis: "Opera am iPhone kann keine App auf den Startbildschirm legen. Mit Safari geht es.",
      };

    case "android-chrome":
      return {
        titel: "Android mit Chrome",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „App installieren“ tippen und mit „Installieren“ bestätigen."]
          : [
              "Rechts oben neben der Adresszeile auf die drei Punkte tippen.",
              "„Installieren und Verknüpfung erstellen“ antippen. Bei älteren Versionen heisst es „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
              "Auf „Installieren“ tippen.",
            ],
        hinweis: angebotDa
          ? undefined
          : "Oft blendet Chrome von selbst unten einen Balken „App installieren“ ein — da kannst du gleich drauftippen. "
            + "Steht oben „In Chrome öffnen“ (Link aus WhatsApp oder Gmail), tippe zuerst darauf.",
      };

    /*
      Samsung Internet baut die App mit einer veralteten Android-Version —
      Android 14+ blockiert sie dann („für eine ältere Android-Version
      entwickelt“, SamsungInternet/support#123). Deshalb nach Chrome schicken.
    */
    case "android-samsung":
      return {
        titel: "Android mit Samsung Internet",
        direkt: false,
        chromeKnopf: true,
        schritte: [
          "Auf „In Chrome öffnen“ tippen — mit Chrome klappt die Installation sicher.",
          "In Chrome auf „App installieren“ tippen und bestätigen.",
        ],
        hinweis: "Ohne Chrome: in Samsung Internet rechts unten das Menü mit den drei Strichen, dann „Seite hinzufügen zu“ → „Startbildschirm“.",
      };

    case "android-firefox":
      return {
        titel: "Android mit Firefox",
        direkt: false,
        chromeKnopf: true,
        schritte: [
          "Auf das Menü mit den drei Punkten tippen — je nach Einstellung oben oder unten neben der Adresszeile.",
          "„Installieren“ antippen. Steht dort „Zum Startbildschirm hinzufügen“, nimm das.",
          "Auf „Automatisch hinzufügen“ tippen.",
        ],
      };

    case "android-edge":
      return {
        titel: "Android mit Edge",
        direkt: angebotDa,
        chromeKnopf: !angebotDa,
        schritte: angebotDa
          ? ["Auf „App installieren“ tippen und bestätigen."]
          : [
              "Unten auf das Menü mit den drei Strichen tippen.",
              "„Zum Telefon hinzufügen“ oder „App installieren“ wählen.",
              "Mit „Installieren“ bestätigen.",
            ],
      };

    case "android-opera":
      return {
        titel: "Android mit Opera",
        direkt: angebotDa,
        chromeKnopf: !angebotDa,
        schritte: angebotDa
          ? ["Auf „App installieren“ tippen und bestätigen."]
          : [
              "Das Menü öffnen.",
              "„Zum Startbildschirm hinzufügen“ wählen.",
              "Bestätigen. Klappt es nicht, den Link in Chrome öffnen.",
            ],
      };

    case "android-anderer":
      return {
        titel: "Android",
        direkt: angebotDa,
        chromeKnopf: !angebotDa,
        schritte: angebotDa
          ? ["Auf „App installieren“ tippen und bestätigen."]
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
          ? ["Auf „App installieren“ klicken und mit „Installieren“ bestätigen."]
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
          ? ["Auf „App installieren“ klicken und mit „Installieren“ bestätigen."]
          : [
              "Rechts oben auf die drei Punkte klicken.",
              "„Apps“ anklicken.",
              "„Diese Website als App installieren“ wählen.",
              "Namen so lassen und auf „Installieren“ klicken.",
            ],
        hinweis: "Taucht rechts in der Adresszeile ein Installieren-Zeichen auf, geht es damit schneller.",
      };

    /* Ehrlich bleiben: Firefox legt am PC keine richtige App an. */
    case "pc-firefox":
      return {
        titel: "Computer mit Firefox",
        direkt: false,
        schritte: [
          "Firefox kann die App nicht installieren. Am besten diese Seite in Chrome oder Edge öffnen und dort rechts in der Adresszeile auf das Installieren-Zeichen klicken.",
          "Oder in Firefox bleiben und ein Lesezeichen setzen: Strg + D drücken. Die App funktioniert auch so.",
        ],
        hinweis: "Neuere Firefox unter Windows haben in der Adresszeile „Tab zur Taskleiste hinzufügen“ — das ist keine eigene App, geht aber auch.",
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
        hinweis: "Firefox kann am Mac keine App anlegen. Ohne App geht es auch: ein Lesezeichen setzen (Cmd + D).",
      };

    default:
      return {
        titel: "Installieren",
        direkt: angebotDa,
        schritte: angebotDa
          ? ["Auf „App installieren“ tippen und bestätigen."]
          : [
              "Das Menü des Browsers öffnen.",
              "„App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.",
            ],
      };
  }
}
