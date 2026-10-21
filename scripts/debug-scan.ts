import { PrismaClient } from "../generated/prisma/client";

const db = new PrismaClient();

async function main() {
  // Find existing users
  const users = await db.user.findMany({ take: 3, select: { email: true, name: true } });
  console.log("Users:", JSON.stringify(users, null, 2));
  await db.$disconnect();
}

main().catch(console.error);
