-- Add race timing fields to schedules table
ALTER TABLE "schedules" ADD COLUMN "room_open_time" TIMESTAMP(3),
ADD COLUMN "green_flag_time" TIMESTAMP(3);