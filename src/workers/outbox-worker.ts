import { prisma } from "@/lib/db/prisma";

export interface OutboxPayload {
  toEmail: string;
  candidateName: string;
  referenceCode: string;
  roleTitle: string;
  portalVerifyUrl: string;
}

/**
 * Worker process for executing Transactional Outbox jobs asynchronously.
 * Remediates OPS-03: Prevents slow synchronous third-party SMTP/SES calls
 * from blocking user-facing HTTP request threads.
 */
export async function processOutboxBatch(batchSize = 10): Promise<{ processed: number; errors: number }> {
  const pendingEvents = await prisma.transactionalOutbox.findMany({
    where: {
      processedAt: null,
      nextAttemptAt: { lte: new Date() },
    },
    take: batchSize,
    orderBy: { createdAt: "asc" },
  });

  let processed = 0;
  let errors = 0;

  for (const event of pendingEvents) {
    try {
      // In production, dispatch via AWS SES client with HTTPS-only tracking
      // and DKIM/DMARC signed sender domain
      const payload = event.payloadJson as unknown as OutboxPayload;

      // Mock SES dispatch call:
      // await sesClient.send(new SendEmailCommand({ ... }))
      if (!payload.toEmail || !payload.portalVerifyUrl) {
        throw new Error("Invalid outbox email payload missing recipient or portal URL");
      }

      await prisma.transactionalOutbox.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          lastError: null,
        },
      });
      processed++;
    } catch (err: unknown) {
      errors++;
      const errorMessage = err instanceof Error ? err.message : "Outbox dispatch failed";
      const nextAttemptMinutes = Math.min(60, Math.pow(2, event.attempts + 1));
      const nextAttemptAt = new Date(Date.now() + nextAttemptMinutes * 60 * 1000);

      await prisma.transactionalOutbox.update({
        where: { id: event.id },
        data: {
          attempts: event.attempts + 1,
          nextAttemptAt,
          lastError: errorMessage,
        },
      });
    }
  }

  return { processed, errors };
}
