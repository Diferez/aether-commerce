"use client";

import { Menu, Search, Sparkles } from "lucide-react";

export function AdminTopBar({
  onOpenMobileNav,
  onOpenCommandMenu
}: {
  onOpenMobileNav: () => void;
  onOpenCommandMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[var(--header-h)] items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm lg:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu size={20} aria-hidden />
      </button>
      <span className="flex items-center gap-2 lg:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
          <Sparkles size={14} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-ink">Aether Admin</span>
      </span>

      <button
        type="button"
        onClick={onOpenCommandMenu}
        aria-label="Search or jump to..."
        className="focus-ring ml-auto flex min-h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-bg px-3 text-sm text-ink-subtle hover:border-border-strong hover:text-ink-muted"
      >
        <Search size={15} aria-hidden />
        <span className="hidden sm:inline">Search or jump to...</span>
        <span className="ml-auto hidden items-center gap-0.5 rounded border border-border-strong px-1.5 py-0.5 text-[11px] font-medium sm:flex">
          <span aria-hidden>Ctrl</span>
          <span aria-hidden>K</span>
        </span>
      </button>
    </header>
  );
}
