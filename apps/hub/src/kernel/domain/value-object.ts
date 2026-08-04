/**
 * Structural-equality building block: two value objects are the same iff
 * they are the same concrete type and every prop matches (Dates compared
 * by value). Props are frozen — a value object never mutates; behaviour
 * returns a new instance.
 */
export abstract class ValueObject<Props extends Record<string, unknown>> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<Props> | null): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.constructor !== this.constructor) {
      return false;
    }
    const keysA = Object.keys(this.props);
    const keysB = Object.keys(other.props);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every((key) => propsEqual(this.props[key], other.props[key]));
  }
}

function propsEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return Object.is(a, b);
}
