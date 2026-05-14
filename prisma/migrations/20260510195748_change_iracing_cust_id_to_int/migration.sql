/*
  Warnings:

  - Changed the type of `iracing_cust_id` on the `users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "iracing_cust_id",
ADD COLUMN     "iracing_cust_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_iracing_cust_id_key" ON "users"("iracing_cust_id");
