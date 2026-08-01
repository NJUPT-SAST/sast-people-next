import { LinkLogin } from "@/components/linkLogin";
import BlurIn from "@/components/magicui/blur-in";
import FlickeringGrid from "@/components/magicui/flickering-grid";
import { TestLogin } from "@/components/testLogin";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import "@fontsource/ma-shan-zheng/chinese-simplified.css";

const sloganFontFamily =
  '"Ma Shan Zheng", "STXingkai", "华文行楷", "FZYaoti", cursive';

const Login = async () => {
  return (
    <main className="min-h-dvh bg-[#f5f7f3] px-safe text-[#18231d]">
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <section className="relative flex min-h-[320px] flex-col overflow-hidden bg-[#18A058] px-8 pb-16 pt-[max(2.5rem,env(safe-area-inset-top))] text-white sm:min-h-[380px] lg:min-h-dvh lg:justify-center lg:p-12 lg:pt-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,255,255,0.16),transparent_45%),linear-gradient(165deg,#1bb366_0%,#18A058_45%,#148f4d_100%)]"
          />

          <div className="relative z-10 mb-10 lg:absolute lg:left-12 lg:top-10 lg:mb-0">
            <Image
              src="/images/sast-logo-white.png"
              alt="SAST Logo"
              width={120}
              height={60}
              priority
              className="w-24 lg:w-[120px]"
            />
          </div>

          <div className="relative z-10 space-y-3 lg:space-y-5 lg:pl-16">
            <div className="absolute -left-4 top-1/2 hidden -translate-y-1/2 text-[10rem] font-semibold leading-none text-white/[0.07] lg:block">
              SAST
            </div>
            <BlurIn
              word="开源平等"
              className="relative text-left text-5xl leading-tight tracking-[0.04em] text-white sm:text-7xl lg:-translate-x-4 lg:text-8xl"
              style={{
                fontFamily: sloganFontFamily,
                textShadow:
                  "0 2px 0 rgba(0,0,0,0.05), 0 16px 40px rgba(0,0,0,0.16)",
              }}
            />
            <BlurIn
              word="薪火相传"
              className="relative text-left text-5xl leading-tight tracking-[0.04em] text-white sm:text-7xl lg:translate-x-14 lg:text-8xl"
              delay={0.3}
              style={{
                fontFamily: sloganFontFamily,
                textShadow:
                  "0 2px 0 rgba(0,0,0,0.05), 0 16px 40px rgba(0,0,0,0.16)",
              }}
            />
          </div>

          <div className="pointer-events-none absolute inset-0">
            <FlickeringGrid
              className="absolute inset-0 opacity-70 [mask:radial-gradient(ellipse_at_80%_0%,#fff_250px,transparent_75%)] lg:[mask:radial-gradient(ellipse_at_60%_50%,#fff_400px,transparent_70%)]"
              squareSize={4}
              gridGap={5}
              color="#ffffff"
              maxOpacity={0.2}
              flickerChance={0.025}
            />
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-10">
          <div className="w-full max-w-[400px]">
            <div className="mb-6 flex items-center gap-2.5 px-1">
              <Image
                src="/images/crocodile-transparent.png"
                alt=""
                width={32}
                height={32}
                className="size-8 object-contain"
                priority
              />
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-tight text-[#18231d]">
                  SAST People
                </p>
                <p className="text-[11px] text-[#7a877f]">成员与组织平台</p>
              </div>
            </div>

            <Card className="rounded-[1.5rem] border-[#e2e8df] bg-white shadow-[0_18px_50px_rgba(24,33,27,0.07)]">
              <CardContent className="flex flex-col gap-7 p-6 sm:p-8">
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-[#18A058]">
                    欢迎回来
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight text-[#18231d]">
                    登录 SAST People
                  </h1>
                  <p className="text-sm leading-6 text-[#66756c]">
                    使用 SAST Link 完成身份认证后进入工作台。
                  </p>
                </div>

                <LinkLogin isBinding={false} />
                {process.env.NODE_ENV === "development" && <TestLogin />}
              </CardContent>
            </Card>

            <p className="mt-6 text-center text-[11px] leading-5 text-[#8a968e]">
              南京邮电大学大学生科学技术协会
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Login;
