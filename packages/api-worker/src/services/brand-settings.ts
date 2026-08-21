import { defaultBrandSettings, type BrandSettings } from "@aether-commerce/core";
import type { Env } from "../types";

// Was inlined once in routes/public.ts before this - now also needed by
// routes/user.ts (to gate review submission behind features.reviews), so
// pulled out rather than duplicating the same D1 read a second time.
export async function readBrandSettings(env: Env): Promise<BrandSettings> {
  const row = await env.DB.prepare("select value_json from application_settings where key = 'brand'").first<{
    value_json: string;
  }>();
  return row ? (JSON.parse(row.value_json) as BrandSettings) : defaultBrandSettings;
}
