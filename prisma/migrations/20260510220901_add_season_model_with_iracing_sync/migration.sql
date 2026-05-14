-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "iracing_season_id" INTEGER NOT NULL,
    "season_name" TEXT NOT NULL,
    "description" TEXT,
    "cars" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "num_drops" INTEGER NOT NULL DEFAULT 0,
    "no_drops_on_or_after_race_num" INTEGER NOT NULL DEFAULT -1,
    "iracing_points_system_id" INTEGER,
    "iracing_points_system_name" TEXT,
    "iracing_points_system_desc" TEXT,
    "is_synced" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_series_id_iracing_season_id_key" ON "seasons"("series_id", "iracing_season_id");

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
