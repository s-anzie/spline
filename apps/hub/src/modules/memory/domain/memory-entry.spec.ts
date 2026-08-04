import { ActorRef } from "../../identity/domain/actor";
import { MemoryEntry } from "./memory-entry";

const now = new Date("2026-08-04T10:00:00Z");
const later = new Date("2026-08-04T11:00:00Z");
const author = ActorRef.create("HUMAN", "u-1").value;

function note(overrides: Record<string, unknown> = {}) {
  return MemoryEntry.remember({
    workspaceId: "w-1",
    scopeType: "WORKSPACE",
    scopeId: "w-1",
    type: "convention",
    title: "Branch naming",
    content: "feature/<ticket>-<slug>",
    tags: ["git", "convention"],
    author,
    now,
    ...overrides,
  });
}

describe("MemoryEntry", () => {
  it("remembers a note nobody else holds", () => {
    const result = note();

    expect(result.isSuccess).toBe(true);
    const entry = result.value;
    expect(entry.title).toBe("Branch naming");
    expect(entry.content).toBe("feature/<ticket>-<slug>");
    expect(entry.tags).toEqual(["git", "convention"]);
    expect(entry.author.actorId).toBe("u-1");
    expect(entry.isReference).toBe(false);
  });

  it("points at a domain object instead of describing it", () => {
    const result = note({
      content: undefined,
      sourceType: "decision",
      sourceId: "d-1",
      title: "Chose Postgres over SQLite",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.value.isReference).toBe(true);
    expect(result.value.sourceId).toBe("d-1");
    expect(result.value.content).toBeNull();
  });

  /**
   * §16's opening line: memory is never the source of truth. An entry
   * carrying BOTH a reference and its own copy of the content is exactly the
   * duplication that makes two versions of one decision — and the second one
   * ages silently.
   */
  it("refuses to be both a reference and a copy of what it references", () => {
    const both = note({ sourceType: "decision", sourceId: "d-1" });

    expect(both.isFailure).toBe(true);
    expect(both.error.name).toBe("MemoryEntryShapeError");
  });

  it("refuses an entry that says nothing at all", () => {
    const empty = note({ content: undefined });

    expect(empty.isFailure).toBe(true);
    expect(empty.error.name).toBe("MemoryEntryShapeError");
  });

  it("refuses a half-declared reference", () => {
    expect(note({ content: undefined, sourceType: "decision" }).isFailure).toBe(true);
    expect(note({ content: undefined, sourceId: "d-1" }).isFailure).toBe(true);
  });

  it("refuses an entry with no workspace, no scope or no title", () => {
    expect(note({ workspaceId: " " }).isFailure).toBe(true);
    expect(note({ scopeId: "" }).isFailure).toBe(true);
    expect(note({ title: "  " }).isFailure).toBe(true);
    expect(note({ type: "" }).isFailure).toBe(true);
  });

  /**
   * §16.1 "versionnée" — corrected by supersession, never overwritten. What
   * one believed yesterday is often the useful part.
   */
  it("is corrected by a successor, and the original stays readable", () => {
    const original = note().value;
    const corrected = note({ content: "feat/<slug>", now: later }).value;

    expect(original.supersedeBy(corrected.id.value, later).isSuccess).toBe(true);
    expect(original.supersededById).toBe(corrected.id.value);
    expect(original.isCurrent).toBe(false);
    expect(original.content).toBe("feature/<ticket>-<slug>");
  });

  it("cannot be superseded twice, nor by itself", () => {
    const entry = note().value;
    entry.supersedeBy("m-2", later);

    expect(entry.supersedeBy("m-3", later).isFailure).toBe(true);
    expect(entry.supersededById).toBe("m-2");

    const other = note().value;
    expect(other.supersedeBy(other.id.value, later).isFailure).toBe(true);
  });

  /** Forgetting a note must be safe — that is the point of §16.1. */
  it("is forgotten outright, because nothing depends on it", () => {
    const entry = note().value;

    expect(entry.forget(later).isSuccess).toBe(true);
    expect(entry.isForgotten).toBe(true);
    expect(entry.isCurrent).toBe(false);
  });

  it("raises facts the journal can read, carrying the workspace", () => {
    const entry = note().value;

    expect(entry.domainEvents[0]?.eventName).toBe("memory.remembered");
    expect(entry.domainEvents[0]?.workspaceId).toBe("w-1");
  });
});
