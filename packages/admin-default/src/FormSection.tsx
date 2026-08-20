export function FormSection({
  title,
  description,
  children
}: Readonly<{
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}
