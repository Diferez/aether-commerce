import { describe, expect, it } from "vitest";
import { claimPendingAction, createPendingAction } from "./pending-actions";
import { fakeEnv } from "./test-support";

const FUTURE = new Date(Date.now() + 5 * 60_000).toISOString();
const PAST = new Date(Date.now() - 5 * 60_000).toISOString();

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pact_1",
    conversation_id: "conv_1",
    actor_id: "usr_admin",
    tool_name: "prepare_order_status_change",
    target_type: "order",
    target_id: "ord_1",
    params_json: "{}",
    diff_json: JSON.stringify({ summary: "test" }),
    status: "pending",
    idempotency_key: "chat_abc",
    request_id: "req_1",
    result_json: null,
    expires_at: FUTURE,
    created_at: "2026-01-01T00:00:00.000Z",
    resolved_at: null,
    ...overrides
  };
}

describe("createPendingAction", () => {
  it("creates a new pending row and returns its generated operationId", async () => {
    const { env, db } = fakeEnv([
      { first: null }, // no existing pending row for this idempotency key
      {}, // insert ... on conflict do nothing
      { first: { id: "pact_new", expires_at: FUTURE } } // read back
    ]);

    const result = await createPendingAction(env, {
      conversationId: "conv_1",
      actorId: "usr_admin",
      toolName: "prepare_order_status_change",
      targetType: "order",
      targetId: "ord_1",
      params: { orderId: "ord_1", fulfillmentStatus: "shipped" },
      diff: { summary: "test" },
      requestId: "req_1"
    });

    expect(result.operationId).toBe("pact_new");
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });

  it("reuses an existing, still-valid pending row for the same actor/tool/params instead of creating a duplicate", async () => {
    const { env, db } = fakeEnv([{ first: { id: "pact_existing", expires_at: FUTURE } }]);

    const result = await createPendingAction(env, {
      conversationId: "conv_1",
      actorId: "usr_admin",
      toolName: "prepare_order_status_change",
      targetType: "order",
      targetId: "ord_1",
      params: { orderId: "ord_1", fulfillmentStatus: "shipped" },
      diff: { summary: "test" },
      requestId: "req_1"
    });

    expect(result.operationId).toBe("pact_existing");
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });
});

describe("claimPendingAction", () => {
  it("returns not_found for an unknown operationId", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const result = await claimPendingAction(env, "pact_missing", "usr_admin");
    expect(result.kind).toBe("not_found");
  });

  it("returns forbidden when the confirming actor did not create the pending action", async () => {
    const { env } = fakeEnv([{ first: pendingRow({ actor_id: "usr_other" }) }]);
    const result = await claimPendingAction(env, "pact_1", "usr_admin");
    expect(result.kind).toBe("forbidden");
  });

  it("replays the cached result on a duplicate confirm instead of re-resolving", async () => {
    const { env } = fakeEnv([{ first: pendingRow({ status: "confirmed", result_json: JSON.stringify({ orderId: "ord_1", fulfillmentStatus: "shipped" }) }) }]);
    const result = await claimPendingAction(env, "pact_1", "usr_admin");
    expect(result).toEqual({ kind: "replay", result: { orderId: "ord_1", fulfillmentStatus: "shipped" } });
  });

  it("marks and reports an expired pending action instead of claiming it", async () => {
    const { env, db } = fakeEnv([{ first: pendingRow({ expires_at: PAST }) }, {}]);
    const result = await claimPendingAction(env, "pact_1", "usr_admin");
    expect(result.kind).toBe("expired");
    if (result.kind === "expired") expect(result.diff).toEqual({ summary: "test" });
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  it("atomically claims a valid pending action", async () => {
    const { env } = fakeEnv([{ first: pendingRow() }, { run: { changes: 1 } }]);
    const result = await claimPendingAction(env, "pact_1", "usr_admin");
    expect(result.kind).toBe("claimed");
    if (result.kind === "claimed") expect(result.row.id).toBe("pact_1");
  });

  it("re-resolves through the same branches when it loses the claim race to a concurrent confirm", async () => {
    const { env } = fakeEnv([
      { first: pendingRow() }, // initial read: still pending
      { run: { changes: 0 } }, // lost the atomic claim - someone else got there first
      { first: pendingRow({ status: "confirmed", result_json: JSON.stringify({ winner: true }) }) } // re-read
    ]);
    const result = await claimPendingAction(env, "pact_1", "usr_admin");
    expect(result).toEqual({ kind: "replay", result: { winner: true } });
  });
});
