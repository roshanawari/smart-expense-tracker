import PDFDocument from "pdfkit";
import { formatMoney } from "@/lib/money";
import { ExportTransaction } from "@/lib/csv";

export interface PdfReportOptions {
  periodLabel: string;
  transactions: ExportTransaction[];
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netBalanceMinor: number;
}

/**
 * Generates a PDF buffer using PDFKit built-in Helvetica.
 * Contains title, period, summary totals, and transaction rows.
 */
export async function generatePdf(options: PdfReportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: "A4",
        info: {
          Title: "Smart Expense Tracker - Report",
          Author: "Smart Expense Tracker",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // Title
      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .fillColor("#0F766E")
        .text("Smart Expense Tracker", { align: "left" });

      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#334155")
        .text("Transactions & Summary Report", { align: "left" });

      doc.moveDown(0.5);

      // Period
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#64748B")
        .text(`Period: `, { continued: true })
        .font("Helvetica")
        .fillColor("#0F172A")
        .text(options.periodLabel);

      doc.moveDown(0.8);

      // Totals Box
      const startY = doc.y;
      doc
        .rect(40, startY, 515, 55)
        .fillAndStroke("#F8FAFC", "#E2E8F0");

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#64748B")
        .text("TOTAL INCOME", 55, startY + 10)
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#16A34A")
        .text(formatMoney(options.totalIncomeMinor), 55, startY + 25);

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#64748B")
        .text("TOTAL EXPENSES", 230, startY + 10)
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#DC2626")
        .text(formatMoney(options.totalExpensesMinor), 230, startY + 25);

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#64748B")
        .text("NET BALANCE", 400, startY + 10)
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor(options.netBalanceMinor >= 0 ? "#0F172A" : "#DC2626")
        .text(formatMoney(options.netBalanceMinor), 400, startY + 25);

      doc.y = startY + 75;

      // Transactions Table Header
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0F172A");

      const tableTop = doc.y;
      doc
        .rect(40, tableTop - 4, 515, 20)
        .fill("#F1F5F9");

      doc
        .fillColor("#475569")
        .fontSize(9)
        .text("Date", 45, tableTop)
        .text("Type", 115, tableTop)
        .text("Category", 175, tableTop)
        .text("Description", 260, tableTop)
        .text("Amount", 460, tableTop, { width: 90, align: "right" });

      doc.y = tableTop + 20;

      // Table Rows
      if (options.transactions.length === 0) {
        doc.moveDown(1);
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor("#64748B")
          .text("No transactions recorded for this period.", 45, doc.y, { align: "center" });
      } else {
        doc.font("Helvetica").fontSize(9);

        for (const tx of options.transactions) {
          // Check for page break
          if (doc.y > 750) {
            doc.addPage();
            doc.y = 40;
          }

          const rowY = doc.y;
          const isIncome = tx.type === "INCOME";

          doc
            .fillColor("#334155")
            .text(tx.date, 45, rowY)
            .fillColor(isIncome ? "#16A34A" : "#DC2626")
            .text(tx.type, 115, rowY)
            .fillColor("#334155")
            .text(tx.categoryName, 175, rowY)
            .fillColor("#64748B")
            .text(tx.description || "-", 260, rowY, { width: 190, lineBreak: false, ellipsis: true })
            .fillColor(isIncome ? "#16A34A" : "#0F172A")
            .font(isIncome ? "Helvetica-Bold" : "Helvetica")
            .text(formatMoney(tx.amountMinor), 460, rowY, { width: 90, align: "right" })
            .font("Helvetica");

          doc.moveDown(0.7);
          doc
            .strokeColor("#F1F5F9")
            .lineWidth(0.5)
            .moveTo(40, doc.y)
            .lineTo(555, doc.y)
            .stroke();
          doc.moveDown(0.3);
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
