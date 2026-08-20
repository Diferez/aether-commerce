"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useAdminChatStream } from "./useAdminChatStream";

type AdminChatContextValue = ReturnType<typeof useAdminChatStream> & {
  open: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
};

const AdminChatContext = createContext<AdminChatContextValue | null>(null);

// Mounted once in AdminShell, above the Sheet the panel renders inside of -
// this is what makes "minimize without losing the conversation" work: the
// conversation state lives here, not inside the Sheet's children, so it
// survives the panel being closed/hidden. It does NOT survive a full page
// navigation on its own (static export = full page loads, no client
// router) - useAdminChatStream persists the conversationId to
// sessionStorage and rehydrates from the server on next open for that.
export function AdminChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const stream = useAdminChatStream();

  const openPanel = useCallback(() => {
    setOpen(true);
    void stream.hydrate();
  }, [stream]);
  const closePanel = useCallback(() => setOpen(false), []);
  const togglePanel = useCallback(() => {
    setOpen((current) => {
      if (!current) void stream.hydrate();
      return !current;
    });
  }, [stream]);

  return (
    <AdminChatContext.Provider value={{ ...stream, open, openPanel, closePanel, togglePanel }}>{children}</AdminChatContext.Provider>
  );
}

export function useAdminChat(): AdminChatContextValue {
  const value = useContext(AdminChatContext);
  if (!value) throw new Error("useAdminChat must be used within AdminChatProvider");
  return value;
}
