import Fastify from "fastify";
import cors from "@fastify/cors";

import authRoutes from "./routes/auth.js";
import analyzeRoutes from "./routes/analyze.js";
import chatRoutes from "./routes/chat.js";
import chatSessionsRoutes from "./routes/chat-sessions.js";
import searchRoutes from "./routes/search.js";
import wikisRoutes from "./routes/wikis.js";
import wikisCheckRoutes from "./routes/wikis-check.js";
import wikiRoutes from "./routes/wiki.js";
import myReposRoutes from "./routes/my-repos.js";
import challengesRoutes from "./routes/challenges.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.register(authRoutes, { prefix: "/api" });
  app.register(analyzeRoutes, { prefix: "/api" });
  app.register(chatRoutes, { prefix: "/api" });
  app.register(chatSessionsRoutes, { prefix: "/api" });
  app.register(searchRoutes, { prefix: "/api" });
  app.register(wikisRoutes, { prefix: "/api" });
  app.register(wikisCheckRoutes, { prefix: "/api" });
  app.register(wikiRoutes, { prefix: "/api" });
  app.register(myReposRoutes, { prefix: "/api" });
  app.register(challengesRoutes, { prefix: "/api" });

  return app;
}
