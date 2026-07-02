import { PrismaClient } from "../../prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connectionString = process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Neither WORKER_DATABASE_URL nor DATABASE_URL is set");
}

const adapter = new PrismaPg({
  connectionString,
});
export const workerPrisma = new PrismaClient({
  adapter,
});