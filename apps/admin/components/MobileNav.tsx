"use client";

import { useEffect, useRef } from "react";
import { useAuth, UserButton, useUser } from "@clerk/react";
import { Sheet } from "@aether/ui";
import { ExternalLink, Sparkles } from "lucide-react";
import { navGroups } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";
import { storefrontUrl } from "./config";

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const role = (user?.publicMetadata as { roles?: string[] } | undefined)?.roles?.[0];

  useEffect(() => {
    if (open) firstLinkRef.current?.focus();
  }, [open]);

  let firstLink = true;

  return (
    <Sheet open={open} onClose={onClose} side="left" title="Navigation">
      <div className="flex min-h-full flex-col">
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

        {/* Was missing entirely on first ship: the sidebar's account/sign-out
            footer only rendered in AdminSidebar, which is hidden below lg -
            on mobile there was no way to see who's signed in or sign out. */}
        <div className="mt-auto grid gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <a
              href={storefrontUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
              aria-label="Open storefront in a new tab"
            >
              <ExternalLink size={16} aria-hidden />
            </a>
          </div>
          <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-ink [&_.cl-userButtonTrigger]:h-9 [&_.cl-userButtonTrigger]:w-9">
              {isSignedIn ? <UserButton /> : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account"}</p>
              {role ? <p className="truncate text-xs capitalize text-ink-subtle">{role.replaceAll("_", " ")}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
