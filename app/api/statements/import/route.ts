import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const importTransactionSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Date must be YYYY-MM-DD"),
  description: z.string().min(1).default("Transaction"),
  type: z.enum(["INCOME", "EXPENSE"]),
  amountMinor: z.number().int().positive(),
  categoryId: z.string().min(1),
});

const importPayloadSchema = z.object({
  transactions: z
    .array(importTransactionSchema)
    .min(1, "Please select at least one transaction to add"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = importPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: parsed.error.issues[0]?.message || "Invalid transaction data",
          },
        },
        { status: 400 }
      );
    }

    const { transactions } = parsed.data;

    // Fetch existing categories to validate existence and type
    const categoryIds = [...new Set(transactions.map((t) => t.categoryId))];
    const categories = await db.category.findMany({
      where: { id: { in: categoryIds } },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    // Validate that every transaction's category matches its type
    for (const t of transactions) {
      const cat = categoryMap.get(t.categoryId);
      if (!cat) {
        return NextResponse.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: `Category with ID '${t.categoryId}' not found`,
            },
          },
          { status: 400 }
        );
      }
      if (cat.type !== t.type) {
        return NextResponse.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: `Category '${cat.name}' (${cat.type}) does not match transaction type (${t.type})`,
            },
          },
          { status: 400 }
        );
      }
    }

    // Persist all transactions atomically
    const created = await db.$transaction(
      transactions.map((t) =>
        db.transaction.create({
          data: {
            userId: session.userId,
            categoryId: t.categoryId,
            type: t.type,
            amountMinor: t.amountMinor,
            date: t.date,
            description: t.description.trim() || null,
          },
          include: {
            category: {
              select: { id: true, name: true, type: true },
            },
          },
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        count: created.length,
        message: `Successfully added ${created.length} transaction${
          created.length === 1 ? "" : "s"
        }`,
        transactions: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/statements/import error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message || "Failed to add transactions",
        },
      },
      { status: 500 }
    );
  }
}
