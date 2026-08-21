import { z } from "zod";
import { defineAdminChatTool, notFoundMessage, notFoundResult } from "../define-tool";
import { createPendingAction } from "../pending-actions";
import { pick } from "../language";
import { writeAuditLog } from "../../audit";
import { createReviewModerationService, type ReviewModerationStatus } from "../../review-moderation";
import type { ActionDiff } from "../artifacts";
import type { PendingActionExecutor } from "../executors";

type ReviewRow = { id: string; status: string; rating: number; title: string; product_name: string | null };

async function loadReviewForModeration(db: D1Database, reviewId: string): Promise<ReviewRow | null> {
  return db
    .prepare(
      `select r.id, r.status, r.rating, r.title, p.name as product_name
       from reviews r
       left join products p on p.id = r.product_id
       where r.id = ?`
    )
    .bind(reviewId)
    .first<ReviewRow>();
}

function reviewLabel(review: ReviewRow): string {
  return review.product_name ? `"${review.title}" (${review.product_name})` : `"${review.title}"`;
}

// Same shape as every other prepare_/execute_ pair in this file's siblings
// (products-mutations.ts, refunds.ts): the model can only ever propose a
// moderation change, never apply it - the operator confirms in the panel
// first, same as PATCH /admin/reviews/:id/moderation itself already requires.
export const prepareModerateReviewTool = defineAdminChatTool({
  name: "prepare_moderate_review",
  description: "Prepares approving, rejecting, or hiding a product review. Returns a preview that must be confirmed before the review's visible status changes.",
  schema: z.object({
    reviewId: z.string().min(1),
    status: z.enum(["pending", "approved", "rejected", "hidden"])
  }),
  requires: { permission: "reviews.moderate", mutation: true },
  run: async (args, ctx) => {
    const review = await loadReviewForModeration(ctx.env.DB, args.reviewId);
    if (!review) return notFoundResult(ctx, "REVIEW_NOT_FOUND", "review", "reseña");
    if (review.status === args.status) {
      return {
        message: pick(ctx.language, `That review is already ${args.status}.`, `Esa reseña ya está ${args.status}.`),
        artifact: { type: "missing_info", message: pick(ctx.language, "No change needed.", "No se necesita ningún cambio."), missingFields: [] }
      };
    }

    const diff: ActionDiff = {
      summary: pick(ctx.language, `Set review ${reviewLabel(review)} to ${args.status}`, `Marcar reseña ${reviewLabel(review)} como ${args.status}`),
      targetLabel: reviewLabel(review),
      fields: [{ field: "status", before: review.status, after: args.status }]
    };
    const { operationId, expiresAt } = await createPendingAction(ctx.env, {
      conversationId: ctx.conversationId,
      actorId: ctx.actor.userId ?? "admin",
      toolName: "prepare_moderate_review",
      targetType: "review",
      targetId: review.id,
      params: { reviewId: review.id, status: args.status },
      diff,
      requestId: ctx.requestId
    });
    return {
      message: pick(ctx.language, `Ready to mark this review ${args.status}. Please confirm.`, `Listo para marcar esta reseña como ${args.status}. Por favor confirma.`),
      artifact: { type: "pending_action", operationId, toolName: "prepare_moderate_review", diff, expiresAt }
    };
  }
});

export const executeModerateReview: PendingActionExecutor = async (ctx, params) => {
  const { reviewId, status } = params as { reviewId: string; status: ReviewModerationStatus };
  const review = await loadReviewForModeration(ctx.env.DB, reviewId);
  if (!review) return { success: false, code: "REVIEW_NOT_FOUND", message: notFoundMessage(ctx, "review", "reseña") };

  const result = await createReviewModerationService(ctx.env.DB).moderate(reviewId, status);
  await writeAuditLog(ctx.env, {
    actorId: ctx.actor.userId ?? "admin",
    action: "review.moderated",
    targetType: "review",
    targetId: reviewId,
    payload: { status, previousStatus: review.status, source: "admin_chat" }
  });
  return { success: true, result: { reviewId: result.id, status: result.status } };
};
