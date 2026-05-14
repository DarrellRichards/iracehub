-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "cust_id" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "league_mail_opt_out" BOOLEAN,
    "league_pm_opt_out" BOOLEAN,
    "league_member_since" TIMESTAMP(3) NOT NULL,
    "car_number" TEXT,
    "nick_name" TEXT,
    "helmet" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_league_id_cust_id_key" ON "members"("league_id", "cust_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
