import { ArrowUpRight, Github, Mail, MessageCircle } from "lucide-react";
import { PageHeader, PageTitle } from "@/components/route";
import { FeedbackForm } from "@/components/about/feedback-form";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";

const chatLink = process.env.FEEDBACK_FEISHU_GROUP_URL?.trim();
const githubLink = "https://github.com/NJUPT-SAST/sast-people-next";

export default async function AboutPage() {
  const userInfo = await getUserInfo();
  return (
    <>
      <PageHeader><PageTitle /></PageHeader>
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center pb-10">
        <section className="w-full max-w-2xl px-4 pb-9 pt-3 text-center sm:px-8 sm:pt-5">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">SAST People</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            SAST People 是南京邮电大学大学生科学技术协会面向成员与项目组的协作平台，覆盖招新、笔试、面试审批、结果通知与成员留任，帮助团队统一管理流程、沉淀记录。
          </p>
          <div className="mx-auto mt-7 w-full border-y border-border/70">
            {chatLink && <a className="group flex items-center gap-4 px-2 py-3.5 text-left transition-colors hover:bg-primary/[0.04]" href={chatLink} target="_blank" rel="noreferrer">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <MessageCircle className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">飞书交流与反馈群</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">仅 SAST 内部成员可进</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </a>}
            {chatLink && <span className="h-px w-full bg-border/70" />}
            <a className="group flex items-center gap-4 px-2 py-3.5 text-left transition-colors hover:bg-primary/[0.04]" href={githubLink} target="_blank" rel="noreferrer">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Github className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">GitHub 项目</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">查看源码、提交 Issue 或参与贡献</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </a>
            <span className="h-px w-full bg-border/70" />
            <a className="group flex items-center gap-4 px-2 py-3.5 text-left transition-colors hover:bg-primary/[0.04]" href="mailto:emmm@sast.fun">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Mail className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">联系开发负责人</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">emmm@sast.fun</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </a>
          </div>
        </section>
        <section className="w-full border-t border-border/70 px-4 pt-9 sm:px-8 sm:pt-10">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Feedback</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">告诉我们哪里可以更好</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">遇到问题、想提建议，或发现一处不准确的内容，都可以在这里告诉我们。</p>
            </div>
            <FeedbackForm initialStudentId={userInfo.studentId ?? ""} />
          </div>
        </section>
      </div>
    </>
  );
}
