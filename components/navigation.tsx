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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/5 bg-black/90 backdrop-blur-md z-50">
        <ul className="flex items-center justify-around h-[34px]">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.name} className="flex-1 h-full">
                <Link
                  href={item.href}
                  className={`relative flex flex-col items-center justify-center w-full h-full space-y-[1px] transition-all ${
                    isActive
                      ? "text-zinc-200"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobile-active-nav"
                      className="absolute inset-0 bg-white/5"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="w-2.5 h-2.5 z-10" />
                  <span className="text-[5px] font-bold tracking-widest z-10 uppercase">
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop Side Navigation */}
      <nav className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-[120px] border-r border-white/5 bg-black/60 backdrop-blur-md z-40 pt-10">
        <ul className="flex flex-col py-1.5 space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.name} className="relative">
                <Link
                  href={item.href}
                  className={`group relative flex items-center space-x-1.5 px-2 py-1.5 rounded-[4px] transition-all duration-300 ${
                    isActive
                      ? "text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-nav"
                      className="absolute inset-0 bg-white/5 rounded-[4px]"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-1/4 bottom-1/4 w-[1px] bg-zinc-300"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="w-3 h-3 relative z-10 transition-transform duration-300 group-hover:scale-105" />
                  <span className="text-[7px] uppercase font-bold tracking-widest relative z-10">
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
