import { Inngest } from 'inngest';

/**
 * 生产环境强制 cloud 模式：Inngest 只在 cloud 模式下校验请求签名，
 * 若部署时误设 INNGEST_DEV，任何人都能直接调用队列函数（发邮件、改数据）。
 * 固定 isDev:false 后签名校验一定生效；缺少 INNGEST_SIGNING_KEY 时请求被拒（fail-closed），
 * 开发/测试环境保持默认（配合本地 inngest dev server）。
 */
export const mqClient = new Inngest({
  id: 'sast-people',
  ...(process.env.NODE_ENV === 'production' ? { isDev: false } : {}),
});
