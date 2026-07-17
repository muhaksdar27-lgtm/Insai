"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Radio,
  Clock,
  Settings,
} from "lucide-react";
import { motion } from "motion/react";

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Scan", href: "/monitoring", icon: Activity },
    { name: "Live", href: "/live-signals", icon: Radio },
    { name: "History", href: "/history", icon: Clock },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/60 backdrop-blur-xl z-50">
        <ul className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.name} className="flex-1">
                <Link
                  href={item.href}
                  className={`relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-all ${
                    isActive
                      ? "text-blue-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobile-active-nav"
                      className="absolute inset-0 bg-blue-500/10"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-5 h-5 z-10 ${isActive ? "drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" : ""}`} />
                  <span className="text-[9px] font-medium tracking-wider z-10">
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-[240px] border-r border-white/5 bg-black/40 backdrop-blur-2xl z-40 pt-20">
        <ul className="flex flex-col py-4 space-y-2 px-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.name} className="relative">
                <Link
                  href={item.href}
                  className={`group relative flex items-center space-x-3 px-4 py-3.5 rounded-xl transition-all duration-300 ${
                    isActive
                      ? "text-zinc-50 font-semibold"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20 rounded-xl"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110 ${isActive ? "text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" : ""}`} />
                  <span className="text-[11px] uppercase tracking-widest mt-0.5 relative z-10">
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
