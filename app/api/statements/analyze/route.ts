import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const statementTransactionSchema = z.object({
  date: z.string().optional().default(""),
  description: z.string().min(1).default("Transaction"),
  type: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
  amount: z.number().positive(),
  categorySuggestion: z.string().optional().default("Other"),
});

const statementResponseSchema = z.object({
  bankName: z.string().optional().default("Bank Statement"),
  statementPeriod: z.string().optional().default(""),
  summary: z
    .object({
      totalIncome: z.number().optional().default(0),
      totalExpense: z.number().optional().default(0),
      netSavings: z.number().optional().default(0),
      transactionCount: z.number().optional().default(0),
    })
    .optional()
    .default({
      totalIncome: 0,
      totalExpense: 0,
      netSavings: 0,
      transactionCount: 0,
    }),
  transactions: z.array(statementTransactionSchema).default([]),
});

/** Extract first JSON block from text */
function extractJson(text: string): any | null {
  try {
    return JSON.parse(text.trim());
  } catch {}

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
    const file = (formData.get("statement") ||
      formData.get("file") ||
      formData.get("document")) as File | null;

    if (!file) {
      return NextResponse.json(
        {
          error: {
            code: "STATEMENT_FAILED",
            message: "No statement file uploaded. Please upload a PDF, CSV, or Image.",
          },
        },
        { status: 400 }
      );
    }

    // Size limit: 10 MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: "Statement file exceeds 10 MB limit.",
          },
        },
        { status: 400 }
      );
    }

    const allowedMimeTypes = [
      "application/pdf",
      "text/csv",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    const isCsvOrText =
      file.type === "text/csv" ||
      file.type === "text/plain" ||
      file.name.endsWith(".csv");

    if (!allowedMimeTypes.includes(file.type) && !isCsvOrText) {
      return NextResponse.json(
        {
          error: {
            code: "STATEMENT_FAILED",
            message: "Unsupported file type. Please upload a PDF, CSV, or image of your bank statement.",
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
            code: "STATEMENT_FAILED",
            message: "Bank statement analysis is not configured. Missing GEMINI_API_KEY in .env.",
          },
        },
        { status: 400 }
      );
    }

    // Fetch existing categories to guide Gemini suggestions
    const dbCategories = await db.category.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    const expenseCatNames = dbCategories
      .filter((c) => c.type === "EXPENSE")
      .map((c) => c.name);
    const incomeCatNames = dbCategories
      .filter((c) => c.type === "INCOME")
      .map((c) => c.name);

    const prompt = `You are a financial analyst specializing in monthly bank statements.
Carefully parse all transactions and statement metrics from the provided document.
Available Expense Categories: ${expenseCatNames.join(", ")}
Available Income Categories: ${incomeCatNames.join(", ")}

Respond with ONLY a raw JSON object (no markdown fences, no explanation) in this exact schema:
{
  "bankName": "Bank Name or 'Bank Statement'",
  "statementPeriod": "e.g. October 2026 or date range",
  "summary": {
    "totalIncome": 12500.00,
    "totalExpense": 8450.00,
    "netSavings": 4050.00,
    "transactionCount": 15
  },
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Short clean description of merchant, recipient, or deposit",
      "type": "EXPENSE" or "INCOME",
      "amount": 250.00,
      "categorySuggestion": "One of the available categories best matching the transaction"
    }
  ]
}

Rules:
1. "type" MUST be "INCOME" for credits/deposits and "EXPENSE" for debits/withdrawals/fees.
2. "amount" MUST be a positive number (no currency signs or negative symbols).
3. "date" MUST be in YYYY-MM-DD format (if only DD/MM or MM/DD is given, infer year from statement period or use 2026).
4. "description" should be concise and human readable (e.g. "Swiggy", "Salary", "Netflix", "ATM Withdrawal", "Rent").
5. Map "categorySuggestion" strictly to the closest available category for that type.
6. Return ALL detected transactions.
7. Return ONLY the JSON object.`;

    const ai = new GoogleGenAI({ apiKey });

    // Models in resilience order
    const candidateModels = [
      "gemini-3.5-flash",
      "gemini-3.7-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ];

    let contentsParts: any[] = [];

    if (isCsvOrText) {
      const textContent = await file.text();
      contentsParts = [
        {
          text: `${prompt}\n\nStatement Content:\n${textContent.slice(0, 100000)}`,
        },
      ];
    } else {
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = file.type || "application/pdf";
      contentsParts = [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        { text: prompt },
      ];
    }

    let rawResponseText: string | null = null;
    let lastErrorMsg = "";

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: contentsParts,
            },
          ],
        });

        const text = response?.text?.trim();
        if (text && text.length > 0) {
          rawResponseText = text;
          break;
        }
      } catch (err: any) {
        lastErrorMsg = String(err?.message ?? "");
        const status = err?.status;
        if (
          status === 401 ||
          status === 403 ||
          lastErrorMsg.includes("API_KEY") ||
          lastErrorMsg.includes("PERMISSION_DENIED")
        ) {
          return NextResponse.json(
            {
              error: {
                code: "STATEMENT_FAILED",
                message: "Bank statement analysis is not configured. Check your GEMINI_API_KEY in .env.",
              },
            },
            { status: 400 }
          );
        }
        continue;
      }
    }

    if (!rawResponseText) {
      return NextResponse.json(
        {
          error: {
            code: "STATEMENT_FAILED",
            message: lastErrorMsg.includes("503")
              ? "AI service is currently busy. Please try again in a moment."
              : "Could not read this statement. Please check the file or format.",
          },
        },
        { status: 400 }
      );
    }

    // Clean code fences if present
    const cleaned = rawResponseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsedJson = extractJson(cleaned);
    if (!parsedJson) {
      return NextResponse.json(
        {
          error: {
            code: "STATEMENT_FAILED",
            message: "Could not parse statement transactions. Please try another statement format.",
          },
        },
        { status: 400 }
      );
    }

    const validated = statementResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: {
            code: "STATEMENT_FAILED",
            message: "Failed to validate statement transaction data structure.",
          },
        },
        { status: 400 }
      );
    }

    const data = validated.data;

    // Helper map of categories by name and type (lowercased for fuzzy matching)
    const categoryLookup = new Map<string, { id: string; name: string; type: string }>();
    dbCategories.forEach((c) => {
      categoryLookup.set(`${c.type}:${c.name.toLowerCase()}`, c);
    });

    const fallbackExpense = dbCategories.find(
      (c) => c.type === "EXPENSE" && c.name.toLowerCase() === "other"
    ) || dbCategories.find((c) => c.type === "EXPENSE") || { id: "", name: "Other", type: "EXPENSE" };

    const fallbackIncome = dbCategories.find(
      (c) => c.type === "INCOME" && c.name.toLowerCase().includes("other")
    ) || dbCategories.find((c) => c.type === "INCOME") || { id: "", name: "Other income", type: "INCOME" };

    const todayStr = new Date().toISOString().slice(0, 10);

    const enrichedTransactions = data.transactions.map((t, idx) => {
      // Validate date YYYY-MM-DD
      let validDate = todayStr;
      if (t.date && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t.date)) {
        validDate = t.date;
      }

      const amountMinor = Math.round(t.amount * 100);

      // Match category
      const matched =
        categoryLookup.get(`${t.type}:${t.categorySuggestion?.toLowerCase()}`) ||
        (t.type === "INCOME" ? fallbackIncome : fallbackExpense);

      return {
        tempId: `tx-${Date.now()}-${idx}`,
        date: validDate,
        description: t.description.trim() || "Transaction",
        type: t.type,
        amount: (amountMinor / 100).toFixed(2),
        amountMinor,
        categoryId: matched.id,
        categoryName: matched.name,
      };
    });

    // Compute or verify summary totals
    let computedIncomeMinor = 0;
    let computedExpenseMinor = 0;

    enrichedTransactions.forEach((t) => {
      if (t.type === "INCOME") {
        computedIncomeMinor += t.amountMinor;
      } else {
        computedExpenseMinor += t.amountMinor;
      }
    });

    const summary = {
      totalIncomeMinor: computedIncomeMinor,
      totalIncome: (computedIncomeMinor / 100).toFixed(2),
      totalExpenseMinor: computedExpenseMinor,
      totalExpense: (computedExpenseMinor / 100).toFixed(2),
      netSavingsMinor: computedIncomeMinor - computedExpenseMinor,
      netSavings: ((computedIncomeMinor - computedExpenseMinor) / 100).toFixed(2),
      transactionCount: enrichedTransactions.length,
    };

    return NextResponse.json({
      bankName: data.bankName || "Monthly Bank Statement",
      statementPeriod: data.statementPeriod || "",
      summary,
      transactions: enrichedTransactions,
      categories: dbCategories,
    });
  } catch (error: any) {
    console.error("POST /api/statements/analyze error:", error);
    return NextResponse.json(
      {
        error: {
          code: "STATEMENT_FAILED",
          message: error?.message || "Failed to analyze bank statement.",
        },
      },
      { status: 500 }
    );
  }
}
