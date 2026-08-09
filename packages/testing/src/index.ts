export function demoRequestId() {
  return "test-request-id";
}

export function mockStripeEvent(id = "evt_test") {
  return { id, type: "checkout.session.completed" };
}
