import { Worker } from "bullmq";
import { redisConnection } from "../jobs/queues.js";
import { processOutboundMessage } from "../services/processOutboundMessage.js";

export function createWhatsAppWorker(): Worker<{ logId: string }> {
  return new Worker<{ logId: string }>(
    "whatsapp-messages",
    async (job) => {
      await processOutboundMessage(job.data.logId);
    },
    { connection: redisConnection }
  );
}
