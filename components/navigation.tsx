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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md z-50 shadow-2xl" aria-label="Mobile Navigation">
        <ul className="flex items-center justify-around h-14" role="list">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.name} className="flex-1 h-full">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    isActive
                      ? "text-blue-400 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobile-active-nav"
                      className="absolute inset-0 bg-blue-500/10 border-t-2 border-blue-400"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="w-4 h-4 z-10" />
                  <span className="text-[10px] font-mono font-bold tracking-wider z-10 uppercase">
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex flex-col fixed top-9 left-0 bottom-0 w-36 border-r border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md z-40 pt-3" aria-label="Main Navigation">
        <ul className="flex flex-col py-2 space-y-1 px-3" role="list">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.name} className="relative">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center space-x-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    isActive
                      ? "text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80"
                  }`}
                >
                  <Icon className="w-4 h-4 relative z-10 transition-transform duration-200 group-hover:scale-110 shrink-0" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider relative z-10">
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

