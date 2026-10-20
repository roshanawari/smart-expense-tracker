import { describe, it, expect, beforeEach } from "vitest";
import { POST as registerHandler } from "@/app/api/auth/register/route";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { db } from "@/lib/db";
import { verifyPassword, verifySessionToken, COOKIE_NAME } from "@/lib/auth";

describe("F1 - Sign up, login, logout", () => {
  const testEmail = "testuser@example.com";

  beforeEach(async () => {
    // Clean up test user if exists
    await db.user.deleteMany({
      where: { email: { in: [testEmail, "uppercase@example.com"] } },
    });
  });

  it("registers a new user, hashes password, saves lowercase email, and sets session", async () => {
    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "  TestUser@Example.COM  ",
        password: "securePassword123",
      }),
    });

    const res = await registerHandler(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.user).toBeDefined();
    expect(json.user.name).toBe("Test User");
    expect(json.user.email).toBe(testEmail);
    expect(json.user.passwordHash).toBeUndefined();

    // Check database directly
    const userInDb = await db.user.findUnique({
      where: { email: testEmail },
    });
    expect(userInDb).not.toBeNull();
    expect(userInDb?.email).toBe(testEmail);
    expect(userInDb?.passwordHash).not.toBe("securePassword123");
    const isPasswordHashed = await verifyPassword("securePassword123", userInDb!.passwordHash);
    expect(isPasswordHashed).toBe(true);

    // Check session cookie
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("session_token=");
    expect(setCookie).toContain("HttpOnly");

    // Extract token and verify JWT payload
    const tokenMatch = setCookie?.match(/session_token=([^;]+)/);
    expect(tokenMatch).not.toBeNull();
    const payload = await verifySessionToken(tokenMatch![1]);
    expect(payload?.userId).toBe(userInDb?.id);
    expect(payload?.email).toBe(testEmail);
  });

  it("rejects duplicate email with 409 'Email already in use'", async () => {
    // First registration
    await registerHandler(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "User One",
          email: testEmail,
          password: "password123",
        }),
      })
    );

    // Duplicate registration (different case)
    const duplicateRes = await registerHandler(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "User Two",
          email: "TESTUSER@example.com",
          password: "password123",
        }),
      })
    );

    expect(duplicateRes.status).toBe(409);
    const json = await duplicateRes.json();
    expect(json.error.message).toBe("Email already in use");
  });

  it("validates input: rejects password < 8 chars and empty name", async () => {
    const shortPasswordRes = await registerHandler(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Valid Name",
          email: "valid@example.com",
          password: "short",
        }),
      })
    );
    expect(shortPasswordRes.status).toBe(400);

    const emptyNameRes = await registerHandler(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "   ",
          email: "valid@example.com",
          password: "password123",
        }),
      })
    );
    expect(emptyNameRes.status).toBe(400);
  });

  it("logs in existing user with correct credentials and returns session", async () => {
    await registerHandler(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Login User",
          email: testEmail,
          password: "correctPassword123",
        }),
      })
    );

    const loginRes = await loginHandler(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: "correctPassword123",
        }),
      })
    );

    expect(loginRes.status).toBe(200);
    const json = await loginRes.json();
    expect(json.user.email).toBe(testEmail);
    const setCookie = loginRes.headers.get("set-cookie");
    expect(setCookie).toContain("session_token=");

    // Verify /api/auth/me with that cookie
    const tokenMatch = setCookie?.match(/session_token=([^;]+)/);
    const meRes = await meHandler(
      new Request("http://localhost:3000/api/auth/me", {
        headers: { cookie: `session_token=${tokenMatch![1]}` },
      })
    );
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.user.email).toBe(testEmail);
  });

  it("returns 401 'Wrong email or password' for incorrect password", async () => {
    await registerHandler(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Login User",
          email: testEmail,
          password: "correctPassword123",
        }),
      })
    );

    const wrongPassRes = await loginHandler(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: "wrongPassword999",
        }),
      })
    );

    expect(wrongPassRes.status).toBe(401);
    const json = await wrongPassRes.json();
    expect(json.error.message).toBe("Wrong email or password");
  });

  it("returns 401 'Wrong email or password' for unknown email", async () => {
    const unknownRes = await loginHandler(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "unknown@example.com",
          password: "anyPassword123",
        }),
      })
    );

    expect(unknownRes.status).toBe(401);
    const json = await unknownRes.json();
    expect(json.error.message).toBe("Wrong email or password");
  });

  it("logs out user with 204 status and clears session cookie", async () => {
    const logoutRes = await logoutHandler();
    expect(logoutRes.status).toBe(204);
    const setCookie = logoutRes.headers.get("set-cookie");
    expect(setCookie).toContain("session_token=;");
  });
});
