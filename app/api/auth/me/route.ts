import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        },
      },
      { status: 401 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      monthlyBudgetMinor: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "User session expired or user not found",
        },
      },
      { status: 401 }
    );
  }

  return NextResponse.json({ user }, { status: 200 });
}
