UPDATE "email_template_content"
SET
  "body_template" = replace(
    "body_template",
    '，请通过会议链接参加：{meetingLink}',
    '。'
  ),
  "updated_at" = now()
WHERE
  "template_key" IN ('interview.schedule', 'interview.schedule.created')
  AND "body_template" LIKE '%请通过会议链接参加：{meetingLink}%';

UPDATE "email_template_content"
SET
  "body_template" = replace(
    "body_template",
    '，请按时通过下方会议链接参加。',
    '。'
  ),
  "updated_at" = now()
WHERE
  "template_key" IN ('interview.schedule', 'interview.schedule.created')
  AND "body_template" LIKE '%请按时通过下方会议链接参加。%';
