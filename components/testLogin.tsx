"use client";

import { loginWithMockLinkUser } from "@/action/test-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEPARTMENT_LABELS, departmentLabel } from "@/const/department";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

export type MockLoginAccount = {
  studentId: string;
  name: string;
  /** People 角色：0 新同学 / 1 部员 / 2 讲师 / 3 部长 / 4 管理员 */
  role: number;
  /** Link 部门标识；null = 无部门（管理员 / 新同学） */
  department: string | null;
};

const ROLE_LABELS: Record<number, string> = {
  0: "新同学",
  1: "部员",
  2: "讲师",
  3: "部长",
  4: "管理员",
};

/* 下拉顺序：管理员 → 部长 → 讲师 → 部员 → 新同学 */
const ROLE_ORDER = [4, 3, 2, 1, 0];
/* 这些身份按「部门 → 账号」选择；其余身份直接选账号 */
const DEPARTMENT_ROLES = new Set([1, 2, 3]);
/* 部门展示顺序沿用 const/department 的定义顺序 */
const DEPARTMENT_ORDER = Object.keys(DEPARTMENT_LABELS);

/** 部门内存在多个同角色账号时，用姓名 + 学号区分 */
const accountOptionLabel = (account: MockLoginAccount) =>
  `${account.name}（${account.studentId}）`;

const roleLabel = (role: number) => ROLE_LABELS[role] ?? String(role);

const accountSummary = (account: MockLoginAccount) =>
  `${ROLE_LABELS[account.role] ?? account.role}${
    account.department ? ` · ${departmentLabel(account.department)}` : ""
  }`;

/** 默认停在部长（便于演示管理端），没有部长账号时取第一个可用身份 */
const pickDefaultRole = (accounts: MockLoginAccount[]) => {
  const roles = ROLE_ORDER.filter((role) =>
    accounts.some((account) => account.role === role),
  );
  return roles.includes(3) ? 3 : (roles[0] ?? 0);
};

type Selection = { role: number; department?: string; studentId?: string };

export const TestLogin = ({ accounts = [] }: { accounts?: MockLoginAccount[] }) => {
  const router = useRouter();
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const [selection, setSelection] = useState<Selection>(() => ({
    role: pickDefaultRole(safeAccounts),
  }));
  const [manualStudentId, setManualStudentId] = useState("");

  if (safeAccounts.length === 0) return null;

  const availableRoles = ROLE_ORDER.filter((role) =>
    safeAccounts.some((account) => account.role === role),
  );
  const roleAccounts = safeAccounts.filter(
    (account) => account.role === selection.role,
  );
  const needsDepartment = DEPARTMENT_ROLES.has(selection.role);
  const departmentOptions = needsDepartment
    ? DEPARTMENT_ORDER.filter((department) =>
        roleAccounts.some((account) => account.department === department),
      )
    : [];
  /* 选择失效（切换身份后）自动回落到第一个可用值，避免额外的重置逻辑 */
  const department =
    selection.department && departmentOptions.includes(selection.department)
      ? selection.department
      : (departmentOptions[0] ?? undefined);
  const candidates = needsDepartment
    ? roleAccounts.filter((account) => account.department === department)
    : roleAccounts;
  const resolved =
    candidates.find((account) => account.studentId === selection.studentId) ??
    candidates[0] ??
    null;

  const runLogin = async (studentId: string) =>
    toast
      .promise(
        async () => {
          const formData = new FormData();
          formData.set("studentId", studentId);
          await loginWithMockLinkUser(formData);
          router.push("/dashboard");
        },
        {
          loading: "登录中",
          success: "登录成功",
          error: "登录失败，请检查测试学号。",
        },
      )
      .unwrap();

  return (
    <div className="flex w-full flex-col gap-4">
      <Separator className="w-full bg-[#dbe5da]" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#18231d]">使用测试帐号登入</p>
        <p className="text-xs text-[#66756c]">
          选择身份与部门（或账号）后直接登录，仅本地 Link mock 环境可见。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mock-login-role" className="text-xs text-[#66756c]">
            身份
          </Label>
          <Select
            value={String(selection.role)}
            onValueChange={(value) =>
              setSelection({ role: Number(value) })
            }
          >
            <SelectTrigger
              id="mock-login-role"
              className="h-11 w-full border-[#dbe5da] bg-white text-[#18231d]"
            >
              <SelectValue placeholder="选择身份" />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((role) => (
                <SelectItem key={role} value={String(role)}>
                  {roleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needsDepartment && departmentOptions.length > 0 ? (
          <div className="space-y-1.5">
            <Label
              htmlFor="mock-login-department"
              className="text-xs text-[#66756c]"
            >
              部门
            </Label>
            <Select
              value={department}
              onValueChange={(value) =>
                setSelection((current) => ({
                  ...current,
                  department: value,
                  studentId: undefined,
                }))
              }
            >
              <SelectTrigger
                id="mock-login-department"
                className="h-11 w-full border-[#dbe5da] bg-white text-[#18231d]"
              >
                <SelectValue placeholder="选择部门" />
              </SelectTrigger>
              <SelectContent>
                {departmentOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {departmentLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="mock-login-account" className="text-xs text-[#66756c]">
              账号
            </Label>
            <Select
              value={resolved?.studentId ?? ""}
              onValueChange={(value) =>
                setSelection((current) => ({ ...current, studentId: value }))
              }
            >
              <SelectTrigger
                id="mock-login-account"
                className="h-11 w-full border-[#dbe5da] bg-white text-[#18231d]"
              >
                <SelectValue placeholder="选择账号" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((account) => (
                  <SelectItem key={account.studentId} value={account.studentId}>
                    {accountOptionLabel(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 同一部门有多个账号（如两位部员）时再选具体账号 */}
      {needsDepartment && candidates.length > 1 && (
        <div className="space-y-1.5">
          <Label
            htmlFor="mock-login-account-variant"
            className="text-xs text-[#66756c]"
          >
            账号
          </Label>
          <Select
            value={resolved?.studentId ?? ""}
            onValueChange={(value) =>
              setSelection((current) => ({ ...current, studentId: value }))
            }
          >
            <SelectTrigger
              id="mock-login-account-variant"
              className="h-11 w-full border-[#dbe5da] bg-white text-[#18231d]"
            >
              <SelectValue placeholder="选择账号" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((account) => (
                <SelectItem key={account.studentId} value={account.studentId}>
                  {accountOptionLabel(account)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <form
        action={async () => {
          if (!resolved) return;
          await runLogin(resolved.studentId);
        }}
        className="flex flex-col gap-2"
      >
        <p className="text-xs leading-5 text-[#66756c]">
          {resolved
            ? `将使用 ${resolved.studentId} · ${resolved.name}（${accountSummary(resolved)}）登录`
            : "请选择身份与部门"}
        </p>
        <FormContentWithStatus disabled={!resolved} />
      </form>

      <details className="group text-xs text-[#66756c]">
        <summary className="cursor-pointer select-none hover:text-[#18231d]">
          手动输入学号
        </summary>
        <form
          action={async () => {
            await runLogin(manualStudentId);
          }}
          className="mt-2 flex w-full flex-col gap-2 sm:flex-row"
        >
          <Input
            type="text"
            value={manualStudentId}
            onChange={(event) => setManualStudentId(event.target.value)}
            placeholder="例如 B44444444"
            className="h-11 border-[#dbe5da] bg-white text-[#18231d] placeholder:text-[#8a968e] focus-visible:ring-[#18A058]/30"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!manualStudentId.trim()}
            className="h-11 shrink-0 border-[#dbe5da]"
          >
            登录该学号
          </Button>
        </form>
      </details>
    </div>
  );
};

const FormContentWithStatus = ({ disabled }: { disabled?: boolean }) => {
  const formStatus = useFormStatus();
  return (
    <Button
      loading={formStatus.pending}
      disabled={disabled || formStatus.pending}
      type="submit"
      className="m-0 h-11 w-full shrink-0 sm:w-auto"
    >
      登录 <ArrowRight />
    </Button>
  );
};
