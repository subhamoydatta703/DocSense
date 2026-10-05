import { PrismaClient, Prisma } from "../../../prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 10_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    max: 5,
});
export const prisma = new PrismaClient({
    adapter,
});
export { Prisma };
