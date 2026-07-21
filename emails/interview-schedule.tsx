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

const statusTone = {
  created: {
    label: "已预约",
    accent: "#2563eb",
    accentSoft: "#eff6ff",
    accentBorder: "#bfdbfe",
    chipText: "#1d4ed8",
  },
  rescheduled: {
    label: "已改约",
    accent: "#d97706",
    accentSoft: "#fffbeb",
    accentBorder: "#fde68a",
    chipText: "#b45309",
  },
  cancelled: {
    label: "已取消",
    accent: "#64748b",
    accentSoft: "#f8fafc",
    accentBorder: "#cbd5e1",
    chipText: "#475569",
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
          <Section style={toolbar}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              style={toolbarTable}
            >
              <tbody>
                <tr>
                  <td style={toolbarBrandCell}>
                    <Img src={logoUrl} width="28" alt="SAST" style={logo} />
                    <Text style={brandName}>SAST People · 面试安排</Text>
                  </td>
                  <td style={toolbarChipCell}>
                    <Text
                      style={{
                        ...statusChip,
                        color: tone.chipText,
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
                  style={
                    index === meta.length - 1 ? metaRowLast : metaRow
                  }
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
  padding: "20px 12px",
  backgroundColor: "#f1f5f9",
  fontFamily: fontStack,
};

const container = {
  width: "100%",
  maxWidth: "520px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "6px",
  overflow: "hidden" as const,
};

const toolbar = {
  padding: "12px 16px",
  backgroundColor: "#0f172a",
};

const toolbarTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const toolbarBrandCell = {
  verticalAlign: "middle" as const,
};

const toolbarChipCell = {
  verticalAlign: "middle" as const,
  textAlign: "right" as const,
};

const logo = {
  display: "inline-block",
  verticalAlign: "middle",
  marginRight: "10px",
  borderRadius: "4px",
  backgroundColor: "#ffffff",
};

const brandName = {
  display: "inline-block",
  margin: 0,
  verticalAlign: "middle",
  color: "#e2e8f0",
  fontFamily: fontStack,
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.2px",
  lineHeight: "20px",
};

const statusChip = {
  display: "inline-block",
  margin: 0,
  padding: "4px 8px",
  border: "1px solid",
  borderRadius: "4px",
  fontFamily: fontStack,
  fontSize: "11px",
  fontWeight: 700,
  lineHeight: "14px",
  letterSpacing: "0.3px",
};

const bodySection = {
  padding: "22px 20px 8px",
};

const title = {
  margin: "0 0 10px",
  color: "#0f172a",
  fontFamily: fontStack,
  fontSize: "22px",
  fontWeight: 700,
  lineHeight: "30px",
};

const intro = {
  margin: "0 0 18px",
  color: "#334155",
  fontFamily: fontStack,
  fontSize: "14px",
  lineHeight: "22px",
};

const scheduleCard = {
  margin: "0 0 16px",
  padding: "14px 16px",
  border: "1px solid #e2e8f0",
  borderLeft: "4px solid #2563eb",
  borderRadius: "4px",
};

const scheduleLabel = {
  margin: "0 0 6px",
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.4px",
  lineHeight: "16px",
  textTransform: "uppercase" as const,
};

const scheduleStart = {
  margin: "0 0 2px",
  color: "#0f172a",
  fontFamily: fontStack,
  fontSize: "20px",
  fontWeight: 700,
  lineHeight: "28px",
};

const scheduleEnd = {
  margin: 0,
  color: "#475569",
  fontFamily: fontStack,
  fontSize: "14px",
  lineHeight: "20px",
};

const metaList = {
  margin: "0 0 18px",
  border: "1px solid #e2e8f0",
  borderRadius: "4px",
  overflow: "hidden" as const,
};

const metaRow = {
  width: "100%",
  borderCollapse: "collapse" as const,
  borderBottom: "1px solid #e2e8f0",
};

const metaRowLast = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const metaLabelCell = {
  width: "72px",
  padding: "11px 12px",
  backgroundColor: "#f8fafc",
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: "18px",
  verticalAlign: "top" as const,
};

const metaValueCell = {
  padding: "11px 12px",
  color: "#0f172a",
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
  padding: "11px 14px",
  border: "1px solid #2563eb",
  borderRadius: "4px",
  backgroundColor: "#2563eb",
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
  padding: "11px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: "4px",
  backgroundColor: "#ffffff",
  color: "#0f172a",
  fontFamily: fontStack,
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "18px",
  textAlign: "center" as const,
  textDecoration: "none",
};

const actionHint = {
  margin: "0 0 8px",
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "12px",
  lineHeight: "18px",
};

const cancelNotice = {
  margin: "0 0 14px",
  padding: "12px 14px",
  border: "1px dashed #cbd5e1",
  borderRadius: "4px",
  backgroundColor: "#f8fafc",
};

const cancelNoticeText = {
  margin: 0,
  color: "#475569",
  fontFamily: fontStack,
  fontSize: "13px",
  lineHeight: "20px",
};

const footer = {
  padding: "14px 20px 18px",
  borderTop: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
};

const footerTextStyle = {
  margin: "0 0 2px",
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "12px",
  lineHeight: "18px",
};

const footerMeta = {
  margin: 0,
  color: "#94a3b8",
  fontFamily: fontStack,
  fontSize: "11px",
  lineHeight: "16px",
};
