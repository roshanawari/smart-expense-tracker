const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats minor units (paise) into INR currency string: e.g. 123450 -> "₹1,234.50"
 */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  return formatter.format(rupees);
}

/**
 * Converts rupees (major units) to paise (minor units integer).
 */
export function toPaise(rupees: number | string): number {
  const num = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  return Math.round(num * 100);
}

/**
 * Converts paise to rupees string with 2 decimals (for form inputs).
 */
export function toRupeesString(paise: number): string {
  return (paise / 100).toFixed(2);
}
export const toMajorString = toRupeesString;

/**
 * Validates and converts user input string (e.g. "120.50") into paise.
 * Rules: greater than 0, at most 2 decimals, below 1,000,000,000.
 */
export function parseMoneyInput(
  input: string
): { success: true; paise: number } | { success: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: false, error: "Amount is required" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      success: false,
      error: "Amount must be a positive number with at most 2 decimals",
    };
  }
  const val = parseFloat(trimmed);
  if (isNaN(val) || val <= 0) {
    return { success: false, error: "Amount must be greater than 0" };
  }
  if (val >= 1000000000) {
    return { success: false, error: "Amount must be below 1,000,000,000" };
  }
  return { success: true, paise: Math.round(val * 100) };
}
