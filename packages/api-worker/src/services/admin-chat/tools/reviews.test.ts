import { describe, expect, it } from "vitest";
import { executeModerateReview, prepareModerateReviewTool } from "./reviews";
import { fakeContext, fakeEnv } from "../test-support";

const REVIEW_ROW = { id: "rev_1", status: "pending", rating: 4, title: "Great mouse", product_name: "Wireless Mouse" };

describe("prepareModerateReviewTool", () => {
  it("returns REVIEW_NOT_FOUND for an unknown review", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const result = await prepareModerateReviewTool.run({ reviewId: "rev_missing", status: "approved" }, ctx);

    expect(result.artifact).toEqual({ type: "error", code: "REVIEW_NOT_FOUND", message: "Review not found." });
  });

  it("reports no change needed instead of preparing a no-op action", async () => {
    const { env, db } = fakeEnv([{ first: REVIEW_ROW }]);
    const ctx = fakeContext(env);

    const result = await prepareModerateReviewTool.run({ reviewId: "rev_1", status: "pending" }, ctx);

    expect(result.message).toMatch(/already pending/i);
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it("previews approving a pending review", async () => {
    const { env } = fakeEnv([
      { first: REVIEW_ROW },
      { first: null }, // createPendingAction: no existing row
      {}, // insert
      { first: { id: "pact_review", expires_at: new Date(Date.now() + 300_000).toISOString() } }
    ]);
    const ctx = fakeContext(env);

    const result = await prepareModerateReviewTool.run({ reviewId: "rev_1", status: "approved" }, ctx);

    expect(result.artifact).toMatchObject({ type: "pending_action", operationId: "pact_review", toolName: "prepare_moderate_review" });
  });
});

describe("executeModerateReview", () => {
  it("returns REVIEW_NOT_FOUND if the review was removed since the preview was shown", async () => {
    const { env } = fakeEnv([{ first: null }]);
    const ctx = fakeContext(env);

    const outcome = await executeModerateReview(ctx, { reviewId: "rev_1", status: "approved" });

    expect(outcome).toEqual({ success: false, code: "REVIEW_NOT_FOUND", message: "Review not found." });
  });

  it("sets the review's status and writes an audit log entry", async () => {
    const { env, db } = fakeEnv([
      { first: REVIEW_ROW }, // loadReviewForModeration existence check
      {}, // update reviews set status = ...
      {} // writeAuditLog insert
    ]);
    const ctx = fakeContext(env);

    const outcome = await executeModerateReview(ctx, { reviewId: "rev_1", status: "approved" });

    expect(outcome).toEqual({ success: true, result: { reviewId: "rev_1", status: "approved" } });
    expect(db.prepare).toHaveBeenCalledTimes(3);
  });
});
