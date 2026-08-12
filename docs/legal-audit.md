# Aether legal and privacy implementation audit

Date: 2026-08-12
Scope: public storefront, account authentication, browser storage, cart, sandbox checkout, orders, contact form, Aether Assistant, API, D1, and named processors.

This is an engineering compliance review, not a substitute for advice from a Colombian attorney. It records what the software actually does so public notices do not make unsupported claims.

## Operating position

Aether is a portfolio demonstration, not an operating merchant. Stripe is configured for test mode, addresses and shipping are simulated, and no checkout is intended to create a real sale. The storefront now says this at checkout and in the terms, shipping, and returns pages.

If real sales are enabled, launch must remain blocked until a lawyer and the operator confirm merchant registration/tax details, real inventory and prices, total taxes and shipping charges, delivery territories and times, warranty, withdrawal, returns and payment-reversal operations, customer-service procedures, and accessibility of the final contract before and after purchase.

## Data inventory and implemented controls

| Area                       | Data                                                                   | Storage / recipient                      | Published retention or criterion                                            | Control status                                                                |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Authentication             | Clerk ID, name, email, session, roles                                  | Clerk; limited D1 profile data when used | Account life or valid request                                               | Disclosed; necessary cookies described                                        |
| Browser preferences        | Language, theme, notice marker                                         | localStorage                             | Until browser data is cleared                                               | Disclosed                                                                     |
| Cart and favorites         | Cart ID/token, items, favorite product records                         | local/session storage; D1 cart           | Anonymous D1 carts cleaned after 90 inactive days; local data until cleared | Cleanup and notice added                                                      |
| Sandbox checkout           | Email, items, totals, Stripe test references, order status             | Stripe sandbox and D1                    | Demo operational life, security/audit/claim criterion                       | No card data stored by Aether; sandbox warning added                          |
| Contact                    | Name, email, optional company, subject, message, locale, authorization | D1; Resend when configured               | 12 months unless legal need                                                 | Checkbox, policy version, timestamp, expiry and cleanup added                 |
| Assistant conversation     | Redacted message, answer, page/product/cart context, session hash      | D1                                       | 30 days                                                                     | Notice, explicit checkbox, policy version metadata, expiry and deletion added |
| Assistant model processing | Original message for intent/search/reply                               | Google Gemini API                        | Controlled by Google's service terms and project plan                       | Transfer disclosed; sensitive-data warning added                              |
| Assistant security         | Hashed scope, cart-action details, usage counters                      | D1                                       | 12 months                                                                   | Cleanup added; full message excluded                                          |
| Infrastructure logs        | IP, user agent, request/security metadata                              | Cloudflare and other providers           | Provider operational/security policies                                      | Disclosed at category level                                                   |

## Findings resolved in this change

1. The old privacy page falsely implied that only generic demo commerce data was stored. It did not mention accounts, contact messages, orders, browser storage, chat history, Gemini, or international processing. Replaced with a bilingual data-treatment policy.
2. Chats were already stored for 30 days, but users received no notice. A pre-send authorization notice now identifies D1 retention and Gemini processing.
3. “Reset” removed only the browser thread ID while leaving server messages. It is now “Delete chat” and calls the ownership-checked DELETE endpoint before clearing the tab.
4. Chat expiry existed as a database value but the production TypeScript Worker had no cleanup path. Opportunistic deletion now runs during conversation writes; action logs and usage data are also capped at 12 months.
5. Anonymous carts had no cleanup. New cart sessions now remove inactive anonymous D1 carts after 90 days.
6. There was no cookie/storage notice and no cookie page. An informational notice and bilingual inventory now cover Clerk, Stripe, localStorage, and sessionStorage. No optional advertising or analytics is currently loaded, so category consent controls are not required by the present implementation.
7. The legal pages were one-sentence placeholders and the site had no legal footer or Colombian consumer-authority link. Full pages, operator contact details, copyright, and a visible SIC link were added.
8. The contact checkbox did not link to the privacy policy or submit an explicit policy version. Both are now included.
9. Checkout lacked a prominent sandbox/no-sale statement and legal links. These are now placed beside the checkout action.

## Remaining operational actions before real commerce

- Obtain Colombian legal review of the final merchant terms and consumer procedures.
- Confirm whether the Gemini project uses paid services or free-tier data terms; do not promise “not used for training” until the billing plan and applicable terms are verified.
- Sign and retain appropriate data-processing terms with Cloudflare, Clerk, Stripe, Google, and Resend, and document international-transfer safeguards.
- Establish an internal privacy-request register, identity-verification procedure, incident-response process, and evidence that deletions and retention jobs work in production.
- Decide and technically enforce a fixed order/account retention schedule if Aether stops being a demo. Real accounting, tax, warranty, fraud, and litigation duties determine the final period.
- Verify whether registration of any database in Colombia's RNBD is required for the final operator and business size.
- Perform a lawyer-approved launch review whenever real payments, real shipping addresses, analytics, marketing, children, sensitive data, or new AI providers are introduced.

## Primary legal references used

- Colombia, Ley 1581 de 2012 (personal data): https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981
- Colombia, Decreto 1377 de 2013 (minimum policy information and authorization): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646
- Colombia, Ley 1480 de 2011 (consumer and e-commerce duties): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306
- Colombia, Ley 2439 de 2024 (e-commerce withdrawal refunds): https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116
- SIC consumer portal: https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor
- Google Gemini API data-retention information: https://ai.google.dev/gemini-api/docs/zdr
