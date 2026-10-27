/**
 * Handyansicht am PC: Die App läuft in einem Rahmen (iframe) mit Handybreite.
 * Der Rahmen trägt diesen Namen — daran erkennt die App, dass sie darin läuft,
 * und hält ihre Anmeldung getrennt: im Rahmen z. B. als Monteur, daneben am
 * PC weiter als Chef. `window.name` bleibt auch nach Neuladen im Rahmen erhalten.
 */
export const HANDY_RAHMEN = "mayr-handyansicht";

/** Eigener Speicherplatz für die Anmeldung im Rahmen */
export const HANDY_ANMELDUNG = "mayr-handyansicht-auth";

export const imHandyRahmen = () => typeof window !== "undefined" && window.name === HANDY_RAHMEN;
