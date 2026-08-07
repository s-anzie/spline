"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { emphasise } from "@/lib/emphasis";
import { humanise } from "@/lib/format";
import { toneOf, type Tone } from "@/lib/tone";
import { PAGE_SIZES, type Paged } from "@/lib/paging";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Tone → the classes that paint it. Kept in one place, used everywhere. */
export const TONE_TEXT: Record<Tone, string> = {
  signal: "text-signal",
  waiting: "text-waiting",
  live: "text-live",
  settled: "text-settled",
  quiet: "text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
  signal: "bg-signal",
  waiting: "bg-waiting",
  live: "bg-live",
  settled: "bg-settled",
  quiet: "bg-muted-foreground/50",
};

const TONE_WASH: Record<Tone, string> = {
  signal: "bg-[var(--signal-wash)]",
  waiting: "bg-[var(--waiting-wash)]",
  live: "bg-[var(--live-wash)]",
  settled: "bg-[var(--settled-wash)]",
  quiet: "bg-muted",
};

/* ── State ───────────────────────────────────────────────────────────────── */

/**
 * A status, as a word with its tone.
 *
 * Colour alone is not the signal — a reader who cannot separate red from
 * green still gets the word, and everybody gets the word faster than they
 * would decode a hue.
 */
export function Status({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const tone = toneOf(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide whitespace-nowrap uppercase",
        TONE_WASH[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          TONE_DOT[tone],
          tone === "live" && "breathing",
        )}
      />
      {humanise(value)}
    </span>
  );
}

/**
 * The severity stripe down the left of a row.
 *
 * Height carries the same information the colour does, so a queue can be
 * skimmed by shape alone — which is what happens when somebody glances at a
 * second monitor rather than reading it.
 */
export function Stripe({ tone, live = false }: { tone: Tone; live?: boolean }) {
  const fill: Record<Tone, string> = {
    signal: "h-full",
    waiting: "h-2/3",
    live: "h-2/3",
    settled: "h-1/3",
    quiet: "h-1/5",
  };
  return (
    <span
      aria-hidden
      className="bg-border flex w-[3px] shrink-0 items-end self-stretch overflow-hidden rounded-full"
    >
      <span
        className={cn(
          "w-full rounded-full",
          fill[tone],
          TONE_DOT[tone],
          live && "breathing",
        )}
      />
    </span>
  );
}

/* ── Readouts ────────────────────────────────────────────────────────────── */

/**
 * One number, large enough to read from across a desk.
 *
 * The tiles are what the screen opens with: an operator should be able to
 * tell whether the day is going well before reading a single row.
 */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "quiet",
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
}) {
  const inert = value === 0 || value === "0";
  return (
    <Card
      onClick={onClick}
      className={cn(
        "gap-0 rounded-lg border p-4 shadow-none transition-colors",
        onClick && "hover:border-foreground/20 cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label">{label}</span>
        {Icon ? (
          <Icon
            className={cn("size-3.5", inert ? "text-muted-foreground/60" : TONE_TEXT[tone])}
            strokeWidth={1.75}
          />
        ) : null}
      </div>
      <p
        className={cn(
          "measure mt-2.5 text-2xl leading-none font-medium",
          inert ? "text-muted-foreground" : TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-1.5 truncate text-xs">{hint}</p>
      ) : null}
    </Card>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
  );
}

/** A share of something finished, with the number kept beside it. */
export function Meter({ value }: { value: number }) {
  const share = Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center gap-2">
      <span className="bg-border h-1 w-20 shrink-0 overflow-hidden rounded-full">
        <span
          className={cn(
            "block h-full rounded-full",
            share >= 100 ? "bg-settled" : "bg-live",
          )}
          style={{ width: `${share}%` }}
        />
      </span>
      <span className="measure text-muted-foreground w-9 text-right text-xs">
        {share}%
      </span>
    </span>
  );
}

/**
 * An identifier. Monospace because it gets compared character by character,
 * copyable because the next thing anyone does with one is paste it.
 */
/**
 * An identifier somebody has to be able to take away with them.
 *
 * Three things here were wrong in a way that only shows up when you actually
 * need the value — which, for an organization id, is the one moment that
 * matters: configuring a machine to knock at your door.
 *
 * 1. The value was the label of a BUTTON, and button text cannot be selected
 *    with the mouse. If the clipboard refused, there was no way left to get
 *    the id out of the screen at all. It is now a `select-all` span: one
 *    click selects the whole thing, keyboard copy works, and the button is a
 *    convenience rather than the only route.
 * 2. The copy affordance was invisible until hover, so nothing said the value
 *    could be taken.
 * 3. Worst: it reported success unconditionally. `navigator.clipboard?.…`
 *    does nothing at all when the API is absent — which is exactly what
 *    happens when the console is reached over plain http from another
 *    machine — and `writeText` can reject on top of that. The tick appeared
 *    either way. It now only claims what happened, and when it cannot copy it
 *    selects the text and says to use the keyboard.
 */
export function Id({ value, full = false }: { value: string | null; full?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const shown = useRef<HTMLSpanElement>(null);

  if (!value) return <span className="measure text-muted-foreground text-xs">—</span>;

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      // Not `?.` — an absent clipboard has to throw so it lands below.
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      const selection = window.getSelection();
      if (shown.current && selection) {
        selection.removeAllRanges();
        selection.selectAllChildren(shown.current);
      }
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
      <span
        ref={shown}
        title={value}
        // `select-all`: one click takes the whole id, never half of it.
        className={cn(
          "measure min-w-0 truncate text-xs select-all",
          // Full form means somebody is about to transcribe it. Dense lists
          // keep the quiet tone; a value being copied gets read.
          full ? "text-foreground/90" : "text-muted-foreground",
        )}
      >
        {full ? value : value.slice(0, 8)}
      </span>
      <button
        type="button"
        onClick={(event) => void copy(event)}
        aria-label={state === "copied" ? "Copied" : "Copy this identifier"}
        className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded p-1 transition-colors"
      >
        {state === "copied" ? (
          <Check className="text-settled size-3" />
        ) : (
          <Copy className="size-3 opacity-60" />
        )}
      </button>
      {state === "failed" ? (
        <span className="text-muted-foreground text-[0.6875rem]">
          selected — copy with your keyboard
        </span>
      ) : null}
    </span>
  );
}

/* ── Frames ──────────────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-8">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {lead ? (
          <p className="text-muted-foreground mt-1.5 max-w-prose text-sm leading-relaxed">
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  count,
  children,
  actions,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <h2 className="label flex items-center gap-2">
          {title}
          {count === undefined ? null : (
            <span className="measure bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[0.625rem] normal-case">
              {count}
            </span>
          )}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Rows separated by hairlines, framed once — not a stack of floating cards. */
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "divide-border gap-0 divide-y overflow-hidden rounded-lg py-0 shadow-none",
        className,
      )}
    >
      {children}
    </Card>
  );
}

/**
 * One row of a panel.
 *
 * `href` makes the WHOLE row the link — not a title inside it — so the target
 * is the size of the row, and it still opens in a new tab on middle click
 * like anything else with an address.
 */
export function Row({
  children,
  href,
  onOpen,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  /** For a row that DOES something rather than going somewhere. */
  onOpen?: () => void;
  className?: string;
}) {
  const shared = cn("flex w-full items-center gap-3 px-4 py-3 text-left", className);
  const interactive = cn(shared, "hover:bg-accent/60 transition-colors");

  if (href) {
    return (
      <Link href={href} data-row="" className={interactive}>
        {children}
      </Link>
    );
  }
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} data-row="" className={interactive}>
        {children}
      </button>
    );
  }
  return <div className={shared}>{children}</div>;
}

export function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon?: LucideIcon;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="items-center gap-0 rounded-lg px-6 py-8 text-center shadow-none">
      {Icon ? (
        <span className="bg-muted text-muted-foreground mb-3 flex size-9 items-center justify-center rounded-full">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
      ) : null}
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm leading-relaxed">
        {children}
      </p>
    </Card>
  );
}

/**
 * A refusal from the hub, shown where the action was.
 *
 * The hub's errors name the affordance — what would have worked (§20.6) — so
 * this prints the hub's own words rather than replacing them with "something
 * went wrong", the sentence that teaches people to stop reading.
 */
/**
 * A long piece of writing somebody else produced — a task's brief, a goal's
 * reasoning — shown whole or shown short.
 *
 * Three things were wrong with how these arrived and each one hid the next.
 *
 * They were passed as a page `lead`, which carries `max-w-prose`: a reading
 * measure, right for the line or two a lead usually is, and wrong for eight
 * numbered points — so half the screen sat empty beside a tall narrow column.
 *
 * They lost their line breaks to HTML's whitespace collapsing, so a brief
 * written as a list reached the screen as one paragraph. `whitespace-pre-wrap`
 * gives those back — when there are any. A manager that wrote its brief as a
 * single run-on sentence has none to give back, and that is the common case.
 *
 * Which leaves length. Twelve lines of somebody else's instructions between
 * the title and everything a reader came to do is a wall, and it is on every
 * visit, for ever. So it folds — and the toggle appears only when there is
 * something folded, because a "show more" under three lines is a control that
 * teaches people it does nothing.
 */
export function Prose({ text, lines = 5 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);

  /**
   * Measured, never guessed from a character count: how much fits depends on
   * the width, the font and the line breaks, and a threshold in characters is
   * wrong on half the screens it meets. Only while clamped — once open, the
   * element grows to fit and would report that nothing overflows.
   */
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || open) {
      return;
    }
    setLong(element.scrollHeight > element.clientHeight + 1);
  }, [text, lines, open]);

  return (
    <div className="mb-6">
      <p
        ref={body}
        className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap"
        style={
          open
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
        }
      >
        {emphasise(text)}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1 text-xs transition-colors"
        >
          {open ? "Show less" : "Show all of it"}
          <ChevronDown
            className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}
    </div>
  );
}

export function Note({
  children,
  tone = "signal",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border-l-2 px-3 py-2 text-sm leading-relaxed",
        TONE_WASH[tone],
        tone === "signal" && "border-l-signal",
        tone === "waiting" && "border-l-waiting",
        tone === "live" && "border-l-live",
        tone === "settled" && "border-l-settled",
        tone === "quiet" && "border-l-border",
      )}
    >
      {children}
    </p>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <Panel>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-8 w-[3px] rounded-full" />
          <Skeleton className="h-3.5" style={{ width: `${46 - index * 7}%` }} />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
      ))}
    </Panel>
  );
}

/* ── Detail ──────────────────────────────────────────────────────────────── */

/** The facts about one thing, in a column an eye can run down. */
export function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-border divide-y">
      {items.map(([term, value]) => (
        <div key={term} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="label shrink-0">{term}</dt>
          {/* Wraps rather than truncates: the values here are the answer
              ("completed, running, failed"), not a label to scan past. */}
          <dd className="min-w-0 text-right text-sm break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Structured payloads, folded away until somebody wants them. */
export function Payload({ value, open = false }: { value: unknown; open?: boolean }) {
  if (!value || (typeof value === "object" && Object.keys(value).length === 0)) {
    return null;
  }
  return (
    <details className="group mt-2" open={open}>
      <summary className="label hover:text-foreground cursor-pointer list-none select-none">
        payload<span className="ml-1 inline-block group-open:rotate-90">›</span>
      </summary>
      <pre className="scroll-x measure bg-muted text-muted-foreground mt-2 rounded-md px-3 py-2 text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/* ── Controls ────────────────────────────────────────────────────────────── */

/**
 * A labelled input. The label is always present — placeholders are not labels.
 *
 * A password field can be shown. Masking protects against somebody reading
 * over a shoulder, which is a real risk but not a constant one; typing a long
 * secret with no way to check it is a constant one. Hidden by default, and
 * the toggle says which state it is in rather than only which way it goes.
 */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  className,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  className?: string;
  /**
   * One line under the box, for what a label cannot say.
   *
   * `Area` has had this since it was written; `Field` had not, so every form
   * needing a word of explanation grew a paragraph of its own beside the
   * input — the same thing, laid out differently each time.
   */
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  const secret = type === "password";

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="label">{label}</Label>
      <div className="relative">
        <Input
          type={secret && shown ? "text" : type}
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={secret ? "pr-9" : undefined}
        />
        {secret ? (
          <button
            type="button"
            onClick={() => setShown((open) => !open)}
            aria-label={shown ? "Hide the password" : "Show the password"}
            aria-pressed={shown}
            title={shown ? "Hide" : "Show"}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 rounded p-1.5 transition-colors"
          >
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}

/** One choice out of a few, all of them visible. Not a dropdown. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="bg-muted scroll-x inline-flex gap-0.5 rounded-lg p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className="measure text-muted-foreground text-[0.625rem]">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The back edge of a drill-down. Always present, always the same place. */
export function BackTo({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground -ml-1 mb-4 inline-flex items-center gap-1 text-xs transition-colors"
    >
      <ChevronLeft className="size-3.5" />
      {label}
    </Link>
  );
}

/* ── Paging ──────────────────────────────────────────────────────────────── */

/**
 * The footer of a long list: where you are, how many there are, how many to
 * show, and the way forward.
 *
 * `cap` is the limit the hub was asked for. When the list came back exactly
 * that long, the record almost certainly continues past it — and a pager that
 * said "125 of 125" would be quietly claiming otherwise. §17.8: never a bare
 * count, and never a silent truncation.
 */
export function Pager<T>({ paged, cap }: { paged: Paged<T>; cap?: number }) {
  const capped = cap !== undefined && paged.total >= cap;
  if (paged.total <= PAGE_SIZES[0] && !capped) return null;

  return (
    <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <span>
        <span className="measure text-foreground">
          {paged.from}–{paged.to}
        </span>{" "}
        of <span className="measure text-foreground">{paged.total}</span>
        {capped ? (
          <span className="text-waiting">
            {" "}
            · the hub returned its most recent {cap}; there is more behind this
          </span>
        ) : null}
      </span>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="label">per page</span>
          {/* `appearance-none` so the control belongs to this console rather
              than to whichever operating system it is being read on. */}
          <span className="relative">
            <select
              value={paged.size}
              onChange={(event) => paged.setSize(Number(event.target.value))}
              className="border-input bg-card hover:bg-accent measure text-foreground cursor-pointer appearance-none rounded-md border py-1 pr-6 pl-2 text-xs transition-colors"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2"
            />
          </span>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => paged.go(paged.page - 1)}
            disabled={paged.page <= 1}
            aria-label="Previous page"
            className="hover:bg-accent rounded-md p-1 transition-colors disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="measure text-foreground px-1">
            {paged.page}/{paged.pageCount}
          </span>
          <button
            type="button"
            onClick={() => paged.go(paged.page + 1)}
            disabled={paged.page >= paged.pageCount}
            aria-label="Next page"
            className="hover:bg-accent rounded-md p-1 transition-colors disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** A multi-line field. Same frame as `Field`, room for a paragraph. */
export function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="label">{label}</Label>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-card focus-visible:ring-ring/50 min-h-16 w-full rounded-md border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-[3px]"
      />
      {hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
    </div>
  );
}

/**
 * The list that says when something is finished.
 *
 * Deliberately a list rather than a paragraph: the hub requires at least one
 * criterion, an agent is told to satisfy them one by one, and a validator
 * checks them one by one. Prose would have to be re-read and re-interpreted
 * at each of those three steps.
 */
export function Criteria({
  label,
  hint,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const set = (index: number, text: string) =>
    onChange(values.map((value, at) => (at === index ? text : value)));

  return (
    <div className="grid gap-1.5">
      <Label className="label">{label}</Label>
      <div className="grid gap-1.5">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="measure text-muted-foreground w-5 shrink-0 text-xs">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Input
              value={value}
              placeholder={index === 0 ? placeholder : undefined}
              onChange={(event) => set(index, event.target.value)}
            />
            <button
              type="button"
              aria-label={`Remove criterion ${index + 1}`}
              disabled={values.length === 1}
              onClick={() => onChange(values.filter((_, at) => at !== index))}
              className="text-muted-foreground hover:text-foreground rounded p-1 disabled:pointer-events-none disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, ""])}
        className="text-muted-foreground hover:text-foreground mt-0.5 inline-flex w-fit items-center gap-1 text-xs transition-colors"
      >
        <Plus className="size-3.5" />
        Add a criterion
      </button>
      {hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
    </div>
  );
}

/**
 * One choice out of many, or out of a list that grows.
 *
 * `Segmented` is right for three or four fixed options with short names — the
 * whole vocabulary is visible and one click away. It is wrong the moment the
 * names get long or the list comes from data: six roles laid out in a row
 * wrap, truncate, and stop being readable, and a workspace with a dozen
 * members would be worse. Anything unbounded belongs behind a trigger.
 */
export function Picker<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  className,
}: {
  value: T | "";
  onChange: (value: T) => void;
  options: { value: T; label: string; hint?: string }[];
  placeholder?: string;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select value={value || undefined} onValueChange={(next) => onChange(next as T)}>
      {/* The trigger carries the NAME only. `SelectValue` would echo the whole
          item, hint included, making a two-line control that repeats what is
          already written under it. */}
      <SelectTrigger className={cn("w-full", className)}>
        <span className={selected ? undefined : "text-muted-foreground"}>
          {selected?.label ?? placeholder}
        </span>
      </SelectTrigger>
      {/**
       * `popper`, not the default `item-aligned`.
       *
       * item-aligned positions the list so the SELECTED item lands over the
       * trigger, which means measuring that item through `SelectValue`. This
       * trigger renders its own label instead — so that measurement finds
       * nothing and the list is dropped at the viewport edge, present in the
       * DOM, `aria-expanded` true, and invisible. Anchoring to the trigger
       * needs no such measurement.
       */}
      <SelectContent position="popper" sideOffset={4} className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex flex-col items-start gap-0.5">
              <span>{option.label}</span>
              {option.hint ? (
                <span className="text-muted-foreground text-xs leading-snug">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
