// Read-only database inventory. Does not fetch sites, upload files, enqueue jobs, or replace sources.
import "../src/config/env";
import { prisma } from "../src/config/db/db";

try {
  let cursor: string | undefined;
  let count = 0;
  while (true) {
    const sources = await prisma.document.findMany({
      where: { sourceType: "WEBSITE" },
      orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, status: true },
    });
    for (const source of sources) {
      console.info("Website source to review for re-extraction", source);
      count++;
    }
    if (sources.length < 100) break;
    cursor = sources.at(-1)!.id;
  }
  console.info("Website inventory complete", { count, mode: "read-only" });
  console.info("Review these IDs before re-fetching sites. Stage corrected uploads and explicitly replace only reviewed sources after indexing succeeds.");
} finally {
  await prisma.$disconnect();
}
