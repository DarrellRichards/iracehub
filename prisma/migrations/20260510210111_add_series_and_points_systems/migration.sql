-- CreateTable
CREATE TABLE "series_points_systems" (
    "id" TEXT NOT NULL,
    "league_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points" INTEGER[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_points_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "points_system_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cars" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "series_points_systems_league_id_name_key" ON "series_points_systems"("league_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "series_league_id_name_key" ON "series"("league_id", "name");

-- AddForeignKey
ALTER TABLE "series_points_systems" ADD CONSTRAINT "series_points_systems_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series" ADD CONSTRAINT "series_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series" ADD CONSTRAINT "series_points_system_id_fkey" FOREIGN KEY ("points_system_id") REFERENCES "series_points_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
