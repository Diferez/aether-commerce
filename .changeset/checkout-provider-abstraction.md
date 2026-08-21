---
"@aether-commerce/api-core": minor
"@aether-commerce/config-schema": minor
"@aether-commerce/core": patch
"@aether-commerce/ui": patch
"@aether-commerce/i18n": patch
"@aether-commerce/agent-core": patch
---

Apply the checkout provider abstraction (phase 6): `@aether-commerce/api-core`'s
`CheckoutProvider` port and `PaidCheckoutSession` are now genuinely
provider-neutral instead of shaped around Stripe's raw fields
(`payment_status` -> `status`, `amount_total` -> `amountTotal`,
`customer_details.email`/`customer_email` -> `customerEmail`,
`payment_intent` -> `providerReference`). This is a breaking change to
`PaidCheckoutSession`'s field names for any code constructing or reading
one directly; adapters that only call `isCheckoutSessionPaid()` or read
`.status`/`.metadata` are unaffected.

Adds `CheckoutProviderId`, `checkoutProviderIds` (`"stripe" | "wompi"`),
`CheckoutProviderCredentials`, `CheckoutSettings`, `CheckoutSettingsService`
and a `CheckoutSettingsRepository` port for admin-managed, per-provider
checkout secrets (mode + credentials), and a `WompiWebhookPayload` /
`parseWompiWebhookPayload` alongside the existing Stripe ones.
`@aether-commerce/config-schema`'s `checkoutConfigSchema.mode` now accepts `"wompi"`
in addition to `"stripe"`.

Also fixes 5 packages (`core`, `ui`, `i18n`, `api-core`, `agent-core`)
whose published `dist/` incorrectly included compiled `*.test.ts` output
(`api-core` alone shipped 15 compiled test files) - no public API change,
just a smaller, cleaner package.
