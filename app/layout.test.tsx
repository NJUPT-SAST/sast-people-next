jest.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Noto_Serif_SC: () => ({ variable: "--font-noto-serif-sc" }),
}));

jest.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-theme-provider="true">{children}</div>,
}));

import { renderToStaticMarkup } from "react-dom/server";
import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("exports metadata used by Next.js", () => {
    expect(metadata).toMatchObject({
      title: "SAST 招新",
      description: "南京邮电大学大学生科学技术协会招新平台",
    });
  });

  it("renders html/body with font variables and children", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>content</main>
      </RootLayout>
    );

    expect(markup).toContain('<html lang="zh-cn">');
    expect(markup).toContain("--font-geist-sans");
    expect(markup).toContain("--font-geist-mono");
    expect(markup).toContain("--font-noto-serif-sc");
    expect(markup).toContain("antialiased");
    expect(markup).toContain('data-theme-provider="true"');
    expect(markup).toContain("<main>content</main>");
  });
});
