import * as jose from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const COOKIE_NAME = "session_token";
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecretKey(): Uint8Array {
  const secret =
    process.env.SESSION_SECRET ||
    "default-dev-secret-key-at-least-32-chars-long";
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  const secret = getSecretKey();
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.userId === "string" &&
      typeof payload.email === "string" &&
      typeof payload.name === "string"
    ) {
      return {
        userId: payload.userId,
        email: payload.email,
        name: payload.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function attachSessionCookie(
  response: NextResponse,
  token: string
): NextResponse {
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: token,
  });
  return response;
}

export function removeSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return response;
}

export function getTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getSessionUser(
  request?: Request
): Promise<SessionPayload | null> {
  if (request) {
    const token = getTokenFromRequest(request);
    if (token) {
      return verifySessionToken(token);
    }
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}
