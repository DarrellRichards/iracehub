-- Add league-level configurable starting balance for virtual money
ALTER TABLE "leagues"
ADD COLUMN "virtual_starting_money" INTEGER NOT NULL DEFAULT 0;

-- Add per-race entry fee
ALTER TABLE "schedules"
ADD COLUMN "virtual_entry_fee" INTEGER NOT NULL DEFAULT 0;

-- Add virtual money ledger table for registration charges/refunds
CREATE TYPE "VirtualMoneyEventType" AS ENUM ('ENTRY_FEE_DEBIT', 'ENTRY_FEE_REFUND');

CREATE TABLE "virtual_money_events" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "event_type" "VirtualMoneyEventType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "virtual_money_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "virtual_money_events_league_id_member_id_created_at_idx"
ON "virtual_money_events"("league_id", "member_id", "created_at");

CREATE INDEX "virtual_money_events_schedule_id_idx"
ON "virtual_money_events"("schedule_id");

ALTER TABLE "virtual_money_events"
ADD CONSTRAINT "virtual_money_events_league_id_fkey"
FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "virtual_money_events"
ADD CONSTRAINT "virtual_money_events_member_id_fkey"
FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "virtual_money_events"
ADD CONSTRAINT "virtual_money_events_schedule_id_fkey"
FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
