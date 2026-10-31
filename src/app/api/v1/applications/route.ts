import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/cache/redis";
import { env } from "@/lib/config/env";

export const QualificationSchema = z.object({
  highestQualification: z.string().min(2).max(80),
  degree: z.string().min(2).max(80),
  specialization: z.string().min(2).max(120),
  institution: z.string().min(2).max(160),
  graduationYear: z.number().int().min(1980).max(2035),
  educationStatus: z.enum(["Completed", "Currently Pursuing", "Expected to Graduate"]),
  scoreSystem: z.enum(["CGPA (Scale 1-10)", "Percentage (%)"]),
  scoreValue: z.number().positive().max(100),
});

export const ApplicationPayloadSchema = z.object({
  roleSlug: z.string().regex(/^[a-z0-9-]+$/).max(80),
  roleTitle: z.string().min(3).max(120),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().regex(/^\+?[0-9\s-]{10,16}$/),
  whatsappNumber: z.string().regex(/^\+?[0-9\s-]{10,16}$/).optional(),
  dateOfBirth: z.string().date(),
  gender: z.enum(["Male", "Female", "Other", "Prefer not to say"]),
  currentCity: z.string().trim().min(2).max(80),
  permanentAddress: z.string().trim().min(5).max(300),
  portfolioUrl: z.string().url().startsWith("https://"),
  linkedinUrl: z.string().url().startsWith("https://"),
  githubOrBehanceUrl: z.string().url().startsWith("https://").optional(),
  noticePeriod: z.string().min(2).max(60),
  technicalSkills: z.array(z.string().trim().min(1).max(50)).min(1).max(30),
  qualifications: z.array(QualificationSchema).min(1).max(5),
  whyCynbitNarrative: z.string().trim().min(20).max(3000),
  termsAccepted: z.literal(true),
});

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";

  // 1. Sliding-window IP rate limit (max 6 applications per 15 minutes per IP)
  const rlKey = `rl:apply:${clientIp}`;
  const reqCount = await redis.incr(rlKey);
  if (reqCount === 1) await redis.expire(rlKey, 900);
  if (reqCount > 6) {
    return NextResponse.json(
      { error: "RATE_LIMIT_EXCEEDED", message: "Too many application submissions. Please wait 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  // 2. Parse & validate payload
  const body = await req.json().catch(() => null);
  const parsed = ApplicationPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // 3. Deterministic Idempotency Lock on (email + roleSlug + cycle)
  const idempHeader = req.headers.get("Idempotency-Key") ?? `${data.email}:${data.roleSlug}:2026-Q4`;
  const idempKey = `idemp:apply:${crypto.createHash("sha256").update(idempHeader).digest("hex")}`;
  const cachedResponse = await redis.get(idempKey);
  if (cachedResponse) {
    return NextResponse.json(JSON.parse(cachedResponse), {
      status: 200,
      headers: { "X-Idempotent-Replay": "true" },
    });
  }

  // 4. Atomic PostgreSQL Transaction: Upsert Candidate + Create RoleApplication + Enqueue Outbox Email
  const rawMagicToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawMagicToken).digest("hex");
  const publicRef = `CYN-2026-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.upsert({
        where: { email: data.email },
        update: {
          fullName: data.fullName,
          phone: data.phone,
          currentCity: data.currentCity,
          portfolioUrl: data.portfolioUrl,
          linkedinUrl: data.linkedinUrl,
          technicalSkills: data.technicalSkills,
        },
        create: {
          publicReferenceCode: publicRef,
          email: data.email,
          fullName: data.fullName,
          phone: data.phone,
          whatsappNumber: data.whatsappNumber,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          currentCity: data.currentCity,
          permanentAddress: data.permanentAddress,
          portfolioUrl: data.portfolioUrl,
          linkedinUrl: data.linkedinUrl,
          githubOrBehanceUrl: data.githubOrBehanceUrl,
          noticePeriod: data.noticePeriod,
          technicalSkills: data.technicalSkills,
          qualifications: {
            create: data.qualifications.map((q) => ({
              highestQualification: q.highestQualification,
              degree: q.degree,
              specialization: q.specialization,
              institution: q.institution,
              graduationYear: q.graduationYear,
              educationStatus: q.educationStatus,
              scoreSystem: q.scoreSystem,
              scoreValue: q.scoreValue,
            })),
          },
        },
      });

      const application = await tx.roleApplication.create({
        data: {
          candidateId: candidate.id,
          roleSlug: data.roleSlug,
          roleTitle: data.roleTitle,
          whyCynbitNarrative: data.whyCynbitNarrative,
          status: "NEW",
        },
      });

      await tx.portalMagicLinkToken.create({
        data: {
          candidateId: candidate.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
          createdIp: clientIp,
        },
      });

      // Strictly bind portal URL to application.id (fixes DATA-02 Lead vs Application ID confusion)
      const portalVerifyUrl =
        `${env.PUBLIC_PORTAL_BASE_URL}/api/v1/auth/portal-verify` +
        `?token=${encodeURIComponent(rawMagicToken)}&appId=${encodeURIComponent(application.id)}`;

      await tx.transactionalOutbox.create({
        data: {
          eventType: "APPLICATION_CONFIRMATION_EMAIL",
          aggregateId: application.id,
          payloadJson: {
            toEmail: candidate.email,
            candidateName: candidate.fullName,
            referenceCode: candidate.publicReferenceCode,
            roleTitle: application.roleTitle,
            portalVerifyUrl,
          },
        },
      });

      return {
        applicationId: application.id,
        referenceCode: candidate.publicReferenceCode,
        status: application.status,
      };
    });

    await redis.set(idempKey, JSON.stringify(result), "EX", 86400);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json(
        {
          error: "DUPLICATE_APPLICATION",
          message: "An active application for this role already exists under your email.",
        },
        { status: 409 }
      );
    }
    throw err;
  }
}
