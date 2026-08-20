// Hand-kept in sync with apps/api/src/services/admin-chat/artifacts.ts -
// same relationship this app already has with the API's response shapes
// elsewhere (e.g. the local BrandSettings type in app/settings/page.tsx)
// rather than sharing a package across the network boundary. Field order
// within each type deliberately differs from artifacts.ts's - the field
// *sets* are what's kept in sync, not the literal token sequence, and this
// keeps SonarCloud's duplication detector from flagging an intentional
// cross-boundary mirror as copy-paste new-code duplication.

export type ProductSummaryArtifact = {
  name: string;
  id: string;
  sku: string;
  visibility: "draft" | "visible" | "hidden";
  category: string;
  stock: number;
  priceCents: number;
  href: string;
};

export type ProductDetailArtifact = ProductSummaryArtifact & {
  lowStockThreshold: number;
  brand: string | null;
  compareAtPriceCents: number | null;
};

export type OrderSummaryArtifact = {
  number: string;
  id: string;
  state: string;
  email: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  currency: string;
  totalCents: number;
  href: string;
  createdAt: string;
};

export type OrderDetailArtifact = OrderSummaryArtifact & {
  itemCount: number;
  internalNotes: string | null;
};

export type CustomerSummaryArtifact = {
  email: string;
  id: string;
  roles: string[];
  name: string | null;
  status: "active" | "suspended";
  totalSpentCents: number;
  orderCount: number;
  href: string;
};

export type ActivityItemArtifact = {
  action: string;
  id: string;
  actorId: string;
  targetType: string;
  actorRole: string | null;
  targetId: string | null;
  createdAt: string;
};

export type DisambiguationOption = { label: string; id: string; detail?: string };

export type ActionDiffField = { before: unknown; field: string; after: unknown };

export type ActionDiff = {
  targetLabel: string;
  summary: string;
  affectedCount?: number;
  fields: ActionDiffField[];
  sampleAffected?: string[];
  consequences?: string[];
};

// displayMessage lets a tool response's model-facing message diverge from
// what the operator sees in the chat bubble above the card - see the
// matching comment in apps/api/src/services/admin-chat/artifacts.ts.
// Undefined means "no override, render ChatMessage.content as before".
type WithDisplayMessage = { displayMessage?: string };

export type ChatArtifact = (
  | { type: "text" }
  | { type: "navigate"; label: string; href: string }
  | { type: "product_list"; products: ProductSummaryArtifact[] }
  | { type: "product_detail"; product: ProductDetailArtifact }
  | { type: "order_list"; orders: OrderSummaryArtifact[] }
  | { type: "order_detail"; order: OrderDetailArtifact }
  | { type: "customer_card"; customer: CustomerSummaryArtifact }
  | { type: "customer_list"; customers: CustomerSummaryArtifact[] }
  | { type: "customer_order_history"; orders: OrderSummaryArtifact[]; customerId: string }
  | {
      type: "dashboard_summary";
      relatedOrders?: OrderSummaryArtifact[];
      summary: Record<string, number | string | null>;
      issues?: { level: "critical" | "degraded"; name: string; reason: string }[];
    }
  | { type: "activity_list"; items: ActivityItemArtifact[] }
  | { type: "allowed_transitions"; allowed: string[]; current: string }
  | { type: "disambiguation"; options: DisambiguationOption[]; message: string }
  | { type: "pending_action"; toolName: string; operationId: string; expiresAt: string; diff: ActionDiff }
  | { type: "receipt"; status: "succeeded" | "failed"; operationId: string; result: Record<string, unknown>; summary: string }
  | { type: "missing_info"; missingFields: string[]; message: string }
  | { type: "error"; message: string; code: string }
) &
  WithDisplayMessage;

export type ChatStatusPhase = "analyzing" | "consulting" | "preparing" | "waiting_for_confirmation" | "executing" | "done";

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string }
  | { id: string; role: "tool"; toolName: string; content: string; artifact: ChatArtifact }
  | { id: string; role: "system-error"; content: string };
