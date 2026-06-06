/* eslint-disable @next/next/no-img-element */
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
const Img = ({ alt = "", ...props }: ElementProps<"img">) => <img alt={alt} {...props} />;

type InterviewScheduleEmailProps = {
  kind?: "created" | "rescheduled" | "cancelled";
  candidateName: string;
  flowName: string;
  titleText?: string;
  bodyText?: string;
  organizerName: string;
  startsAtText: string;
  endsAtText: string;
  meetingLink: string;
  scheduleLink?: string;
  note?: string;
  footerText?: string;
  logoUrl?: string;
};

const statusCopy = {
  created: { label: "预约确认", color: "#0f766e", background: "#ecfdf5" },
  rescheduled: { label: "时间调整", color: "#b45309", background: "#fffbeb" },
  cancelled: { label: "已取消", color: "#b91c1c", background: "#fef2f2" },
} as const;

export const InterviewScheduleEmail = ({
  kind = "created",
  flowName,
  titleText = "面试预约通知",
  bodyText,
  organizerName,
  startsAtText,
  endsAtText,
  meetingLink,
  scheduleLink,
  note,
  footerText = "南京邮电大学大学生科学技术协会",
  logoUrl = "https://nextpeople.sast.fun/images/logo.png",
}: InterviewScheduleEmailProps) => (
  <Html>
    <Preview>{flowName} {statusCopy[kind].label}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Section style={brand}>
          <Img src={logoUrl} alt="SAST" width="34" height="34" style={logo} />
          <div>
            <Text style={brandName}>SAST People</Text>
            <Text style={brandMeta}>南京邮电大学大学生科学技术协会</Text>
          </div>
        </Section>
        <Section style={statusBar(statusCopy[kind].background, statusCopy[kind].color)}>
          {statusCopy[kind].label}
        </Section>
        <Heading style={heading}>{titleText}</Heading>
        <Text style={paragraph}>
          {bodyText ?? `你已预约 ${flowName} 的面试，请按时通过下方会议链接参加。`}
        </Text>
        <Section style={details}>
          <div style={detailRow}>
            <Text style={label}>流程</Text>
            <Text style={value}>{flowName}</Text>
          </div>
          <div style={detailRow}>
            <Text style={label}>时间</Text>
            <Text style={value}>{startsAtText}</Text>
            <Text style={subValue}>至 {endsAtText}</Text>
          </div>
          <div style={detailRow}>
            <Text style={label}>讲师</Text>
            <Text style={value}>{organizerName}</Text>
          </div>
          {note && (
            <div style={detailRowLast}>
              <Text style={label}>备注</Text>
              <Text style={value}>{note}</Text>
            </div>
          )}
        </Section>
        {kind !== "cancelled" && (
          <Section style={actionBlock}>
            <Link href={meetingLink} style={linkButton}>飞书会议</Link>
            {scheduleLink && (
              <Link href={scheduleLink} style={linkButton}>飞书日程</Link>
            )}
          </Section>
        )}
        <Hr style={hr} />
        <Text style={footer}>{footerText}</Text>
      </Container>
    </Body>
  </Html>
);

InterviewScheduleEmail.PreviewProps = {
  kind: "created",
  candidateName: "张三",
  flowName: "2026 免试招新",
  titleText: "面试预约通知",
  organizerName: "讲师",
  startsAtText: "2026-06-04 19:00",
  endsAtText: "2026-06-04 19:30",
  meetingLink: "https://vc.feishu.cn/j/123456789",
  scheduleLink: "https://applink.feishu.cn/client/calendar/event/detail?calendarId=primary&eventId=demo",
  note: "请提前准备作品介绍。",
  footerText: "南京邮电大学大学生科学技术协会",
  logoUrl: "https://nextpeople.sast.fun/images/logo.png",
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
  maxWidth: "620px",
  margin: "32px auto",
  padding: "32px",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
};

const statusBar = (backgroundColor: string, color: string) => ({
  display: "inline-block",
  margin: "0 0 18px",
  padding: "5px 10px",
  borderRadius: "999px",
  backgroundColor,
  color,
  fontSize: "12px",
  lineHeight: "18px",
  fontWeight: 700,
});

const brand = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  margin: "0 0 22px",
};

const logo = {
  display: "block",
  borderRadius: "8px",
};

const brandName = {
  margin: 0,
  fontSize: "14px",
  lineHeight: "18px",
  fontWeight: 700,
  color: "#111827",
};

const brandMeta = {
  margin: "2px 0 0",
  fontSize: "12px",
  lineHeight: "16px",
  color: "#6b7280",
};

const heading = {
  margin: "0 0 18px",
  fontSize: "26px",
  lineHeight: "34px",
  color: "#111827",
};

const paragraph = {
  margin: "0 0 16px",
  fontSize: "15px",
  lineHeight: "24px",
  color: "#374151",
};

const details = {
  margin: "22px 0",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  backgroundColor: "#f9fafb",
};

const detailRow = {
  padding: "14px 18px",
  borderBottom: "1px solid #e5e7eb",
};

const detailRowLast = {
  padding: "14px 18px",
};

const label = {
  margin: "0 0 4px",
  fontSize: "12px",
  lineHeight: "18px",
  color: "#6b7280",
};

const value = {
  margin: 0,
  fontSize: "15px",
  lineHeight: "24px",
  color: "#111827",
};

const subValue = {
  margin: "2px 0 0",
  fontSize: "15px",
  lineHeight: "24px",
  color: "#111827",
};

const actionBlock = {
  margin: "24px 0",
  padding: 0,
};

const linkButton = {
  display: "inline-block",
  minWidth: "132px",
  marginRight: "10px",
  marginBottom: "10px",
  padding: "12px 18px",
  borderRadius: "6px",
  border: "1px solid #0f766e",
  backgroundColor: "#f0fdfa",
  color: "#0f766e",
  fontSize: "15px",
  lineHeight: "20px",
  fontWeight: 700,
  textAlign: "center" as const,
  textDecoration: "none",
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
