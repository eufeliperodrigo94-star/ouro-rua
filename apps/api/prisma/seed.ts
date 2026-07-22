import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@ourorua.com" },
    update: {},
    create: { email: "admin@ourorua.com", name: "Admin", password: hash, role: "ADMIN" },
  });
  console.log("Seed OK: admin@ourorua.com / admin123");
}
main().catch(console.error).finally(() => prisma.$disconnect());
