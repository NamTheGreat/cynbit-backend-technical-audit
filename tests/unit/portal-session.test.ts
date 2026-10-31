import { describe, it, expect } from "vitest";
import { signSessionCookie, verifySessionCookie } from "@/lib/auth/portal-session";

describe("Portal Session HMAC Verification (Remediates SEC-01 & SEC-02)", () => {
  const mockClaims = {
    candidateId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    email: "namankalia1904@gmail.com",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour valid
  };

  it("signs and verifies valid session claims", () => {
    const signed = signSessionCookie(mockClaims);
    expect(signed).toContain(".");

    const verified = verifySessionCookie(signed);
    expect(verified).not.toBeNull();
    expect(verified?.candidateId).toBe(mockClaims.candidateId);
    expect(verified?.email).toBe(mockClaims.email);
  });

  it("rejects tampered session payloads", () => {
    const signed = signSessionCookie(mockClaims);
    const [payloadB64, signature] = signed.split(".");

    // Tamper with candidateId in payload
    const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    decoded.candidateId = "attacker-candidate-uuid-123";
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");

    const tamperedCookie = `${tamperedPayloadB64}.${signature}`;
    const verified = verifySessionCookie(tamperedCookie);
    expect(verified).toBeNull();
  });

  it("rejects tampered HMAC signatures", () => {
    const signed = signSessionCookie(mockClaims);
    const [payloadB64] = signed.split(".");
    const invalidSignature = "invalid_signature_string_that_does_not_match";

    const verified = verifySessionCookie(`${payloadB64}.${invalidSignature}`);
    expect(verified).toBeNull();
  });

  it("rejects expired session cookies", () => {
    const expiredClaims = {
      ...mockClaims,
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    };

    const signed = signSessionCookie(expiredClaims);
    const verified = verifySessionCookie(signed);
    expect(verified).toBeNull();
  });
});
