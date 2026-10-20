import "dotenv/config";
import { db } from "../lib/db";
import { CategoryType } from "../generated/prisma/enums";

const categories: Array<{ name: string; type: CategoryType }> = [
  // 5 EXPENSE categories
  { name: "Food", type: CategoryType.EXPENSE },
  { name: "Travel", type: CategoryType.EXPENSE },
  { name: "Shopping", type: CategoryType.EXPENSE },
  { name: "Bills", type: CategoryType.EXPENSE },
  { name: "Other", type: CategoryType.EXPENSE },
  // 3 INCOME categories
  { name: "Salary", type: CategoryType.INCOME },
  { name: "Pocket money", type: CategoryType.INCOME },
  { name: "Other income", type: CategoryType.INCOME },
];

async function main() {
  console.log("Seeding categories...");

  for (const cat of categories) {
    await db.category.upsert({
      where: {
        name_type: {
          name: cat.name,
          type: cat.type,
        },
      },
      update: {},
      create: {
        name: cat.name,
        type: cat.type,
      },
    });
  }

  const count = await db.category.count();
  console.log(`Seeding complete. Total categories: ${count}`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
