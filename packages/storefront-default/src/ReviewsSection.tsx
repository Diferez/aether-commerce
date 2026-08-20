"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@aether/ui";
import { useStorefrontConfig } from "./AetherStorefrontProvider";
import { useAetherAuth } from "./AetherAuthProvider";
import { useLanguage } from "./LanguageProvider";
import { StorefrontLink } from "./StorefrontLink";

type ApprovedReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: "approved";
  created_at: string;
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={13} className={index < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-zinc-300"} aria-hidden />
      ))}
    </div>
  );
}

// Star-rating input, not a display: a row of clickable buttons rather than
// RatingStars above (that one is read-only and driven by a fixed number).
function RatingInput({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={t.yourRating}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star}/5`}
          onClick={() => onChange(star)}
          className="focus-ring rounded p-0.5"
        >
          <Star size={20} className={star <= value ? "fill-amber-400 text-amber-400" : "text-zinc-300"} aria-hidden />
        </button>
      ))}
    </div>
  );
}

// Real, moderated reviews (GET /products/:id/reviews, approved-only) and
// the submission form that feeds the pending queue an admin approves from
// (apps/admin/app/reviews/page.tsx) - separate from the top-of-page rating
// summary in ProductDetailClient.tsx, which reads the catalog's own
// imported rating_average/rating_count, not this table.
export function ReviewsSection({ productId, slug }: { productId: string; slug: string }) {
  const { locale, t } = useLanguage();
  const { apiBaseUrl } = useStorefrontConfig();
  const { customer, getToken } = useAetherAuth();
  const [reviews, setReviews] = useState<ApprovedReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${apiBaseUrl}/api/v1/products/${encodeURIComponent(productId)}/reviews`)
      .then((response) => response.json())
      .then((payload: { success: boolean; data?: ApprovedReview[] }) => {
        if (!cancelled && payload.success && payload.data) setReviews(payload.data);
      })
      .catch(() => {
        // Empty list on failure - the form below still works independently.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, apiBaseUrl]);

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1 || title.trim().length < 3 || body.trim().length < 10) {
      setMessage(t.reviewNotFilled);
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBaseUrl}/api/v1/products/${encodeURIComponent(productId)}/reviews`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ rating, title: title.trim(), body: body.trim() })
      });
      const payload = (await response.json()) as { success: boolean };
      if (!payload.success) {
        setMessage(t.reviewSubmitFailed);
        return;
      }
      setSubmitted(true);
      setRating(0);
      setTitle("");
      setBody("");
    } catch {
      setMessage(t.reviewSubmitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-2">
      <h2 className="text-lg font-semibold text-zinc-950">{t.reviewsHeading}</h2>

      {!loaded ? null : reviews.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">{t.noReviewsYet}</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {reviews.map((review) => (
            <li key={review.id} className="border-b border-zinc-100 pb-4 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-zinc-950">{review.title}</p>
                <span className="text-xs text-zinc-500">{new Date(review.created_at).toLocaleDateString(locale === "es" ? "es-CO" : "en-US")}</span>
              </div>
              <div className="mt-1">
                <RatingStars rating={review.rating} />
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{review.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-zinc-200 pt-5">
        <h3 className="text-sm font-semibold text-zinc-950">{t.writeAReview}</h3>
        {!customer ? (
          <p className="mt-2 text-sm text-zinc-600">
            <StorefrontLink href={`/login?next=/products/${encodeURIComponent(slug)}`} className="font-semibold text-accent underline decoration-accent underline-offset-4">
              {t.signInToReview}
            </StorefrontLink>
          </p>
        ) : submitted ? (
          <p className="mt-2 text-sm text-zinc-600">{t.reviewSubmitted}</p>
        ) : (
          <form onSubmit={(event) => void submitReview(event)} className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-700">{t.yourRating}</span>
              <RatingInput value={rating} onChange={setRating} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-700">{t.reviewTitleLabel}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t.reviewTitlePlaceholder}
                maxLength={120}
                className="focus-ring min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-zinc-950"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-zinc-700">{t.reviewBodyLabel}</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t.reviewBodyPlaceholder}
                maxLength={1200}
                rows={3}
                className="focus-ring rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
              />
            </label>
            {message ? <p className="text-sm text-danger">{message}</p> : null}
            <div>
              <Button type="submit" disabled={submitting}>
                {submitting ? t.submittingReview : t.submitReview}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
