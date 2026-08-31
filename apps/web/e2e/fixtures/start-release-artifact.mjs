import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const standaloneRoot = join(projectRoot, ".next", "standalone");
const serverPath = join(standaloneRoot, "server.js");

if (!existsSync(serverPath)) {
  throw new Error(
    "Missing .next/standalone/server.js. Run a successful production build before the release browser gate.",
  );
}

// Next's standalone output deliberately omits static/public assets. Mirror the
// production Dockerfile's two COPY steps before launching the exact server.
cpSync(join(projectRoot, ".next", "static"), join(standaloneRoot, ".next", "static"), {
  recursive: true,
  force: true,
});
cpSync(join(projectRoot, "public"), join(standaloneRoot, "public"), {
  recursive: true,
  force: true,
});

process.env.HOSTNAME = "127.0.0.1";
process.env.PORT = "3101";
process.chdir(standaloneRoot);
await import(pathToFileURL(serverPath).href);
