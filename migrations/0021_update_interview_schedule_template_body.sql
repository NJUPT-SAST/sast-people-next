update "email_template_content"
set
  "body_template" = '{candidateName} 同学，你好。{flowName} 的面试安排已确认，请查看下方时间、地点和参会入口，并按时参加。',
  "updated_at" = now()
where
  "template_key" = 'interview.schedule'
  and "body_template" in (
    '{candidateName} 同学，你已预约 {flowName} 的面试，请按时通过下方会议链接参加。',
    '{candidateName} 同学，你已预约 {flowName} 的面试，请以本邮件中的安排为准。'
  );
