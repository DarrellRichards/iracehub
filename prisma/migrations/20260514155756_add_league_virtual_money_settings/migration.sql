-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "virtual_baseline_payout" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "virtual_entry_fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "virtual_inc_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "virtual_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "virtual_team_cost" INTEGER NOT NULL DEFAULT 0;
