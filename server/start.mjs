// Production entry (KTD7, KTD14): serves Next's standalone build through Next's custom-server API
// instead of the generated server.js, so each request can be adjusted before Next sees it.
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
// Beside the standalone server.js (Docker image), or the repo's .next/standalone.
const dir = existsSync(path.join(root, "server.js")) ? root : path.join(root, ".next", "standalone");

process.env.NODE_ENV = "production";
process.chdir(dir);
// The same config the generated server.js inlines; Next reads it from this variable instead of next.config.
const { config } = JSON.parse(readFileSync(path.join(dir, ".next", "required-server-files.json"), "utf8"));
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";
// Anything but a positive count (unset, 0, invalid) is direct-socket mode.
const behindProxy = Number(process.env.TRUSTED_PROXY_COUNT) > 0;

const next = createRequire(path.join(dir, "server.js"))("next");
const app = next({ dir, dev: false, hostname, port, conf: config });
await app.prepare();
const handle = app.getRequestHandler();

http
  .createServer((req, res) => {
    // Next sets X-Forwarded-For from the socket only when the header is absent, so without a trusted
    // proxy any client-sent value is dropped and the client cannot forge its IP.
    if (!behindProxy) delete req.headers["x-forwarded-for"];
    handle(req, res);
  })
  .listen(port, hostname, () => console.log(`Kindwords listening on http://${hostname}:${port}`));
