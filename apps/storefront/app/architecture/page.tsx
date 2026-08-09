"use client";

import {
  Blocks,
  Bot,
  Cloud,
  CreditCard,
  Database,
  GitBranch,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Mail,
  ServerCog,
  ShieldCheck,
  ShoppingCart,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "../../components/LanguageProvider";

type BarDatum = { label: string; count: number };

type ArchitectureCopy = {
  eyebrow: string;
  title: string;
  description: string;
  items: Array<{ title: string; body: string; Icon: LucideIcon }>;
  runtime: {
    eyebrow: string;
    title: string;
    body: string;
    client: string;
    hub: string;
    deployNote: string;
    services: Array<{ label: string; Icon: LucideIcon; deployTime?: boolean }>;
  };
  infra: {
    eyebrow: string;
    title: string;
    body: string;
    repo: string;
    ci: string;
    bindingsLabel: string;
    deployTargets: Array<{ label: string; sub: string; Icon: LucideIcon }>;
    services: Array<{ label: string; sub: string; Icon: LucideIcon }>;
  };
  charts: {
    apiTitle: string;
    apiDescription: string;
    apiUnit: string;
    apiTotal: string;
    dataTitle: string;
    dataDescription: string;
    dataUnit: string;
    dataTotal: string;
  };
  apiDomains: BarDatum[];
  dataDomains: BarDatum[];
  flows: Array<{ title: string; body: string; Icon: LucideIcon }>;
};

const copy: Record<"en" | "es", ArchitectureCopy> = {
  en: {
    eyebrow: "Architecture",
    title: "Aether system design",
    description:
      "Aether is built as a portfolio-connected commerce demo: a static customer experience backed by a Worker API, D1 persistence, Stripe sandbox payments, and deployment automation designed for a small production footprint.",
    items: [
      {
        title: "Unified static front",
        body: "The portfolio and Aether storefront are shipped together as a static front. Pages stay fast, cacheable, and independent from server-side rendering.",
        Icon: Blocks
      },
      {
        title: "Cloudflare Worker API",
        body: "Hono routes own catalog, carts, contact messages, checkout, webhooks, request IDs, secure errors, and the API boundary used by the static front.",
        Icon: ServerCog
      },
      {
        title: "Cloudflare D1 data layer",
        body: "SQLite-backed D1 stores carts, orders, products, contact messages, webhook events, email events, and operational records for the demo.",
        Icon: Database
      },
      {
        title: "Secrets boundary",
        body: "Stripe, Clerk-ready auth, Resend, and Cloudinary configuration stay server-side in Worker secrets or deployment variables.",
        Icon: KeyRound
      }
    ],
    runtime: {
      eyebrow: "Runtime map",
      title: "Clear boundaries between UI, API, data, and third-party services.",
      body: "The front never owns secrets or final commerce decisions. It renders the experience, sends intent to the Worker, and receives normalized responses that are safe for the browser.",
      client: "Static portfolio + store",
      hub: "Hono Worker API",
      deployNote: "Deploy-time only",
      services: [
        { label: "D1 database", Icon: Database },
        { label: "Stripe sandbox", Icon: CreditCard },
        { label: "Resend email events", Icon: Mail },
        { label: "GitHub Actions + Wrangler", Icon: GitBranch, deployTime: true }
      ]
    },
    infra: {
      eyebrow: "Infrastructure",
      title: "What actually gets deployed, and where.",
      body: "Every push to main runs the same GitHub Actions workflow: build, test, then deploy each piece to its own Cloudflare resource. Nothing is deployed by hand.",
      repo: "GitHub repository (main)",
      ci: "GitHub Actions CI/CD",
      bindingsLabel: "Secrets & bindings (D1, Stripe, Resend, Clerk, Cloudinary)",
      deployTargets: [
        { label: "aether-api", sub: "Cloudflare Worker", Icon: ServerCog },
        { label: "aether-storefront", sub: "Cloudflare Worker", Icon: Blocks },
        { label: "aether-admin", sub: "Cloudflare Pages", Icon: Layers },
        { label: "ai-assistant", sub: "Cloudflare Worker", Icon: Bot }
      ],
      services: [
        { label: "D1", sub: "aether-production", Icon: Database },
        { label: "Stripe", sub: "sandbox mode", Icon: CreditCard },
        { label: "Resend", sub: "transactional email", Icon: Mail },
        { label: "Clerk", sub: "auth (ready)", Icon: KeyRound },
        { label: "Cloudinary", sub: "media (optional)", Icon: ImageIcon }
      ]
    },
    charts: {
      apiTitle: "API surface by domain",
      apiDescription: "Route handlers actually defined in the Worker API, counted straight from the source - not sample traffic.",
      apiUnit: "endpoints",
      apiTotal: "endpoints across 8 route groups",
      dataTitle: "Data model by domain",
      dataDescription: "Every table declared across the D1 migrations, grouped by the part of the system it serves.",
      dataUnit: "tables",
      dataTotal: "tables across 7 domains"
    },
    apiDomains: [
      { label: "Admin", count: 28 },
      { label: "Customer account", count: 25 },
      { label: "Storefront browsing", count: 12 },
      { label: "Cart", count: 6 },
      { label: "Catalog", count: 4 },
      { label: "Checkout", count: 2 },
      { label: "Contact", count: 1 },
      { label: "Webhooks", count: 1 }
    ],
    dataDomains: [
      { label: "Commerce & catalog", count: 10 },
      { label: "Orders & payments", count: 9 },
      { label: "AI assistant", count: 6 },
      { label: "Users & access", count: 6 },
      { label: "Reviews & engagement", count: 5 },
      { label: "Admin & ops", count: 4 },
      { label: "Notifications", count: 3 }
    ],
    flows: [
      {
        title: "Catalog flow",
        body: "External product data is normalized into Aether contracts, filtered for usable images and names, merged with local overrides, then exposed through paginated API responses.",
        Icon: Workflow
      },
      {
        title: "Cart and checkout",
        body: "The browser keeps the cart responsive, while the Worker recalculates prices, validates quantities, creates Stripe test checkout sessions, and records orders after confirmed payment events.",
        Icon: ShoppingCart
      },
      {
        title: "Contact and notifications",
        body: "Portfolio and store contact forms post to the same Worker API. D1 keeps the message history and Resend can deliver email notifications when credentials are configured.",
        Icon: Mail
      },
      {
        title: "Deployment pipeline",
        body: "GitHub Actions, Cloudflare Workers, Cloudflare Pages-compatible output, Wrangler, and environment-specific variables keep production deploys repeatable.",
        Icon: GitBranch
      },
      {
        title: "Operational controls",
        body: "The demo uses public-safe behavior, protected checkout, API validation, idempotent webhook handling, and server-side secrets to avoid exposing sensitive keys in the client bundle.",
        Icon: ShieldCheck
      },
      {
        title: "Free-tier conscious design",
        body: "The architecture favors static assets, Worker endpoints, D1, cached catalog reads, and sandbox payments so the project can run within practical Cloudflare demo constraints.",
        Icon: Cloud
      }
    ]
  },
  es: {
    eyebrow: "Arquitectura",
    title: "Diseño del sistema Aether",
    description:
      "Aether está construido como una demo de comercio conectada al portafolio: una experiencia estática para clientes, respaldada por una API Worker, persistencia en D1, pagos de prueba con Stripe y despliegues automatizables con una huella operativa pequeña.",
    items: [
      {
        title: "Front estático unificado",
        body: "El portafolio y la tienda Aether se publican juntos como un front estático. Las páginas se mantienen rápidas, cacheables e independientes de renderizado en servidor.",
        Icon: Blocks
      },
      {
        title: "API en Cloudflare Worker",
        body: "Las rutas con Hono manejan catálogo, carritos, mensajes de contacto, checkout, webhooks, identificadores de request, errores seguros y el límite entre front y backend.",
        Icon: ServerCog
      },
      {
        title: "Capa de datos con Cloudflare D1",
        body: "D1, basado en SQLite, guarda carritos, órdenes, productos, mensajes de contacto, eventos de webhook, eventos de correo y registros operativos de la demo.",
        Icon: Database
      },
      {
        title: "Separación de secretos",
        body: "Stripe, autenticación preparada para Clerk, Resend y la configuración de Cloudinary permanecen del lado del servidor en secretos del Worker o variables de despliegue.",
        Icon: KeyRound
      }
    ],
    runtime: {
      eyebrow: "Mapa de ejecución",
      title: "Límites claros entre UI, API, datos y servicios externos.",
      body: "El front no posee secretos ni toma decisiones finales de comercio. Renderiza la experiencia, envía intenciones al Worker y recibe respuestas normalizadas seguras para el navegador.",
      client: "Portafolio + tienda estática",
      hub: "API Worker con Hono",
      deployNote: "Solo en despliegue",
      services: [
        { label: "Base de datos D1", Icon: Database },
        { label: "Stripe sandbox", Icon: CreditCard },
        { label: "Eventos de correo con Resend", Icon: Mail },
        { label: "GitHub Actions + Wrangler", Icon: GitBranch, deployTime: true }
      ]
    },
    infra: {
      eyebrow: "Infraestructura",
      title: "Qué se despliega en realidad, y dónde.",
      body: "Cada push a main corre el mismo workflow de GitHub Actions: build, tests y despliegue de cada pieza a su propio recurso de Cloudflare. Nada se despliega a mano.",
      repo: "Repositorio en GitHub (main)",
      ci: "GitHub Actions CI/CD",
      bindingsLabel: "Secretos y bindings (D1, Stripe, Resend, Clerk, Cloudinary)",
      deployTargets: [
        { label: "aether-api", sub: "Cloudflare Worker", Icon: ServerCog },
        { label: "aether-storefront", sub: "Cloudflare Worker", Icon: Blocks },
        { label: "aether-admin", sub: "Cloudflare Pages", Icon: Layers },
        { label: "ai-assistant", sub: "Cloudflare Worker", Icon: Bot }
      ],
      services: [
        { label: "D1", sub: "aether-production", Icon: Database },
        { label: "Stripe", sub: "modo sandbox", Icon: CreditCard },
        { label: "Resend", sub: "correo transaccional", Icon: Mail },
        { label: "Clerk", sub: "auth (listo)", Icon: KeyRound },
        { label: "Cloudinary", sub: "media (opcional)", Icon: ImageIcon }
      ]
    },
    charts: {
      apiTitle: "Superficie de API por dominio",
      apiDescription: "Handlers de ruta definidos realmente en la API Worker, contados directo del código fuente - no tráfico de muestra.",
      apiUnit: "endpoints",
      apiTotal: "endpoints en 8 grupos de rutas",
      dataTitle: "Modelo de datos por dominio",
      dataDescription: "Cada tabla declarada en las migraciones de D1, agrupada por la parte del sistema a la que sirve.",
      dataUnit: "tablas",
      dataTotal: "tablas en 7 dominios"
    },
    apiDomains: [
      { label: "Administración", count: 28 },
      { label: "Cuenta del cliente", count: 25 },
      { label: "Navegación de tienda", count: 12 },
      { label: "Carrito", count: 6 },
      { label: "Catálogo", count: 4 },
      { label: "Checkout", count: 2 },
      { label: "Contacto", count: 1 },
      { label: "Webhooks", count: 1 }
    ],
    dataDomains: [
      { label: "Comercio y catálogo", count: 10 },
      { label: "Órdenes y pagos", count: 9 },
      { label: "Asistente de IA", count: 6 },
      { label: "Usuarios y accesos", count: 6 },
      { label: "Reseñas y engagement", count: 5 },
      { label: "Administración", count: 4 },
      { label: "Notificaciones", count: 3 }
    ],
    flows: [
      {
        title: "Flujo de catálogo",
        body: "Los datos externos de productos se normalizan al contrato de Aether, se filtran por imágenes y nombres útiles, se combinan con reglas locales y se exponen en respuestas paginadas.",
        Icon: Workflow
      },
      {
        title: "Carrito y checkout",
        body: "El navegador mantiene el carrito fluido, mientras el Worker recalcula precios, valida cantidades, crea sesiones de checkout de prueba con Stripe y registra órdenes después de eventos de pago confirmados.",
        Icon: ShoppingCart
      },
      {
        title: "Contacto y notificaciones",
        body: "Los formularios del portafolio y la tienda publican en la misma API Worker. D1 conserva el historial y Resend puede enviar notificaciones cuando las credenciales están configuradas.",
        Icon: Mail
      },
      {
        title: "Pipeline de despliegue",
        body: "GitHub Actions, Cloudflare Workers, salida compatible con Cloudflare Pages, Wrangler y variables por entorno mantienen despliegues repetibles.",
        Icon: GitBranch
      },
      {
        title: "Controles operativos",
        body: "La demo usa comportamiento seguro para público, checkout protegido, validación en API, webhooks idempotentes y secretos del lado del servidor para evitar exponer claves en el cliente.",
        Icon: ShieldCheck
      },
      {
        title: "Diseño consciente del free tier",
        body: "La arquitectura favorece assets estáticos, endpoints Worker, D1, lecturas cacheadas de catálogo y pagos sandbox para operar dentro de restricciones prácticas de una demo en Cloudflare.",
        Icon: Cloud
      }
    ]
  }
};

function FanOut({ count }: { count: number }) {
  const offsets = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100);
  const first = offsets[0] ?? 0;
  const last = offsets[offsets.length - 1] ?? 0;
  return (
    <div className="relative mx-auto h-8 w-full max-w-4xl" aria-hidden>
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border-strong sm:hidden" />
      <div
        className="absolute top-0 hidden h-px bg-border-strong sm:block"
        style={{ left: `${first}%`, right: `${100 - last}%` }}
      />
      {offsets.map((offset) => (
        <div key={offset} className="absolute top-0 hidden h-4 w-px bg-border-strong sm:block" style={{ left: `${offset}%` }} />
      ))}
    </div>
  );
}

function BarChart({
  data,
  unit,
  totalLabel,
  barClassName,
  trackClassName
}: {
  data: BarDatum[];
  unit: string;
  totalLabel: string;
  barClassName: string;
  trackClassName: string;
}) {
  const max = Math.max(...data.map((row) => row.count));
  const total = data.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-3">
        {data.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr_2.5rem]">
            <span className="truncate text-sm text-ink-muted">{row.label}</span>
            <div className={`h-3.5 w-full overflow-hidden ${trackClassName}`}>
              <div
                className={`h-full rounded-r-[4px] ${barClassName}`}
                style={{ width: `${Math.max((row.count / max) * 100, 4)}%` }}
              />
            </div>
            <span className="text-right text-sm font-semibold tabular-nums text-ink">{row.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-border pt-3 text-xs text-ink-subtle">
        {total.toLocaleString()} {unit} · {totalLabel}
      </p>
    </div>
  );
}

export default function ArchitecturePage() {
  const { locale } = useLanguage();
  const page = copy[locale];

  return (
    <main className="aether-shell py-8">
      <p className="text-sm font-semibold uppercase text-accent">{page.eyebrow}</p>
      <h1 className="mt-2 text-4xl font-semibold text-ink">{page.title}</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-ink-muted">{page.description}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {page.items.map(({ title, body, Icon }) => (
          <section key={title} className="rounded-lg border border-border bg-surface p-5">
            <Icon className="text-accent" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{body}</p>
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-semibold uppercase text-accent-2">{page.runtime.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{page.runtime.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">{page.runtime.body}</p>

        <div className="mt-6 flex flex-col items-stretch gap-3">
          <div className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-border-strong bg-surface-hover px-4 py-3">
            <Blocks className="shrink-0 text-ink" size={20} aria-hidden />
            <span className="text-sm font-semibold text-ink">{page.runtime.client}</span>
          </div>

          <div className="mx-auto h-8 w-px bg-border-strong" aria-hidden />

          <div className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-accent bg-accent-soft px-4 py-3">
            <ServerCog className="shrink-0 text-accent" size={20} aria-hidden />
            <span className="text-sm font-semibold text-ink">{page.runtime.hub}</span>
          </div>

          <div className="relative mx-auto h-8 w-full max-w-3xl" aria-hidden>
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border-strong sm:hidden" />
            <div className="absolute left-[12.5%] right-[12.5%] top-0 hidden h-px bg-border-strong sm:block" />
            <div className="absolute left-[12.5%] top-0 hidden h-4 w-px bg-border-strong sm:block" />
            <div className="absolute left-[37.5%] top-0 hidden h-4 w-px bg-border-strong sm:block" />
            <div className="absolute left-[62.5%] top-0 hidden h-4 w-px bg-border-strong sm:block" />
            <div className="absolute left-[87.5%] top-0 hidden h-4 w-px bg-border-strong sm:block" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {page.runtime.services.map(({ label, Icon, deployTime }) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                  deployTime ? "border-dashed border-border-strong bg-surface" : "border-border bg-surface-hover"
                }`}
              >
                <Icon className={deployTime ? "shrink-0 text-ink-muted" : "shrink-0 text-accent-2"} size={20} aria-hidden />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                  {deployTime ? <span className="block text-[11px] text-ink-subtle">{page.runtime.deployNote}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-semibold uppercase text-accent-2">{page.infra.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{page.infra.title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">{page.infra.body}</p>

        <div className="mt-6 flex flex-col items-stretch gap-3">
          <div className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-border-strong bg-surface-hover px-4 py-3">
            <GitBranch className="shrink-0 text-ink" size={20} aria-hidden />
            <span className="text-sm font-semibold text-ink">{page.infra.repo}</span>
          </div>

          <div className="mx-auto h-8 w-px bg-border-strong" aria-hidden />

          <div className="mx-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-accent bg-accent-soft px-4 py-3">
            <Workflow className="shrink-0 text-accent" size={20} aria-hidden />
            <span className="text-sm font-semibold text-ink">{page.infra.ci}</span>
          </div>

          <FanOut count={page.infra.deployTargets.length} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {page.infra.deployTargets.map(({ label, sub, Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3">
                <Icon className="shrink-0 text-accent-2" size={20} aria-hidden />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-[11px] text-ink-subtle">{sub}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-ink-subtle">{page.infra.bindingsLabel}</p>

          <FanOut count={page.infra.services.length} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {page.infra.services.map(({ label, sub, Icon }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-4 py-3"
              >
                <Icon className="shrink-0 text-ink-muted" size={20} aria-hidden />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-[11px] text-ink-subtle">{sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold text-ink">{page.charts.apiTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{page.charts.apiDescription}</p>
          <div className="mt-4">
            <BarChart
              data={page.apiDomains}
              unit={page.charts.apiUnit}
              totalLabel={page.charts.apiTotal}
              barClassName="bg-accent"
              trackClassName="rounded-r-[4px] bg-accent-soft"
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">{page.charts.dataTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{page.charts.dataDescription}</p>
          <div className="mt-4">
            <BarChart
              data={page.dataDomains}
              unit={page.charts.dataUnit}
              totalLabel={page.charts.dataTotal}
              barClassName="bg-accent-2"
              trackClassName="rounded-r-[4px] bg-accent-2-soft"
            />
          </div>
        </section>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {page.flows.map(({ title, body, Icon }) => (
          <section key={title} className="rounded-lg border border-border bg-surface p-5">
            <Icon className="text-accent" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
