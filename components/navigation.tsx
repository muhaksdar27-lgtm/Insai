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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/95 backdrop-blur-md z-50" aria-label="Mobile Navigation">
        <ul className="flex items-center justify-around h-12" role="list">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.name} className="flex-1 h-full">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex flex-col items-center justify-center w-full h-full space-y-0.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded ${
                    isActive
                      ? "text-zinc-100 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobile-active-nav"
                      className="absolute inset-0 bg-white/10"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="w-4 h-4 z-10" />
                  <span className="text-[9px] font-bold tracking-wider z-10 uppercase">
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex flex-col fixed top-7 left-0 bottom-0 w-32 border-r border-white/10 bg-black/80 backdrop-blur-md z-40 pt-2" aria-label="Main Navigation">
        <ul className="flex flex-col py-2 space-y-1 px-2.5" role="list">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.name} className="relative">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center space-x-2 px-2.5 py-2 rounded-md transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                    isActive
                      ? "text-zinc-100 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute inset-0 bg-white/10 rounded-md"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-1/4 bottom-1/4 w-[2px] bg-blue-400 rounded-r"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10 transition-transform duration-300 group-hover:scale-105" />
                  <span className="text-[9px] uppercase font-bold tracking-wider relative z-10">
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

