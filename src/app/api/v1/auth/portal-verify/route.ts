import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { signSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/portal-session";
import { env } from "@/lib/config/env";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawToken = searchParams.get("token");
  const appId = searchParams.get("appId");

  if (!rawToken) {
    return NextResponse.json({ error: "MISSING_TOKEN", message: "Verification token is required." }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const magicTokenRecord = await prisma.portalMagicLinkToken.findUnique({
    where: { tokenHash },
    include: { candidate: true },
  });

  if (!magicTokenRecord) {
    return NextResponse.json({ error: "INVALID_TOKEN", message: "Token is invalid or does not exist." }, { status: 401 });
  }

  if (Date.now() > magicTokenRecord.expiresAt.getTime()) {
    return NextResponse.json({ error: "TOKEN_EXPIRED", message: "Verification link has expired." }, { status: 401 });
  }

  // Determine target redirect destination
  let targetPath = "/candidate";
  if (appId) {
    // Verify application belongs to candidate
    const app = await prisma.roleApplication.findFirst({
      where: { id: appId, candidateId: magicTokenRecord.candidateId },
    });
    if (app) {
      targetPath = `/candidate/${app.id}`;
    }
  }

  const claims = {
    candidateId: magicTokenRecord.candidateId,
    email: magicTokenRecord.candidate.email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const signedCookie = signSessionCookie(claims);

  const redirectUrl = new URL(targetPath, env.PUBLIC_PORTAL_BASE_URL);
  const response = NextResponse.redirect(redirectUrl, { status: 303 });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signedCookie,
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store, max-age=0");

  return response;
}
