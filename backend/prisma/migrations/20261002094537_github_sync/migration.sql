-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'SYNCING', 'FAILED');

-- AlterTable
ALTER TABLE "Metrics" ALTER COLUMN "ciPassRate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "defaultBranch" TEXT,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "syncStartedAt" TIMESTAMP(3),
ADD COLUMN     "syncStatus" "SyncStatus" NOT NULL DEFAULT 'IDLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "githubLogin" TEXT,
ADD COLUMN     "githubTokenEnc" TEXT;
