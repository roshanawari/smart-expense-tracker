import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const receiptSchema = z.object({
  merchant: z.string().min(1).default("Receipt"),
  date: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  total: z.number().positive(),
  items: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number(),
      })
    )
    .optional()
    .default([]),
});

/** Extract the first JSON object from a string that may have surrounding text */
function extractJson(text: string): any | null {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Find first {...} block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = (formData.get("bill") ||
      formData.get("image") ||
      formData.get("file")) as File | null;

    if (!file) {
      return NextResponse.json(
        {
          error: {
            code: "SCAN_FAILED",
            message: "Could not read this bill. Enter it manually.",
          },
        },
        { status: 400 }
      );
    }

    // Server-side size validation: max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "Bill image exceeds 5 MB limit. Enter it manually.",
          },
        },
        { status: 400 }
      );
    }

    // Server-side MIME type check: JPG, PNG, WEBP
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: {
            code: "SCAN_FAILED",
            message: "Could not read this bill. Enter it manually.",
          },
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: {
            code: "SCAN_FAILED",
            message: "Bill scan is not configured. Check your GEMINI_API_KEY in .env.",
          },
        },
        { status: 400 }
      );
    }

    // Ephemeral in-memory buffer only (never stored on disk)
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a receipt parser. Look at this image.
If it is a bill or receipt, respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "merchant": "store or restaurant name",
  "date": "YYYY-MM-DD or null",
  "currency": "INR or null",
  "total": 649.00,
  "items": [
    { "name": "item name", "amount": 260.00 }
  ]
}
Rules:
- total must be the final payable amount as a plain number
- amounts are plain numbers (no currency symbols)
- date in YYYY-MM-DD format or null if not found
- if not a receipt, return { "merchant": "Unknown", "total": 0, "items": [] }
Respond with ONLY the JSON, nothing else.`;

    // Try fast modern models in order
    const candidateModels = [
      "gemini-3.5-flash",
      "gemini-3.7-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ];
    let rawResponseText: string | null = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: file.type,
                    data: base64Data,
                  },
                },
                { text: prompt },
              ],
            },
          ],
        });

        const text = response?.text?.trim();
        if (text && text.length > 0) {
          rawResponseText = text;
          break;
        }
      } catch (err: any) {
        // If auth error, fail fast — never log the key
        const msg = String(err?.message ?? "");
        if (
          err?.status === 401 ||
          err?.status === 403 ||
          msg.includes("API_KEY") ||
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("API key not valid")
        ) {
          return NextResponse.json(
            {
              error: {
                code: "SCAN_FAILED",
                message: "Bill scan is not configured. Check your GEMINI_API_KEY in .env.",
              },
            },
            { status: 400 }
          );
        }
        // Other errors: try next model
        continue;
      }
    }

    if (!rawResponseText) {
      return NextResponse.json(
        {
          error: {
            code: "SCAN_FAILED",
            message: "Could not read this bill. Enter it manually.",
          },
        },
        { status: 400 }
      );
    }

    // Strip markdown code fences if present
    const cleaned = rawResponseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsedJson = extractJson(cleaned);
    if (!parsedJson) {
      return NextResponse.json(
        {
          error: {
            code: "SCAN_FAILED",
            message: "Could not read this bill. Enter it manually.",
          },
        },
        { status: 400 }
      );
    }

    const validated = receiptSchema.safeParse(parsedJson);
    if (!validated.success || !validated.data.total || validated.data.total <= 0) {
      return NextResponse.json(
        {
          error: {
            code: "SCAN_FAILED",
            message: "Could not read this bill. Enter it manually.",
          },
        },
        { status: 400 }
      );
    }

    const { merchant, date, total, items } = validated.data;
    // Server converts total to paise (integer, never float)
    const totalMinor = Math.round(total * 100);

    // Validate date format: YYYY-MM-DD
    let formattedDate: string | null = null;
    if (date && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
      formattedDate = date;
    }

    return NextResponse.json({
      merchant: merchant.trim(),
      date: formattedDate,
      totalMinor,
      total: (totalMinor / 100).toFixed(2),
      items: items || [],
    });
  } catch {
    // Never log key or image data
    return NextResponse.json(
      {
        error: {
          code: "SCAN_FAILED",
          message: "Could not read this bill. Enter it manually.",
        },
      },
      { status: 400 }
    );
  }
}
