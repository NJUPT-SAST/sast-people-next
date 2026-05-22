import { PageTitle } from "@/components/route";
import { Button } from "@/components/ui/button";
import React, { Suspense } from "react";
import QRCodeScanner from "@/components/review/qrcodeScanner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MannualInput } from "@/components/review/mannualInput";
import { SelectProblemServer } from "./selectProblem";
import { Loading } from "@/components/loading";
import { SelectedRangeDisplay } from "@/components/review/selectedRangeDisplay";
import { Separator } from "@/components/ui/separator";

const Review: React.FC = async () => {
  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle />
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline">
              设置阅卷范围
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:w-3/4 sm:max-w-2xl overflow-y-auto p-4 sm:p-6 flex flex-col">
            <SheetHeader className="text-2xl font-semibold px-2 pt-2 pb-2">
              <SheetTitle>设置阅卷范围</SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-32">
              <Suspense fallback={<Loading />}>
                <SelectProblemServer />
              </Suspense>
            </div>
          </SheetContent>
        </Sheet>
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
                支持手动输入学号或扫码识别，确认考生信息后进入评分页面。
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-border">
              <div className="flex flex-col gap-8 p-6 lg:p-8 lg:w-[380px] xl:w-[420px] bg-muted/10 shrink-0">
                <MannualInput />
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 rounded-l-xl" />
                  <p className="text-xs text-primary flex items-center gap-1.5 mb-2 font-semibold">
                    建议与提示
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    建议先设置上方的【阅卷范围】，再开始扫描。扫码识别到考生后会显示学号、姓名等基础信息供你二次确认。
                  </p>
                </div>
              </div>
              <div className="flex-1 p-6 lg:p-8 min-w-0 flex flex-col justify-center">
                <QRCodeScanner />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Review;
