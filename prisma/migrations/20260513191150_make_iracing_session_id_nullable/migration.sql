/*
  Warnings:

  - A unique constraint covering the columns `[iracing_session_id]` on the table `schedules` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "iracing_session_id" INTEGER;

-- CreateTable
CREATE TABLE "race_sessions" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "iracing_session_id" INTEGER,
    "subsession_id" INTEGER,
    "private_session_id" INTEGER,
    "league_season_id" INTEGER,
    "launch_at" TIMESTAMP(3) NOT NULL,
    "has_results" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER,
    "track_id" INTEGER,
    "track_name" TEXT,
    "race_laps" INTEGER,
    "race_length" INTEGER,
    "time_limit" INTEGER,
    "winner_cust_id" INTEGER,
    "winner_name" TEXT,
    "raw_session" JSONB NOT NULL,
    "raw_track_state" JSONB,
    "raw_weather" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "race_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_session_points" (
    "id" TEXT NOT NULL,
    "race_session_id" TEXT NOT NULL,
    "position_points" JSONB NOT NULL DEFAULT '{}',
    "bonus_points" JSONB NOT NULL DEFAULT '{}',
    "allow_provisionals" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "race_session_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_session_results" (
    "id" TEXT NOT NULL,
    "race_session_id" TEXT NOT NULL,
    "member_id" TEXT,
    "cust_id" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,
    "finish_position" INTEGER,
    "start_position" INTEGER,
    "laps_completed" INTEGER,
    "incidents" INTEGER,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "points_base" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points_adjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "raw_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "race_session_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "race_sessions_schedule_id_key" ON "race_sessions"("schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "race_sessions_iracing_session_id_key" ON "race_sessions"("iracing_session_id");

-- CreateIndex
CREATE INDEX "race_sessions_league_id_series_id_season_id_idx" ON "race_sessions"("league_id", "series_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "race_session_points_race_session_id_key" ON "race_session_points"("race_session_id");

-- CreateIndex
CREATE INDEX "race_session_results_member_id_idx" ON "race_session_results"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "race_session_results_race_session_id_cust_id_key" ON "race_session_results"("race_session_id", "cust_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_iracing_session_id_key" ON "schedules"("iracing_session_id");

-- AddForeignKey
ALTER TABLE "race_sessions" ADD CONSTRAINT "race_sessions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_sessions" ADD CONSTRAINT "race_sessions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_sessions" ADD CONSTRAINT "race_sessions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_sessions" ADD CONSTRAINT "race_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_session_points" ADD CONSTRAINT "race_session_points_race_session_id_fkey" FOREIGN KEY ("race_session_id") REFERENCES "race_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_session_results" ADD CONSTRAINT "race_session_results_race_session_id_fkey" FOREIGN KEY ("race_session_id") REFERENCES "race_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_session_results" ADD CONSTRAINT "race_session_results_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
