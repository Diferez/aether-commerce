import type { Context } from "hono";
import type { AppBindings } from "./types";

export function ok<T>(c: Context<AppBindings>, data: T, status: 200 | 201 = 200) {
  return c.json(
    {
      success: true,
      data,
      meta: { requestId: c.get("requestId") }
    },
    status
  );
}

export function collection<T>(
  c: Context<AppBindings>,
  data: T[],
  pagination: { page: number; pageSize: number; total: number; pageCount: number }
) {
  const normalizedPagination = {
    ...pagination,
    limit: pagination.pageSize,
    totalItems: pagination.total,
    totalPages: pagination.pageCount,
    hasNextPage: pagination.page < pagination.pageCount,
    hasPreviousPage: pagination.page > 1
  };

  return c.json({
    success: true,
    data,
    pagination: normalizedPagination,
    meta: { requestId: c.get("requestId") }
  });
}

export function fail(
  c: Context<AppBindings>,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
  code: string,
  message: string,
  details?: unknown
) {
  return c.json(
    {
      success: false,
      error: { code, message, details },
      meta: { requestId: c.get("requestId") ?? crypto.randomUUID() }
    },
    status
  );
}
