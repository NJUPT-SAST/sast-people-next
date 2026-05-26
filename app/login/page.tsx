import { FeishuRedirect } from "@/components/feishuInject";
import { LinkLogin } from "@/components/linkLogin";
import BlurIn from "@/components/magicui/blur-in";
import FlickeringGrid from "@/components/magicui/flickering-grid";
import { TestLogin } from "@/components/testLogin";
import { Card, CardContent } from "@/components/ui/card";
import { Inter } from "next/font/google";
import Image from "next/image";

const inter = Inter({
  subsets: ["latin"],
});

const Login = async () => {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap"
      />
      <main className={`${inter.className} min-h-dvh bg-[#f4f6f2] text-[#18231d]`}>
        <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)]">
          <section className="relative flex min-h-[320px] flex-col overflow-hidden bg-[#18A058] px-8 pb-20 pt-10 text-white sm:min-h-[380px] lg:min-h-dvh lg:justify-center lg:p-12">
            <div className="relative z-10 mb-10 lg:absolute lg:left-12 lg:top-10 lg:mb-0">
              <Image
                src="/images/white-logo.png"
                alt="SAST Logo"
                width={120}
                height={60}
                priority
                className="w-24 lg:w-[120px]"
              />
            </div>

            <div className="relative z-10 space-y-3 lg:space-y-5 lg:pl-16">
              <div className="absolute -left-4 top-1/2 hidden -translate-y-1/2 text-[10rem] font-semibold leading-none text-white/8 lg:block">
                SAST
              </div>
              <BlurIn
                word="开源平等"
                className="relative text-left text-5xl leading-tight tracking-[0.14em] text-white sm:text-6xl lg:-rotate-2 lg:text-8xl lg:tracking-[0.18em]"
                style={{
                  fontFamily: '"Ma Shan Zheng", cursive',
                  fontWeight: 400,
                  textShadow:
                    "0 2px 0 rgba(0,0,0,0.08), 0 18px 45px rgba(0,0,0,0.18)",
                }}
              />
              <BlurIn
                word="薪火相传"
                className="relative text-left text-5xl leading-tight tracking-[0.14em] text-white sm:text-6xl lg:translate-x-12 lg:rotate-1 lg:text-8xl lg:tracking-[0.18em]"
                delay={0.3}
                style={{
                  fontFamily: '"Ma Shan Zheng", cursive',
                  fontWeight: 400,
                  textShadow:
                    "0 2px 0 rgba(0,0,0,0.08), 0 18px 45px rgba(0,0,0,0.18)",
                }}
              />
            </div>

            <div className="pointer-events-none absolute inset-0">
              <FlickeringGrid
                className="absolute inset-0 opacity-80 [mask:radial-gradient(ellipse_at_80%_0%,#fff_250px,transparent_75%)] lg:[mask:radial-gradient(ellipse_at_60%_50%,#fff_400px,transparent_70%)]"
                squareSize={4}
                gridGap={5}
                color="#ffffff"
                maxOpacity={0.25}
                flickerChance={0.03}
              />
            </div>
          </section>

          <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
            <div className="w-full max-w-[420px]">
              <Card className="rounded-3xl border-[#dbe5da] bg-white shadow-[0_24px_70px_rgba(24,33,27,0.08)]">
                <CardContent className="flex flex-col gap-8 p-6 sm:p-8">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-[#18A058]">Welcome back</p>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#18231d]">
                      登录到 SAST Pass
                    </h2>
                    <p className="text-sm leading-6 text-[#66756c]">
                      使用 SAST Link 完成身份认证。
                    </p>
                  </div>

                  <LinkLogin isBinding={false} />
                  {process.env.NODE_ENV === "development" && <TestLogin />}
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
      <FeishuRedirect />
    </>
  );
};

export default Login;
