import { ReviewModerationService, type ReviewModerationRepository } from "@aether/api-core";

/** D1 adapter for administrative review moderation. */
export function createReviewModerationService(db: D1Database): ReviewModerationService {
  const repository: ReviewModerationRepository = {
    async listAll() {
      const rows = await db.prepare("select * from reviews order by created_at desc limit 100").all<Record<string, unknown>>();
      return rows.results;
    },
    async setStatus(reviewId, status) {
      await db.prepare("update reviews set status = ?, updated_at = CURRENT_TIMESTAMP where id = ?").bind(status, reviewId).run();
    }
  };
  return new ReviewModerationService(repository);
}
