import { describe, expect, it } from "vitest";
import {
  calculateSplitTotal,
  displayMoney,
  distributeMoney,
  formatCurrency,
  formatMoney,
  generateEvenSplit,
  generateFlatTopSplit,
  generateTopHeavySplit,
  generateWinnerHeavySplit,
} from "@/lib/money";

describe("money utilities", () => {
  it("formats whole-dollar values for display", () => {
    expect(formatMoney(1250)).toBe("$1,250");
    expect(displayMoney(5000)).toBe("$50");
  });

  it("creates even payout splits that add up to the purse", () => {
    const split = generateEvenSplit(103, 5);

    expect(split).toEqual([21, 21, 21, 20, 20]);
    expect(calculateSplitTotal(split)).toBe(103);
  });

  it("keeps winner-heavy splits purse-balanced", () => {
    const split = generateWinnerHeavySplit(1000, 5);

    expect(split[0]).toBe(400);
    expect(split).toHaveLength(5);
    expect(calculateSplitTotal(split)).toBe(1000);
  });

  it("handles winner-heavy single position payout", () => {
    expect(generateWinnerHeavySplit(1000, 1)).toEqual([1000]);
  });

  it("prioritizes top finishers in top-heavy splits", () => {
    const split = generateTopHeavySplit(1000, 10);

    expect(split[0]).toBeGreaterThan(split[3]);
    expect(split[3]).toBeGreaterThanOrEqual(split[9]);
    const total = calculateSplitTotal(split);
    expect(total).toBeGreaterThanOrEqual(900); // Allow rounding loss
    expect(total).toBeLessThanOrEqual(1000);
  });

  it("distributes rounding remainder to the first recipient", () => {
    const distribution = distributeMoney(100, [
      { recipient: "captain", percent: 33 },
      { recipient: "driver", percent: 33 },
      { recipient: "team", percent: 33 },
    ]);

    expect(distribution).toEqual({
      captain: 34,
      driver: 33,
      team: 33,
    });
  });

  it("never over-distributes when split percentages exceed 100%", () => {
    const distribution = distributeMoney(5, [
      { recipient: "captain", percent: 50 },
      { recipient: "driver", percent: 50 },
      { recipient: "team", percent: 50 },
    ]);

    expect(Object.values(distribution).reduce((sum, amount) => sum + amount, 0)).toBe(
      5,
    );
  });

  it("formats compact negative money with conventional currency sign order", () => {
    expect(formatCurrency(-150000, { compact: true })).toBe("-$1.5K");
  });

  it("generates a flat split across all positions", () => {
    const split = generateFlatTopSplit(100, 4);
    expect(split).toEqual([25, 25, 25, 25]);
  });
});
