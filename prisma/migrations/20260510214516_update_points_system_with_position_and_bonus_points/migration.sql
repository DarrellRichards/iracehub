/*
  Warnings:

  - You are about to drop the column `points` on the `series_points_systems` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "series_points_systems" DROP COLUMN "points",
ADD COLUMN     "bonus_points" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "is_preset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position_points" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "preset_type" TEXT;
