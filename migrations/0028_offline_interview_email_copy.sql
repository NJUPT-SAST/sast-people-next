UPDATE "email_template_content"
SET
  "body_template" = '{candidateName} 同学，你好。{flowName} 的线下面试安排已确认，请按时到达下方地点参加。',
  "updated_at" = now()
WHERE
  "template_key" IN ('interview.schedule', 'interview.schedule.created')
  AND "body_template" IN (
    '{candidateName} 同学，你好。{flowName} 的面试安排已确认，请查看下方时间、地点和参会入口，并按时参加。',
    '{candidateName} 同学，你已预约 {flowName} 的面试，请按时通过下方会议链接参加。',
    '{candidateName} 同学，你已预约 {flowName} 的面试，请以本邮件中的安排为准。'
  );
