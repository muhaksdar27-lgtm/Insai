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
        className="bg-[#050505] text-zinc-50 flex flex-col min-h-screen font-sans selection:bg-blue-500/30 overflow-x-hidden"
      >
        <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(59,130,246,0.15),rgba(255,255,255,0))]" />
        <SSEProvider>
          <header className="flex items-center justify-between px-3 h-9 border-b border-white/10 bg-black/60 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded flex items-center justify-center border border-blue-500/30 bg-blue-500/10 text-blue-400 font-mono font-black text-[10px]">
                I
              </div>
              <h1 className="font-mono font-bold text-[10px] sm:text-xs tracking-widest text-zinc-100 uppercase flex items-center gap-1">
                INSAI<span className="text-blue-400">TRADING</span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <ConnectionStatus />
              <TimeDisplay />
            </div>
          </header>
          <div className="flex flex-1">
            <Navigation />
            <main className="flex-1 overflow-y-auto pb-16 md:pb-6 md:pl-36 pt-2 px-1.5 md:px-3 max-w-[1400px] mx-auto w-full">
              {children}
            </main>
          </div>
        </SSEProvider>
      </body>
    </html>
  );
}
