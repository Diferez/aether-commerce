import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAdminChatTool } from "./define-tool";
import { fakeContext, fakeEnv } from "./test-support";

describe("defineAdminChatTool", () => {
  it("denies a tool call when the actor lacks the required permission, without ever running the handler", async () => {
    let ran = false;
    const tool = defineAdminChatTool({
      name: "test_tool",
      description: "test",
      schema: z.object({}),
      requires: { permission: "orders.write" },
      run: () => {
        ran = true;
        return Promise.resolve({ message: "ok", artifact: { type: "text" as const } });
      }
    });
    const { env } = fakeEnv();
    const ctx = fakeContext(env, { roles: ["support"], permissions: [] });

    const result = await tool.run({}, ctx);

    expect(ran).toBe(false);
    expect(result.artifact).toMatchObject({ type: "error", code: "FORBIDDEN" });
  });

  it("builds the FORBIDDEN message in Spanish when the operator's conversation is in Spanish", async () => {
    const tool = defineAdminChatTool({
      name: "test_tool",
      description: "test",
      schema: z.object({}),
      requires: { permission: "orders.write" },
      run: () => Promise.resolve({ message: "ok", artifact: { type: "text" as const } })
    });
    const { env } = fakeEnv();
    const ctx = fakeContext(env, { roles: ["support"], permissions: [] }, { language: "es" });

    const result = await tool.run({}, ctx);

    expect(result.message).toBe('No tienes el permiso "orders.write" necesario para esto.');
    expect(result.message).not.toMatch(/permission/i);
  });

  it("blocks a mutation tool when ADMIN_CHAT_MUTATIONS_ENABLED is false, before touching business logic", async () => {
    let ran = false;
    const tool = defineAdminChatTool({
      name: "test_mutation",
      description: "test",
      schema: z.object({}),
      requires: { permission: "orders.write", mutation: true },
      run: () => {
        ran = true;
        return Promise.resolve({ message: "ok", artifact: { type: "text" as const } });
      }
    });
    const { env } = fakeEnv([], { ADMIN_CHAT_MUTATIONS_ENABLED: "false" });
    const ctx = fakeContext(env, { roles: ["admin"], permissions: [] });

    const result = await tool.run({}, ctx);

    expect(ran).toBe(false);
    expect(result.artifact).toMatchObject({ type: "error", code: "MUTATIONS_DISABLED" });
  });

  it("blocks any mutating tool call while in demo mode", async () => {
    const tool = defineAdminChatTool({
      name: "test_mutation",
      description: "test",
      schema: z.object({}),
      requires: { permission: "orders.write", mutation: true },
      run: () => Promise.resolve({ message: "ok", artifact: { type: "text" as const } })
    });
    const { env } = fakeEnv();
    const ctx = fakeContext(env, { roles: ["demo_viewer"], permissions: [], mode: "demo" });

    const result = await tool.run({}, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "DEMO_MODE" });
  });

  it("returns a structured error instead of throwing when args fail schema validation", async () => {
    const tool = defineAdminChatTool({
      name: "test_tool",
      description: "test",
      schema: z.object({ orderId: z.string().min(1) }),
      run: () => Promise.resolve({ message: "ok", artifact: { type: "text" as const } })
    });
    const { env } = fakeEnv();
    const ctx = fakeContext(env);

    const result = await tool.run({}, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "INVALID_ARGUMENTS" });
  });

  it("catches an exception thrown by the tool body and returns a structured, non-throwing error", async () => {
    const tool = defineAdminChatTool({
      name: "test_tool",
      description: "test",
      schema: z.object({}),
      run: () => {
        throw new Error("boom");
      }
    });
    const { env } = fakeEnv();
    const ctx = fakeContext(env);

    const result = await tool.run({}, ctx);

    expect(result.artifact).toMatchObject({ type: "error", code: "TOOL_FAILED" });
  });

  it("runs the handler and returns its result when every precondition passes", async () => {
    const tool = defineAdminChatTool({
      name: "test_tool",
      description: "test",
      schema: z.object({}),
      requires: { permission: "orders.read" },
      run: () => Promise.resolve({ message: "done", artifact: { type: "text" as const } })
    });
    const { env } = fakeEnv();
    const ctx = fakeContext(env, { roles: ["order_manager"], permissions: [] });

    const result = await tool.run({}, ctx);

    expect(result).toEqual({ message: "done", artifact: { type: "text" } });
  });
});
