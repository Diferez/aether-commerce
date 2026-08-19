-- One-time best-effort backfill for rows that existed before payment_status/
-- fulfillment_status were tracked independently (migration 0015). The old
-- single `state` enum doesn't retain enough history to always know for
-- certain whether a cancelled order had already been paid - but
-- createOrderFromStripeSession has only ever created orders already in
-- 'paid' state, so in this dataset a 'cancelled' order can only have
-- reached it via processing/packed (both post-payment), making "paid
-- before cancellation" the correct read of existing data, not a guess.
-- Every order created from this migration forward tracks both axes
-- precisely at write time instead of relying on this approximation.
UPDATE orders SET payment_status = CASE state
  WHEN 'draft' THEN 'pending'
  WHEN 'pending_payment' THEN 'pending'
  WHEN 'payment_processing' THEN 'pending'
  WHEN 'payment_failed' THEN 'failed'
  WHEN 'partially_refunded' THEN 'partially_refunded'
  WHEN 'refunded' THEN 'refunded'
  WHEN 'returned' THEN 'refunded'
  ELSE 'paid'
END;

UPDATE orders SET fulfillment_status = CASE state
  WHEN 'draft' THEN 'unfulfilled'
  WHEN 'pending_payment' THEN 'unfulfilled'
  WHEN 'payment_processing' THEN 'unfulfilled'
  WHEN 'payment_failed' THEN 'unfulfilled'
  WHEN 'paid' THEN 'unfulfilled'
  WHEN 'processing' THEN 'processing'
  WHEN 'packed' THEN 'shipped'
  WHEN 'shipped' THEN 'shipped'
  WHEN 'in_transit' THEN 'shipped'
  WHEN 'out_for_delivery' THEN 'shipped'
  WHEN 'cancelled' THEN 'cancelled'
  ELSE 'delivered'
END;
