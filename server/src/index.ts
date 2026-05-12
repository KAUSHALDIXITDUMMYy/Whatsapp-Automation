import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import authRoutes from "./routes/auth.js";
import customersRoutes from "./routes/customers.js";
import fieldsRoutes from "./routes/fields.js";
import groupsRoutes from "./routes/groups.js";
import importRoutes from "./routes/importRoutes.js";
import messagingRoutes from "./routes/messaging.js";
import remindersRoutes from "./routes/reminders.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profile.js";
import metaWhatsappWebhookRoutes from "./routes/metaWhatsappWebhook.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAdmin } from "./middleware/auth.js";
import { runDailyReminderScan } from "./services/reminderScan.js";
import { config } from "./config.js";

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use("/api/auth", authLimiter, authRoutes);

app.use("/api/profile", profileRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/fields", fieldsRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/import", importRoutes);
app.use("/api/messaging", messagingRoutes);
app.use("/api/reminders", remindersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/webhooks/meta/whatsapp", metaWhatsappWebhookRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

app.post("/api/admin/run-reminder-scan", requireAdmin, async (_req, res, next) => {
  try {
    const result = await runDailyReminderScan();
    res.json(result);
  } catch (e) {
    next(e);
  }
});

app.use(errorHandler);

const port = config.port;

if (!config.skipRedis) {
  import("./workers/whatsappWorker.js").then(({ createWhatsAppWorker }) => {
    createWhatsAppWorker().on("failed", (job, err) => {
      console.error("[worker] job failed", job?.id, err);
    });
  });
} else {
  console.warn(
    "[dev] SKIP_REDIS=true — outbound WhatsApp runs inline. Install Redis and unset SKIP_REDIS for production-style queues."
  );
}

cron.schedule("15 0 * * *", async () => {
  try {
    const r = await runDailyReminderScan();
    console.log("[cron] reminder scan", r);
  } catch (e) {
    console.error("[cron] reminder scan failed", e);
  }
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
