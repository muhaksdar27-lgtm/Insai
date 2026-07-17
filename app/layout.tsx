import type { Metadata } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import Navigation from "@/components/navigation";
import TimeDisplay from "@/components/time-display";
import ConnectionStatus from "@/components/connection-status";
import { SSEProvider } from "@/components/sse-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "INSAI Trading",
  description: "INSAI Trading Application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body
        className="bg-[#050505] text-zinc-50 flex flex-col min-h-screen font-sans selection:bg-blue-500/30"
      >
        <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(59,130,246,0.15),rgba(255,255,255,0))]" />
        <SSEProvider>
          <header className="flex items-center justify-between px-6 h-16 border-b border-white/5 bg-black/40 backdrop-blur-2xl sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                <span className="font-bold text-[13px] tracking-wide text-white">I</span>
              </div>
              <h1 className="font-bold text-[12px] tracking-widest text-zinc-100 uppercase">
                INSAI <span className="text-blue-400">Trading</span>
              </h1>
              <span className="hidden md:inline text-[9px] text-zinc-500 tracking-widest uppercase border-l border-white/10 pl-4">
                AI Signal Engine
              </span>
            </div>
            <div className="flex items-center gap-6">
              <ConnectionStatus />
              <div className="h-6 w-px bg-white/10 hidden md:block"></div>
              <TimeDisplay />
            </div>
          </header>
          <div className="flex flex-1">
            <Navigation />
            <main className="flex-1 overflow-y-auto pb-24 md:pb-8 md:pl-[240px] pt-6 px-4 md:px-8 max-w-[1600px] mx-auto w-full">
              {children}
            </main>
          </div>
        </SSEProvider>
      </body>
    </html>
  );
}
