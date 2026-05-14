-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('ADMIN_ROUTES');

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "iracing_league_id" INTEGER NOT NULL,
    "league_name" TEXT NOT NULL,
    "owner_cust_id" INTEGER,
    "created_at_iracing" TIMESTAMP(3),
    "hidden" BOOLEAN,
    "message" TEXT,
    "about" TEXT,
    "url" TEXT,
    "recruiting" BOOLEAN,
    "rules" TEXT,
    "private_wall" BOOLEAN,
    "private_roster" BOOLEAN,
    "private_schedule" BOOLEAN,
    "private_results" BOOLEAN,
    "roster_count" INTEGER,
    "small_logo" TEXT,
    "large_logo" TEXT,
    "raw_league" JSONB,
    "creator_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "league_mail_opt_out" BOOLEAN,
    "league_pm_opt_out" BOOLEAN,
    "car_number" TEXT,
    "nick_name" TEXT,
    "is_member" BOOLEAN,
    "is_applicant" BOOLEAN,
    "is_invite" BOOLEAN,
    "is_ignored" BOOLEAN,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "PermissionType" NOT NULL,
    "source_league_id" TEXT,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leagues_iracing_league_id_key" ON "leagues"("iracing_league_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_memberships_user_id_league_id_key" ON "league_memberships"("user_id", "league_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_key" ON "user_permissions"("user_id", "permission");

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_source_league_id_fkey" FOREIGN KEY ("source_league_id") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
