import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  const { config: loadDotenv } = require("dotenv") as {
    config: (options?: { path?: string }) => void;
  };
  loadDotenv({ path: ".env.local" });
} catch {
  // noop in minimal runtime containers where dotenv is not installed
}

const prismaConfig = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
};

export default prismaConfig;
