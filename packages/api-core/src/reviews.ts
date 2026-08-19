export type CustomerReviewInput = {
  rating: number;
  title: string;
  body: string;
};

export type CustomerReviewPatch = {
  title?: string | undefined;
  body?: string | undefined;
};

export type CustomerReview = CustomerReviewInput & {
  id: string;
  userId: string;
  productId: string;
  status: "pending";
};

/** Persistence port for reviews owned by an authenticated customer. */
export interface CustomerReviewRepository {
  create(review: CustomerReview): Promise<void>;
  update(userId: string, reviewId: string, patch: CustomerReviewPatch): Promise<void>;
  softDelete(userId: string, reviewId: string): Promise<void>;
}

export class CustomerReviewService {
  constructor(
    private readonly repository: CustomerReviewRepository,
    private readonly createId: () => string
  ) {}

  async create(userId: string, productId: string, input: CustomerReviewInput): Promise<Pick<CustomerReview, "id" | "status">> {
    const review: CustomerReview = { id: this.createId(), userId, productId, status: "pending", ...input };
    await this.repository.create(review);
    return { id: review.id, status: review.status };
  }

  update(userId: string, reviewId: string, patch: CustomerReviewPatch): Promise<void> {
    return this.repository.update(userId, reviewId, patch);
  }

  softDelete(userId: string, reviewId: string): Promise<void> {
    return this.repository.softDelete(userId, reviewId);
  }
}

export type PublicProductReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: "approved";
  createdAt: string;
};

export interface PublicReviewRepository {
  listApprovedByProductId(productId: string): Promise<PublicProductReview[]>;
}

/** Read service exposing only already moderated reviews to storefronts. */
export class PublicReviewService {
  constructor(private readonly repository: PublicReviewRepository) {}

  listApproved(productId: string): Promise<PublicProductReview[]> {
    return this.repository.listApprovedByProductId(productId);
  }
}

export type ReviewModerationStatus = "pending" | "approved" | "rejected" | "hidden";
export type AdminReviewRecord = Record<string, unknown>;

export interface ReviewModerationRepository {
  listAll(status?: ReviewModerationStatus): Promise<AdminReviewRecord[]>;
  setStatus(reviewId: string, status: ReviewModerationStatus): Promise<void>;
}

/** Reusable moderation operation; application adapters decide who has permission to invoke it. */
export class ReviewModerationService {
  constructor(private readonly repository: ReviewModerationRepository) {}

  list(status?: ReviewModerationStatus): Promise<AdminReviewRecord[]> {
    return this.repository.listAll(status);
  }

  async moderate(reviewId: string, status: ReviewModerationStatus): Promise<{ id: string; status: ReviewModerationStatus }> {
    await this.repository.setStatus(reviewId, status);
    return { id: reviewId, status };
  }
}
