"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, ShieldCheck, UserRoundCog } from "lucide-react";

import { startViewAs, stopViewAs } from "@/action/view-as";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEPARTMENT_LABELS,
  departmentCategory,
  departmentLabel,
  isDepartmentEnabled,
} from "@/const/department";
import { ADMIN_ROLE, LECTURER_ROLE, MANAGER_ROLE } from "@/lib/link/role";
import { cn } from "@/lib/utils";
import type { SessionViewAs } from "@/lib/session";

/* 与 mock 登录页同一套身份口径：0 新同学 / 1 部员 / 2 讲师 / 3 部长 / 4 管理员 */
const ROLE_OPTIONS: Array<{ value: number; label: string; hint: string }> = [
  { value: 0, label: "新同学", hint: "只有个人页，看不到部门数据" },
  { value: 1, label: "部员", hint: "本部门只读视角" },
  { value: 2, label: "讲师", hint: "试卷批改 / 笔试 / 面试" },
  { value: 3, label: "部长", hint: "本部门全部功能（邮件、面评审批、流程）" },
  { value: ADMIN_ROLE, label: "管理员", hint: "管理员可见全部部门，保存后退出临时视角" },
];

/* 需要部门归属的身份：与 lib 侧 requiresDepartment 保持一致 */
const needsDepartment = (role: number) => role >= 1 && role <= MANAGER_ROLE;

/** 办公部门没有讲师这一级（没有试卷、没有讲师面评），只有部员 / 部长 */
const roleAvailableIn = (role: number, department: string) =>
  !(role === LECTURER_ROLE && departmentCategory(department) === "office");

const DEPARTMENTS = Object.keys(DEPARTMENT_LABELS).filter(isDepartmentEnabled);

/** 顶栏入口：管理员切到任意身份/部门看一眼，随时切回 */
export function ViewAsSwitcher({ viewAs }: { viewAs: SessionViewAs | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<number>(viewAs?.role ?? 2);
  const [department, setDepartment] = useState<string>(
    viewAs?.department ?? DEPARTMENTS[0] ?? "",
  );

  const submit = () => {
    startTransition(async () => {
      try {
        await startViewAs({ role, department });
        setOpen(false);
        router.refresh();
        toast.success(
          role === ADMIN_ROLE
            ? "已切回管理员身份"
            : `已切换到「${ROLE_OPTIONS.find((item) => item.value === role)?.label} · ${
                department ? departmentLabel(department) : "无部门"
              }」查看`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "切换失败，请稍后重试",
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={viewAs ? "default" : "ghost"}
          size="sm"
          className={cn(
            "h-9 gap-1.5 px-2.5 text-xs",
            viewAs && "bg-primary/15 text-primary hover:bg-primary/20",
          )}
          title="切换身份查看"
        >
          <UserRoundCog className="size-4" />
          <span className="hidden sm:inline">切换身份</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>切换身份查看</DialogTitle>
          <DialogDescription>
            以其他身份或部门浏览系统，用来核对权限范围与界面效果；每次切换都记录在操作审计里。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-as-role">身份</Label>
            <Select
              value={String(role)}
              onValueChange={(next) => setRole(Number(next))}
            >
              <SelectTrigger id="view-as-role" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={String(option.value)}
                    /* 办公部门没有讲师这一级，选了也没意义 */
                    disabled={
                      needsDepartment(option.value) &&
                      !roleAvailableIn(option.value, department)
                    }
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {needsDepartment(role) && !roleAvailableIn(role, department)
                ? "办公部门没有讲师身份，请选择部员或部长。"
                : ROLE_OPTIONS.find((item) => item.value === role)?.hint}
            </p>
          </div>

          {needsDepartment(role) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="view-as-department">部门</Label>
              <Select
                value={department}
                onValueChange={(next) => {
                  setDepartment(next);
                  /* 切到办公部门时把不可用的讲师身份顺手落到部长，少一步来回 */
                  if (!roleAvailableIn(role, next)) setRole(MANAGER_ROLE);
                }}
              >
                <SelectTrigger id="view-as-department" className="h-10">
                  <SelectValue placeholder="选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {departmentLabel(key)}
                      {departmentCategory(key) === "office" ? "（无讲师）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            切换只改变「看到什么」，不会改数据归属；顶栏会一直显示当前视角，点「退出切换」即可回到管理员。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={submit} loading={pending}>
            <Eye data-icon="inline-start" />
            按这个身份查看
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 正在以别的身份查看时的提示条：始终可见，一键退出 */
export function ViewAsBanner({ viewAs }: { viewAs: SessionViewAs }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const roleLabel =
    ROLE_OPTIONS.find((item) => item.value === viewAs.role)?.label ??
    `角色 ${viewAs.role}`;

  const exit = () => {
    startTransition(async () => {
      try {
        await stopViewAs();
        router.refresh();
        toast.success("已退出切换，回到管理员身份");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "退出切换失败，请稍后重试",
        );
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
        <ShieldCheck className="size-4" />
        正在以「{roleLabel}
        {viewAs.department ? ` · ${departmentLabel(viewAs.department)}` : ""}」查看
      </span>
      <span className="text-xs text-amber-900/70 dark:text-amber-200/70">
        看到的权限与数据范围都和该身份一致
      </span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-8 border-amber-500/40 bg-background/60 text-amber-900 hover:bg-background dark:text-amber-200"
        onClick={exit}
        loading={pending}
      >
        退出切换
      </Button>
    </div>
  );
}
