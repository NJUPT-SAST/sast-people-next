import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { resultEmailCopy, resultEmailLinks } from '@/lib/email/result-email-config';

interface OfferEmailProps {
  name?: string;
  flowName?: string;
  accept?: boolean;
  genericGreeting?: boolean;
  memberInfoFormUrl?: string;
  feishuGroupUrl?: string;
  calendarUrl?: string;
  feishuRegisterHelpUrl?: string;
  contactEmail?: string;
  memberFormLabel?: string;
  feishuGroupName?: string;
}

export const OfferEmail = ({
  name,
  flowName = 'SAST 招新',
  accept = true,
  genericGreeting = false,
  memberInfoFormUrl = resultEmailLinks.memberInfoForm,
  feishuGroupUrl = resultEmailLinks.feishuGroup,
  calendarUrl = resultEmailLinks.calendar,
  feishuRegisterHelpUrl = resultEmailLinks.feishuRegisterHelp,
  contactEmail = resultEmailCopy.contactEmail,
  memberFormLabel = resultEmailCopy.memberFormLabel,
  feishuGroupName = resultEmailCopy.feishuGroupName,
}: OfferEmailProps) => {
  const greeting =
    genericGreeting || !name
      ? '亲爱的 [同学姓名] 同学，'
      : `亲爱的 ${name} 同学，`;
  const tone = accept ? acceptedTone : pendingTone;
  const preview = accept
    ? `恭喜你通过 ${flowName}，欢迎加入 SAST。`
    : `感谢你参加 ${flowName}，也谢谢你认真走完这段旅程。`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={shell}>
          <Section style={topLine} />
          <Section style={header}>
            <Text style={brand}>SAST</Text>
            <Text style={brandSub}>Nanjing University of Posts and Telecommunications</Text>
            <Text style={{ ...badge, color: tone.deep, backgroundColor: tone.tint }}>
              {accept ? '通过确认' : '结果通知'}
            </Text>
            <Text style={title}>
              {accept ? '欢迎来到 SAST' : '谢谢你走到这里'}
            </Text>
            <Text style={lead}>
              {accept
                ? '愿你在这里遇见可靠的伙伴，把好奇心写进真正运行的作品里。'
                : '这次结果不是终点。谢谢你把时间、热情和认真交给这段旅程。'}
            </Text>
          </Section>

          <Section style={{ ...resultCard, borderColor: tone.line }}>
            <Text style={kicker}>{flowName}</Text>
            <Text style={{ ...resultHeading, color: tone.deep }}>
              {accept ? '你已通过本轮招新' : '本次暂未通过'}
            </Text>
            <Text style={resultBody}>
              {accept
                ? '这是一封正式的欢迎信。我们很高兴在这个阶段与你相遇，也期待接下来一起学习、协作、创造。'
                : '我们知道这个结果可能会让人失落。它不是对你能力和热爱的否定，只是这一次综合评估后的阶段性决定。'}
            </Text>
          </Section>

          <Section style={content}>
            <Text style={paragraph}>{greeting}</Text>
            {accept ? (
              <>
                <Text style={paragraph}>
                  恭喜你顺利通过 {flowName}，正式成为南京邮电大学大学生科学技术协会的一员。
                </Text>
                <Text style={paragraph}>
                  在招新过程中，我们看到了你对技术的兴趣、愿意尝试的态度，以及认真完成每一步的投入。SAST 不只是一个社团，更是一群愿意一起写代码、做项目、拆问题、把想法落地的人。
                </Text>
                <Text style={paragraph}>
                  希望你在这里遇见同频的伙伴，也慢慢找到自己真正想深挖的方向。欢迎加入我们。
                </Text>

                <Section style={actionCard}>
                  <Text style={sectionTitle}>接下来请完成两件事</Text>
                  <Text style={muted}>以下链接仅供本人使用，请不要转发给其他人。</Text>

                  <Text style={stepNumber}>01</Text>
                  <Text style={stepTitle}>填写成员信息</Text>
                  <Text style={stepCopy}>请在今天内完善信息，方便后续统一建档和通知。</Text>
                  <Button style={{ ...primaryButton, backgroundColor: acceptedTone.deep }} href={memberInfoFormUrl}>
                    填写{memberFormLabel}
                  </Button>

                  <Hr style={softDivider} />

                  <Text style={stepNumber}>02</Text>
                  <Text style={stepTitle}>加入飞书群</Text>
                  <Text style={stepCopy}>
                    注册个人飞书账号（
                    <Link href={feishuRegisterHelpUrl} style={anchor}>
                      查看注册说明
                    </Link>
                    ），加入“{feishuGroupName}”。
                  </Text>
                  <Button style={secondaryButton} href={feishuGroupUrl}>
                    加入{feishuGroupName}
                  </Button>
                </Section>
              </>
            ) : (
              <>
                <Text style={paragraph}>
                  感谢你参加 {flowName}。愿意认真走完招新流程，本身就是一件值得被看见的事。
                </Text>
                <Text style={paragraph}>
                  我们对每一位同学都做了慎重评估。很遗憾，这次暂时没有与你走到同一个节点。但这并不代表你和技术、和 SAST 的故事只能停在这里。
                </Text>
                <Text style={paragraph}>
                  如果你仍然喜欢编程、设计、产品、算法或工程实践，欢迎继续参加我们的公开授课和后续活动。很多成长不是一次筛选决定的，而是在一次次继续尝试里发生的。
                </Text>
              </>
            )}

            <Section style={calendarCard}>
              <Text style={sectionTitle}>公开活动日历</Text>
              <Text style={muted}>
                你可以通过个人飞书账号订阅
                <Link href={calendarUrl} style={anchor}>
                  科协公开活动
                </Link>
                ，获取授课和活动安排。
              </Text>
            </Section>

            <Text style={paragraph}>
              如果你有更多疑问，可以联系 {contactEmail}。
            </Text>
            <Text style={closing}>祝你一路顺利，也一直保有热爱。</Text>
          </Section>

          <Section style={footer}>
            <Text style={footerBrand}>SAST R&D Center</Text>
            <Text style={footerText}>南京邮电大学大学生科学技术协会</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

OfferEmail.PreviewProps = {
  name: '新同学',
  flowName: '2024秋季招新',
  accept: true,
} as OfferEmailProps;

export default OfferEmail;

const main = {
  margin: '0',
  backgroundColor: '#f3f0ea',
  padding: '32px 12px',
};

const shell = {
  width: '100%',
  maxWidth: '620px',
  margin: '0 auto',
  backgroundColor: '#fffdf8',
  border: '1px solid #dfd6c9',
  borderRadius: '18px',
  overflow: 'hidden',
};

const topLine = {
  height: '6px',
  backgroundColor: '#1b5f4a',
};

const header = {
  padding: '34px 42px 24px',
};

const brand = {
  margin: '0',
  color: '#111827',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '30px',
  fontWeight: '700',
  letterSpacing: '2px',
  lineHeight: '34px',
};

const brandSub = {
  margin: '8px 0 28px',
  color: '#8b8175',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '12px',
  lineHeight: '18px',
};

const badge = {
  display: 'inline-block',
  margin: '0 0 18px',
  padding: '7px 12px',
  borderRadius: '999px',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '13px',
  fontWeight: '700',
  lineHeight: '18px',
};

const title = {
  margin: '0',
  color: '#172033',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '34px',
  fontWeight: '700',
  lineHeight: '44px',
};

const lead = {
  margin: '16px 0 0',
  color: '#4b5563',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '16px',
  lineHeight: '28px',
};

const resultCard = {
  margin: '0 42px 30px',
  padding: '22px 24px',
  backgroundColor: '#ffffff',
  border: '1px solid',
  borderRadius: '14px',
};

const kicker = {
  margin: '0 0 8px',
  color: '#8b8175',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '13px',
  lineHeight: '18px',
};

const resultHeading = {
  margin: '0 0 10px',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '23px',
  fontWeight: '700',
  lineHeight: '31px',
};

const resultBody = {
  margin: '0',
  color: '#344054',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '15px',
  lineHeight: '26px',
};

const content = {
  padding: '0 42px 10px',
};

const paragraph = {
  margin: '0 0 17px',
  color: '#172033',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '16px',
  lineHeight: '29px',
};

const actionCard = {
  margin: '28px 0',
  padding: '24px',
  backgroundColor: '#f8faf7',
  border: '1px solid #d8e2d7',
  borderRadius: '14px',
};

const calendarCard = {
  margin: '30px 0 24px',
  padding: '20px 22px',
  backgroundColor: '#f8f6f1',
  border: '1px solid #e4ddd2',
  borderRadius: '14px',
};

const sectionTitle = {
  margin: '0 0 8px',
  color: '#172033',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '17px',
  fontWeight: '700',
  lineHeight: '24px',
};

const muted = {
  margin: '0 0 16px',
  color: '#5b6574',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '14px',
  lineHeight: '25px',
};

const stepNumber = {
  margin: '20px 0 6px',
  color: '#1b5f4a',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '15px',
  fontWeight: '700',
  letterSpacing: '1px',
  lineHeight: '20px',
};

const stepTitle = {
  margin: '0 0 6px',
  color: '#172033',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '16px',
  fontWeight: '700',
  lineHeight: '24px',
};

const stepCopy = {
  margin: '0 0 14px',
  color: '#3f4a5a',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '15px',
  lineHeight: '26px',
};

const primaryButton = {
  borderRadius: '999px',
  color: '#ffffff',
  display: 'inline-block',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '15px',
  fontWeight: '700',
  lineHeight: '20px',
  padding: '12px 20px',
  textAlign: 'center' as const,
  textDecoration: 'none',
};

const secondaryButton = {
  ...primaryButton,
  backgroundColor: '#172033',
};

const anchor = {
  color: '#1d4ed8',
  textDecoration: 'underline',
};

const softDivider = {
  borderColor: '#dfe7df',
  margin: '24px 0 2px',
};

const closing = {
  margin: '24px 0 0',
  color: '#172033',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '19px',
  fontWeight: '700',
  lineHeight: '30px',
};

const footer = {
  padding: '28px 42px 34px',
  backgroundColor: '#faf7ef',
  borderTop: '1px solid #e5ded2',
};

const footerBrand = {
  margin: '0 0 6px',
  color: '#172033',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '18px',
  fontWeight: '700',
  letterSpacing: '1px',
  lineHeight: '24px',
};

const footerText = {
  margin: '0',
  color: '#766c60',
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
};

const acceptedTone = {
  deep: '#1b5f4a',
  tint: '#e6f4ed',
  line: '#a8d5c0',
};

const pendingTone = {
  deep: '#9a5b13',
  tint: '#fff1cf',
  line: '#ebc87a',
};
