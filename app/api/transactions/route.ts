import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createTransactionSchema } from "@/lib/validations/transaction";

export async function GET(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM
    const type = searchParams.get("type"); // INCOME or EXPENSE
    const categoryId = searchParams.get("categoryId");

    const where: {
      userId: string;
      date?: { startsWith: string };
      type?: "INCOME" | "EXPENSE";
      categoryId?: string;
    } = {
      userId: session.userId,
    };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      where.date = { startsWith: month };
    }

    if (type === "INCOME" || type === "EXPENSE") {
      where.type = type;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const transactions = await db.transaction.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: [
        { date: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ transactions }, { status: 200 });
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch transactions" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const result = createTransactionSchema.safeParse(body);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: firstIssue?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { type, amountMinor, date, categoryId, description } = result.data;

    // Verify category exists and matches transaction type
    const category = await db.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Category does not exist" } },
        { status: 400 }
      );
    }

    if (category.type !== type) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: `Category type '${category.type}' does not match transaction type '${type}'`,
          },
        },
        { status: 400 }
      );
    }

    const transaction = await db.transaction.create({
      data: {
        userId: session.userId,
        categoryId,
        type,
        amountMinor,
        date,
        description: description?.trim() || null,
      },
      include: {
        category: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create transaction" } },
      { status: 500 }
    );
  }
}
