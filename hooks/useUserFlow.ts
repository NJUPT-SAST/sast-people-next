import useSWR from 'swr';
import { fetcher } from '@/lib/utils';

export const useUserFlowId = (studentId: string, flowId: number) => {
  return useSWR<{ success: boolean; userFlowId: number | null; name?: string | null }, Error>(
    studentId && flowId ? `/api/user-flow?studentId=${encodeURIComponent(studentId)}&flowId=${flowId}` : null,
    fetcher,
  );
};
