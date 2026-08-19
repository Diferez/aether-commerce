import { Fragment } from "react";

// The model's own prose (never tool-authored text, which is plain strings
// we wrote ourselves) comes back with light markdown - **bold**, *italic*,
// `code`. Rendered as real React nodes via a small regex split, never
// dangerouslySetInnerHTML and never a markdown library that could turn
// arbitrary model output into arbitrary HTML/links.
//
// [text](url) is matched too, but never turned into a real <a href> - a
// model-authored href is not something this chat should ever navigate the
// operator to unvetted. Instead it degrades to just the link text, so a
// model that occasionally reaches for markdown-link or pseudo-command
// syntax anyway (observed live: `[Abrir pedido](command:default_api:...)`)
// shows readable text instead of literal, broken-looking bracket syntax.
// The system prompt separately tells the model not to do this - every
// order/product/customer row already renders as a real clickable link in
// the card above the model's own text - but this is the fallback for when
// it does anyway.
const TOKEN_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]*\))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\([^)]*\)$/;

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
        const linkMatch = LINK_PATTERN.exec(part);
        if (linkMatch) {
          return <Fragment key={index}>{linkMatch[1]}</Fragment>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 1) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
