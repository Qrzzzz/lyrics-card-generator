import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lyric Card Generator",
  description: "Generate premium Apple Music-style lyric share images from manual lyrics and song metadata."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
