// Centralized redaction for anything that might end up in a log line, an
// audit metadata blob, or a Sentry event. One function, reused everywhere
// data leaves application code toward an observability sink, so a new call
// site can't accidentally skip it.

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2000;
const MAX_OBJECT_KEYS = 100;

// Exact-match, case-insensitive - deliberately includes bare "number" (per
// card-number redaction requirements) and "session" rather than only
// compound names, since those are the literal field names payment
// providers and auth libraries use. Structured log/audit fields use more
// specific names (orderNumber, requestId) so this doesn't collide with them.
const FULL_REDACT_KEYS = new Set([
  "password",
  "passwordconfirmation",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "set-cookie",
  "secret",
  "apikey",
  "stripesecretkey",
  "webhooksecret",
  "cardnumber",
  "number",
  "cvc",
  "cvv",
  "clientsecret",
  "session",
  "jwt"
]);

// Suffix patterns catch compound names not in the literal list above
// (csrfToken, sessionSecret, userPassword) without the false-positive risk
// of a bare "key$"/"id$" suffix, which would swallow legitimate identifiers.
const FULL_REDACT_SUFFIXES = [/token$/i, /secret$/i, /password$/i];

function isAddressKey(lowerKey: string): boolean {
  // "ipAddress"/"ip_address" are handled by isIpKey's partial mask, not a
  // full address-object redaction - excluded here so that check wins.
  if (lowerKey === "ipaddress" || lowerKey === "ip_address") return false;
  return lowerKey.endsWith("address") || lowerKey === "addresses";
}

function isFullRedactKey(lowerKey: string): boolean {
  return FULL_REDACT_KEYS.has(lowerKey) || FULL_REDACT_SUFFIXES.some((pattern) => pattern.test(lowerKey)) || isAddressKey(lowerKey);
}

function isEmailKey(lowerKey: string): boolean {
  return /email/i.test(lowerKey);
}

function isPhoneKey(lowerKey: string): boolean {
  return /phone/i.test(lowerKey);
}

function isIpKey(lowerKey: string): boolean {
  return /^ip$|ipaddress|ip_address/i.test(lowerKey);
}

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "[REDACTED]";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "[REDACTED]";
  return `***${digits.slice(-2)}`;
}

function maskIp(value: string): string {
  const v4 = value.split(".");
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part))) {
    return `${v4[0]}.${v4[1]}.${v4[2]}.***`;
  }
  const v6 = value.split(":");
  if (v6.length >= 3) {
    return `${v6.slice(0, 2).join(":")}::***`;
  }
  return "[REDACTED]";
}

function truncateString(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
}

function redactError(error: Error): Record<string, unknown> {
  return { name: error.name, message: truncateString(error.message) };
}

function redactInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return redactError(value);

  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactInner(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) limited.push(`…${value.length - MAX_ARRAY_ITEMS} more`);
    return limited;
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  const result: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    const lowerKey = key.toLowerCase();
    if (isFullRedactKey(lowerKey)) {
      result[key] = "[REDACTED]";
      continue;
    }
    if (isEmailKey(lowerKey) && typeof entryValue === "string") {
      result[key] = maskEmail(entryValue);
      continue;
    }
    if (isPhoneKey(lowerKey) && typeof entryValue === "string") {
      result[key] = maskPhone(entryValue);
      continue;
    }
    if (isIpKey(lowerKey) && typeof entryValue === "string") {
      result[key] = maskIp(entryValue);
      continue;
    }
    result[key] = redactInner(entryValue, depth + 1, seen);
  }
  if (Object.keys(value as object).length > MAX_OBJECT_KEYS) {
    result["…truncated"] = true;
  }
  return result;
}

// Recursively sanitizes a value for any observability sink: drops secrets
// entirely, partially masks PII (email/phone/ip), converts Errors to a
// stack-free {name, message}, bounds depth/array length/string length/key
// count, and breaks cycles - safe to hand any value straight from
// application code (a full request body, a provider payload) to a logger,
// audit entry, or Sentry breadcrumb without inspecting it first.
export function redact(value: unknown): unknown {
  return redactInner(value, 0, new WeakSet());
}
