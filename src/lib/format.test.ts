import { describe, expect, it } from "vitest";
import { zahlLesen } from "./format";

describe("Zahlen aus Eingabefeldern", () => {
  it("Komma und Punkt wie in Österreich", () => {
    expect(zahlLesen("1,5")).toBe(1.5);
    expect(zahlLesen("1.5")).toBe(1.5);
    expect(zahlLesen("1.250")).toBe(1250);
    expect(zahlLesen("1.250,00")).toBe(1250);
    expect(zahlLesen("12.500,50 €")).toBe(12500.5);
    expect(zahlLesen("0.250")).toBe(0.25);
    expect(zahlLesen("-1.250")).toBe(-1250);
    expect(zahlLesen(" 7,5 h")).toBe(7.5);
  });

  it("leer oder unlesbar ist 0", () => {
    expect(zahlLesen("")).toBe(0);
    expect(zahlLesen("abc")).toBe(0);
    expect(zahlLesen(null)).toBe(0);
    expect(zahlLesen(Number.NaN)).toBe(0);
    expect(zahlLesen(3.5)).toBe(3.5);
  });
});
