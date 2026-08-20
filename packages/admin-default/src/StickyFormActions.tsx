export function StickyFormActions({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
      {children}
    </div>
  );
}
