-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "data" JSONB,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);
