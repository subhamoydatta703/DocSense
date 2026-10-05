// Dry run by default. Review reported document IDs before explicitly using --apply.
// Rebuilds only COMPLETED documents whose stored chunks are all empty/page markers.
import "../src/config/env";
import { prisma } from "../src/config/db/db";
import { reindexUnreadableSources } from "../src/services/processing/reindexUnreadableSourcesService";

const apply = process.argv.includes("--apply");
try {
  const result = await reindexUnreadableSources(apply);
  console.info("Unreadable-source scan complete", { mode: apply ? "apply" : "dry-run", ...result });
  if (apply) console.info("The running API's queue recovery will reindex pending sources. Original stored files were preserved.");
} finally { await prisma.$disconnect(); }
