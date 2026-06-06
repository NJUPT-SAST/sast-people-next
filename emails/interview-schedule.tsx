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
  location?: string;
  meetingLink: string;
  scheduleLink?: string;
  note?: string;
  footerText?: string;
  logoUrl?: string;
};

const statusCopy = {
  created: {
    label: "预约确认",
    color: "#0f766e",
    background: "#e8f7f1",
    accent: "#0f766e",
  },
  rescheduled: {
    label: "时间调整",
    color: "#a16207",
    background: "#fff7df",
    accent: "#d97706",
  },
  cancelled: {
    label: "已取消",
    color: "#b91c1c",
    background: "#fff0f0",
    accent: "#dc2626",
  },
} as const;

export const InterviewScheduleEmail = ({
  kind = "created",
  flowName,
  titleText = "面试预约通知",
  bodyText,
  organizerName,
  startsAtText,
  endsAtText,
  location,
  meetingLink,
  scheduleLink,
  note,
  footerText = "南京邮电大学大学生科学技术协会",
  logoUrl = "https://storage.sast.fun/sast-logo.png",
}: InterviewScheduleEmailProps) => (
  <Html>
    <Preview>{flowName} {statusCopy[kind].label}</Preview>
    <Body style={body}>
      <Container style={{
        ...container,
        borderTop: `4px solid ${statusCopy[kind].accent}`,
      }}>
        <Section style={brand}>
          <Img src={logoUrl} alt="SAST" width="44" style={logo} />
          <div style={brandText}>
            <Text style={brandName}>SAST People</Text>
            <Text style={brandMeta}>南京邮电大学大学生科学技术协会</Text>
          </div>
        </Section>
        <Section style={headline}>
          <Section style={statusBar(statusCopy[kind].background, statusCopy[kind].color)}>
            {statusCopy[kind].label}
          </Section>
          <Heading style={heading}>{titleText}</Heading>
          <Text style={paragraph}>
            {bodyText ?? `你已预约 ${flowName} 的面试，请按时通过下方会议链接参加。`}
          </Text>
        </Section>
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
          {location && (
            <div style={note ? detailRow : detailRowLast}>
              <Text style={label}>地点</Text>
              <Text style={value}>{location}</Text>
            </div>
          )}
          {note && (
            <div style={detailRowLast}>
              <Text style={label}>备注</Text>
              <Text style={value}>{note}</Text>
            </div>
          )}
        </Section>
        {kind !== "cancelled" && (
          <Section style={actionBlock}>
            <Link href={meetingLink} style={primaryButton}>飞书会议</Link>
            {scheduleLink && (
              <Link href={scheduleLink} style={secondaryButton}>飞书日程</Link>
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
  location: "仙林校区大学生活动中心 101",
  meetingLink: "https://vc.feishu.cn/j/123456789",
  scheduleLink: "https://applink.feishu.cn/client/calendar/event/detail?calendarId=primary&eventId=demo",
  note: "请提前准备作品介绍。",
  footerText: "南京邮电大学大学生科学技术协会",
  logoUrl: "https://storage.sast.fun/sast-logo.png",
} as InterviewScheduleEmailProps;

export default InterviewScheduleEmail;

const body = {
  margin: 0,
  backgroundColor: "#f2f5f3",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
};

const container = {
  width: "100%",
  maxWidth: "540px",
  margin: "16px auto",
  padding: "24px 22px",
  backgroundColor: "#ffffff",
  border: "1px solid #dfe5e1",
  borderRadius: "8px",
};

const statusBar = (backgroundColor: string, color: string) => ({
  display: "inline-block",
  margin: "8px 0 14px",
  padding: "4px 9px",
  borderRadius: "999px",
  backgroundColor,
  color,
  fontSize: "11px",
  lineHeight: "16px",
  fontWeight: 700,
});

const brand = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  margin: "0 0 20px",
};

const logo = {
  display: "block",
  flexShrink: 0,
};

const brandText = {
  minWidth: 0,
};

const brandName = {
  margin: "0 0 3px",
  fontSize: "13px",
  lineHeight: "17px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  color: "#27332f",
};

const brandMeta = {
  margin: 0,
  fontSize: "11px",
  lineHeight: "17px",
  color: "#65736e",
};

const headline = {
  margin: "0 0 18px",
};

const heading = {
  margin: "0 0 10px",
  fontSize: "23px",
  lineHeight: "31px",
  color: "#12181f",
};

const paragraph = {
  margin: 0,
  fontSize: "15px",
  lineHeight: "24px",
  color: "#3e4a46",
};

const details = {
  margin: "0 0 20px",
  border: "1px solid #dfe5e1",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  overflow: "hidden",
};

const detailRow = {
  padding: "10px 14px",
  borderBottom: "1px solid #e6ebe8",
};

const detailRowLast = {
  padding: "10px 14px",
};

const label = {
  margin: "0 0 3px",
  fontSize: "12px",
  lineHeight: "17px",
  color: "#7b8782",
};

const value = {
  margin: 0,
  fontSize: "15px",
  lineHeight: "23px",
  color: "#12181f",
};

const subValue = {
  margin: "1px 0 0",
  fontSize: "15px",
  lineHeight: "23px",
  color: "#12181f",
};

const actionBlock = {
  margin: "18px 0 20px",
  padding: 0,
};

const buttonBase = {
  display: "inline-block",
  width: "100%",
  boxSizing: "border-box" as const,
  marginBottom: "8px",
  padding: "11px 14px",
  borderRadius: "6px",
  fontSize: "14px",
  lineHeight: "20px",
  fontWeight: 700,
  textAlign: "center" as const,
  textDecoration: "none",
};

const primaryButton = {
  ...buttonBase,
  border: "1px solid #0f766e",
  backgroundColor: "#0f766e",
  color: "#ffffff",
};

const secondaryButton = {
  ...buttonBase,
  border: "1px solid #b8cbc5",
  backgroundColor: "#f5fbf8",
  color: "#0f766e",
};

const hr = {
  margin: "20px 0",
  borderColor: "#dfe5e1",
};

const footer = {
  margin: 0,
  fontSize: "12px",
  lineHeight: "18px",
  color: "#6b7280",
};
