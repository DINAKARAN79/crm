import { describe, expect, it } from "vitest";
import { sortFollowUpsByStatus } from "./follow-up-order";

describe("sortFollowUpsByStatus", () => {
  it("orders scheduled, missed, then completed follow-ups", () => {
    const followUps = [
      { id: "completed", isCompleted: true, isMissed: false, dueDate: "2026-01-01" },
      { id: "missed", isCompleted: false, isMissed: true, dueDate: "2026-01-01" },
      { id: "scheduled-later", isCompleted: false, isMissed: false, dueDate: "2026-02-01" },
      { id: "scheduled-first", isCompleted: false, isMissed: false, dueDate: "2026-01-01" },
    ];

    expect(sortFollowUpsByStatus(followUps).map((followUp) => followUp.id)).toEqual([
      "scheduled-first",
      "scheduled-later",
      "missed",
      "completed",
    ]);
    expect(followUps[0].id).toBe("completed");
  });
});
