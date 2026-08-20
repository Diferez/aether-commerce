"use client";

import Link from "next/link";
import type { AriaRole, MouseEventHandler, ReactNode } from "react";
import { useStorefrontPath } from "./AetherStorefrontProvider";

type StorefrontLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  role?: AriaRole;
  target?: string;
  rel?: string;
  "aria-label"?: string;
};

export function StorefrontLink({ href, children, className, onClick, role, target, rel, "aria-label": ariaLabel }: StorefrontLinkProps) {
  const storefrontPath = useStorefrontPath();
  const linkProps = {
    ...(className ? { className } : {}),
    ...(onClick ? { onClick } : {}),
    ...(role ? { role } : {}),
    ...(target ? { target } : {}),
    ...(rel ? { rel } : {}),
    ...(ariaLabel ? { "aria-label": ariaLabel } : {})
  };

  return (
    <Link href={storefrontPath(href)} {...linkProps}>
      {children}
    </Link>
  );
}
