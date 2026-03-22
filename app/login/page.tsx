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
      <div className="h-screen w-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="h-full relative bg-primary text-white hidden col-span-1 p-5 lg:flex justify-center flex-col">
          <div className="absolute top-5 left-5">
            <Image
              src="/images/white-logo.png"
              alt="SAST Logo"
              width={100}
              height={50}
            />
          </div>
          <div className="space-y-4 *:font-light *:font-sans z-10">
            <BlurIn word="开源平等" />
            <BlurIn word="薪火相传" />
          </div>
          <div className="absolute bottom-[40px] right-[-10vw] w-full h-full">
            <div className="relative size-[1000px] border-none rounded-lg w-full overflow-hidden border">
              <FlickeringGrid
                className="z-0 absolute inset-0 [mask:radial-gradient(circle_at_center,#fff_300px,transparent_0)]"
                squareSize={4}
                gridGap={5}
                color="#ffffff"
                maxOpacity={0.5}
                flickerChance={0.1}
                height={1000}
                width={1000}
              />
            </div>
          </div>
        </div>
        <div className="h-full flex justify-center items-center flex-col gap-8 col-span-1 px-6">
          <Card className="w-full max-w-sm border-0 shadow-none lg:border lg:shadow-sm">
            <CardContent className="flex flex-col items-center gap-8 pt-6">
              <div className="flex items-center gap-2 lg:hidden text-primary">
                <TicketsPlane className="h-8 w-8" />
              </div>
              <div className="flex gap-2 flex-col items-center">
                <div className="text-2xl font-semibold">登录到 SAST Pass</div>
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
