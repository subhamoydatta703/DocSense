-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('PDF', 'WEBSITE');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "sourceType" "SourceType" NOT NULL DEFAULT 'PDF',
ADD COLUMN     "sourceUrl" TEXT,
ALTER COLUMN "s3Key" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Document_userId_sourceUrl_idx" ON "Document"("userId", "sourceUrl");
