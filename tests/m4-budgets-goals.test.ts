import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getBudgets } from "@/app/api/budgets/route";
import { PUT as updateOverallBudget } from "@/app/api/budgets/overall/route";
import {
  PUT as setCategoryBudget,
  DELETE as deleteCategoryBudget,
} from "@/app/api/budgets/[categoryId]/route";
import { GET as getGoals, POST as createGoal } from "@/app/api/goals/route";
import {
  PATCH as patchGoal,
  DELETE as deleteGoal,
} from "@/app/api/goals/[id]/route";
import { POST as addSavings } from "@/app/api/goals/[id]/savings/route";
import { NextRequest } from "next/server";

describe("Milestone 4: Budgets & Goals (Features F8 & F9)", () => {
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;
  let foodCategory: any;
  let salaryCategory: any;

  beforeEach(async () => {
    // Clean up test data for isolated test users
    const existingUsers = await db.user.findMany({
      where: { email: { in: ["m4_usera@example.com", "m4_userb@example.com"] } },
    });
    const userIds = existingUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await db.transaction.deleteMany({ where: { userId: { in: userIds } } });
      await db.budget.deleteMany({ where: { userId: { in: userIds } } });
      await db.savingsGoal.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }

    const passwordHash = await hashPassword("password123");
    const userA = await db.user.create({
      data: {
        name: "User A",
        email: "m4_usera@example.com",
        passwordHash,
      },
    });
    const userB = await db.user.create({
      data: {
        name: "User B",
        email: "m4_userb@example.com",
        passwordHash,
      },
    });

    userAId = userA.id;
    userBId = userB.id;
    userAToken = await createSessionToken({
      userId: userA.id,
      email: userA.email,
      name: userA.name,
    });
    userBToken = await createSessionToken({
      userId: userB.id,
      email: userB.email,
      name: userB.name,
    });

    foodCategory = await db.category.findUniqueOrThrow({
      where: { name_type: { name: "Food", type: "EXPENSE" } },
    });
    salaryCategory = await db.category.findUniqueOrThrow({
      where: { name_type: { name: "Salary", type: "INCOME" } },
    });
  });

  describe("Feature F8: Budget Management", () => {
    it("sets, updates, and clears overall monthly budget", async () => {
      // 1. Set overall budget to ₹20,000.00 (2,000,000 paise)
      const setReq = new NextRequest("http://localhost:3000/api/budgets/overall", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${userAToken}`,
        },
        body: JSON.stringify({ amount: "20000" }),
      });
      const setRes = await updateOverallBudget(setReq);
      expect(setRes.status).toBe(200);

      // Verify in DB
      let user = await db.user.findUniqueOrThrow({ where: { id: userAId } });
      expect(user.monthlyBudgetMinor).toBe(2000000);

      // 2. Clear overall budget
      const clearReq = new NextRequest("http://localhost:3000/api/budgets/overall", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${userAToken}`,
        },
        body: JSON.stringify({ amountMinor: null }),
      });
      const clearRes = await updateOverallBudget(clearReq);
      expect(clearRes.status).toBe(200);

      user = await db.user.findUniqueOrThrow({ where: { id: userAId } });
      expect(user.monthlyBudgetMinor).toBeNull();
    });

    it("manages category budgets and flags Over budget when spending exceeds limit", async () => {
      // 1. Add expense transaction in Food: ₹5,000.00 (500,000 minor)
      await db.transaction.create({
        data: {
          userId: userAId,
          categoryId: foodCategory.id,
          type: "EXPENSE",
          amountMinor: 500000,
          date: "2026-10-10",
        },
      });

      // 2. Set Food budget below spending: ₹3,000.00 (300,000 minor)
      const setBudgetReq = new NextRequest(
        `http://localhost:3000/api/budgets/${foodCategory.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${userAToken}`,
          },
          body: JSON.stringify({ amount: "3000" }),
        }
      );
      const setBudgetRes = await setCategoryBudget(setBudgetReq, {
        params: Promise.resolve({ categoryId: foodCategory.id }),
      });
      expect(setBudgetRes.status).toBe(200);

      // 3. GET /api/budgets and verify "Over budget" status
      const getReq = new NextRequest("http://localhost:3000/api/budgets?month=2026-10", {
        headers: { cookie: `session_token=${userAToken}` },
      });
      const getRes = await getBudgets(getReq);
      expect(getRes.status).toBe(200);
      const data = await getRes.json();

      const foodStat = data.categories.find((c: any) => c.categoryId === foodCategory.id);
      expect(foodStat).toBeDefined();
      expect(foodStat.budgetMinor).toBe(300000);
      expect(foodStat.spentMinor).toBe(500000);
      expect(foodStat.isOver).toBe(true);
      expect(foodStat.remainingMinor).toBe(-200000);

      // 4. Update budget to ₹10,000.00 (1,000,000 minor) -> now OK
      const updateBudgetReq = new NextRequest(
        `http://localhost:3000/api/budgets/${foodCategory.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${userAToken}`,
          },
          body: JSON.stringify({ amount: "10000" }),
        }
      );
      await setCategoryBudget(updateBudgetReq, {
        params: Promise.resolve({ categoryId: foodCategory.id }),
      });

      const getUpdatedRes = await getBudgets(getReq);
      const updatedData = await getUpdatedRes.json();
      const updatedFoodStat = updatedData.categories.find(
        (c: any) => c.categoryId === foodCategory.id
      );
      expect(updatedFoodStat.isOver).toBe(false);
      expect(updatedFoodStat.remainingMinor).toBe(500000);

      // 5. Clear category budget
      const deleteReq = new NextRequest(
        `http://localhost:3000/api/budgets/${foodCategory.id}`,
        {
          method: "DELETE",
          headers: { cookie: `session_token=${userAToken}` },
        }
      );
      const delRes = await deleteCategoryBudget(deleteReq, {
        params: Promise.resolve({ categoryId: foodCategory.id }),
      });
      expect(delRes.status).toBe(204);

      const dbBudget = await db.budget.findUnique({
        where: {
          userId_categoryId: {
            userId: userAId,
            categoryId: foodCategory.id,
          },
        },
      });
      expect(dbBudget).toBeNull();
    });

    it("rejects budget for income category", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/budgets/${salaryCategory.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${userAToken}`,
          },
          body: JSON.stringify({ amount: "5000" }),
        }
      );
      const res = await setCategoryBudget(req, {
        params: Promise.resolve({ categoryId: salaryCategory.id }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_CATEGORY_TYPE");
    });
  });

  describe("Feature F9: Savings Goal Tracker", () => {
    it("creates a goal showing 0%, contributions update percentage, full amount reaches goal", async () => {
      // 1. Create a goal: "Emergency Fund", Target: ₹10,000.00 (1,000,000 minor)
      const createReq = new NextRequest("http://localhost:3000/api/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${userAToken}`,
        },
        body: JSON.stringify({
          name: "Emergency Fund",
          target: "10000",
          targetDate: "2026-12-31",
        }),
      });
      const createRes = await createGoal(createReq);
      expect(createRes.status).toBe(201);
      const createdJson = await createRes.json();
      const goalId = createdJson.goal.id;

      // F9 Done When: "Creating a goal shows 0%"
      expect(createdJson.goal.percentage).toBe(0);
      expect(createdJson.goal.isReached).toBe(false);
      expect(createdJson.goal.savedMinor).toBe(0);
      expect(createdJson.goal.targetMinor).toBe(1000000);

      // 2. Add half of the target: ₹5,000.00 (500,000 minor)
      const halfSavingsReq = new NextRequest(
        `http://localhost:3000/api/goals/${goalId}/savings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${userAToken}`,
          },
          body: JSON.stringify({ amount: "5000" }),
        }
      );
      const halfRes = await addSavings(halfSavingsReq, {
        params: Promise.resolve({ id: goalId }),
      });
      expect(halfRes.status).toBe(200);
      const halfJson = await halfRes.json();

      // F9 Done When: "Add savings with half of the target shows 50%"
      expect(halfJson.goal.percentage).toBe(50);
      expect(halfJson.goal.savedMinor).toBe(500000);
      expect(halfJson.goal.isReached).toBe(false);

      // 3. Add remaining ₹5,000.00
      const fullSavingsReq = new NextRequest(
        `http://localhost:3000/api/goals/${goalId}/savings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${userAToken}`,
          },
          body: JSON.stringify({ amount: "5000" }),
        }
      );
      const fullRes = await addSavings(fullSavingsReq, {
        params: Promise.resolve({ id: goalId }),
      });
      expect(fullRes.status).toBe(200);
      const fullJson = await fullRes.json();

      // F9 Done When: "a full amount shows 'Goal reached'"
      expect(fullJson.goal.percentage).toBe(100);
      expect(fullJson.goal.savedMinor).toBe(1000000);
      expect(fullJson.goal.isReached).toBe(true);

      // 4. Verify in GET /api/goals
      const listReq = new NextRequest("http://localhost:3000/api/goals", {
        headers: { cookie: `session_token=${userAToken}` },
      });
      const listRes = await getGoals(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.goals.length).toBe(1);
      expect(listJson.goals[0].isReached).toBe(true);

      // 5. Cross-user isolation: User B cannot modify or delete User A's goal (404)
      const userBPatchReq = new NextRequest(
        `http://localhost:3000/api/goals/${goalId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${userBToken}`,
          },
          body: JSON.stringify({ name: "Hacked Goal" }),
        }
      );
      const patchForbiddenRes = await patchGoal(userBPatchReq, {
        params: Promise.resolve({ id: goalId }),
      });
      expect(patchForbiddenRes.status).toBe(404);

      const userBDeleteReq = new NextRequest(
        `http://localhost:3000/api/goals/${goalId}`,
        {
          method: "DELETE",
          headers: { cookie: `session_token=${userBToken}` },
        }
      );
      const delForbiddenRes = await deleteGoal(userBDeleteReq, {
        params: Promise.resolve({ id: goalId }),
      });
      expect(delForbiddenRes.status).toBe(404);

      // 6. Delete goal by owner User A
      const userADeleteReq = new NextRequest(
        `http://localhost:3000/api/goals/${goalId}`,
        {
          method: "DELETE",
          headers: { cookie: `session_token=${userAToken}` },
        }
      );
      const delSuccessRes = await deleteGoal(userADeleteReq, {
        params: Promise.resolve({ id: goalId }),
      });
      expect(delSuccessRes.status).toBe(204);

      const dbGoal = await db.savingsGoal.findUnique({ where: { id: goalId } });
      expect(dbGoal).toBeNull();
    });
  });
});
