import { serve } from 'inngest/next';
import { mqClient } from '@/queue/client';
import queueFunctions from '@/queue';

export const { GET, POST, PUT } = serve({
  client: mqClient,
  functions: queueFunctions,
});
