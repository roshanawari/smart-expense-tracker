import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isValidYearMonth, getMonthRange, formatMonthFull } from "@/lib/date";
import { generateCsv, ExportTransaction } from "@/lib/csv";
import { generatePdf } from "@/lib/pdf";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format")?.toLowerCase();

    if (!format || (format !== "csv" && format !== "pdf")) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FORMAT",
            message: "Export format must be 'csv' or 'pdf'",
          },
        },
        { status: 400 }
      );
    }

    const month = searchParams.get("month");
    const type = searchParams.get("type");
    const categoryId = searchParams.get("categoryId");

    if (month && !isValidYearMonth(month)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_MONTH",
            message: "Invalid month format. Expected YYYY-MM.",
          },
        },
        { status: 400 }
      );
    }

    if (type && type !== "INCOME" && type !== "EXPENSE") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TYPE",
            message: "Type must be INCOME or EXPENSE",
          },
        },
        { status: 400 }
      );
    }

    // Build filter query
    const where: any = {
      userId: session.userId,
    };

    if (month) {
      const range = getMonthRange(month);
      where.date = {
        gte: range.start,
        lte: range.end,
      };
    }

    if (type) {
      where.type = type;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const transactions = await db.transaction.findMany({
      where,
      include: {
        category: {
          select: { name: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    const exportRows: ExportTransaction[] = transactions.map((tx) => ({
      date: tx.date,
      type: tx.type,
      categoryName: tx.category.name,
      description: tx.description,
      amountMinor: tx.amountMinor,
    }));

    let totalIncomeMinor = 0;
    let totalExpensesMinor = 0;

    for (const tx of transactions) {
      if (tx.type === "INCOME") {
        totalIncomeMinor += tx.amountMinor;
      } else {
        totalExpensesMinor += tx.amountMinor;
      }
    }

    const netBalanceMinor = totalIncomeMinor - totalExpensesMinor;
    const periodLabel = month ? formatMonthFull(month) : "All Time";
    const filename = `transactions-${month || "all"}.${format}`;

    if (format === "csv") {
      const csvData = generateCsv(exportRows);
      return new NextResponse(csvData, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } else {
      const pdfBuffer = await generatePdf({
        periodLabel,
        transactions: exportRows,
        totalIncomeMinor,
        totalExpensesMinor,
        netBalanceMinor,
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
  } catch (err) {
    console.error("GET /api/transactions/export error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to generate export file" } },
      { status: 500 }
    );
  }
}
