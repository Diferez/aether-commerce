import { ReviewModerationService, type ReviewModerationRepository, type ReviewModerationStatus } from "@aether-commerce/api-core";

/**
 * D1 adapter for administrative review moderation. Joins in the product
 * name and reviewer email/name (reviews.user_id stores the Clerk id, same
 * convention as orders.user_id - see routes/user.ts's /orders route) so the
 * admin panel never has to show a bare product/user id to identify what's
 * being moderated.
 */
export function createReviewModerationService(db: D1Database): ReviewModerationService {
  const repository: ReviewModerationRepository = {
    async listAll(status) {
      const rows = await db
        .prepare(
          `select r.id, r.status, r.rating, r.title, r.body, r.created_at, r.updated_at,
                  r.product_id, p.name as product_name,
                  r.user_id, u.email as user_email, u.name as user_name
             from reviews r
             left join products p on p.id = r.product_id
             left join users u on u.clerk_id = r.user_id
            where (?1 is null or r.status = ?1)
            order by r.created_at desc
            limit 100`
        )
        .bind(status ?? null)
        .all<Record<string, unknown>>();
      return rows.results;
    },
    async setStatus(reviewId, status) {
      await db.prepare("update reviews set status = ?, updated_at = CURRENT_TIMESTAMP where id = ?").bind(status, reviewId).run();
    }
  };
  return new ReviewModerationService(repository);
}

export type { ReviewModerationStatus };
