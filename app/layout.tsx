import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sourceHanSansHeavy = localFont({
  src: "../public/fonts/SourceHanSansSC-Heavy.otf",
  variable: "--font-source-han-sans-heavy",
  display: "swap"
});

const sourceHanSerifHeavy = localFont({
  src: "../public/fonts/SourceHanSerifSC-Heavy.otf",
  variable: "--font-source-han-serif-heavy",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Lyric Glass Card",
  description: "Create premium lyric share cards from manual lyrics and song metadata."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceHanSansHeavy.variable} ${sourceHanSerifHeavy.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
