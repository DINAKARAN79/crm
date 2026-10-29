import { describe, expect, it } from "vitest";
import { formatPhoneWithCountryCode } from "./phone-display";

describe("formatPhoneWithCountryCode", () => {
  it("does not repeat a country code already included in an international phone", () => {
    expect(formatPhoneWithCountryCode("+91", "+9198767848484")).toBe("+91 98767848484");
  });

  it("does not strip an Indian national number that starts with 91", () => {
    expect(formatPhoneWithCountryCode("91", "9123456789")).toBe("+91 9123456789");
  });

  it("adds the country code to a national number", () => {
    expect(formatPhoneWithCountryCode("91", "9876543210")).toBe("+91 9876543210");
  });

  it("handles numbers prefixed with the international dialing code", () => {
    expect(formatPhoneWithCountryCode("91", "00919876543210")).toBe("+91 9876543210");
  });
});
