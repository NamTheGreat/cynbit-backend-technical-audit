import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/config/env";

export const SESSION_COOKIE_NAME = "__Host-cynbit_candidate_sess";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 3; // 72 hours (covers 48h assessment window)

export interface CandidateSessionClaims {
  candidateId: string;
  email: string;
  iat: number;
  exp: number;
}

export class PortalAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "PortalAuthError";
  }
}

/**
 * Generates a 256-bit cryptographically secure capability token and stores only its
 * SHA-256 digest in PostgreSQL so database read-replica leaks cannot compromise active sessions.
 * Remediates SEC-01 and SEC-02.
 */
export async function issuePortalMagicLinkToken(
  candidateId: string,
  ttlHours = 72,
  clientIp?: string
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url"); // 256 bits of CSPRNG entropy
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  await prisma.portalMagicLinkToken.create({
    data: {
      candidateId,
      tokenHash,
      expiresAt,
      createdIp: clientIp ?? null,
    },
  });

  return rawToken;
}

/**
 * Signs candidate session claims using HMAC-SHA256 with constant-time verification.
 */
export function signSessionCookie(claims: CandidateSessionClaims): string {
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.PORTAL_SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies HMAC-SHA256 signed session cookie with constant-time timingSafeEqual.
 */
export function verifySessionCookie(cookieValue: string): CandidateSessionClaims | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", env.PORTAL_SESSION_SECRET)
    .update(payloadB64)
    .digest("base64url");

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as CandidateSessionClaims;
    if (Date.now() >= claims.exp * 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Enforces authenticated candidate access and verifies role application ownership.
 * Throws 401 if unauthenticated, 403 if attempting horizontal pivot to another candidate's application.
 */
export async function requireAuthenticatedCandidateApplication(applicationId: string) {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawCookie) {
    throw new PortalAuthError("Missing candidate portal session cookie. Remediates SEC-01.", 401);
  }

  const claims = verifySessionCookie(rawCookie);
  if (!claims) {
    throw new PortalAuthError("Invalid or expired candidate portal session.", 401);
  }

  // Single joined query fetching active application + candidate sibling applications (prevents N+1 & BOLA)
  const application = await prisma.roleApplication.findUnique({
    where: { id: applicationId },
    include: {
      deliverables: { orderBy: { slotIndex: "asc" } },
      candidate: {
        include: {
          applications: {
            select: { id: true, roleTitle: true, roleSlug: true, status: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!application) {
    throw new PortalAuthError("Application not found.", 404);
  }

  if (application.candidateId !== claims.candidateId) {
    // Strictly prevent horizontal privilege escalation across candidates (OWASP API1:2023 BOLA)
    throw new PortalAuthError("Forbidden: Application does not belong to authenticated candidate.", 403);
  }

  return application;
}
