import { buildApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma } from "./shared/kernel/prisma";
import { startLifecycleSweepJob } from "./jobs/lifecycle-sweep.job";
import { startNotificationWorker } from "./modules/notification/notification.worker";

async function main() {
  const app = await buildApp();
  const container = app.diContainer;

  const notificationWorker = startNotificationWorker({
    notificationRepository: container.resolve("notificationRepository"),
    notificationMailer: container.resolve("notificationMailer"),
    logger: container.resolve("logger"),
  });

  const sweep = await startLifecycleSweepJob({
    lifecycleSweepService: container.resolve("lifecycleSweepService"),
    logger: container.resolve("logger"),
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Inventory backend listening on port ${env.PORT} (${env.NODE_ENV})`);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await notificationWorker.close();
    sweep.stop();
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
