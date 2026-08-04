import type { Metadata } from "next";
import { Gowun_Batang, Raleway } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"


const gowunBatang = Gowun_Batang({
  variable: "--font-gowun-batang",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const karla = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cache",
  description: "Capture now. Learn later.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${gowunBatang.variable} ${karla.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
