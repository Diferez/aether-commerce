// Every shape a tool (or the confirm endpoint) can hand back to the chat
// route. The frontend renders exactly these types with known, controlled
// components (ToolResultCard, PendingActionCard, ReceiptCard) - it never
// renders model-generated HTML/markdown as markup, only these typed fields.

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

// displayMessage lets a tool's ToolResult.message (always what the model
// reads on the next turn) diverge from what the operator sees in the chat
// bubble above the artifact card - needed the first time by
// get_system_health, whose model-facing message deliberately repeats every
// blocked order's internal id (so a follow-up "change it to processing"
// can act on it directly) but whose card (status badge, issues, related
// orders) already shows everything a human needs, id-less. Undefined means
// "no override, show ToolResult.message as before" - every existing tool
// keeps its current behavior without any change. An intersection (not a
// field on the union's parent) so every artifact variant gets it without
// having to add it one by one.
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
  // issues/relatedOrders are optional and only ever populated by
  // get_system_health (the specific components/orders behind a critical or
  // degraded status) - every other dashboard_summary caller omits them and
  // the card just shows the numbers.
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
