ALTER TABLE "interview_schedule"
  ADD COLUMN IF NOT EXISTS "meeting_room_id" varchar(255);
