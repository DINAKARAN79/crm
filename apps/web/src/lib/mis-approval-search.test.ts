import { describe, expect, it } from "vitest";
import { matchesApprovalPacketSearch } from "./mis-approval-search";

const packet = {
  receiptNumber: "RC-2026-000016",
  transactionId: "TXN-7584",
  receivedFrom: "Dina Customer",
  paymentMode: "Bank Transfer",
  lead: {
    leadNumber: "LN000218",
    firstName: "Dina",
    lastName: "Customer",
    company: "DCT Realty",
    phone: "+91 (98979) 78787",
    mobile: "+919876543210",
    email: "dina@example.com",
    owner: { firstName: "Maya", lastName: "Sales", profile: { name: "CRM" } },
  },
  booking: {
    bookingNumber: "BK-2026-0010",
    project: { name: "DCT Paradise" },
    unit: { number: "U015" },
    firstApplicant: { name: "Dina Customer", mobileNumber: "+919876543210" },
    secondApplicant: null,
    quotation: {
      quotationNumber: "QT-2026-000016",
      customerName: "Dina Customer",
      customerPhone: "+919876543210",
      customerEmail: "dina@example.com",
      projectName: "DCT Paradise",
      unitNumber: "U015",
    },
  },
};

describe("matchesApprovalPacketSearch", () => {
  it.each([
    ["receipt", "RC-2026-000016"],
    ["lead", "ln000218"],
    ["booking", "BK-2026-0010"],
    ["customer email", "DINA@EXAMPLE.COM"],
    ["phone with formatting removed", "9897978787"],
    ["phone with country code and punctuation", "+91-98979-78787"],
    ["project", "paradise"],
    ["unit", "U015"],
    ["owner profile", "crm"],
  ])("matches %s search terms", (_label, query) => {
    expect(matchesApprovalPacketSearch(packet, query)).toBe(true);
  });

  it("matches an empty query and rejects unrelated terms", () => {
    expect(matchesApprovalPacketSearch(packet, "   ")).toBe(true);
    expect(matchesApprovalPacketSearch(packet, "not found")).toBe(false);
  });
});
