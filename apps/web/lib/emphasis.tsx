import { Fragment } from "react";

/**
 * The one piece of markup worth honouring in text an agent wrote: `**bold**`.
 *
 * Task and goal descriptions come from a manager, and a manager writes the
 * way it writes — headings marked with asterisks, then a numbered list. The
 * asterisks reached the screen as asterisks, so a brief that was structured
 * when it was written looked like it had been typed by somebody who did not
 * know how to format.
 *
 * Deliberately NOT a markdown renderer. This text is attacker-influenced —
 * §18.12: an agent may have copied it out of a poisoned file — and a renderer
 * that produces HTML from it is an injection surface for one formatting
 * nicety. Splitting on a delimiter and returning React elements cannot
 * produce markup at all: every fragment stays text, and React escapes it.
 *
 * Everything else (links, images, code fences) stays literal on purpose. A
 * half-rendered document is more confusing than a plainly unrendered one, and
 * each thing added here is a decision to make separately.
 */
export function emphasise(text: string): React.ReactNode {
  const parts = text.split("**");
  // An odd number of delimiters means one is unclosed: leave the whole thing
  // alone rather than guess where the author meant it to end.
  if (parts.length < 3 || parts.length % 2 === 0) {
    return text;
  }
  return parts.map((part, at) =>
    at % 2 === 1 ? (
      <strong key={at} className="text-foreground font-medium">
        {part}
      </strong>
    ) : (
      <Fragment key={at}>{part}</Fragment>
    ),
  );
}
