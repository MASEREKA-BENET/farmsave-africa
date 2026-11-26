// Development code-generation helper: introspect the real migration in an isolated PostgreSQL engine.
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const database = new PGlite();
await database.exec(await readFile("prisma/migrations/202611050100_neon_backend/migration.sql", "utf8"));
const server = createServer(database);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
try {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["node_modules/prisma/build/index.js", "db", "pull", "--force"], {
    env: { ...process.env, DIRECT_URL: `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?sslmode=disable` }, timeout: 60000
  });
  console.info(stdout); if (stderr) console.info(stderr);
} finally {
  server.closeAllConnections?.(); server.close(); await database.close();
}
