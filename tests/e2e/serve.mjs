// Playwright's web server: the app through `npm run start:standalone` on a fresh data directory
// (output also written to server.log so the test can read the setup code), and a plain host page
// on a second origin that embeds the wall the way a maker's site would.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const DATA_DIR = path.resolve("test-data/e2e");
const APP = "http://127.0.0.1:3300";

rmSync(DATA_DIR, { recursive: true, force: true });
mkdirSync(DATA_DIR, { recursive: true });
const log = createWriteStream(path.join(DATA_DIR, "server.log"));

// A constant command through the shell, so npm resolves on Windows too.
const app = spawn("npm run start:standalone", {
  shell: true,
  env: {
    ...process.env,
    PORT: "3300",
    HOSTNAME: "127.0.0.1",
    PUBLIC_URL: APP,
    TRUSTED_PROXY_COUNT: "0",
    DATABASE_URL: `file:${path.join(DATA_DIR, "kindwords.db").replaceAll("\\", "/")}`,
    STORAGE_DRIVER: "local",
    UPLOADS_DIR: path.join(DATA_DIR, "uploads"),
  },
});
for (const stream of [app.stdout, app.stderr]) {
  stream.on("data", (chunk) => {
    log.write(chunk);
    process.stdout.write(chunk);
  });
}
app.on("exit", (code) => process.exit(code ?? 1));

const template = readFileSync(new URL("./fixtures/host-page.html", import.meta.url), "utf8");
http
  .createServer((req, res) => {
    const space = new URL(req.url ?? "/", "http://localhost").searchParams.get("space") ?? "";
    const safe = /^[A-Za-z0-9_-]{1,64}$/.test(space) ? space : "";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(template.replaceAll("__APP__", APP).replaceAll("__SPACE__", safe));
  })
  .listen(3301, "localhost");

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => app.kill(signal));
