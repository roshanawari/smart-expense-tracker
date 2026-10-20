import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validations/auth";
import { hashPassword, createSessionToken, attachSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: firstIssue?.message || "Invalid input",
          },
        },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Email already in use",
          },
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await db.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );

    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        },
      },
      { status: 500 }
    );
  }
}
