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
          <SheetContent className="w-full md:w-3/4">
            <SheetHeader className="text-2xl font-semibold">
              <SheetTitle>设置阅卷范围</SheetTitle>
            </SheetHeader>
            <Suspense fallback={<Loading />}>
              <SelectProblemServer />
            </Suspense>
          </SheetContent>
        </Sheet>
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <SelectedRangeDisplay />
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">开始阅卷</p>
              <p className="text-sm text-muted-foreground">
                支持手动输入学号或扫码识别，确认考生信息后进入评分页面。
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8 items-start">
              <div className="flex flex-col gap-6 rounded-xl border border-border/50 bg-background p-6 shadow-sm">
                <MannualInput />
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground bg-muted/40 p-4 rounded-lg border border-border/50">
                  <strong className="font-semibold text-foreground">💡 建议与提示：</strong><br />
                  建议先设置上方的【阅卷范围】，再开始扫描。扫码识别到考生后会显示学号、姓名等基础信息供你二次确认。
                </p>
              </div>
              <div className="flex flex-col min-w-0 rounded-xl border border-border/50 bg-background p-6 shadow-sm h-full">
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
