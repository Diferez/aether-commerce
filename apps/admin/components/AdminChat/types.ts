// Hand-kept in sync with apps/api/src/services/admin-chat/artifacts.ts -
// same relationship this app already has with the API's response shapes
// elsewhere (e.g. the local BrandSettings type in app/settings/page.tsx)
// rather than sharing a package across the network boundary.

export type ProductSummaryArtifact = {
  id: string;
  name: string;
  sku: string;
  category: string;
  priceCents: number;
  stock: number;
  visibility: "draft" | "visible" | "hidden";
  href: string;
};

export type ProductDetailArtifact = ProductSummaryArtifact & {
  compareAtPriceCents: number | null;
  lowStockThreshold: number;
  brand: string | null;
};

export type OrderSummaryArtifact = {
  id: string;
  number: string;
  email: string;
  state: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  href: string;
};

export type OrderDetailArtifact = OrderSummaryArtifact & {
  internalNotes: string | null;
  itemCount: number;
};

export type CustomerSummaryArtifact = {
  id: string;
  name: string | null;
  email: string;
  status: "active" | "suspended";
  roles: string[];
  orderCount: number;
  totalSpentCents: number;
  href: string;
};

export type ActivityItemArtifact = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorId: string;
  createdAt: string;
};

export type DisambiguationOption = { id: string; label: string; detail?: string };

export type ActionDiffField = { field: string; before: unknown; after: unknown };

export type ActionDiff = {
  summary: string;
  targetLabel: string;
  fields: ActionDiffField[];
  consequences?: string[];
  affectedCount?: number;
  sampleAffected?: string[];
};

// displayMessage lets a tool response's model-facing message diverge from
// what the operator sees in the chat bubble above the card - see the
// matching comment in apps/api/src/services/admin-chat/artifacts.ts.
// Undefined means "no override, render ChatMessage.content as before".
type WithDisplayMessage = { displayMessage?: string };

export type ChatArtifact = (
  | { type: "text" }
  | { type: "navigate"; href: string; label: string }
  | { type: "product_list"; products: ProductSummaryArtifact[] }
  | { type: "product_detail"; product: ProductDetailArtifact }
  | { type: "order_list"; orders: OrderSummaryArtifact[] }
  | { type: "order_detail"; order: OrderDetailArtifact }
  | { type: "customer_card"; customer: CustomerSummaryArtifact }
  | { type: "customer_list"; customers: CustomerSummaryArtifact[] }
  | { type: "customer_order_history"; customerId: string; orders: OrderSummaryArtifact[] }
  | {
      type: "dashboard_summary";
      summary: Record<string, number | string | null>;
      issues?: { name: string; level: "critical" | "degraded"; reason: string }[];
      relatedOrders?: OrderSummaryArtifact[];
    }
  | { type: "activity_list"; items: ActivityItemArtifact[] }
  | { type: "allowed_transitions"; current: string; allowed: string[] }
  | { type: "disambiguation"; message: string; options: DisambiguationOption[] }
  | { type: "pending_action"; operationId: string; toolName: string; diff: ActionDiff; expiresAt: string }
  | { type: "receipt"; operationId: string; status: "succeeded" | "failed"; summary: string; result: Record<string, unknown> }
  | { type: "missing_info"; message: string; missingFields: string[] }
  | { type: "error"; code: string; message: string }
) &
  WithDisplayMessage;

export type ChatStatusPhase = "analyzing" | "consulting" | "preparing" | "waiting_for_confirmation" | "executing" | "done";

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string }
  | { id: string; role: "tool"; toolName: string; content: string; artifact: ChatArtifact }
  | { id: string; role: "system-error"; content: string };
