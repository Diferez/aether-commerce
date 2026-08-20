"use client";

import { useEffect, useRef } from "react";
import { useAuth, UserButton, useUser } from "@clerk/react";
import { Sheet } from "@aether/ui";
import { ExternalLink, Sparkles } from "lucide-react";
import { getNavGroups } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { useAdminConfig } from "./AetherAdminProvider";
import { useBrand } from "./useBrand";
import { useAdminLanguage } from "./AdminLanguageProvider";

// Clerk's <UserButton/> only renders the avatar as the real clickable
// trigger (.cl-userButtonTrigger) - the name/role text next to it is our
// own markup, not part of the button, so clicking it did nothing. Forward
// clicks (or Enter/Space, for the keyboard-accessible row below) anywhere
// in the row to the real trigger, unless the click already landed on it
// (which would otherwise open then immediately close the menu).
function openUserMenuUnlessAlreadyOnTrigger(event: React.SyntheticEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (target.closest(".cl-userButtonTrigger")) return;
  event.currentTarget.querySelector<HTMLButtonElement>(".cl-userButtonTrigger")?.click();
}

export function MobileNav({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const brand = useBrand();
  const { storefrontUrl } = useAdminConfig();
  const { t } = useAdminLanguage();
  const navGroups = getNavGroups(t);
  const role = (user?.publicMetadata as { roles?: string[] } | undefined)?.roles?.[0];

  useEffect(() => {
    if (open) firstLinkRef.current?.focus();
  }, [open]);

  let firstLink = true;

  return (
    <Sheet open={open} onClose={onClose} side="left" title={t.sidebar.navigation}>
      <div className="flex min-h-full flex-col">
        <div className="flex items-center gap-2.5 border-b border-border pb-4">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} className="h-8 w-8 shrink-0 rounded-md object-contain" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white">
              <Sparkles size={16} aria-hidden />
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-ink">{t.sidebar.brand}</p>
            <p className="text-xs text-ink-subtle">{t.sidebar.adminConsole}</p>
          </div>
        </div>
        <nav aria-label={t.nav.navLabel} className="mt-4">
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
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LanguageToggle />
            </div>
            {storefrontUrl ? (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
                aria-label={t.sidebar.openStorefront}
              >
                <ExternalLink size={16} aria-hidden />
              </a>
            ) : null}
          </div>
          <div
            role={isSignedIn ? "button" : undefined}
            tabIndex={isSignedIn ? 0 : undefined}
            className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 ${isSignedIn ? "cursor-pointer hover:bg-surface-hover" : ""}`}
            onClick={openUserMenuUnlessAlreadyOnTrigger}
            onKeyDown={(event) => {
              if (isSignedIn && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                openUserMenuUnlessAlreadyOnTrigger(event);
              }
            }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-ink [&_.cl-userButtonTrigger]:h-9 [&_.cl-userButtonTrigger]:w-9">
              {isSignedIn ? <UserButton /> : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? t.common.account}</p>
              {role ? <p className="truncate text-xs capitalize text-ink-subtle">{role.replaceAll("_", " ")}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
