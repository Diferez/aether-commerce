import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.AETHER_AI_EVAL_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("AETHER_AI_EVAL_URL is required.");

const limitArg = process.argv.indexOf("--limit");
const requestedLimit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 10;
const limit = Math.min(25, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 10));
const path = resolve("apps/ai-assistant/evaluation/cases.jsonl");
const cases = readFileSync(path, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .slice(0, limit);

let passed = 0;
for (const entry of cases) {
  const response = await fetch(`${baseUrl}/v1/assistant/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aether-session-id": `evaluation-${entry.id}`
    },
    body: JSON.stringify({
      thread_id: `evaluation-${entry.id}`,
      message: entry.input,
      locale: entry.locale,
      privacy_consent: true,
      privacy_version: "evaluation"
    })
  });
  if (!response.ok) throw new Error(`${entry.id}: HTTP ${response.status}`);
  const payload = await response.json();
  const success = payload.intent === entry.expected.intent;
  if (success) passed += 1;
  console.log(JSON.stringify({ id: entry.id, expected: entry.expected.intent, actual: payload.intent, success }));
}

const ratio = passed / cases.length;
console.log(JSON.stringify({ evaluated: cases.length, passed, ratio }));
if (ratio < 0.9) process.exitCode = 1;
