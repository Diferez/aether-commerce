"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const themeStorageKey = "aether.admin.theme.v1";

function applyTheme(theme: "light" | "dark") {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  window.localStorage.setItem(themeStorageKey, theme);
}

export function ThemeToggle({
  className,
  label
}: {
  className?: string;
  /** When provided, renders as a full-width labeled row (sidebar footer) instead of an icon-only square button. */
  label?: { light: string; dark: string };
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  if (label) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={theme === "dark"}
        className={
          className ??
          "focus-ring flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-ink hover:bg-surface-hover"
        }
      >
        {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        {theme === "dark" ? label.light : label.dark}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={theme === "dark"}
      className={
        className ??
        "focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-ink-muted hover:bg-surface-hover hover:text-ink"
      }
    >
      {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
