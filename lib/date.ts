export function isValidYearMonth(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getDaysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

export function getMonthRange(yearMonth: string): { start: string; end: string } {
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const days = getDaysInMonth(year, month);
  return {
    start: `${yearStr}-${monthStr}-01`,
    end: `${yearStr}-${monthStr}-${String(days).padStart(2, "0")}`,
  };
}

export function getPreviousMonth(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getNextMonth(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function formatMonthShort(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  const monthIndex = parseInt(monthStr, 10) - 1;
  return `${MONTH_NAMES_SHORT[monthIndex]} ${yearStr}`;
}

export function formatMonthFull(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  const monthIndex = parseInt(monthStr, 10) - 1;
  return `${MONTH_NAMES_FULL[monthIndex]} ${yearStr}`;
}

export interface MonthPeriod {
  month: string; // YYYY-MM
  label: string; // e.g. "May 2026"
  start: string; // YYYY-MM-01
  end: string;   // YYYY-MM-31
}

export function getLastNMonths(yearMonth: string, count: number = 6): MonthPeriod[] {
  const periods: MonthPeriod[] = [];
  let currentYM = yearMonth;
  for (let i = 0; i < count; i++) {
    const range = getMonthRange(currentYM);
    periods.unshift({
      month: currentYM,
      label: formatMonthShort(currentYM),
      start: range.start,
      end: range.end,
    });
    currentYM = getPreviousMonth(currentYM);
  }
  return periods;
}
