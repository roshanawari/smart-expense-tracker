import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: [
        { type: "asc" },
        { name: "asc" },
      ],
    });
    return NextResponse.json({ categories }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch categories",
        },
      },
      { status: 500 }
    );
  }
}
