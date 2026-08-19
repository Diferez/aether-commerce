# Troubleshooting

## Product images do not load

DummyJSON source data can contain invalid image URLs. The catalog adapter removes
bad URLs and falls back to deterministic Cloudinary placeholders.

## Checkout does not redirect

Check that `APP_ORIGIN_STORE` is configured, and that the active provider's
secret key is set - either `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` or
`WOMPI_SECRET_KEY`/`WOMPI_EVENTS_SECRET` as a Worker secret, or the
equivalent value saved from the admin panel's checkout settings (`GET
/api/v1/admin/checkout-settings` shows which provider and credentials are
currently effective). Aether does not create live payments in either
provider. If credentials were saved from the admin panel and checkout still
falls back to a simulated URL, confirm `AETHER_SETTINGS_ENCRYPTION_KEY` is
set - without it, stored secrets cannot be decrypted and are treated as not
configured.

## Emails are not sent

Confirm that `RESEND_API_KEY` and `CONTACT_RECIPIENT_EMAIL` are configured, and
that the sender domain or email is verified in Resend.

## Admin mutations fail

Public demo admin intentionally blocks persistence. Use a Clerk user with the
`admin` role and the private admin URL for real mutations.

## D1 migration fails

Apply migrations in order from `database/core/migrations`. D1 uses SQLite syntax, so
foreign keys and indexes should match the checked-in SQL files.
