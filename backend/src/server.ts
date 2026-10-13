import "dotenv/config";
import { buildApp } from "./app.js";
import { startRefreshScheduler } from "./services/queue/refresh.queue.js";

const app = buildApp();
const start = async () => {
  try {
    const port = Number(process.env.PORT || 3031);
    const host = process.env.HOST || "0.0.0.0";
    await app.listen({ port, host });
    console.log(`🚀 Server listening on http://${host}:${port}`);
    void startRefreshScheduler().catch((err) => app.log.error(err));
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
