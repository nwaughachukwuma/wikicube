import { spawn } from "node:child_process";
import { startMockServer, MOCK_PORT } from "./mock-server.mjs";

async function main() {
  const mock = await startMockServer(MOCK_PORT);

  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://localhost:${MOCK_PORT}`;
  process.env.NEXT_SUPABASE_SECRET_KEY = "dummy";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = "dummy";
  process.env.GITHUB_API_URL = `http://localhost:${MOCK_PORT}/github`;

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(command, ["next", "dev"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  function shutdown(signal) {
    return new Promise((resolve) => {
      child.on("close", () => resolve());
      child.kill(signal);
    });
  }

  process.on("SIGTERM", async () => {
    await shutdown("SIGTERM");
    await mock.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await shutdown("SIGINT");
    await mock.close();
    process.exit(0);
  });

  child.on("exit", async (code) => {
    await mock.close();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
