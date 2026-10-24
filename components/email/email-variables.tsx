"use client";

import { Braces } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 模板里可以引用的变量：发送时由系统替换成真实值。
 *
 * `key` 就是 `{key}` 里的名字；`group` 用来在菜单里分段（运行时数据 / 模板字段）。
 */
export type EmailTemplateVariable = {
  key: string;
  label: string;
  group: string;
  example?: string;
};

const EmailVariablesContext = createContext<readonly EmailTemplateVariable[]>([]);

export function EmailVariablesProvider({
  variables,
  children,
}: {
  variables: readonly EmailTemplateVariable[];
  children: ReactNode;
}) {
  return (
    <EmailVariablesContext.Provider value={variables}>{children}</EmailVariablesContext.Provider>
  );
}

export function useEmailTemplateVariables() {
  return useContext(EmailVariablesContext);
}

/**
 * 浮动工具条里的「变量」入口。
 *
 * 以前变量只能靠人记住名字手打 `{flowName}`；这里把当前模板真正认得的变量列出来，
 * 点一下插到光标处（`insertContent` 走的是编辑器命令，选区由 ProseMirror 自己保住）。
 */
export function EmailVariableMenu({ editor }: { editor: Editor }) {
  const variables = useEmailTemplateVariables();
  if (variables.length === 0) return null;

  const groups: Array<{ group: string; items: EmailTemplateVariable[] }> = [];
  for (const variable of variables) {
    const existing = groups.find((item) => item.group === variable.group);
    if (existing) existing.items.push(variable);
    else groups.push({ group: variable.group, items: [variable] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="插入变量"
          title="插入变量（发送时替换为真实值）"
          className="shrink-0"
        >
          <Braces />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          插入变量：发送时替换成真实值
        </DropdownMenuLabel>
        {groups.map((group, index) => (
          <div key={group.group}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              {group.group}
            </DropdownMenuLabel>
            {group.items.map((variable) => (
              <DropdownMenuItem
                key={variable.key}
                onSelect={() =>
                  editor.chain().focus().insertContent(`{${variable.key}}`).run()
                }
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{variable.label}</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {`{${variable.key}}`}
                    {variable.example ? ` · 例：${variable.example}` : ""}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
