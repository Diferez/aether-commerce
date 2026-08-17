import { describe, expect, it } from "vitest";
import {
  CustomerReviewService,
  PublicReviewService,
  type CustomerReview,
  type CustomerReviewRepository,
  type PublicReviewRepository
} from "./reviews";

describe("customer reviews", () => {
  it("assigns generated identifiers and keeps new reviews pending before persistence", async () => {
    const created: CustomerReview[] = [];
    const repository: CustomerReviewRepository = {
      create: (review) => {
        created.push(review);
        return Promise.resolve();
      },
      update: () => Promise.resolve(),
      softDelete: () => Promise.resolve()
    };
    const service = new CustomerReviewService(repository, () => "review-id");

    await expect(service.create("customer", "product", { rating: 5, title: "Great", body: "A sufficiently detailed review." }))
      .resolves.toEqual({ id: "review-id", status: "pending" });
    expect(created).toEqual([{
      id: "review-id",
      userId: "customer",
      productId: "product",
      status: "pending",
      rating: 5,
      title: "Great",
      body: "A sufficiently detailed review."
    }]);
  });
});

describe("public reviews", () => {
  it("only exposes repository results that the moderation adapter marks as approved", async () => {
    const repository: PublicReviewRepository = {
      listApprovedByProductId: () => Promise.resolve([{
        id: "review-id",
        rating: 5,
        title: "Great",
        body: "A sufficiently detailed review.",
        status: "approved",
        createdAt: "2026-01-01"
      }])
    };

    await expect(new PublicReviewService(repository).listApproved("product-id")).resolves.toHaveLength(1);
  });
});
