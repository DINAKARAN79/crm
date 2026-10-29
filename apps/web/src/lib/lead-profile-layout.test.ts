import { describe, expect, it } from "vitest";
import { selectLeadPageLayout } from "./lead-profile-layout";

const defaultLayout = { id: "default", name: "Default Layout", isDefault: true };
const presalesLayout = { id: "presales", name: "presales", isDefault: false };

describe("selectLeadPageLayout", () => {
  it("uses the matching profile layout before the default", () => {
    expect(selectLeadPageLayout([defaultLayout, presalesLayout], defaultLayout, "  Presales "))
      .toBe(presalesLayout);
  });

  it("falls back to the default for profiles without a matching layout", () => {
    expect(selectLeadPageLayout([defaultLayout, presalesLayout], defaultLayout, "Sales"))
      .toBe(defaultLayout);
  });

  it("uses the default layout when no profile name is available", () => {
    expect(selectLeadPageLayout([defaultLayout, presalesLayout], defaultLayout))
      .toBe(defaultLayout);
  });

  it("uses the first available layout if the default is missing", () => {
    expect(selectLeadPageLayout([presalesLayout], null, "Sales"))
      .toBe(presalesLayout);
  });

  it("uses an explicit profile assignment before a layout named like the profile", () => {
    expect(selectLeadPageLayout([defaultLayout, presalesLayout], defaultLayout, "Presales", "default"))
      .toBe(defaultLayout);
  });
});
