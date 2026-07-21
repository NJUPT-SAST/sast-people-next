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
const Img = ({ alt = "", ...props }: ElementProps<"img">) => (
  <img alt={alt} {...props} />
);

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

/**
 * Soft coordinated palette for schedule notices.
 * Intentionally different from result emails (warm green invitation).
 */
const statusTone = {
  created: {
    label: "已预约",
    accent: "#2f6b73",
    accentSoft: "#f3f8f8",
    accentBorder: "#c7dbde",
  },
  rescheduled: {
    label: "已改约",
    accent: "#8a6a3d",
    accentSoft: "#faf7f2",
    accentBorder: "#e6d8c2",
  },
  cancelled: {
    label: "已取消",
    accent: "#6b7280",
    accentSoft: "#f6f7f8",
    accentBorder: "#d7dbe0",
  },
} as const;

type MetaItem = {
  label: string;
  value: string;
};

export const InterviewScheduleEmail = ({
  kind = "created",
  candidateName,
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
}: InterviewScheduleEmailProps) => {
  const tone = statusTone[kind];
  const meta: MetaItem[] = [
    { label: "流程", value: flowName },
    { label: "讲师", value: organizerName },
  ];
  if (location) {
    meta.push({ label: "地点", value: location });
  }
  if (note) {
    meta.push({ label: "备注", value: note });
  }

  const defaultBody =
    kind === "cancelled"
      ? `${candidateName} 同学，你好。你的 ${flowName} 面试预约已取消，后续安排请关注新的通知。`
      : kind === "rescheduled"
        ? `${candidateName} 同学，你好。你的 ${flowName} 面试时间已调整，请以本邮件中的新时间为准。`
        : `${candidateName} 同学，你好。${flowName} 的面试安排已确认，请查看下方时间与参会入口。`;

  return (
    <Html>
      <Preview>
        {flowName} {tone.label} {startsAtText}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              style={headerTable}
            >
              <tbody>
                <tr>
                  <td style={headerBrandCell}>
                    <Img src={logoUrl} width="32" alt="SAST" style={logo} />
                    <Text style={brandName}>SAST People</Text>
                    <Text style={brandDivider}>·</Text>
                    <Text style={brandMeta}>面试安排</Text>
                  </td>
                  <td style={headerChipCell}>
                    <Text
                      style={{
                        ...statusChip,
                        color: tone.accent,
                        backgroundColor: tone.accentSoft,
                        borderColor: tone.accentBorder,
                      }}
                    >
                      {tone.label}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={bodySection}>
            <Heading style={title}>{titleText}</Heading>
            <Text style={intro}>{bodyText ?? defaultBody}</Text>

            <Section
              style={{
                ...scheduleCard,
                borderColor: tone.accentBorder,
                borderLeftColor: tone.accent,
                backgroundColor: tone.accentSoft,
              }}
            >
              <Text style={scheduleLabel}>面试时间</Text>
              <Text style={scheduleStart}>{startsAtText}</Text>
              <Text style={scheduleEnd}>至 {endsAtText}</Text>
            </Section>

            <Section style={metaList}>
              {meta.map((item, index) => (
                <table
                  key={`${item.label}-${index}`}
                  role="presentation"
                  cellPadding={0}
                  cellSpacing={0}
                  style={index === meta.length - 1 ? metaRowLast : metaRow}
                >
                  <tbody>
                    <tr>
                      <td style={metaLabelCell}>{item.label}</td>
                      <td style={metaValueCell}>{item.value}</td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </Section>

            {kind !== "cancelled" ? (
              <Section style={actionSection}>
                <Link
                  href={meetingLink}
                  style={{
                    ...primaryButton,
                    backgroundColor: tone.accent,
                    borderColor: tone.accent,
                  }}
                >
                  进入飞书会议
                </Link>
                {scheduleLink ? (
                  <Link href={scheduleLink} style={secondaryButton}>
                    打开飞书日程
                  </Link>
                ) : null}
                <Text style={actionHint}>
                  建议提前几分钟进入，并确认设备与网络正常。
                </Text>
              </Section>
            ) : (
              <Section style={cancelNotice}>
                <Text style={cancelNoticeText}>
                  原会议与日程入口已失效。如需重新安排，请等待后续通知。
                </Text>
              </Section>
            )}
          </Section>

          <Section style={footer}>
            <Text style={footerTextStyle}>{footerText}</Text>
            <Text style={footerMeta}>面试通知 · SAST People 自动发送</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

InterviewScheduleEmail.PreviewProps = {
  kind: "created",
  candidateName: "张三",
  flowName: "2026 免试招新",
  titleText: "面试预约已确认",
  organizerName: "讲师",
  startsAtText: "2026-06-04 19:00",
  endsAtText: "2026-06-04 19:30",
  location: "仙林校区大学生活动中心 101",
  meetingLink: "https://vc.feishu.cn/j/123456789",
  scheduleLink:
    "https://applink.feishu.cn/client/calendar/event/detail?calendarId=primary&eventId=demo",
  note: "请提前准备作品介绍。",
  footerText: "南京邮电大学大学生科学技术协会",
  logoUrl: "https://storage.sast.fun/sast-logo.png",
} as InterviewScheduleEmailProps;

export default InterviewScheduleEmail;

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';

const main = {
  margin: 0,
  padding: "24px 12px",
  backgroundColor: "#eef1f4",
  fontFamily: fontStack,
};

const container = {
  width: "100%",
  maxWidth: "528px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #dde3e8",
  borderRadius: "10px",
  overflow: "hidden" as const,
  boxShadow: "0 1px 2px rgba(31, 41, 55, 0.04)",
};

const header = {
  padding: "14px 20px",
  backgroundColor: "#f7f9fa",
  borderBottom: "1px solid #e5eaef",
};

const headerTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const headerBrandCell = {
  verticalAlign: "middle" as const,
};

const headerChipCell = {
  verticalAlign: "middle" as const,
  textAlign: "right" as const,
};

const logo = {
  display: "inline-block",
  verticalAlign: "middle",
  marginRight: "10px",
};

const brandName = {
  display: "inline-block",
  margin: 0,
  verticalAlign: "middle",
  color: "#374151",
  fontFamily: fontStack,
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: "20px",
};

const brandDivider = {
  display: "inline-block",
  margin: "0 6px",
  verticalAlign: "middle",
  color: "#c0c7cf",
  fontFamily: fontStack,
  fontSize: "13px",
  lineHeight: "20px",
};

const brandMeta = {
  display: "inline-block",
  margin: 0,
  verticalAlign: "middle",
  color: "#6b7280",
  fontFamily: fontStack,
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: "20px",
};

const statusChip = {
  display: "inline-block",
  margin: 0,
  padding: "4px 9px",
  border: "1px solid",
  borderRadius: "999px",
  fontFamily: fontStack,
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: "16px",
};

const bodySection = {
  padding: "22px 20px 10px",
};

const title = {
  margin: "0 0 10px",
  color: "#1f2937",
  fontFamily: fontStack,
  fontSize: "21px",
  fontWeight: 700,
  lineHeight: "30px",
};

const intro = {
  margin: "0 0 18px",
  color: "#4b5563",
  fontFamily: fontStack,
  fontSize: "14px",
  lineHeight: "23px",
};

const scheduleCard = {
  margin: "0 0 16px",
  padding: "14px 16px",
  border: "1px solid",
  borderLeft: "3px solid",
  borderRadius: "8px",
};

const scheduleLabel = {
  margin: "0 0 6px",
  color: "#6b7280",
  fontFamily: fontStack,
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  lineHeight: "16px",
};

const scheduleStart = {
  margin: "0 0 2px",
  color: "#1f2937",
  fontFamily: fontStack,
  fontSize: "19px",
  fontWeight: 700,
  lineHeight: "28px",
};

const scheduleEnd = {
  margin: 0,
  color: "#4b5563",
  fontFamily: fontStack,
  fontSize: "14px",
  lineHeight: "20px",
};

const metaList = {
  margin: "0 0 18px",
  border: "1px solid #e5eaef",
  borderRadius: "8px",
  overflow: "hidden" as const,
  backgroundColor: "#ffffff",
};

const metaRow = {
  width: "100%",
  borderCollapse: "collapse" as const,
  borderBottom: "1px solid #eef1f4",
};

const metaRowLast = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const metaLabelCell = {
  width: "72px",
  padding: "12px 14px",
  backgroundColor: "#f9fafb",
  color: "#6b7280",
  fontFamily: fontStack,
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: "18px",
  verticalAlign: "top" as const,
};

const metaValueCell = {
  padding: "12px 14px",
  color: "#1f2937",
  fontFamily: fontStack,
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: "20px",
  verticalAlign: "top" as const,
};

const actionSection = {
  margin: "0 0 12px",
};

const primaryButton = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  margin: "0 0 8px",
  padding: "12px 14px",
  border: "1px solid",
  borderRadius: "8px",
  color: "#ffffff",
  fontFamily: fontStack,
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "18px",
  textAlign: "center" as const,
  textDecoration: "none",
};

const secondaryButton = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  margin: "0 0 10px",
  padding: "12px 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
  color: "#374151",
  fontFamily: fontStack,
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "18px",
  textAlign: "center" as const,
  textDecoration: "none",
};

const actionHint = {
  margin: "0 0 8px",
  color: "#6b7280",
  fontFamily: fontStack,
  fontSize: "12px",
  lineHeight: "18px",
};

const cancelNotice = {
  margin: "0 0 14px",
  padding: "12px 14px",
  border: "1px solid #e5eaef",
  borderRadius: "8px",
  backgroundColor: "#f9fafb",
};

const cancelNoticeText = {
  margin: 0,
  color: "#4b5563",
  fontFamily: fontStack,
  fontSize: "13px",
  lineHeight: "20px",
};

const footer = {
  padding: "14px 20px 18px",
  borderTop: "1px solid #e5eaef",
  backgroundColor: "#f7f9fa",
};

const footerTextStyle = {
  margin: "0 0 2px",
  color: "#6b7280",
  fontFamily: fontStack,
  fontSize: "12px",
  lineHeight: "18px",
};

const footerMeta = {
  margin: 0,
  color: "#9ca3af",
  fontFamily: fontStack,
  fontSize: "11px",
  lineHeight: "16px",
};
