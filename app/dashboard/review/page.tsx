import { PageTitle } from "@/components/route";
import React, { Suspense } from "react";
import QRCodeScanner from "@/components/review/qrcodeScanner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MannualInput } from "@/components/review/mannualInput";
import { SelectProblemServer } from "./selectProblem";
import { Loading } from "@/components/loading";
import { SelectedRangeDisplay } from "@/components/review/selectedRangeDisplay";
import { ReviewSheet } from "@/components/review/reviewSheet";

const Review: React.FC = async () => {
  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle />
        <ReviewSheet>
          <Suspense fallback={<Loading />}>
            <SelectProblemServer />
          </Suspense>
        </ReviewSheet>
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <SelectedRangeDisplay />
          </CardHeader>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">开始阅卷</p>
              <p className="text-sm text-muted-foreground">
                使用摄像头扫码识别考生，或手动输入学号后进入评分。
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col">
              <div className="mx-4 mt-3 mb-5 lg:mx-6 lg:mt-4 lg:mb-6 rounded-md border bg-amber-50 px-4 py-3 text-center dark:bg-amber-950/20">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  请先设置上方【阅卷范围】，再开始阅卷。
                </p>
              </div>
              <div className="p-4 lg:p-6 pt-0">
                <QRCodeScanner />
              </div>
              <div className="border-t p-4 lg:p-6 bg-muted/10">
                <MannualInput />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Review;
