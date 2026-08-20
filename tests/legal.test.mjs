import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = process.cwd().endsWith("aether-commerce") ? process.cwd() : resolve("aether-commerce");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("storefront publishes complete legal routes and controller channels", () => {
  const legal = read("apps/storefront/components/legal-content.ts");
  const footer = read("apps/storefront/components/SiteFooter.tsx");
  const layout = read("apps/storefront/app/layout.tsx");

  for (const route of ["privacy", "cookies", "terms", "returns", "shipping"]) {
    assert.match(read(`apps/storefront/app/${route}/page.tsx`), /LegalDocument/);
    assert.match(footer, new RegExp(`href="\/${route}"`));
  }

  for (const detail of ["Carrera 73 # 20A-40", "diferez676@gmail.com", "+57 304 274 9571"]) {
    assert.ok(legal.includes(detail));
    assert.ok(footer.includes(detail));
  }

  assert.match(layout, /SiteFooter/);
  assert.match(layout, /CookieNotice/);
  assert.match(footer, /sedeelectronica\.sic\.gov\.co/);
});

test("assistant privacy notice matches storage and deletion behavior", () => {
  const widget = read("packages/storefront-default/src/AssistantWidget.tsx");
  const worker = read("apps/ai-assistant/worker.ts");
  const legal = read("apps/storefront/components/legal-content.ts");

  assert.match(widget, /privacy_consent: privacyAccepted/);
  assert.match(widget, /privacy_version: legalPolicyVersion/);
  assert.match(widget, /method: "DELETE"/);
  assert.match(worker, /AI_CONVERSATION_RETENTION_DAYS/);
  assert.match(worker, /purgeExpiredAssistantData/);
  assert.match(worker, /redactPii\(String\(data\.body\.message/);
  assert.match(legal, /Chats: 30 días/);
  assert.match(legal, /Google Gemini/);
});

test("published retention periods have enforcement hooks", () => {
  const assistant = read("apps/ai-assistant/worker.ts");
  const cart = read("apps/api/src/routes/cart.ts");
  const contact = read("apps/api/src/routes/contact.ts");

  assert.match(assistant, /-12 months/);
  assert.match(cart, /-90 days/);
  assert.match(contact, /\+12 months/);
});
