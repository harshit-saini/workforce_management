import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { startScheduler } from "./jobs/scheduler.js";
import { ensureUploadDir } from "./lib/uploads.js";

async function main() {
  await ensureUploadDir();
  const app = buildApp();

  await app.listen({ port: config.port, host: "0.0.0.0" });
  startScheduler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
