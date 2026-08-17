# Troubleshooting

## Product images do not load

DummyJSON source data can contain invalid image URLs. The catalog adapter removes
bad URLs and falls back to deterministic Cloudinary placeholders.

## Checkout does not redirect

Check that `STRIPE_SECRET_KEY`, `APP_ORIGIN_STORE`, and `STRIPE_WEBHOOK_SECRET`
are configured. Aether does not create live payments.

## Emails are not sent

Confirm that `RESEND_API_KEY` and `CONTACT_RECIPIENT_EMAIL` are configured, and
that the sender domain or email is verified in Resend.

## Admin mutations fail

Public demo admin intentionally blocks persistence. Use a Clerk user with the
`admin` role and the private admin URL for real mutations.

## D1 migration fails

Apply migrations in order from `database/core/migrations`. D1 uses SQLite syntax, so
foreign keys and indexes should match the checked-in SQL files.
