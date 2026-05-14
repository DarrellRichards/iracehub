-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "registration_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_registrations_member_id_idx" ON "event_registrations"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_schedule_id_member_id_key" ON "event_registrations"("schedule_id", "member_id");

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
