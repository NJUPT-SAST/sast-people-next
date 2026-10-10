import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuditLogTable } from '@/components/audit/audit-log-table';

const filters = {
  page: 1,
  pageSize: 20,
  actor: '',
  action: '',
  actionGroup: '',
  resourceType: '',
  from: '',
  to: '',
};

describe('AuditLogTable', () => {
  it('uses final decision wording for an administrator rejection', () => {
    render(
      <AuditLogTable
        totalCount={1}
        filters={filters}
        logs={[{
          id: 3,
          actorId: 10,
          actorRole: 4,
          actorType: 'user',
          actorName: '管理员',
          actorStudentId: null,
          action: 'evaluation.reject',
          resourceType: 'interview_evaluation',
          resourceId: 7,
          resourceLabel: '面评：张三',
          department: null,
          createdAt: new Date('2026-08-19T12:00:00Z'),
          metadata: {},
          targetUser: null,
          targetUsers: [],
        }]}
      />,
    );

    expect(screen.getAllByText('终审不通过').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('驳回面评')).toHaveLength(0);
  });

  it('renders a compact scoring summary and reveals full details on demand', async () => {
    const user = userEvent.setup();

    render(
      <AuditLogTable
        totalCount={1}
        filters={filters}
        logs={[
          {
            id: 1,
            actorId: 10,
            actorRole: 2,
            actorType: 'user',
            actorName: '讲师甲',
            actorStudentId: 'T001',
            action: 'review.score.upsert',
            resourceType: 'user_flow',
            resourceId: 8,
            resourceLabel: '考生流程：2026 春招',
            department: null,
            createdAt: new Date('2026-08-19T12:00:00Z'),
            metadata: {
              targetUserId: 20,
              scoreChanges: [
                {
                  problemId: 3,
                  problemTitle: '算法题',
                  previousScore: 60,
                  nextScore: 88,
                },
              ],
            },
            targetUser: { id: 20, name: '同学乙', studentId: '2026001' },
            targetUsers: [],
          },
        ]}
      />,
    );

    expect(screen.getAllByText(/同学乙（2026001） · 算法题 60 → 88 分/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-08-19").length).toBeGreaterThan(0);
    expect(screen.getAllByText("20:00:00").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('评分变更')).toBeInTheDocument();
    expect(screen.getByText('算法题')).toBeInTheDocument();
    expect(screen.getAllByText(/60\s*→\s*88 分/).length).toBeGreaterThan(0);
  });

  it('marks a score change that overwrote another grader', async () => {
    const user = userEvent.setup();

    render(
      <AuditLogTable
        totalCount={1}
        filters={filters}
        logs={[
          {
            id: 2,
            actorId: 11,
            actorRole: 3,
            actorType: 'user',
            actorName: '部长丙',
            actorStudentId: 'T002',
            action: 'review.score.upsert',
            resourceType: 'user_flow',
            resourceId: 9,
            resourceLabel: '考生流程：2026 春招',
            department: null,
            createdAt: new Date('2026-08-20T12:00:00Z'),
            metadata: {
              targetUserId: 21,
              scoreChanges: [
                {
                  problemId: 4,
                  problemTitle: '设计题',
                  previousScore: 40,
                  nextScore: 45,
                  previousJudgerId: 10,
                  previousJudgerName: '讲师甲',
                  nextJudgerId: 11,
                  nextJudgerName: '部长丙',
                },
              ],
            },
            targetUser: { id: 21, name: '同学丙', studentId: '2026002' },
            targetUsers: [],
          },
        ]}
      />,
    );

    expect(screen.getAllByText(/（覆盖 讲师甲 的评分）/).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    expect(screen.getByText('覆盖 讲师甲 的评分')).toBeInTheDocument();
  });

  it('keeps rows compact and opens full details on demand', async () => {
    const user = userEvent.setup();

    render(
      <AuditLogTable
        totalCount={1}
        filters={filters}
        logs={[
          {
            id: 2,
            actorId: 10,
            actorRole: 4,
            actorType: 'user',
            actorName: '管理员',
            actorStudentId: 'T001',
            action: 'flow.update',
            resourceType: 'flow',
            resourceId: 101,
            resourceLabel: '流程：春招笔试',
            department: 'software',
            createdAt: new Date('2026-08-19T12:00:00Z'),
            metadata: { title: '春招笔试', changedFields: ['title'] },
            targetUser: null,
            targetUsers: [],
          },
        ]}
      />,
    );

    expect(screen.getAllByText('流程名称：春招笔试').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/#101 · 软件研发部/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '查看详情' }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('软件研发部')).toBeInTheDocument();
  });

  it('names previously unlabelled actions and renders the simulated identity in the detail dialog', async () => {
    const user = userEvent.setup();

    render(
      <AuditLogTable
        totalCount={2}
        filters={filters}
        logs={[
          {
            id: 41,
            actorId: 10,
            actorRole: 4,
            actorType: 'user',
            actorName: '管理员',
            actorStudentId: 'B00000000',
            action: 'session.view-as.start',
            resourceType: 'session',
            resourceId: 10,
            resourceLabel: null,
            department: 'publicity',
            createdAt: new Date('2026-10-07T04:00:00Z'),
            metadata: { role: 3, department: 'publicity' },
            targetUser: null,
            targetUsers: [],
          },
          {
            id: 42,
            actorId: 10,
            actorRole: 4,
            actorType: 'user',
            actorName: '管理员',
            actorStudentId: 'B00000000',
            action: 'flow.update_workspace',
            resourceType: 'flow',
            resourceId: 9,
            resourceLabel: '流程：2026 校科协软件研发部 WOC 招新',
            department: 'software',
            createdAt: new Date('2026-10-07T04:01:00Z'),
            metadata: {},
            targetUser: null,
            targetUsers: [],
          },
        ]}
      />,
    );

    expect(screen.getAllByText('切换身份查看').length).toBeGreaterThan(0);
    expect(screen.getAllByText('更新流程工作台').length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('查看身份');
    expect(dialog).toHaveTextContent('部长');
    expect(dialog).toHaveTextContent('科宣部');
  });
});
