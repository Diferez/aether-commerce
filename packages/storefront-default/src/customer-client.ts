"use client";

import { useAetherAuth } from "./AetherAuthProvider";
import type { AuthCustomer } from "./AetherAuthProvider";

export type CustomerSession = AuthCustomer;

export function useCustomerSession(): { customer: CustomerSession | null; isLoaded: boolean } {
  const { customer, isLoaded } = useAetherAuth();
  return { customer, isLoaded };
}

export function useSignOutCustomer() {
  const { signOut } = useAetherAuth();
  return signOut;
}
