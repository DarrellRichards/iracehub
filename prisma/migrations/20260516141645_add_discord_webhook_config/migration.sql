-- CreateTable
CREATE TABLE "discord_webhook_configs" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "on_event_created" BOOLEAN NOT NULL DEFAULT true,
    "on_day_of_event" BOOLEAN NOT NULL DEFAULT true,
    "on_results_uploaded" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_webhook_configs_league_id_key" ON "discord_webhook_configs"("league_id");

-- AddForeignKey
ALTER TABLE "discord_webhook_configs" ADD CONSTRAINT "discord_webhook_configs_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
