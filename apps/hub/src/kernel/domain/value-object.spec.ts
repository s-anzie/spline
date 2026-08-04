import { ValueObject } from "./value-object";

interface MoneyProps extends Record<string, unknown> {
  amount: number;
  currency: string;
}

class Money extends ValueObject<MoneyProps> {
  constructor(props: MoneyProps) {
    super(props);
  }

  get amount(): number {
    return this.props.amount;
  }
}

interface WindowProps extends Record<string, unknown> {
  until: Date;
}

class QuotaWindow extends ValueObject<WindowProps> {
  constructor(props: WindowProps) {
    super(props);
  }
}

class OtherType extends ValueObject<MoneyProps> {
  constructor(props: MoneyProps) {
    super(props);
  }
}

describe("ValueObject", () => {
  it("equality is structural, not identity-based", () => {
    const a = new Money({ amount: 10, currency: "EUR" });
    const b = new Money({ amount: 10, currency: "EUR" });

    expect(a.equals(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("differs when any prop differs", () => {
    const a = new Money({ amount: 10, currency: "EUR" });

    expect(a.equals(new Money({ amount: 11, currency: "EUR" }))).toBe(false);
    expect(a.equals(new Money({ amount: 10, currency: "USD" }))).toBe(false);
  });

  it("two different concrete types are never equal, even with identical props", () => {
    const money = new Money({ amount: 10, currency: "EUR" });
    const other = new OtherType({ amount: 10, currency: "EUR" });

    expect(money.equals(other)).toBe(false);
  });

  it("compares Date props by value, not reference", () => {
    const a = new QuotaWindow({ until: new Date("2026-08-04T10:00:00Z") });
    const b = new QuotaWindow({ until: new Date("2026-08-04T10:00:00Z") });
    const c = new QuotaWindow({ until: new Date("2026-08-04T11:00:00Z") });

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("handles null and undefined", () => {
    const a = new Money({ amount: 10, currency: "EUR" });

    expect(a.equals(null)).toBe(false);
    expect(a.equals(undefined)).toBe(false);
  });

  it("props are frozen — mutation attempts throw", () => {
    const a = new Money({ amount: 10, currency: "EUR" });

    expect(() => {
      (a as unknown as { props: MoneyProps }).props.amount = 99;
    }).toThrow();
  });
});
