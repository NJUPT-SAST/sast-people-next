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
  note?: string;
  footerText?: string;
  logoUrl?: string;
};

/**
 * Quiet calendar invitation style.
 * Distinct from result/offer mail (no Georgia, no green result panel).
 * One cool slate theme for all kinds — status differs by label only.
 */
const statusLabel = {
  created: "已预约",
  rescheduled: "已改约",
  cancelled: "已取消",
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
  note,
  footerText = "南京邮电大学大学生科学技术协会",
  logoUrl = "https://storage.sast.fun/sast-logo.png",
}: InterviewScheduleEmailProps) => {
  const label = statusLabel[kind];
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
        : `${candidateName} 同学，你好。${flowName} 的线下面试安排已确认，请查看下方时间和地点并按时到达。`;

  return (
    <Html>
      <Preview>
        {flowName} {label} {startsAtText}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={topAccent} />

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
                    <Img src={logoUrl} width="28" alt="SAST" style={logo} />
                    <Text style={brandName}>SAST People</Text>
                  </td>
                  <td style={headerChipCell}>
                    <Text style={statusChip}>{label}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={bodySection}>
            <Text style={eyebrow}>面试日程</Text>
            <Heading style={title}>{titleText}</Heading>
            <Text style={intro}>{bodyText ?? defaultBody}</Text>

            <Section style={scheduleCard}>
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                style={scheduleTable}
              >
                <tbody>
                  <tr>
                    <td style={scheduleRail} />
                    <td style={scheduleContent}>
                      <Text style={scheduleLabel}>面试时间</Text>
                      <Text style={scheduleStart}>{startsAtText}</Text>
                      <Text style={scheduleEnd}>至 {endsAtText}</Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section style={metaList}>
              {meta.map((item, index) => (
                <Section
                  key={`${item.label}-${index}`}
                  style={
                    index === meta.length - 1 ? metaItemLast : metaItem
                  }
                >
                  <Text style={metaLabel}>{item.label}</Text>
                  <Text style={metaValue}>{item.value}</Text>
                </Section>
              ))}
            </Section>

            <Section style={offlineNotice}>
              <Text style={offlineNoticeText}>
                {kind === "cancelled"
                  ? "原线下面试安排已取消。如需重新安排，请等待后续通知。"
                  : "本次为线下面试，请按时到达上述地点。飞书日程与会议仅用于工作人员录制和妙记留档，无需通过会议链接参会。"}
              </Text>
            </Section>
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
  note: "请提前准备作品介绍。",
  footerText: "南京邮电大学大学生科学技术协会",
  logoUrl: "https://storage.sast.fun/sast-logo.png",
} as InterviewScheduleEmailProps;

export default InterviewScheduleEmail;

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';

/* Cool slate base — no brown stone, no offer-mail green cream */
const main = {
  margin: 0,
  padding: "28px 14px",
  backgroundColor: "#f3f5f8",
  fontFamily: fontStack,
};

const container = {
  width: "100%",
  maxWidth: "540px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  overflow: "hidden" as const,
  boxShadow: "0 8px 28px rgba(15, 23, 42, 0.06)",
};

const topAccent = {
  height: "3px",
  lineHeight: "3px",
  fontSize: "0",
  backgroundColor: "#1e293b",
};

const header = {
  padding: "18px 26px 0",
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
  borderRadius: "6px",
};

const brandName = {
  display: "inline-block",
  margin: 0,
  verticalAlign: "middle",
  color: "#334155",
  fontFamily: fontStack,
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  lineHeight: "20px",
};

const statusChip = {
  display: "inline-block",
  margin: 0,
  padding: "5px 11px",
  border: "1px solid #e2e8f0",
  borderRadius: "999px",
  backgroundColor: "#f1f5f9",
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  lineHeight: "16px",
};

const bodySection = {
  padding: "20px 26px 8px",
};

const eyebrow = {
  margin: "0 0 8px",
  color: "#94a3b8",
  fontFamily: fontStack,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.12em",
  lineHeight: "16px",
  textTransform: "uppercase" as const,
};

const title = {
  margin: "0 0 12px",
  color: "#0f172a",
  fontFamily: fontStack,
  fontSize: "24px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: "32px",
};

const intro = {
  margin: "0 0 22px",
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "14px",
  lineHeight: "24px",
};

const scheduleCard = {
  margin: "0 0 22px",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  overflow: "hidden" as const,
  backgroundColor: "#f8fafc",
};

const scheduleTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const scheduleRail = {
  width: "4px",
  fontSize: "0",
  lineHeight: "0",
  backgroundColor: "#1e293b",
};

const scheduleContent = {
  padding: "16px 18px",
  verticalAlign: "top" as const,
};

const scheduleLabel = {
  margin: "0 0 8px",
  color: "#94a3b8",
  fontFamily: fontStack,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  lineHeight: "16px",
};

const scheduleStart = {
  margin: "0 0 4px",
  color: "#0f172a",
  fontFamily: fontStack,
  fontSize: "20px",
  fontWeight: 700,
  letterSpacing: "-0.01em",
  lineHeight: "28px",
};

const scheduleEnd = {
  margin: 0,
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "14px",
  lineHeight: "22px",
};

const metaList = {
  margin: "0 0 22px",
  padding: "4px 2px 0",
};

const metaItem = {
  margin: "0 0 14px",
};

const metaItemLast = {
  margin: 0,
};

const metaLabel = {
  margin: "0 0 4px",
  color: "#94a3b8",
  fontFamily: fontStack,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  lineHeight: "16px",
};

const metaValue = {
  margin: 0,
  color: "#1e293b",
  fontFamily: fontStack,
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: "22px",
};

const offlineNotice = {
  margin: "0 0 14px",
  padding: "14px 16px",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  backgroundColor: "#f8fafc",
};

const offlineNoticeText = {
  margin: 0,
  color: "#64748b",
  fontFamily: fontStack,
  fontSize: "13px",
  lineHeight: "21px",
};

const footer = {
  padding: "16px 26px 22px",
  borderTop: "1px solid #eef2f7",
};

const footerTextStyle = {
  margin: "0 0 4px",
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
