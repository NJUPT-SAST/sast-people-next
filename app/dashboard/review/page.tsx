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
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <MannualInput />
              <Separator />
              <p className="text-xs leading-5 text-muted-foreground">
                建议先设置阅卷范围，再开始扫描。扫码识别到考生后会先展示学号、姓名和专业供你确认。
              </p>
            </div>
            <div>
              <QRCodeScanner />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Review;
