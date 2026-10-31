import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/cache/redis";
import { requireAuthenticatedCandidateApplication, PortalAuthError } from "@/lib/auth/portal-session";

export const SupportTicketCategoryEnum = z.enum([
  "Assessment Task & Deliverable Issue",
  "Cashfree Payment / Fee Issue",
  "Interview Scheduling & Sync",
  "Offer Letter, NDA & Joining Kit",
  "BitElevate Access & Credentials",
  "General Question / Other Issue",
]);

export const CreateSupportTicketSchema = z.object({
  category: SupportTicketCategoryEnum,
  subject: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(2000),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  try {
    const { applicationId } = await context.params;
    const application = await requireAuthenticatedCandidateApplication(applicationId);

    // Rate limit: max 3 tickets per 10 minutes per candidateId (Remediates API-03)
    const rlKey = `rl:ticket:${application.candidateId}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 600);
    if (count > 3) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "You have submitted too many support requests. Please allow 10 minutes before opening another ticket.",
        },
        { status: 429, headers: { "Retry-After": "600" } }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = CreateSupportTicketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_FAILED", details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        candidateId: application.candidateId,
        category: parsed.data.category,
        subject: parsed.data.subject,
        description: parsed.data.description,
        status: "OPEN",
      },
    });

    return NextResponse.json(
      {
        ticketId: ticket.id,
        category: ticket.category,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof PortalAuthError) {
      return NextResponse.json({ error: "AUTH_ERROR", message: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: "TICKET_CREATION_FAILED", message }, { status: 400 });
  }
}
