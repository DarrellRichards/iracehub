/**
 * Money formatting and conversion utilities
 */

/**
 * Format a number as USD currency
 * @param cents - Amount in cents (e.g., 5000 = $50.00)
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "$50.00")
 */
export function formatCurrency(
  cents: number,
  options?: {
    showCents?: boolean;
    compact?: boolean;
  },
): string {
  const { showCents = true, compact = false } = options || {};

  const dollars = cents / 100;
  const absValue = Math.abs(dollars);

  // Compact format for large numbers
  if (compact && absValue >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (compact && absValue >= 1_000) {
    return `$${(dollars / 1_000).toFixed(1)}K`;
  }

  // Standard format
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/**
 * Convert dollars to cents
 * @param dollars - Amount in dollars
 * @returns Amount in cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Calculate percentage of an amount
 * @param amount - Base amount in cents
 * @param percent - Percentage (0-100)
 * @returns Calculated amount in cents
 */
export function calculatePercentage(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}

/**
 * Distribute money based on percentages
 * @param amount - Total amount in cents to distribute
 * @param splits - Array of { recipient: string, percent: number }
 * @returns Object with recipient: amount in cents
 */
export function distributeMoney(
  amount: number,
  splits: Array<{ recipient: string; percent: number }>,
): Record<string, number> {
  const result: Record<string, number> = {};
  let totalDistributed = 0;

  // Calculate each split
  for (const split of splits) {
    const distribution = calculatePercentage(amount, split.percent);
    result[split.recipient] = distribution;
    totalDistributed += distribution;
  }

  // Handle rounding issues by giving remainder to the first recipient
  if (totalDistributed < amount && splits.length > 0) {
    const remainder = amount - totalDistributed;
    result[splits[0].recipient] += remainder;
  }

  return result;
}

/**
 * Format money for display in UI (with symbol)
 * @param cents - Amount in cents
 * @returns Formatted string like "$50"
 */
export function displayMoney(cents: number): string {
  return formatCurrency(cents, { compact: false });
}

/**
 * Format money for compact display
 * @param cents - Amount in cents
 * @returns Formatted string like "$50K" or "$1.2M"
 */
export function displayMoneyCompact(cents: number): string {
  return formatCurrency(cents, { compact: true });
}

/**
 * Format money given in dollars (not cents)
 * @param dollars - Amount in dollars
 * @returns Formatted string like "$50.00"
 */
export function formatMoney(dollars: number): string {
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Generates even payout split across all finish positions
 * @param purse - Total purse in dollars
 * @param numPositions - Number of finishing positions
 * @returns Array of payouts for each position
 */
export function generateEvenSplit(
  purse: number,
  numPositions: number = 20,
): number[] {
  if (purse <= 0 || numPositions <= 0) return [];

  const perPosition = Math.floor(purse / numPositions);
  const remainder = purse % numPositions;

  return Array.from({ length: numPositions }, (_, i) =>
    i < remainder ? perPosition + 1 : perPosition,
  );
}

/**
 * Generates top-heavy payout split (more for winners)
 * @param purse - Total purse in dollars
 * @param numPositions - Number of finishing positions
 * @returns Array of payouts for each position
 */
export function generateTopHeavySplit(
  purse: number,
  numPositions: number = 20,
): number[] {
  if (purse <= 0 || numPositions <= 0) return [];

  if (numPositions <= 3) {
    const perPosition = Math.floor(purse / numPositions);
    const remainder = purse % numPositions;

    return Array.from(
      { length: numPositions },
      (_, index) => perPosition + (index === 0 ? remainder : 0),
    );
  }

  // Calculate tier sizes
  const topCount = 3;
  const middleCount = Math.min(7, numPositions - 3);
  const bottomCount = numPositions - topCount - middleCount;

  // Allocate purse proportionally
  let topAmount = Math.floor(purse * 0.6);
  let middleAmount = Math.floor(purse * 0.3);
  let bottomAmount = purse - topAmount - middleAmount;

  // If no bottom positions, redistribute that amount to middle
  if (bottomCount === 0) {
    middleAmount += bottomAmount;
    bottomAmount = 0;
  }

  const result: number[] = [];

  // Top tier: distribute topAmount across topCount positions
  const topPerPos = Math.floor(topAmount / topCount);
  const topRemainder = topAmount % topCount;
  for (let i = 0; i < topCount; i++) {
    result.push(topPerPos + (i < topRemainder ? 1 : 0));
  }

  // Middle tier: distribute middleAmount across middleCount positions
  if (middleCount > 0) {
    const middlePerPos = Math.floor(middleAmount / middleCount);
    const middleRemainder = middleAmount % middleCount;
    for (let i = 0; i < middleCount; i++) {
      result.push(middlePerPos + (i < middleRemainder ? 1 : 0));
    }
  }

  // Bottom tier: distribute bottomAmount across bottomCount positions
  if (bottomCount > 0) {
    const bottomPerPos = Math.floor(bottomAmount / bottomCount);
    const bottomRemainder = bottomAmount % bottomCount;
    for (let i = 0; i < bottomCount; i++) {
      result.push(bottomPerPos + (i < bottomRemainder ? 1 : 0));
    }
  }

  return result;
}

/**
 * Generates winner-heavy split (40% to 1st, rest split evenly)
 * @param purse - Total purse in dollars
 * @param numPositions - Number of finishing positions
 * @returns Array of payouts for each position
 */
export function generateWinnerHeavySplit(
  purse: number,
  numPositions: number = 20,
): number[] {
  if (purse <= 0 || numPositions <= 0) return [];

  const winnerAmount = Math.floor(purse * 0.4);
  const restAmount = purse - winnerAmount;
  const restPositions = numPositions - 1;
  const perRest = Math.floor(restAmount / restPositions);

  const result: number[] = [winnerAmount];

  for (let i = 0; i < restPositions; i++) {
    result.push(perRest + (i < restAmount % restPositions ? 1 : 0));
  }

  return result;
}

/**
 * Generates flat split for top positions only
 * @param purse - Total purse in dollars
 * @param numPositions - Number of finishing positions
 * @returns Array of payouts for each position
 */
export function generateFlatTopSplit(
  purse: number,
  numPositions: number = 20,
): number[] {
  if (purse <= 0 || numPositions <= 0) return [];

  const perPosition = Math.floor(purse / numPositions);
  const remainder = purse % numPositions;

  return Array.from({ length: numPositions }, (_, i) =>
    i < remainder ? perPosition + 1 : perPosition,
  );
}

/**
 * Calculate total of payout split array
 * @param split - Array of payout amounts
 * @returns Total
 */
export function calculateSplitTotal(split: number[]): number {
  return split.reduce((sum, val) => sum + Math.max(0, val), 0);
}
