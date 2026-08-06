import { PageHeader, PageTitle } from "@/components/route";
import React from "react";
import QRCodeScanner from "@/components/review/qrcodeScanner";
import { MannualInput } from "@/components/review/mannualInput";
import { SelectProblemServer } from "./selectProblem";
import {
  ReviewRangeNotice,
  SelectedRangeDisplay,
} from "@/components/review/selectedRangeDisplay";
import { ReviewSheet } from "@/components/review/reviewSheet";
import { useFlowList as getFlowList } from "@/hooks/useFlowList";

const Review: React.FC = async () => {
  const flowList = await getFlowList();
  const activeFlowIds = flowList.map((flow) => flow.id);

  return (
    <>
      <PageHeader className="border-b pb-4">
        <PageTitle />
        <div className="w-full sm:w-auto">
          <ReviewSheet>
            <SelectProblemServer flowList={flowList} />
          </ReviewSheet>
        </div>
      </PageHeader>
      <div className="mt-6 flex flex-col gap-8">
        <section className="px-4 lg:px-6">
          <SelectedRangeDisplay activeFlowIds={activeFlowIds} />
        </section>
        <section className="bg-muted/20">
          <header className="px-4 pb-4 pt-5 lg:px-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">开始阅卷</p>
              <p className="text-sm text-muted-foreground">
                使用摄像头扫码识别考生，或手动输入学号后进入评分。
              </p>
            </div>
          </header>
          <div className="flex flex-col">
            <ReviewRangeNotice activeFlowIds={activeFlowIds} />
            <div className="px-4 pb-4 pt-0 lg:px-6 lg:pb-6">
              <QRCodeScanner activeFlowIds={activeFlowIds} />
            </div>
            <div className="px-4 pb-6 pt-2 lg:px-6 lg:pb-8 lg:pt-3">
              <MannualInput activeFlowIds={activeFlowIds} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default Review;
