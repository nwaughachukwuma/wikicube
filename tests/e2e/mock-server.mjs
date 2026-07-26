import { createServer } from "node:http";
import { URL } from "node:url";

export const MOCK_PORT = Number(process.env.MOCK_SERVER_PORT || "3001");

export const PUBLIC_WIKI_OWNER = "marcelroed";
export const PUBLIC_WIKI_REPO = "gigatoken";
export const PUBLIC_WIKI_OVERVIEW =
  "# Gigatoken\n\nA **fast** tokenizer for large datasets.";

export const PRIVATE_WIKI_OWNER = "nwaughachukwuma";
export const PRIVATE_WIKI_REPO = "private-wikicube-e2e";
export const PRIVATE_WIKI_OVERVIEW =
  "This private overview must never appear in page metadata.";

function makeWiki(owner, repo, overview, visibility) {
  return {
    id: `wiki-${owner}-${repo}`,
    owner,
    repo,
    default_branch: "main",
    overview,
    status: "done",
    visibility,
    indexed_by: visibility === "private" ? "user-1" : null,
    search_ready: true,
    search_error: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export const publicWiki = makeWiki(
  PUBLIC_WIKI_OWNER,
  PUBLIC_WIKI_REPO,
  PUBLIC_WIKI_OVERVIEW,
  "public",
);

export const privateWiki = makeWiki(
  PRIVATE_WIKI_OWNER,
  PRIVATE_WIKI_REPO,
  PRIVATE_WIKI_OVERVIEW,
  "private",
);

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "*");
}

export function startMockServer(port = MOCK_PORT) {
  const server = createServer((req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/github/repos/")) {
      const match = pathname.match(/^\/github\/repos\/([^/]+)\/([^/]+)$/);
      if (match) {
        const [, owner, repo] = match;
        if (owner === publicWiki.owner && repo === publicWiki.repo) {
          sendJson(res, 200, {
            private: false,
            default_branch: publicWiki.default_branch,
          });
          return;
        }
      }
      sendJson(res, 404, { message: "Not Found" });
      return;
    }

    if (pathname.startsWith("/auth/v1/")) {
      sendJson(res, 200, { data: { session: null, user: null }, error: null });
      return;
    }

    if (pathname === "/rest/v1/wikis") {
      const owner = url.searchParams.get("owner")?.replace(/^eq\./, "");
      const repo = url.searchParams.get("repo")?.replace(/^eq\./, "");

      if (owner === publicWiki.owner && repo === publicWiki.repo) {
        sendJson(res, 200, [publicWiki]);
        return;
      }
      if (owner === privateWiki.owner && repo === privateWiki.repo) {
        sendJson(res, 200, [privateWiki]);
        return;
      }
      sendJson(res, 200, []);
      return;
    }

    if (pathname === "/rest/v1/features") {
      sendJson(res, 200, []);
      return;
    }

    sendJson(res, 200, {});
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[e2e mock server] listening on ${port}`);
      resolve({
        close: () =>
          new Promise((res) => server.close(() => res())),
      });
    });
  });
}
