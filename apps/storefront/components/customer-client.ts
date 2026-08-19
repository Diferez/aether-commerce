"use client";

import { useAetherAuth } from "./ClerkAuthProvider";

export type CustomerSession = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function useCustomerSession(): { customer: CustomerSession | null; isLoaded: boolean } {
  const { customer, isLoaded } = useAetherAuth();
  return { customer, isLoaded };
}

export function useSignOutCustomer() {
  const { signOut } = useAetherAuth();
  return signOut;
}
