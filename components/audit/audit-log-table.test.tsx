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
            actorName: '讲师甲',
            actorStudentId: 'T001',
            action: 'review.score.upsert',
            resourceType: 'user_flow',
            resourceId: 8,
            resourceLabel: '考生流程：2026 春招',
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

    await user.click(screen.getAllByRole('button', { name: '查看详情' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('评分变更')).toBeInTheDocument();
    expect(screen.getByText('算法题')).toBeInTheDocument();
    expect(screen.getAllByText(/60\s*→\s*88 分/).length).toBeGreaterThan(0);
  });

  it('keeps rows compact and opens full details on demand', async () => {
    render(
      <AuditLogTable
        totalCount={1}
        filters={filters}
        logs={[
          {
            id: 2,
            actorId: 10,
            actorName: '管理员',
            actorStudentId: 'T001',
            action: 'flow.update',
            resourceType: 'flow',
            resourceId: 101,
            resourceLabel: '流程：春招笔试',
            createdAt: new Date('2026-08-19T12:00:00Z'),
            metadata: { title: '春招笔试', changedFields: ['title'] },
            targetUser: null,
            targetUsers: [],
          },
        ]}
      />,
    );

    expect(screen.getAllByText('流程名称：春招笔试').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '查看详情' }).length).toBeGreaterThan(0);
  });
});
