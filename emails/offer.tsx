import * as React from 'react';
import { resultEmailCopy, resultEmailLinks } from '../lib/email/result-email-config';
import {
  DEFAULT_EMAIL_FRAME,
  defaultResultEmailBlocks,
  type EmailBlock,
  type EmailFrameStyle,
  type ResultEmailFlowKind,
} from '../lib/email/blocks';
import { EmailBlockList, EmailShell } from '../lib/email/email-shell';
import { resolveEmailTheme } from '../lib/email/theme';
import { renderTemplateText } from '../lib/email/template-settings';

interface OfferEmailProps {
  name?: string;
  flowName?: string;
  accept?: boolean;
  flowKind?: ResultEmailFlowKind;
  /** 候选人所报部门展示名：办公类部门面试通知的 {department} 变量 */
  department?: string;
  /** 后续 QQ 群号：办公类部门面试通知的 {groupNumber} 变量 */
  groupNumber?: string;
  /**
   * 正文区块。为空时按流程类型回落到内置版式（结果面板 + 称呼 + 正文 + 结构卡片 + 联系落款），
   * 保证没有自定义版式的模板渲染结果与历史上的硬编码版式一致。
   */
  blocks?: EmailBlock[];
  /** 邮件外框（背景、内容卡、logo、页眉、页脚）：空字段回落内置外观 */
  frame?: EmailFrameStyle;
  /** 主题色（#RRGGBB）：空值 = 沿用内置的通过绿 / 不通过橙 */
  themeColor?: string;
  bodyTemplate?: string;
  titleTemplate?: string;
  subtitleTemplate?: string;
  resultBadgeTemplate?: string;
  resultTitleTemplate?: string;
  resultSummaryTemplate?: string;
  memberInfoFormUrl?: string;
  feishuGroupUrl?: string;
  calendarUrl?: string;
  feishuRegisterHelpUrl?: string;
  contactEmail?: string;
  memberFormLabel?: string;
  feishuGroupName?: string;
}

/** 结果邮件：外壳 + 正文区块，两段都可在模板编辑器里改 */
export const OfferEmail = ({
  name,
  flowName,
  accept = false,
  flowKind = 'recruitment',
  department = '',
  groupNumber = '',
  blocks,
  frame = DEFAULT_EMAIL_FRAME,
  themeColor = '',
  bodyTemplate = '',
  titleTemplate = '',
  subtitleTemplate = '',
  resultBadgeTemplate = '',
  resultTitleTemplate = '',
  resultSummaryTemplate = '',
  memberInfoFormUrl = resultEmailLinks.memberInfoForm,
  feishuGroupUrl = resultEmailLinks.feishuGroup,
  calendarUrl = resultEmailLinks.calendar,
  feishuRegisterHelpUrl = resultEmailLinks.feishuRegisterHelp,
  contactEmail = resultEmailCopy.contactEmail,
  memberFormLabel = resultEmailCopy.memberFormLabel,
  feishuGroupName = resultEmailCopy.feishuGroupName,
}: OfferEmailProps) => {
  const theme = resolveEmailTheme(themeColor, accept);
  const copyVariables = {
    name: name ?? '',
    flowName: flowName ?? '本次流程',
    department,
    groupNumber,
    contactEmail,
    feishuGroupName,
    feishuGroupUrl,
    calendarUrl,
    memberInfoFormUrl,
    feishuRegisterHelpUrl,
    memberFormLabel,
  };
  const isOfficeFlowKind = flowKind === 'office_round1' || flowKind === 'office_round2';
  const officeRoundLabel = flowKind === 'office_round2' ? '二轮' : '一轮';
  const officeDepartment = department || '部门';
  const defaultTitle = isOfficeFlowKind
    ? accept
      ? `${officeDepartment}${officeRoundLabel}面试结果通知`
      : `${officeDepartment}面试结果通知`
    : flowKind === 'woc' ? 'WoC / WoD 考核结果通知' : flowKind === 'soc' ? 'SoC / SoD 留任结果通知' : flowKind === 'recruitment_exemption' ? 'SAST 免试招新结果通知' : 'SAST 笔试招新结果通知';
  const defaultSubtitle = isOfficeFlowKind
    ? accept
      ? `恭喜通过${officeDepartment}${officeRoundLabel}面试`
      : `感谢你参与${officeDepartment}面试`
    : flowKind === 'woc' ? (accept ? '恭喜完成 WoC / WoD 阶段考核' : '感谢你完成 WoC / WoD 阶段考核') : flowKind === 'soc' ? (accept ? '恭喜通过暑期考核并留任讲师' : '感谢你完成 SoC / SoD 暑期考核') : (accept ? '欢迎加入南京邮电大学大学生科学技术协会' : '感谢你认真完成这次招新流程');

  /* 未自定义版式的模板走内置区块：结果面板、称呼、散文、结构卡片、联系与落款全是区块 */
  const resolvedBlocks =
    blocks && blocks.length > 0
      ? blocks
      : defaultResultEmailBlocks({
          flowKind,
          accept,
          bodyTemplate,
          panel: {
            resultBadgeTemplate,
            resultTitleTemplate,
            resultSummaryTemplate,
          },
        });

  return (
    <EmailShell
      frame={frame}
      theme={theme}
      title={renderTemplateText(titleTemplate || defaultTitle, copyVariables)}
      subtitle={renderTemplateText(subtitleTemplate || defaultSubtitle, copyVariables)}>
      <EmailBlockList blocks={resolvedBlocks} variables={copyVariables} theme={theme} />
    </EmailShell>
  );
};

OfferEmail.PreviewProps = {
  name: '新同学',
  flowName: '2024秋季招新',
  accept: true,
} as OfferEmailProps;

export default OfferEmail;
