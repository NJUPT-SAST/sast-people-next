import * as React from "react";

type ElementProps<T extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<T>;

const Html = ({ children }: { children: React.ReactNode }) => <html>{children}</html>;
const Body = ({ children, ...props }: ElementProps<"body">) => <body {...props}>{children}</body>;
const Container = ({ children, ...props }: ElementProps<"div">) => <div {...props}>{children}</div>;
const Section = ({ children, ...props }: ElementProps<"div">) => <div {...props}>{children}</div>;
const Heading = ({ children, ...props }: ElementProps<"h1">) => <h1 {...props}>{children}</h1>;
const Text = ({ children, ...props }: ElementProps<"p">) => <p {...props}>{children}</p>;
const Link = ({ children, ...props }: ElementProps<"a">) => <a {...props}>{children}</a>;
const Preview = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "none", maxHeight: 0, maxWidth: 0, opacity: 0, overflow: "hidden" }}>
    {children}
  </div>
);

export type InterviewWithdrawalEmailProps = {
  candidateName: string;
  flowName: string;
  reason: string;
  flowUrl: string;
};

export const InterviewWithdrawalEmail = ({
  candidateName,
  flowName,
  reason,
  flowUrl,
}: InterviewWithdrawalEmailProps) => (
  <Html>
    <Preview>{flowName} 面试报名已退回</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>SAST People</Text>
          <Text style={eyebrow}>面试报名</Text>
          <Heading style={title}>报名已退回</Heading>
        </Section>
        <Section style={content}>
          <Text style={text}>{candidateName} 同学，你好。</Text>
          <Text style={text}>
            你的 {flowName} 面试报名已被退回。请根据以下说明补充或调整报名信息后重新报名。
          </Text>
          <Section style={reasonCard}>
            <Text style={reasonLabel}>退回理由</Text>
            <Text style={reasonText}>{reason}</Text>
          </Section>
          <Link href={flowUrl} style={button}>查看我的流程</Link>
        </Section>
        <Section style={footer}>
          <Text style={footerText}>南京邮电大学大学生科学技术协会</Text>
          <Text style={footerMeta}>SAST People 自动发送</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

InterviewWithdrawalEmail.PreviewProps = {
  candidateName: "张三",
  flowName: "2026 免试招新 Demo",
  reason: "请补充作品集后重新报名。",
  flowUrl: "https://people.sast.fun/dashboard/user-flow",
} as InterviewWithdrawalEmailProps;

export default InterviewWithdrawalEmail;

const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';

const main = { backgroundColor: "#f8fafc", margin: 0, padding: "24px 12px" };
const container = { width: "100%", maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" as const };
const header = { padding: "28px 32px 20px", borderBottom: "1px solid #e2e8f0" };
const brand = { margin: "0 0 16px", color: "#0f172a", fontFamily: fontStack, fontSize: "16px", fontWeight: 700, lineHeight: "22px" };
const eyebrow = { margin: "0 0 8px", color: "#b45309", fontFamily: fontStack, fontSize: "12px", fontWeight: 600, lineHeight: "18px" };
const title = { margin: 0, color: "#0f172a", fontFamily: fontStack, fontSize: "24px", fontWeight: 700, lineHeight: "32px" };
const content = { padding: "24px 32px 28px" };
const text = { margin: "0 0 16px", color: "#334155", fontFamily: fontStack, fontSize: "14px", lineHeight: "24px" };
const reasonCard = { margin: "20px 0 24px", padding: "16px", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px" };
const reasonLabel = { margin: "0 0 8px", color: "#92400e", fontFamily: fontStack, fontSize: "12px", fontWeight: 700, lineHeight: "18px" };
const reasonText = { margin: 0, color: "#78350f", fontFamily: fontStack, fontSize: "14px", lineHeight: "22px", whiteSpace: "pre-wrap" as const };
const button = { display: "inline-block", padding: "10px 16px", color: "#ffffff", backgroundColor: "#0f172a", borderRadius: "6px", fontFamily: fontStack, fontSize: "14px", fontWeight: 600, lineHeight: "20px", textDecoration: "none" };
const footer = { padding: "16px 32px 22px", borderTop: "1px solid #e2e8f0" };
const footerText = { margin: "0 0 4px", color: "#64748b", fontFamily: fontStack, fontSize: "12px", lineHeight: "18px" };
const footerMeta = { margin: 0, color: "#94a3b8", fontFamily: fontStack, fontSize: "11px", lineHeight: "16px" };
