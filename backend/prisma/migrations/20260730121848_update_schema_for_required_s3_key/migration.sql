/*
  Warnings:

  - Made the column `s3Key` on table `Document` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "s3Key" SET NOT NULL;
