import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
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
  flowName,
  accept,
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
      ? '亲爱的[同学姓名]同学，'
      : `亲爱的${name}同学，`;
  const tone = accept ? acceptedTone : rejectedTone;

  return (
    <Html>
      <Head />
      <Preview>SAST Invitation</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...topBar, backgroundColor: tone.primary }} />
          <Section style={header}>
            <Img
              src="https://storage.sast.fun/sast-logo.png"
              width="64"
              alt="SAST"
              style={logo}
            />
            <Text style={eyebrow}>SAST R&D Center</Text>
            <Text style={title}>SAST 招新结果通知</Text>
            <Text style={subtitle}>
              {accept ? '欢迎加入南京邮电大学大学生科学技术协会' : '感谢你认真完成这次招新流程'}
            </Text>
          </Section>

          <Section style={resultPanelWrap}>
            <Section style={{ ...resultPanel, borderColor: tone.border, backgroundColor: tone.panel }}>
              <Text style={{ ...resultBadge, color: tone.primary, backgroundColor: tone.badge }}>
                {accept ? '通过通知' : '结果通知'}
              </Text>
              <Text style={{ ...resultTitle, color: tone.primary }}>
                {accept ? '恭喜你顺利通过' : '感谢你的参与'}
              </Text>
              <Text style={resultText}>
                {accept ? '本次考核结果已确认。' : '本次招新结果已确认。'}
              </Text>
            </Section>
          </Section>

          <Section style={content}>
            <Text style={text}>{greeting}</Text>
            {accept ? (
              <>
                <Text style={text}>
                  恭喜你顺利通过 {flowName}，正式成为南京邮电大学大学生科学技术协会的一员。
                </Text>
                <Text style={text}>
                  我们欣赏你对技术的热情和积极的态度。在这里，希望你能与志同道合的伙伴们一起，将脑海中天马行空的创意变为现实，在项目实战中挑战自我，感受协同攻克难关的纯粹快乐。
                </Text>
                <Text style={text}>
                  未来，让我们在这条路上共同学习、进步，在自己所热爱的世界里闪闪发光。
                </Text>

                <Section style={noticeCard}>
                  <Text style={importantText}>
                    【重要步骤】<br />
                    请注意：以下信息请勿向其他人分享
                  </Text>

                  <Text style={text}>
                    1. 为完善你的成员信息，请务必在今日内填写社团管理系统成员信息收集表
                  </Text>
                  <Button
                    style={{ ...button, backgroundColor: acceptedTone.primary }}
                    href={memberInfoFormUrl}>
                    点击填写 {memberFormLabel}
                  </Button>

                  <Hr style={innerDivider} />

                  <Text style={text}>
                    2. 请注册个人飞书账号（
                    <Link href={feishuRegisterHelpUrl} style={anchor}>
                      注册说明
                    </Link>
                    ）并加入“{feishuGroupName}”飞书群，和学长及其他新成员一起交流
                  </Text>
                  <Button
                    style={buttonDark}
                    href={feishuGroupUrl}>
                    点击加入 {feishuGroupName}
                  </Button>
                </Section>

                <Section style={calendarCard}>
                  <Text style={importantText}>
                    【查看授课日历】
                  </Text>
                  <Text style={text}>
                    通过个人飞书账号，订阅
                    <Link href={calendarUrl} style={anchor}>
                      科协公开活动
                    </Link>
                    ，获取最新授课日历
                  </Text>
                </Section>

                <Text style={text}>
                  我们真诚地欢迎你的加入！
                </Text>
              </>
            ) : (
              <>
                <Text style={text}>
                  感谢你参加 {flowName}，你在整个过程中的出色表现，以及展现出的技术才华和学习热情，给我们留下了深刻的印象。
                </Text>
                <Text style={text}>
                  我们对每一位参与者都进行了慎重和综合的评估。经过艰难的抉择，我们很遗憾地通知你，本次未能通过我们的考核。我们深知这个结果可能会让你感到失望，但这绝非对你个人能力的否定，你的才华依然闪耀。
                </Text>
                <Text style={text}>
                  我们希望这次经历不会影响你对技术的热爱，并诚挚地邀请你继续参加我们接下来的授课活动。此外，我们的“寒假大作战”活动也依然向你开放，这是你再次展示自己能力并加入我们的另一个机会。
                </Text>
                <Text style={text}>
                  希望你能继续保持这份对技术的热忱，不断精进，再接再厉。我们期待在未来的活动中再次看到你的身影！
                </Text>

                <Section style={calendarCard}>
                  <Text style={importantText}>
                    【查看授课日历】
                  </Text>
                  <Text style={text}>
                    通过个人飞书账号，订阅
                    <Link href={calendarUrl} style={anchor}>
                      科协公开活动
                    </Link>
                    ，获取最新授课日历
                  </Text>
                </Section>

                <Text style={text}>
                  再次感谢你的参与！
                </Text>
              </>
            )}
            <Hr style={divider} />
            <Text style={text}>
              如果你有更多疑问，请联系 {contactEmail}
            </Text>
            <Text style={signOff}>祝心想事成!</Text>
          </Section>

          <Section style={footer}>
            <Img
              src="https://storage.sast.fun/sast-email-header.png"
              width="180"
              alt="SAST - Igniting the thought"
              style={footerImage}
            />
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
  backgroundColor: '#eef3f1',
  padding: '24px 10px',
};

const container = {
  width: '100%',
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: '#fffdfa',
  border: '1px solid #d9e2dc',
  borderRadius: '18px',
  overflow: 'hidden',
};

const topBar = {
  height: '8px',
  backgroundColor: '#157347',
  borderBottom: '1px solid #d7e5dc',
};

const header = {
  padding: '28px 28px 20px',
  backgroundColor: '#fffdfa',
};

const logo = {
  display: 'block',
  margin: '0 0 14px',
};

const eyebrow = {
  margin: '0 0 8px',
  color: '#6f7f78',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  fontWeight: '700',
  letterSpacing: '0.6px',
  textTransform: 'uppercase' as const,
};

const title = {
  margin: '0',
  color: '#111827',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '26px',
  fontWeight: '700',
  lineHeight: '32px',
};

const subtitle = {
  margin: '10px 0 0',
  color: '#52615a',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
};

const resultPanelWrap = {
  padding: '0 34px 26px',
};

const resultPanel = {
  margin: '0',
  padding: '20px 22px',
  border: '1px solid',
  borderRadius: '12px',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const resultBadge = {
  display: 'inline-block',
  margin: '0 0 10px',
  padding: '5px 10px',
  borderRadius: '999px',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  fontWeight: '700',
  lineHeight: '16px',
};

const resultTitle = {
  margin: '0 0 8px',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '30px',
};

const resultText = {
  margin: '0',
  color: '#5b6570',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
};

const content = {
  padding: '0 28px 8px',
};

const text = {
  margin: '0 0 14px',
  color: '#172033',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: '400',
  lineHeight: '26px',
};

const importantText = {
  margin: '0 0 12px',
  color: '#111827',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: '700',
  lineHeight: '24px',
};

const noticeCard = {
  margin: '20px 0',
  padding: '18px 18px 20px',
  backgroundColor: '#f7faf8',
  border: '1px solid #d7e5dc',
  borderRadius: '12px',
};

const calendarCard = {
  margin: '20px 0',
  padding: '18px 18px',
  backgroundColor: '#fbfaf6',
  border: '1px solid #efe7dc',
  borderRadius: '12px',
};

const button = {
  borderRadius: '999px',
  color: '#ffffff',
  display: 'inline-block',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  fontWeight: '700',
  lineHeight: '18px',
  padding: '11px 16px',
  textAlign: 'center' as const,
  textDecoration: 'none',
};

const buttonDark = {
  ...button,
  backgroundColor: '#172033',
};

const anchor = {
  color: '#1d4ed8',
  textDecoration: 'underline',
};

const innerDivider = {
  borderColor: '#dce7df',
  margin: '18px 0',
};

const divider = {
  borderColor: '#edf1ef',
  margin: '22px 0 18px',
};

const signOff = {
  margin: '4px 0 0',
  color: '#111827',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '17px',
  fontWeight: '700',
  lineHeight: '26px',
};

const footer = {
  padding: '22px 28px 28px',
  backgroundColor: '#fffdfa',
  textAlign: 'center' as const,
};

const footerImage = {
  display: 'block',
  margin: '0 auto 10px',
};

const footerText = {
  margin: '0',
  color: '#65736d',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
};

const acceptedTone = {
  primary: '#157347',
  badge: '#e5f6ed',
  panel: '#f2fbf6',
  border: '#b7ddc8',
};

const rejectedTone = {
  primary: '#b45309',
  badge: '#fff1d6',
  panel: '#fffaf0',
  border: '#ecd39a',
};
