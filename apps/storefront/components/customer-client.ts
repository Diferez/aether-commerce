"use client";

import { useClerk, useUser } from "@clerk/react";

export type CustomerSession = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function useCustomerSession(): { customer: CustomerSession | null; isLoaded: boolean } {
  const { user, isLoaded } = useUser();

  if (!isLoaded || !user) {
    return { customer: null, isLoaded };
  }

  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const name = user.fullName?.trim() || email || "Account";

  return {
    customer: {
      id: user.id,
      name,
      email,
      createdAt: (user.createdAt ?? new Date()).toISOString()
    },
    isLoaded: true
  };
}

export function useSignOutCustomer() {
  const { signOut } = useClerk();
  return signOut;
}
