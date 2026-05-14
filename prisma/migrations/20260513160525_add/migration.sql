-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "race_name" TEXT NOT NULL,
    "is_off_week" BOOLEAN NOT NULL DEFAULT false,
    "points_count" BOOLEAN NOT NULL DEFAULT true,
    "can_drop" BOOLEAN NOT NULL DEFAULT false,
    "track_name" TEXT,
    "track_id" INTEGER,
    "race_length" TEXT,
    "weather" JSONB NOT NULL DEFAULT '{}',
    "race_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_season_id_race_order_key" ON "schedules"("season_id", "race_order");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
