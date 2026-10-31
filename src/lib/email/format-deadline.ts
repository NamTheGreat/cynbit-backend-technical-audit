/**
 * Formats an assessment deadline explicitly in Indian Standard Time (Asia/Kolkata, UTC+05:30)
 * AND UTC so candidates in India and global reviewers see identical, unambiguous deadlines.
 *
 * Remediates OPS-02: Eliminates the 5.5-hour deadline discrepancy where email templates
 * rendered server-local UTC without a timezone label while the candidate portal rendered IST.
 */

export interface FormattedDeadline {
  primaryIst: string;
  secondaryUtc: string;
  iso8601: string;
  rfc5545Utc: string;
}

export function formatAssessmentDeadline(deadlineUtc: Date): FormattedDeadline {
  const istFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const utcFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // RFC-5545 iCalendar UTC format: YYYYMMDDTHHMMSSZ
  const rfc5545Utc = deadlineUtc
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  return {
    primaryIst: `${istFormatter.format(deadlineUtc)} IST (UTC+05:30)`,
    secondaryUtc: `${utcFormatter.format(deadlineUtc)} UTC`,
    iso8601: deadlineUtc.toISOString(),
    rfc5545Utc,
  };
}
