## Checklist pre-merge

- [ ] PR apunta a `develop` para pruebas o a `main` solo desde una rama ya validada.
- [ ] `pnpm validate` pasa localmente o en CI.
- [ ] `pnpm build` pasa localmente o en CI.
- [ ] Si cambia CORS o URLs públicas, actualicé `APP_ORIGIN_STORE`, `APP_ORIGIN_ADMIN`, `NEXT_PUBLIC_AETHER_API_URL`, `NEXT_PUBLIC_AETHER_AI_URL` y `NEXT_PUBLIC_PORTFOLIO_URL` en el environment correcto.
- [ ] Revisé storefront, admin, API y asistente en desarrollo antes de mergear a `main`.
