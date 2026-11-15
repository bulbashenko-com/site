// Brings the database (DATABASE_URL) to the schema of this build, before the app starts: the init container
// `migrate` of the Deployment in bulbashenko-com/infra (apps/base/site) and the staging refresh run it.
//
// 1. A database created before migrations existed (by `prisma db push`) has the tables but no _prisma_migrations:
//    mark the baseline 0_init as applied instead of running it.
// 2. `prisma migrate deploy`: apply what is new, in order.
// 3. Drift check: the database must now match prisma/schema.prisma exactly. If not (a hand-made change, a migration
//    that does not match the schema), fail and print the difference; the old version keeps serving meanwhile.
import { execFileSync } from "node:child_process";
import pg from "pg";

const prisma = (...args) => execFileSync("node_modules/.bin/prisma", args, { stdio: "inherit" });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `select to_regclass('public._prisma_migrations') is not null as migrated,
          to_regclass('public."Profile"') is not null as populated`,
);
await client.end();
const { migrated, populated } = rows[0];

if (!migrated && populated) {
  console.log("existing schema without migration history: marking 0_init as applied");
  prisma("migrate", "resolve", "--applied", "0_init");
}

prisma("migrate", "deploy");

try {
  execFileSync(
    "node_modules/.bin/prisma",
    ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  console.log("database matches prisma/schema.prisma");
} catch (error) {
  if (error.status === 2) {
    console.error("DRIFT: the database differs from prisma/schema.prisma after migrating:");
    console.error(error.stdout?.toString());
  }
  process.exit(1);
}
