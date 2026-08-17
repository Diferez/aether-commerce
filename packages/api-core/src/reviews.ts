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
