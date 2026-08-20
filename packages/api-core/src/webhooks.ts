export type WebhookEvent = {
  id: string;
  provider: string;
  providerEventId: string;
  payload: string;
};

export interface WebhookEventRepository {
  record(event: WebhookEvent): Promise<void>;
}

export type WebhookEventIdFactory = () => string;

/** Reusable idempotent webhook persistence boundary. Signature verification stays in provider adapters. */
export class WebhookEventService {
  constructor(
    private readonly repository: WebhookEventRepository,
    private readonly createId: WebhookEventIdFactory
  ) {}

  async record(provider: string, providerEventId: string, payload: string): Promise<void> {
    await this.repository.record({ id: this.createId(), provider, providerEventId, payload });
  }
}

export type StripeWebhookPayload = {
  id: string;
  type: string;
  data?: {
    object?: {
      id: string;
      payment_status?: string;
      amount_total?: number;
      currency?: string;
      customer_details?: { email?: string };
      customer_email?: string;
      metadata?: { cartId?: string; userId?: string; checkoutSnapshotId?: string };
      payment_intent?: string;
      // charge.refunded - the object is the Charge itself.
      refunded?: boolean;
      amount_refunded?: number;
      // charge.dispute.created - the object is the Dispute itself.
      reason?: string;
      status?: string;
    };
  };
};

/** Parses only the public event shape consumed by the checkout adapter. */
export function parseStripeWebhookPayload(payload: string): StripeWebhookPayload {
  return JSON.parse(payload) as StripeWebhookPayload;
}

export type WompiWebhookPayload = {
  event: string;
  data?: {
    transaction?: {
      id: string;
      status?: string;
      amount_in_cents?: number;
      currency?: string;
      reference?: string;
      customer_email?: string;
      payment_link_id?: string;
    };
  };
  sent_at?: string;
  timestamp?: number;
  signature?: {
    properties: string[];
    checksum: string;
  };
  environment?: string;
};

/** Parses only the public event shape consumed by the checkout adapter. */
export function parseWompiWebhookPayload(payload: string): WompiWebhookPayload {
  return JSON.parse(payload) as WompiWebhookPayload;
}
