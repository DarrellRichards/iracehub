-- AlterTable
ALTER TABLE "members" ADD COLUMN     "earned_virtual" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "total_earned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "virtual_bank" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "team_driver_payments" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "payment_percent" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_driver_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_driver_payments_team_id_idx" ON "team_driver_payments"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_driver_payments_team_id_member_id_key" ON "team_driver_payments"("team_id", "member_id");

-- AddForeignKey
ALTER TABLE "team_driver_payments" ADD CONSTRAINT "team_driver_payments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_driver_payments" ADD CONSTRAINT "team_driver_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
