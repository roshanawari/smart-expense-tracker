import { NextResponse } from "next/server";
import { removeSessionCookie } from "@/lib/auth";

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  removeSessionCookie(response);
  return response;
}
