import type { Role } from "@aether/schemas";
import type { Env } from "../types";
import { updateUserRole } from "./clerk";
import { CURRENT_ORDER_SELECT, orderWithCurrentData, type StoredOrderRow } from "./orders";

export type CustomerStatus = "active" | "suspended";
export type CustomerSource = "registered" | "guest";

export type AdminCustomerSummary = {
  id: string;
  source: CustomerSource;
  name: string | null;
  email: string;
  roles: string[];
  status: CustomerStatus;
  createdAt: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

export type AdminCustomerListQuery = {
  search?: string | undefined;
  status?: CustomerStatus | undefined;
  page: number;
  pageSize: number;
};

export type AdminCustomerDetail = {
  id: string;
  source: CustomerSource;
  name: string | null;
  email: string;
  roles: string[];
  status: CustomerStatus;
  createdAt: string | null;
  addresses: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
};

export type CustomerMutationError = "not_found" | "guest_account";
export type RoleMutationError = "not_found" | "guest_account" | "clerk_update_failed";

const GUEST_ID_PREFIX = "guest:";

function parseRolesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : ["customer"];
  } catch {
    return ["customer"];
  }
}

// The roster is a real users row for anyone Clerk has synced (via the
// /webhooks/clerk handler) plus a synthetic row per distinct guest-checkout
// email that has no matching users row - covers both people who only ever
// signed up (never bought) and people who bought without ever creating an
// account. Guest ids are prefixed "guest:" so they can never collide with a
// real Clerk user id (those never contain a colon).
const ROSTER_CTE = `
  select u.id as id, u.name as name, u.email as email, u.roles_json as roles_json, u.status as status, u.created_at as created_at, 'registered' as source
  from users u
  union all
  select '${GUEST_ID_PREFIX}' || lower(o.email) as id, null as name, o.email as email, '["customer"]' as roles_json, 'active' as status, min(o.created_at) as created_at, 'guest' as source
  from orders o
  where not exists (select 1 from users u2 where lower(u2.email) = lower(o.email))
  group by lower(o.email)
`;

type RosterRow = {
  id: string;
  name: string | null;
  email: string;
  roles_json: string;
  status: string;
  created_at: string | null;
  source: CustomerSource;
};

export async function listCustomersForAdmin(env: Env, query: AdminCustomerListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.search) {
    where.push("(roster.email like ? or roster.name like ?)");
    const needle = `%${query.search}%`;
    params.push(needle, needle);
  }
  if (query.status) {
    where.push("roster.status = ?");
    params.push(query.status);
  }

  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";

  const total = await env.DB.prepare(`select count(*) as count from (${ROSTER_CTE}) roster ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const offset = (query.page - 1) * query.pageSize;
  const rows = await env.DB.prepare(
    `select * from (${ROSTER_CTE}) roster ${whereClause} order by roster.created_at desc limit ? offset ?`
  )
    .bind(...params, query.pageSize, offset)
    .all<RosterRow>();

  const emails = [...new Set(rows.results.map((row) => row.email.toLowerCase()))];
  const aggregates = new Map<string, { orderCount: number; totalSpent: number; lastOrderAt: string | null }>();
  if (emails.length > 0) {
    const placeholders = emails.map(() => "?").join(",");
    const aggregateRows = await env.DB.prepare(
      `select lower(email) as email_key, count(*) as order_count, sum(total) as total_spent, max(created_at) as last_order_at
       from orders where lower(email) in (${placeholders}) group by lower(email)`
    )
      .bind(...emails)
      .all<{ email_key: string; order_count: number; total_spent: number; last_order_at: string | null }>();
    for (const row of aggregateRows.results) {
      aggregates.set(row.email_key, {
        orderCount: row.order_count,
        totalSpent: row.total_spent,
        lastOrderAt: row.last_order_at
      });
    }
  }

  const data: AdminCustomerSummary[] = rows.results.map((row) => {
    const aggregate = aggregates.get(row.email.toLowerCase());
    return {
      id: row.id,
      source: row.source,
      name: row.name,
      email: row.email,
      roles: parseRolesJson(row.roles_json),
      status: row.status === "suspended" ? "suspended" : "active",
      createdAt: row.created_at,
      orderCount: aggregate?.orderCount ?? 0,
      totalSpent: aggregate?.totalSpent ?? 0,
      lastOrderAt: aggregate?.lastOrderAt ?? null
    };
  });

  const totalCount = total?.count ?? 0;
  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalCount,
      pageCount: Math.max(1, Math.ceil(totalCount / query.pageSize))
    }
  };
}

export async function getCustomerDetail(env: Env, id: string): Promise<AdminCustomerDetail | null> {
  if (id.startsWith(GUEST_ID_PREFIX)) {
    const email = id.slice(GUEST_ID_PREFIX.length);
    const rows = await env.DB.prepare(
      `select ${CURRENT_ORDER_SELECT} from orders where lower(email) = lower(?) order by created_at desc`
    )
      .bind(email)
      .all<StoredOrderRow>();
    if (rows.results.length === 0) {
      return null;
    }
    return {
      id,
      source: "guest",
      name: null,
      email,
      roles: ["customer"],
      status: "active",
      createdAt: null,
      addresses: [],
      orders: rows.results.map(orderWithCurrentData)
    };
  }

  // email matched too, case-insensitively - admin-chat's own
  // summarizeCustomersForModel (services/admin-chat/tools/customers.ts) only
  // ever shows the model a customer's name and email, never their internal
  // id, so a bare `id = ?` made a follow-up get_customer_details call fail
  // every time for anyone the model only knows by name/email (the guest
  // branch above already tolerates this via its own email lookup - this is
  // the same accommodation for a registered user). Mirrors the identical fix
  // applied to orders' loadOrderRow and products' getProductRow after a live
  // ORDER_NOT_FOUND failure traced to this exact identifier gap.
  const user = await env.DB.prepare("select id, name, email, roles_json, status, created_at from users where id = ? or lower(email) = lower(?)")
    .bind(id, id)
    .first<{ id: string; name: string | null; email: string; roles_json: string; status: string; created_at: string }>();
  if (!user) {
    return null;
  }

  const addressRows = await env.DB.prepare(
    "select payload_json from user_addresses where user_id = ? and deleted_at is null"
  )
    .bind(id)
    .all<{ payload_json: string }>();

  // Same "match by user_id or email" pattern a shopper's own order history
  // uses (routes/user.ts's GET /orders) - reused here for the admin view.
  const orderRows = await env.DB.prepare(
    `select ${CURRENT_ORDER_SELECT} from orders where user_id = ? or email = ? collate nocase order by created_at desc`
  )
    .bind(id, user.email)
    .all<StoredOrderRow>();

  return {
    id: user.id,
    source: "registered",
    name: user.name,
    email: user.email,
    roles: parseRolesJson(user.roles_json),
    status: user.status === "suspended" ? "suspended" : "active",
    createdAt: user.created_at,
    addresses: addressRows.results.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>),
    orders: orderRows.results.map(orderWithCurrentData)
  };
}

export async function setCustomerStatus(
  env: Env,
  id: string,
  status: CustomerStatus,
  actor: { actorId: string; requestId: string }
): Promise<{ updated: true } | { updated: false; error: CustomerMutationError }> {
  if (id.startsWith(GUEST_ID_PREFIX)) {
    return { updated: false, error: "guest_account" };
  }

  const current = await env.DB.prepare("select status from users where id = ?").bind(id).first<{ status: string }>();
  if (!current) {
    return { updated: false, error: "not_found" };
  }
  if (current.status === status) {
    return { updated: true };
  }

  await env.DB.batch([
    env.DB.prepare("update users set status = ?, updated_at = CURRENT_TIMESTAMP where id = ?").bind(status, id),
    env.DB.prepare(
      `insert into audit_logs (id, actor_id, action, target_type, target_id, payload_json)
       values (?, ?, 'user.status_changed', 'user', ?, ?)`
    ).bind(
      crypto.randomUUID(),
      actor.actorId,
      id,
      JSON.stringify({ from: current.status, to: status, requestId: actor.requestId })
    )
  ]);

  return { updated: true };
}

// Clerk is the real source of truth for roles (see middleware/auth.ts) - the
// remote call happens first, and D1's roles_json mirror is only updated on
// success, so a failed Clerk call never leaves D1 claiming a role change
// that didn't actually happen.
export async function setCustomerRole(
  env: Env,
  id: string,
  role: Role,
  actor: { actorId: string; requestId: string }
): Promise<{ updated: true } | { updated: false; error: RoleMutationError }> {
  if (id.startsWith(GUEST_ID_PREFIX)) {
    return { updated: false, error: "guest_account" };
  }

  const current = await env.DB.prepare("select roles_json from users where id = ?")
    .bind(id)
    .first<{ roles_json: string }>();
  if (!current) {
    return { updated: false, error: "not_found" };
  }

  const clerkResult = await updateUserRole(env, id, role);
  if (!clerkResult.ok) {
    return { updated: false, error: "clerk_update_failed" };
  }

  const previousRoles = parseRolesJson(current.roles_json);
  await env.DB.batch([
    env.DB.prepare("update users set roles_json = ?, updated_at = CURRENT_TIMESTAMP where id = ?").bind(
      JSON.stringify([role]),
      id
    ),
    env.DB.prepare(
      `insert into audit_logs (id, actor_id, action, target_type, target_id, payload_json)
       values (?, ?, 'user.role_changed', 'user', ?, ?)`
    ).bind(
      crypto.randomUUID(),
      actor.actorId,
      id,
      JSON.stringify({ from: previousRoles, to: [role], requestId: actor.requestId })
    )
  ]);

  return { updated: true };
}
