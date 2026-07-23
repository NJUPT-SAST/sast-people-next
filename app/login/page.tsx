import { LinkLogin } from "@/components/linkLogin";
import BlurIn from "@/components/magicui/blur-in";
import FlickeringGrid from "@/components/magicui/flickering-grid";
import { TestLogin } from "@/components/testLogin";
import Image from "next/image";
import "@fontsource/ma-shan-zheng/chinese-simplified.css";

const sloganFontFamily =
  '"Ma Shan Zheng", "STXingkai", "华文行楷", "FZYaoti", cursive';

const highlights = [
  { label: "流程招新", desc: "笔试 / 免试 / WOC" },
  { label: "面评协作", desc: "讲师面评 · 终审" },
  { label: "统一身份", desc: "SAST Link 认证" },
] as const;

const Login = async () => {
  return (
    <main className="min-h-dvh bg-[#f3f1eb] text-[#141816]">
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.08fr)_minmax(400px,0.92fr)]">
        <section className="relative flex min-h-[42vh] flex-col overflow-hidden bg-[#0f3d28] px-7 pb-16 pt-[max(2rem,env(safe-area-inset-top))] text-white sm:min-h-[48vh] sm:px-10 lg:min-h-dvh lg:justify-between lg:px-14 lg:pb-12 lg:pt-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(52,211,153,0.28),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgba(24,160,88,0.35),transparent_50%),linear-gradient(160deg,#125c38_0%,#0b2f1f_55%,#082318_100%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_78%)]"
          />
          <div className="pointer-events-none absolute inset-0">
            <FlickeringGrid
              className="absolute inset-0 opacity-50 [mask:radial-gradient(ellipse_at_70%_20%,#fff_180px,transparent_72%)] lg:[mask:radial-gradient(ellipse_at_55%_45%,#fff_360px,transparent_70%)]"
              squareSize={3}
              gridGap={6}
              color="#d1fae5"
              maxOpacity={0.22}
              flickerChance={0.02}
            />
          </div>

          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/images/sast-logo-white.png"
                alt="SAST"
                width={120}
                height={60}
                priority
                className="h-9 w-auto sm:h-11"
              />
              <div className="hidden h-8 w-px bg-white/20 sm:block" />
              <p className="hidden text-[11px] tracking-[0.22em] text-white/70 uppercase sm:block">
                People
              </p>
            </div>
            <p className="text-[11px] tracking-[0.16em] text-white/55 uppercase">
              NJUPT SAST
            </p>
          </div>

          <div className="relative z-10 mt-12 space-y-8 lg:mt-0 lg:max-w-xl">
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-[0.22em] text-emerald-200/80 uppercase">
                Campus Talent Platform
              </p>
              <div className="space-y-1 sm:space-y-2">
                <BlurIn
                  word="开源平等"
                  className="text-left text-[2.75rem] leading-[1.05] tracking-[0.06em] text-white sm:text-6xl lg:text-7xl xl:text-8xl"
                  style={{
                    fontFamily: sloganFontFamily,
                    textShadow: "0 18px 50px rgba(0,0,0,0.28)",
                  }}
                />
                <BlurIn
                  word="薪火相传"
                  className="text-left text-[2.75rem] leading-[1.05] tracking-[0.06em] text-white/95 sm:text-6xl lg:translate-x-10 lg:text-7xl xl:text-8xl"
                  delay={0.28}
                  style={{
                    fontFamily: sloganFontFamily,
                    textShadow: "0 18px 50px rgba(0,0,0,0.28)",
                  }}
                />
              </div>
            </div>

            <p className="max-w-md text-sm leading-7 text-white/72 sm:text-[15px]">
              南京邮电大学校科协人事与招新平台。统一报名、阅卷、面评与录取通知，
              让每一次加入都清晰可追踪。
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-3 backdrop-blur-[2px]"
                >
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/55">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 mt-10 hidden text-xs tracking-wide text-white/40 lg:mt-0 lg:block">
            身份认证由 SAST Link 提供
          </p>
        </section>

        <section className="relative flex items-center justify-center px-5 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(24,160,88,0.08),transparent_40%)]"
          />

          <div className="relative w-full max-w-[420px]">
            <div className="mb-8 space-y-2 lg:mb-10">
              <div className="flex items-center gap-2.5">
                <Image
                  src="/images/crocodile-transparent.png"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 object-contain"
                  priority
                />
                <p className="text-sm font-medium tracking-tight text-[#18231d]">
                  SAST People
                </p>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#e4e7df] bg-white/90 p-6 shadow-[0_30px_80px_rgba(20,24,22,0.08)] backdrop-blur-sm sm:p-8">
              <div className="space-y-2.5">
                <h1 className="text-[1.65rem] font-semibold tracking-tight text-[#141816] sm:text-[1.85rem]">
                  登录人事平台
                </h1>
                <p className="text-sm leading-6 text-[#66756c]">
                  使用 SAST Link 完成身份认证后进入工作台。
                </p>
              </div>

              <div className="mt-8 space-y-5">
                <LinkLogin isBinding={false} />
                <p className="text-center text-[11px] leading-5 text-[#8a968e]">
                  登录即表示你将以校科协成员或候选人身份使用本系统
                </p>
                {process.env.NODE_ENV === "development" && <TestLogin />}
              </div>
            </div>

            <p className="mt-6 text-center text-[11px] text-[#8a968e]">
              南京邮电大学大学生科学技术协会
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Login;
