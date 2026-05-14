-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "virtual_payout_split" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "virtual_purse" INTEGER NOT NULL DEFAULT 0;
