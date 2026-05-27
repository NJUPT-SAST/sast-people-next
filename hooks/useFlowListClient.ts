import { useMyFlowList } from './useMyFlowList';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';

export const useFlowListClient = (uid: number | null) => {
  return useSWR<Awaited<ReturnType<typeof useMyFlowList>>, Error>(
    uid ? '/api/flow?uid=' + uid : null,
    fetcher,
  );
};
