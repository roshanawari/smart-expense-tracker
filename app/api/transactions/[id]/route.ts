import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { updateTransactionSchema } from "@/lib/validations/transaction";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const transaction = await db.transaction.findFirst({
      where: {
        id,
        userId: session.userId,
      },
      include: {
        category: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Transaction not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ transaction }, { status: 200 });
  } catch (error) {
    console.error("GET /api/transactions/:id error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch transaction" } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await db.transaction.findFirst({
      where: {
        id,
        userId: session.userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Transaction not found" } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const result = updateTransactionSchema.safeParse(body);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: firstIssue?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const targetType = result.data.type ?? existing.type;
    const targetCategoryId = result.data.categoryId ?? existing.categoryId;

    // Check category match if either type or category is updated
    if (result.data.type || result.data.categoryId) {
      const category = await db.category.findUnique({
        where: { id: targetCategoryId },
      });
      if (!category) {
        return NextResponse.json(
          { error: { code: "BAD_REQUEST", message: "Category does not exist" } },
          { status: 400 }
        );
      }
      if (category.type !== targetType) {
        return NextResponse.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: `Category type '${category.type}' does not match transaction type '${targetType}'`,
            },
          },
          { status: 400 }
        );
      }
    }

    const updated = await db.transaction.update({
      where: { id },
      data: {
        ...(result.data.type && { type: result.data.type }),
        ...(result.data.amountMinor !== undefined && { amountMinor: result.data.amountMinor }),
        ...(result.data.date && { date: result.data.date }),
        ...(result.data.categoryId && { categoryId: result.data.categoryId }),
        ...(result.data.description !== undefined && {
          description: result.data.description?.trim() || null,
        }),
      },
      include: {
        category: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    return NextResponse.json({ transaction: updated }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/transactions/:id error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update transaction" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await db.transaction.findFirst({
      where: {
        id,
        userId: session.userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Transaction not found" } },
        { status: 404 }
      );
    }

    await db.transaction.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/transactions/:id error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to delete transaction" } },
      { status: 500 }
    );
  }
}
