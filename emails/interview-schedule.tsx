import * as React from "react";

type ElementProps<T extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<T>;

const Html = ({ children }: { children: React.ReactNode }) => (
  <html>{children}</html>
);
const Body = ({ children, ...props }: ElementProps<"body">) => (
  <body {...props}>{children}</body>
);
const Container = ({ children, ...props }: ElementProps<"div">) => (
  <div {...props}>{children}</div>
);
const Section = ({ children, ...props }: ElementProps<"div">) => (
  <div {...props}>{children}</div>
);
const Heading = ({ children, ...props }: ElementProps<"h1">) => (
  <h1 {...props}>{children}</h1>
);
const Text = ({ children, ...props }: ElementProps<"p">) => (
  <p {...props}>{children}</p>
);
const Link = ({ children, ...props }: ElementProps<"a">) => (
  <a {...props}>{children}</a>
);
const Hr = (props: ElementProps<"hr">) => <hr {...props} />;
const Preview = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "none",
      maxHeight: 0,
      maxWidth: 0,
      opacity: 0,
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

type InterviewScheduleEmailProps = {
  candidateName: string;
  flowName: string;
  titleText?: string;
  bodyText?: string;
  organizerName: string;
  startsAtText: string;
  endsAtText: string;
  meetingLink: string;
  note?: string;
  footerText?: string;
};

export const InterviewScheduleEmail = ({
  candidateName,
  flowName,
  titleText = "面试预约通知",
  bodyText,
  organizerName,
  startsAtText,
  endsAtText,
  meetingLink,
  note,
  footerText = "南京邮电大学大学生科学技术协会",
}: InterviewScheduleEmailProps) => (
  <Html>
    <Preview>{flowName} 面试预约通知</Preview>
    <Body style={body}>
      <Container style={container}>
        <Heading style={heading}>{titleText}</Heading>
        <Text style={paragraph}>{candidateName} 同学：</Text>
        <Text style={paragraph}>
          {bodyText ?? `你已预约 ${flowName} 的面试，请按时通过下方会议链接参加。`}
        </Text>
        <Section style={card}>
          <Text style={label}>时间</Text>
          <Text style={value}>
            {startsAtText} - {endsAtText}
          </Text>
          <Text style={label}>发起人</Text>
          <Text style={value}>{organizerName}</Text>
          {note && (
            <>
              <Text style={label}>备注</Text>
              <Text style={value}>{note}</Text>
            </>
          )}
        </Section>
        <Text style={paragraph}>
          会议链接：<Link href={meetingLink} style={anchor}>{meetingLink}</Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>{footerText}</Text>
      </Container>
    </Body>
  </Html>
);

InterviewScheduleEmail.PreviewProps = {
  candidateName: "张三",
  flowName: "2026 免试招新",
  titleText: "面试预约通知",
  organizerName: "讲师",
  startsAtText: "2026-06-04 19:00",
  endsAtText: "2026-06-04 19:30",
  meetingLink: "https://vc.feishu.cn/j/123456789",
  note: "请提前准备作品介绍。",
  footerText: "南京邮电大学大学生科学技术协会",
} as InterviewScheduleEmailProps;

export default InterviewScheduleEmail;

const body = {
  margin: 0,
  backgroundColor: "#f6f7f9",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
};

const container = {
  width: "100%",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px 24px",
  backgroundColor: "#ffffff",
};

const heading = {
  margin: "0 0 24px",
  fontSize: "24px",
  lineHeight: "32px",
  color: "#111827",
};

const paragraph = {
  margin: "0 0 16px",
  fontSize: "15px",
  lineHeight: "24px",
  color: "#374151",
};

const card = {
  margin: "20px 0",
  padding: "18px 20px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  backgroundColor: "#f9fafb",
};

const label = {
  margin: "0 0 4px",
  fontSize: "12px",
  lineHeight: "18px",
  color: "#6b7280",
};

const value = {
  margin: "0 0 14px",
  fontSize: "15px",
  lineHeight: "24px",
  color: "#111827",
};

const anchor = {
  color: "#2563eb",
};

const hr = {
  margin: "24px 0",
  borderColor: "#e5e7eb",
};

const footer = {
  margin: 0,
  fontSize: "12px",
  lineHeight: "18px",
  color: "#6b7280",
};
