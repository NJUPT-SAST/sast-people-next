import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewCandidateDialog } from "./reviewCandidateDialog";

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ReviewCandidateDialog", () => {
  it("shows the shared field set so scan and manual entry look the same", () => {
    render(
      <ReviewCandidateDialog
        open
        onOpenChange={jest.fn()}
        candidate={{
          name: "许清和",
          studentId: "B24000001",
          college: "通信与信息工程学院",
          major: "通信工程",
        }}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.getByText("确认考生信息")).toBeInTheDocument();
    expect(screen.getByText("请核对姓名、学号与试卷一致，确认后进入该考生的评分页。")).toBeInTheDocument();
    expect(screen.getByText("姓名")).toBeInTheDocument();
    expect(screen.getByText("许清和")).toBeInTheDocument();
    expect(screen.getByText("学号")).toBeInTheDocument();
    expect(screen.getByText("B24000001")).toBeInTheDocument();
    expect(screen.getByText("学院")).toBeInTheDocument();
    expect(screen.getByText("通信与信息工程学院")).toBeInTheDocument();
    expect(screen.getByText("专业")).toBeInTheDocument();
    expect(screen.getByText("通信工程")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认并开始阅卷" })).toBeInTheDocument();
  });

  it("hides 学院 when the entry point could not resolve it and fills 未填写", () => {
    render(
      <ReviewCandidateDialog
        open
        onOpenChange={jest.fn()}
        candidate={{ name: null, studentId: null }}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.queryByText("学院")).not.toBeInTheDocument();
    expect(screen.getAllByText("未填写")).toHaveLength(3);
  });

  it("confirms and cancels through the dialog callbacks", async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <ReviewCandidateDialog
        open
        onOpenChange={onOpenChange}
        candidate={{ name: "许清和", studentId: "B24000001" }}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "确认并开始阅卷" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
