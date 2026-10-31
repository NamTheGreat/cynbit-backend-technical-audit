import { describe, it, expect } from "vitest";
import { formatAssessmentDeadline } from "@/lib/email/format-deadline";

describe("formatAssessmentDeadline (Remediates OPS-02)", () => {
  it("formats UTC timestamp accurately into Indian Standard Time (+05:30) and UTC", () => {
    // 2026-11-01T10:00:58Z should format to 3:30 PM IST
    const deadline = new Date("2026-11-01T10:00:58.000Z");
    const result = formatAssessmentDeadline(deadline);

    expect(result.primaryIst).toContain("3:30 pm");
    expect(result.primaryIst).toContain("IST (UTC+05:30)");
    expect(result.secondaryUtc).toBe("01/11/2026, 10:00 UTC");
    expect(result.iso8601).toBe("2026-11-01T10:00:58.000Z");
    expect(result.rfc5545Utc).toBe("20261101T100058Z");
  });

  it("handles morning and evening hour boundaries with unambiguous AM/PM indicators", () => {
    const morningUtc = new Date("2026-10-15T07:39:25.000Z");
    const result = formatAssessmentDeadline(morningUtc);

    // 07:39 UTC + 5:30 = 13:09 IST (1:09 PM)
    expect(result.primaryIst).toContain("1:09 pm");
    expect(result.secondaryUtc).toBe("15/10/2026, 07:39 UTC");
  });
});
