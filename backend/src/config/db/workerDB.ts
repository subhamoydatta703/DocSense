import { PrismaClient } from "../../../prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connectionString = process.env.WORKER_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Neither WORKER_DATABASE_URL nor DATABASE_URL is set");
}

const adapter = new PrismaPg({
  connectionString,
  connectionTimeoutMillis: 10_000,
  query_timeout: 15_000,
  statement_timeout: 15_000,
  max: 5,
});
export const workerPrisma = new PrismaClient({
  adapter,
});
