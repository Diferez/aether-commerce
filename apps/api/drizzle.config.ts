import type { Config } from "drizzle-kit";

export default {
  schema: "../../database/core/schema.ts",
  out: "../../database/core/migrations",
  dialect: "sqlite"
} satisfies Config;
