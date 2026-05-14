-- Add stage configuration to schedules
ALTER TABLE "schedules"
ADD COLUMN "stages" JSONB NOT NULL DEFAULT '[]';

-- Add per-driver stage finish positions to race session results
ALTER TABLE "race_session_results"
ADD COLUMN "stage_finishes" JSONB NOT NULL DEFAULT '[]';
