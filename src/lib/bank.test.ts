import { describe, expect, it } from "vitest";
import { bicPruefen, ibanLesbar, ibanPruefen, uidPruefen } from "./bank";

describe("IBAN", () => {
  it("gültige IBAN, mit oder ohne Leerzeichen", () => {
    expect(ibanPruefen("AT61 1904 3002 3457 3201")).toBe("AT611904300234573201");
    expect(ibanPruefen("at611904300234573201")).toBe("AT611904300234573201");
    expect(ibanPruefen("DE89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000");
  });

  it("Zahlendreher und falsche Länge fallen auf", () => {
    expect(ibanPruefen("AT61 1904 3002 3457 3210")).toBeNull();
    expect(ibanPruefen("AT00 0000 0000 0000 0000")).toBeNull();
    expect(ibanPruefen("AT61 1904 3002 3457 320")).toBeNull();
    expect(ibanPruefen("Raiffeisen")).toBeNull();
    expect(ibanPruefen("")).toBeNull();
  });

  it("lesbar in Viererblöcken", () => {
    expect(ibanLesbar("AT611904300234573201")).toBe("AT61 1904 3002 3457 3201");
    expect(ibanLesbar("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });
});

describe("BIC und UID", () => {
  it("BIC mit 8 oder 11 Zeichen", () => {
    expect(bicPruefen("rlnwatww")).toBe("RLNWATWW");
    expect(bicPruefen("GIBAATWWXXX")).toBe("GIBAATWWXXX");
    expect(bicPruefen("GIBA AT")).toBeNull();
  });

  it("UID: Österreich ATU + 8 Ziffern, andere Länder locker", () => {
    expect(uidPruefen("ATU 12345678")).toBe("ATU12345678");
    expect(uidPruefen("ATU1234567")).toBeNull();
    expect(uidPruefen("AT12345678")).toBeNull();
    expect(uidPruefen("DE123456789")).toBe("DE123456789");
    expect(uidPruefen("12345678")).toBeNull();
  });
});
