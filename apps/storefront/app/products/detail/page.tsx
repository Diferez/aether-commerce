"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storefrontPath } from "../../../components/config";

export default function LegacyProductDetailRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("slug");
    router.replace(storefrontPath(slug ? `/products/${encodeURIComponent(slug)}` : "/products"));
  }, [router]);

  return (
    <main className="aether-shell py-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton mt-4 h-20 rounded" />
      </section>
    </main>
  );
}
