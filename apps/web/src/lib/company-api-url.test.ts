import { describe, expect, it } from "vitest";
import { companyApiUrl } from "./company-api-url";

const tenantId = "cmv96icjx000999kr5ysn8b5r";

describe("company API urls", () => {
  it("builds a list url with the selected company id and leaves placeholders readable", () => {
    const lead = companyApiUrl({
      baseUrl: "http://localhost:3001",
      path: "/api/leads",
      tenantId,
      params: [
        { name: "page", in: "query", required: false },
        { name: "limit", in: "query", required: false },
        { name: "status", in: "query", required: false },
      ],
    });
    expect(lead.url).toBe(`http://localhost:3001/api/leads?tenantId=${tenantId}`);
    expect(lead.queryExample).toBe("&page=1&limit=20&status=...");
    expect(lead.url).not.toMatch(/%3C|%3E/);

    const calls = companyApiUrl({
      baseUrl: "http://localhost:3001",
      path: "/api/call-details",
      tenantId,
      params: [{ name: "leadId", in: "query", required: true }],
    });
    expect(calls.url).toBe(`http://localhost:3001/api/call-details?tenantId=${tenantId}&leadId=<lead-id>`);
    expect(calls.replaceWithRealValue).toEqual(["leadId"]);

    const one = companyApiUrl({
      baseUrl: "http://localhost:3001",
      path: "/api/leads/:id",
      tenantId,
    });
    expect(one.url).toBe(`http://localhost:3001/api/leads/<id>?tenantId=${tenantId}`);
  });
});
