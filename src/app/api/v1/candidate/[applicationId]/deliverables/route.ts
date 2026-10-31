import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireAuthenticatedCandidateApplication, PortalAuthError } from "@/lib/auth/portal-session";
import { assertSafeExternalUrl } from "@/lib/security/ssrf";

export const DeliverableSubmissionSchema = z.object({
  primaryDeliverableUrl: z.string().trim().url().max(500),
  additionalDeliverableUrls: z.array(z.string().trim().url().max(500)).max(4).default([]),
  executionNotes: z.string().trim().max(4000).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  try {
    const { applicationId } = await context.params;
    const application = await requireAuthenticatedCandidateApplication(applicationId);

    // 1. Enforce Assessment State Machine & Deadline Cutoff (Fixes API-02)
    if (application.status !== "ASSESSMENT_ACTIVE" && application.status !== "ASSESSMENT_SUBMITTED") {
      return NextResponse.json(
        {
          error: "INVALID_STATE",
          message: `Deliverables cannot be submitted when application status is ${application.status}.`,
        },
        { status: 409 }
      );
    }

    if (application.assessmentDeadlineAt) {
      const graceMs = (application.assessmentGraceMinutes ?? 15) * 60 * 1000;
      const effectiveCutoff = application.assessmentDeadlineAt.getTime() + graceMs;
      if (Date.now() > effectiveCutoff) {
        await prisma.roleApplication.update({
          where: { id: application.id },
          data: { status: "ASSESSMENT_EXPIRED" },
        });
        return NextResponse.json(
          {
            error: "ASSESSMENT_DEADLINE_EXPIRED",
            message: `The submission window closed at ${application.assessmentDeadlineAt.toISOString()}.`,
          },
          { status: 403 }
        );
      }
    }

    // 2. Validate Payload & Perform SSRF DNS/CIDR Verification on All 1..5 Links (Fixes API-01)
    const body = await req.json().catch(() => null);
    const parsed = DeliverableSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_FAILED", details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const allRawUrls = [parsed.data.primaryDeliverableUrl, ...parsed.data.additionalDeliverableUrls];
    const verifiedLinks = await Promise.all(allRawUrls.map((u) => assertSafeExternalUrl(u)));

    // 3. Persist Deliverables Atomically & Transition Status to ASSESSMENT_SUBMITTED
    const updated = await prisma.$transaction(async (tx) => {
      await tx.assessmentDeliverable.deleteMany({ where: { applicationId: application.id } });
      await tx.assessmentDeliverable.createMany({
        data: verifiedLinks.map((item, idx) => ({
          applicationId: application.id,
          slotIndex: idx,
          url: item.canonicalUrl,
          hostname: item.hostname,
        })),
      });

      return tx.roleApplication.update({
        where: { id: application.id },
        data: {
          status: "ASSESSMENT_SUBMITTED",
          submittedAt: new Date(),
          executionNotes: parsed.data.executionNotes ?? null,
        },
        include: { deliverables: { orderBy: { slotIndex: "asc" } } },
      });
    });

    return NextResponse.json(
      {
        status: updated.status,
        submittedAt: updated.submittedAt,
        deliverablesCount: updated.deliverables.length,
        deliverables: updated.deliverables,
      },
      { status: 200, headers: { "Referrer-Policy": "no-referrer" } }
    );
  } catch (err: unknown) {
    if (err instanceof PortalAuthError) {
      return NextResponse.json({ error: "AUTH_ERROR", message: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: "SUBMISSION_REJECTED", message }, { status: 400 });
  }
}
