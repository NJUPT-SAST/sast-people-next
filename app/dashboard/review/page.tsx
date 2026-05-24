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
              <div className="p-4 lg:p-6">
                <QRCodeScanner />
              </div>
              <div className="border-t p-4 lg:p-6 bg-muted/10">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <MannualInput />
                  <p className="text-xs text-muted-foreground shrink-0">
                    建议先设置上方【阅卷范围】，再开始阅卷。
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Review;
