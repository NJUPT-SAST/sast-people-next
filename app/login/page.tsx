import { FeishuRedirect } from "@/components/feishuInject";
import { LinkLogin } from "@/components/linkLogin";
import BlurIn from "@/components/magicui/blur-in";
import FlickeringGrid from "@/components/magicui/flickering-grid";
import { TestLogin } from "@/components/testLogin";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

const Login = async () => {
  return (
    <>
      <div className="min-h-screen w-screen flex flex-col lg:grid lg:grid-cols-5 bg-gray-50 lg:bg-white selection:bg-[#18A058] selection:text-white">
        <div className="relative bg-[#18A058] text-white col-span-3 px-8 pt-12 pb-24 lg:p-12 flex lg:justify-center flex-col z-0 overflow-hidden shrink-0">
          <div className="z-10 mb-8 lg:absolute lg:top-10 lg:left-12 lg:mb-0">
            <Image
              src="/images/white-logo.png"
              alt="SAST Logo"
              width={120}
              height={60}
              className="w-24 lg:w-[120px]"
            />
          </div>
          <div className="space-y-3 lg:space-y-4 z-10 lg:pl-16">
            <BlurIn
              word="开源平等"
              className="text-left text-4xl lg:text-8xl tracking-widest font-serif font-bold text-white drop-shadow-sm"
            />
            <BlurIn
              word="薪火相传"
              className="text-left text-4xl lg:text-8xl tracking-widest font-serif font-bold text-white drop-shadow-sm"
              delay={0.3}
            />
          </div>
          <div className="absolute inset-0 pointer-events-none">
            <FlickeringGrid
              className="z-0 absolute inset-0 [mask:radial-gradient(ellipse_at_80%_0%,#fff_250px,transparent_75%)] lg:[mask:radial-gradient(ellipse_at_60%_50%,#fff_400px,transparent_70%)] opacity-80"
              squareSize={4}
              gridGap={5}
              color="#ffffff"
              maxOpacity={0.25}
              flickerChance={0.03}
            />
          </div>
        </div>
        <div className="flex-1 flex justify-start lg:justify-center items-center flex-col gap-8 col-span-1 lg:col-span-2 px-5 lg:px-6 -mt-10 lg:mt-0 z-10 pb-12">
          <Card className="w-full max-w-md border-0 lg:border lg:shadow-xl lg:shadow-black/5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] bg-white animate-in fade-in slide-in-from-bottom-4 duration-700">
            <CardContent className="flex flex-col items-center gap-8 pt-10 pb-10">
              <div className="flex gap-2 flex-col items-center">
                <div className="text-2xl font-semibold tracking-tight text-gray-900">登录到 SAST Pass</div>
                <div className="text-sm text-gray-500">
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
