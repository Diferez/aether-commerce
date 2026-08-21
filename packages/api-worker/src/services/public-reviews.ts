import { PublicReviewService, type PublicReviewRepository } from "@aether-commerce/api-core";

/** D1 adapter for public, moderation-filtered product reviews. */
export function createPublicReviewService(db: D1Database): PublicReviewService {
  const repository: PublicReviewRepository = {
    async listApprovedByProductId(productId) {
      const rows = await db
        .prepare("select id, rating, title, body, status, created_at from reviews where product_id = ? and status = 'approved' order by created_at desc")
        .bind(productId)
        .all<{
          id: string;
          rating: number;
          title: string;
          body: string;
          status: "approved";
          created_at: string;
        }>();
      return rows.results.map((review) => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        status: review.status,
        createdAt: review.created_at
      }));
    }
  };
  return new PublicReviewService(repository);
}
