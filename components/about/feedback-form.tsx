"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FeedbackForm({ initialStudentId }: { initialStudentId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    const form = new FormData(formElement);
    const payload = {
      category: String(form.get("category") ?? "bug"),
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      studentId: initialStudentId,
      contact: String(form.get("contact") ?? ""),
      environment: `${window.location.hostname} · ${window.location.protocol.replace(":", "")}`,
      pageUrl: window.location.href,
      deviceName: navigator.platform || "未知平台",
      browserInfo: JSON.stringify({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        languages: navigator.languages,
        online: navigator.onLine,
        colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
        screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
        touchPoints: navigator.maxTouchPoints,
        referrer: document.referrer,
      }),
      viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    };
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "反馈提交失败");
      setSubmitted(true);
      formElement.reset();
      if (result.notificationSent) {
        toast.success("感谢反馈，开发组已收到");
      } else {
        toast.warning("反馈已保存，但开发群通知暂未发送");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "反馈提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {submitted && <p className="mb-6 border-l-2 border-emerald-500 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">反馈已提交，可以继续提交新的反馈。</p>}
      <form className="flex flex-col gap-5" onSubmit={submit}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2"><Label htmlFor="feedback-category">类型</Label><Select name="category" defaultValue="bug"><SelectTrigger id="feedback-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bug">问题反馈</SelectItem><SelectItem value="suggestion">功能建议</SelectItem><SelectItem value="content">内容纠错</SelectItem><SelectItem value="other">其他</SelectItem></SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="feedback-title">标题</Label><Input id="feedback-title" name="title" required maxLength={160} placeholder="例如：移动端按钮被遮挡" /></div>
          </div>
          <div className="flex flex-col gap-2"><Label htmlFor="feedback-description">详细描述</Label><Textarea id="feedback-description" name="description" required minLength={10} maxLength={10000} rows={6} placeholder="请描述发生了什么、如何复现、期望结果是什么" /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="feedback-contact">联系邮箱</Label><Input id="feedback-contact" name="contact" type="email" required maxLength={160} placeholder="用于反馈跟进" /></div>
        <div className="flex justify-center pt-2">
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>{submitting ? "正在提交…" : "提交反馈"}</Button>
        </div>
      </form>
    </div>
  );
}
