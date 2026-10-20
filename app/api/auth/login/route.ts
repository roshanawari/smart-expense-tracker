import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validations/auth";
import { verifyPassword, createSessionToken, attachSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);

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

    const { email, password } = result.data;

    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Wrong email or password",
          },
        },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Wrong email or password",
          },
        },
        { status: 401 }
      );
    }

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
      { status: 200 }
    );

    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Login error:", error);
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
