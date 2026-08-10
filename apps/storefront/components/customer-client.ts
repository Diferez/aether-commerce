"use client";

import { useClerk, useUser } from "@clerk/react";
import { useMemo } from "react";

export type CustomerSession = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function useCustomerSession(): { customer: CustomerSession | null; isLoaded: boolean } {
  const { user, isLoaded } = useUser();

  const userId = user?.id ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName?.trim() || email || "Account";
  const createdAt = user?.createdAt?.toISOString() ?? "";

  const customer = useMemo<CustomerSession | null>(() => {
    if (!isLoaded || !userId) return null;

    return {
      id: userId,
      name,
      email,
      createdAt: createdAt || new Date().toISOString()
    };
  }, [createdAt, email, isLoaded, name, userId]);

  return { customer, isLoaded };
}

export function useSignOutCustomer() {
  const { signOut } = useClerk();
  return signOut;
}
