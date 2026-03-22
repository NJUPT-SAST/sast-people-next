import { FeishuRedirect } from "@/components/feishuInject";
import { LinkLogin } from "@/components/linkLogin";
import BlurIn from "@/components/magicui/blur-in";
import FlickeringGrid from "@/components/magicui/flickering-grid";
import { TestLogin } from "@/components/testLogin";
import { Card, CardContent } from "@/components/ui/card";
import { TicketsPlane } from "lucide-react";
import Image from "next/image";

const Login = async () => {
  return (
    <>
      <div className="h-screen w-screen grid grid-cols-1 lg:grid-cols-5">
        <div className="h-full relative bg-emerald-950 text-white hidden col-span-3 p-5 lg:flex justify-center flex-col">
          <div className="absolute top-8 left-8 z-10">
            <Image
              src="/images/white-logo.png"
              alt="SAST Logo"
              width={120}
              height={60}
            />
          </div>
          <div className="space-y-4 z-10 pl-12">
            <BlurIn
              word="开源平等"
              className="text-left lg:text-8xl tracking-widest font-serif font-bold"
            />
            <BlurIn
              word="薪火相传"
              className="text-left lg:text-8xl tracking-widest font-serif font-bold"
              delay={0.3}
            />
          </div>
          <div className="absolute inset-0 overflow-hidden">
            <FlickeringGrid
              className="z-0 absolute inset-0 [mask:radial-gradient(ellipse_at_60%_50%,#fff_400px,transparent_70%)]"
              squareSize={4}
              gridGap={5}
              color="#6ee7b7"
              maxOpacity={0.15}
              flickerChance={0.03}
            />
          </div>
        </div>
        <div className="h-full flex justify-center items-center flex-col gap-8 col-span-1 lg:col-span-2 px-6">
          <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-lg lg:rounded-2xl">
            <CardContent className="flex flex-col items-center gap-8 pt-8 pb-10">
              <div className="flex items-center gap-2 lg:hidden text-green-700">
                <TicketsPlane className="h-8 w-8" />
              </div>
              <div className="flex gap-3 flex-col items-center">
                <div className="text-3xl font-semibold">登录到 SAST Pass</div>
                <div className="text-sm text-muted-foreground">
                  开启你的科协之旅
                </div>
              </div>
              <LinkLogin isBinding={false} />
              {process.env.NODE_ENV === "development" && <TestLogin />}
            </CardContent>
          </Card>
        </div>
      </div>
      <FeishuRedirect />
    </>
  );
};

export default Login;
