import { Fragment } from "react";

// The model's own prose (never tool-authored text, which is plain strings
// we wrote ourselves) comes back with light markdown - **bold**, *italic*,
// `code`. Rendered as real React nodes via a small regex split, never
// dangerouslySetInnerHTML and never a markdown library that could turn
// arbitrary model output into arbitrary HTML/links.
const TOKEN_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(TOKEN_PATTERN).filter((part) => part.length > 0);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          return (
            <code key={index} className="rounded bg-surface px-1 py-0.5 text-[0.85em] [overflow-wrap:anywhere]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 1) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
