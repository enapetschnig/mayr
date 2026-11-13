import { describe, expect, it } from "vitest";
import { anleitungFuer, chromeLink, geraetErkennen, inAppBrowser, safariVersion } from "./installieren";
import { einladungsAdresse, einladungsText, mailAdresse, tokenAusPfad, whatsAppAdresse } from "./einladung";

const UA = {
  iphone26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphone18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  whatsappAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 WhatsApp/2.24",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
};

describe("geraetErkennen", () => {
  it("unterscheidet Geräte und Browser", () => {
    expect(geraetErkennen(UA.iphone26, 5)).toBe("ios-safari");
    expect(geraetErkennen(UA.iphoneChrome, 5)).toBe("ios-chrome");
    expect(geraetErkennen(UA.ipad, 5)).toBe("ios-safari");
    expect(geraetErkennen(UA.macSafari, 0)).toBe("mac-safari");
    expect(geraetErkennen(UA.android, 5)).toBe("android-chrome");
    expect(geraetErkennen(UA.samsung, 5)).toBe("android-samsung");
    expect(geraetErkennen(UA.win, 0)).toBe("pc-chrome");
    expect(geraetErkennen(UA.edge, 0)).toBe("pc-edge");
    expect(geraetErkennen(UA.firefox, 0)).toBe("pc-firefox");
  });
  it("erkennt In-App-Browser", () => {
    expect(inAppBrowser(UA.whatsappAndroid)).toBe("WhatsApp");
    expect(inAppBrowser(UA.instagram)).toBe("Instagram");
    expect(inAppBrowser(UA.iphone26)).toBeNull();
    expect(geraetErkennen(UA.instagram, 5)).toBe("inapp");
  });
});

describe("anleitungFuer", () => {
  it("iOS-Version aus Version/NN, nicht aus „iPhone OS 18_6“", () => {
    expect(safariVersion(UA.iphone26)).toBe(26);
    expect(anleitungFuer("ios-safari", false, UA.iphone26).schritte.join(" ")).toMatch(/Mehr anzeigen/);
    expect(anleitungFuer("ios-safari", false, UA.iphone18).schritte[0]).toMatch(/Unten in der Mitte/);
  });
  it("Android mit Angebot: ein Knopf; Samsung: nach Chrome", () => {
    expect(anleitungFuer("android-chrome", true).direkt).toBe(true);
    expect(anleitungFuer("android-samsung", true)).toMatchObject({ direkt: false, chromeKnopf: true });
  });
  it("Firefox am PC sagt ehrlich, dass es keine App wird", () => {
    expect(anleitungFuer("pc-firefox", false).schritte[0]).toMatch(/kann die App nicht installieren/);
  });
  it("Chrome-Link behält die Einladung", () => {
    expect(chromeLink("https://mayr.handwerkapp.at/einladung/abcDEF123_-xyzabcdefghij"))
      .toBe("intent://mayr.handwerkapp.at/einladung/abcDEF123_-xyzabcdefghij#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fmayr.handwerkapp.at%2Feinladung%2FabcDEF123_-xyzabcdefghij;end");
  });
});

describe("einladung", () => {
  const link = einladungsAdresse("https://mayr.handwerkapp.at/", "AbC_-123456789012345678");
  it("Adresse und Token", () => {
    expect(link).toBe("https://mayr.handwerkapp.at/einladung/AbC_-123456789012345678");
    expect(tokenAusPfad("/einladung/AbC_-123456789012345678")).toBe("AbC_-123456789012345678");
    expect(tokenAusPfad("/einladung/<script>")).toBeNull();
  });
  it("Text, WhatsApp und Mail", () => {
    const t = einladungsText({ vorname: "Jürgen", firma: "SETEC", link });
    expect(t).toMatch(/^Hallo Jürgen, du bist zur SETEC-App eingeladen/);
    expect(t.endsWith(link)).toBe(true);
    expect(einladungsText({ vorname: "Stefan", firma: "SETEC", link, zugang: true })).toMatch(/dein Zugang/);
    expect(decodeURIComponent(whatsAppAdresse("A & B"))).toBe("https://wa.me/?text=A & B");
    expect(mailAdresse("Betreff", "x&y")).toBe("mailto:?subject=Betreff&body=x%26y");
  });
});
