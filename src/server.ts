import { buildApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma } from "./shared/kernel/prisma";
import { redisConnection } from "./shared/kernel/queue";

async function main() {
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Inventory backend listening on port ${env.PORT} (${env.NODE_ENV})`);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    await disconnectPrisma();
    redisConnection.disconnect();
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
