"use client";

import { useEffect, useRef } from "react";
import { Sheet } from "@aether/ui";
import { Sparkles } from "lucide-react";
import { navGroups } from "./nav-items";

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (open) firstLinkRef.current?.focus();
  }, [open]);

  let firstLink = true;

  return (
    <Sheet open={open} onClose={onClose} side="left" title="Navigation">
      <div className="flex items-center gap-2.5 border-b border-border pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white">
          <Sparkles size={16} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Aether</p>
          <p className="text-xs text-ink-subtle">Admin console</p>
        </div>
      </div>
      <nav aria-label="Admin" className="mt-4">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={groupIndex > 0 ? "mt-4" : undefined}>
            {group.label ? <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{group.label}</p> : null}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const isFirst = firstLink;
                firstLink = false;
                return (
                  <li key={item.href}>
                    <a
                      ref={isFirst ? firstLinkRef : undefined}
                      href={item.href}
                      onClick={onClose}
                      className="focus-ring flex min-h-11 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-ink hover:bg-surface-hover"
                    >
                      <item.icon size={18} aria-hidden />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </Sheet>
  );
}
