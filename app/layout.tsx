import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lyric Card Generator",
  description: "Create Apple Music-style lyric share images from lyrics and song information."
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
