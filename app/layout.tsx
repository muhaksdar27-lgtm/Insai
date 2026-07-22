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
          <header className="flex items-center justify-between px-2 h-7 border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-[2px] flex items-center justify-center border border-white/10 bg-gradient-to-br from-zinc-800 to-black shadow-sm">
                <span className="font-bold text-[6px] tracking-wide text-zinc-300">I</span>
              </div>
              <h1 className="font-bold text-[7px] tracking-widest text-zinc-300 uppercase">
                INSAI<span className="text-zinc-500">TRD</span>
              </h1>
            </div>
            <div className="flex items-center gap-1.5">
              <ConnectionStatus />
              <TimeDisplay />
            </div>
          </header>
          <div className="flex flex-1">
            <Navigation />
            <main className="flex-1 overflow-y-auto pb-10 md:pb-3 md:pl-[120px] pt-2 px-1.5 md:px-3 max-w-[1400px] mx-auto w-full">
              {children}
            </main>
          </div>
        </SSEProvider>
      </body>
    </html>
  );
}
