-- CreateEnum
CREATE TYPE "LeagueJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "recruiting_open" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "league_recruiting_series" (
    "league_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_recruiting_series_pkey" PRIMARY KEY ("league_id","series_id")
);

-- CreateTable
CREATE TABLE "league_join_requests" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "requester_user_id" TEXT NOT NULL,
    "requester_cust_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "why_join" TEXT NOT NULL,
    "status" "LeagueJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_join_request_series" (
    "request_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,

    CONSTRAINT "league_join_request_series_pkey" PRIMARY KEY ("request_id","series_id")
);

-- CreateIndex
CREATE INDEX "league_recruiting_series_series_id_idx" ON "league_recruiting_series"("series_id");

-- CreateIndex
CREATE INDEX "league_join_requests_league_id_status_created_at_idx" ON "league_join_requests"("league_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "league_join_requests_requester_user_id_league_id_idx" ON "league_join_requests"("requester_user_id", "league_id");

-- CreateIndex
CREATE INDEX "league_join_request_series_series_id_idx" ON "league_join_request_series"("series_id");

-- AddForeignKey
ALTER TABLE "league_recruiting_series" ADD CONSTRAINT "league_recruiting_series_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_recruiting_series" ADD CONSTRAINT "league_recruiting_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_join_requests" ADD CONSTRAINT "league_join_requests_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_join_requests" ADD CONSTRAINT "league_join_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_join_requests" ADD CONSTRAINT "league_join_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_join_request_series" ADD CONSTRAINT "league_join_request_series_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "league_join_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_join_request_series" ADD CONSTRAINT "league_join_request_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
