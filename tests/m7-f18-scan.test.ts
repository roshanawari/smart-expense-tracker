import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { POST as scanBill } from "@/app/api/bills/scan/route";
import { NextRequest } from "next/server";

describe("Milestone 7: Feature F18 (Receipt Bill Scan API)", () => {
  let user: any;
  let token: string;

  beforeEach(async () => {
    const existing = await db.user.findFirst({
      where: { email: "scanner_user@test.com" },
    });
    if (existing) {
      await db.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await hashPassword("password123");
    user = await db.user.create({
      data: { name: "Scanner User", email: "scanner_user@test.com", passwordHash },
    });
    token = await createSessionToken({ userId: user.id, email: user.email, name: user.name });
  });

  it("Rejects unauthenticated requests with 401", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/bills/scan", {
      method: "POST",
      body: formData,
    });
    const res = await scanBill(req);
    expect(res.status).toBe(401);
  });

  it("Rejects request when no file is uploaded with SCAN_FAILED", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/bills/scan", {
      method: "POST",
      headers: { cookie: `session_token=${token}` },
      body: formData,
    });
    const res = await scanBill(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("SCAN_FAILED");
    expect(data.error.message).toBe("Could not read this bill. Enter it manually.");
  });

  it("Rejects invalid file types (e.g. text/plain) with SCAN_FAILED", async () => {
    const blob = new Blob(["this is a plain text file, not an image"], {
      type: "text/plain",
    });
    const formData = new FormData();
    formData.append("bill", blob, "test.txt");

    const req = new NextRequest("http://localhost:3000/api/bills/scan", {
      method: "POST",
      headers: { cookie: `session_token=${token}` },
      body: formData,
    });
    const res = await scanBill(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("SCAN_FAILED");
    expect(data.error.message).toBe("Could not read this bill. Enter it manually.");
  });

  it("Rejects files larger than 5MB with FILE_TOO_LARGE", async () => {
    // 5.5 MB payload
    const largeBuffer = new Uint8Array(5.5 * 1024 * 1024);
    const blob = new Blob([largeBuffer], { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("bill", blob, "large.jpg");

    const req = new NextRequest("http://localhost:3000/api/bills/scan", {
      method: "POST",
      headers: { cookie: `session_token=${token}` },
      body: formData,
    });
    const res = await scanBill(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("FILE_TOO_LARGE");
  });

  it(
    "Non-bill image or failure returns { error: { code: 'SCAN_FAILED', message: 'Could not read this bill. Enter it manually.' } }",
    async () => {
    // 100 bytes dummy png image (non-bill)
    const dummyPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);
    const blob = new Blob([dummyPng], { type: "image/png" });
    const formData = new FormData();
    formData.append("bill", blob, "dot.png");

    const req = new NextRequest("http://localhost:3000/api/bills/scan", {
      method: "POST",
      headers: { cookie: `session_token=${token}` },
      body: formData,
    });
    const res = await scanBill(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("SCAN_FAILED");
    expect(data.error.message).toBe("Could not read this bill. Enter it manually.");
  }, 20000);
});
