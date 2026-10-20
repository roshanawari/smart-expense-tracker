export interface ExportTransaction {
  date: string;
  type: "INCOME" | "EXPENSE" | string;
  categoryName: string;
  description: string | null;
  amountMinor: number;
}

/**
 * Escapes a CSV cell according to RFC 4180 and spreadsheet formula safety.
 * - Prefixes cells starting with '=', '+', '-', or '@' with a single quote.
 * - Quotes fields containing commas, double quotes, or newlines.
 * - Escapes double quotes with double-quotes ("").
 */
export function escapeCsvCell(cell: string): string {
  let safeCell = cell;

  // Formula injection prevention
  if (/^[=+\-@]/.test(safeCell)) {
    safeCell = `'${safeCell}`;
  }

  // Quote if contains commas, quotes, or line breaks
  if (/[",\r\n]/.test(safeCell)) {
    return `"${safeCell.replace(/"/g, '""')}"`;
  }

  return safeCell;
}

/**
 * Generates CSV content from transactions list.
 * Headers: date,type,category,description,amount
 * Amount in major units with 2 decimal places.
 */
export function generateCsv(transactions: ExportTransaction[]): string {
  const headers = ["date", "type", "category", "description", "amount"];
  const lines = [headers.join(",")];

  for (const tx of transactions) {
    const amountMajor = (tx.amountMinor / 100).toFixed(2);
    const row = [
      escapeCsvCell(tx.date),
      escapeCsvCell(tx.type),
      escapeCsvCell(tx.categoryName),
      escapeCsvCell(tx.description || ""),
      escapeCsvCell(amountMajor),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}
