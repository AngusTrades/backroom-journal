"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function apply(mode: "dark" | "light") {
    document.documentElement.setAttribute("data-theme", mode);
    try {
      localStorage.setItem("backroom-theme", mode);
    } catch {}
    setTheme(mode);
  }

  return (
    <div className="flex gap-0.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface-2)] p-[3px]">
      <button
        type="button"
        onClick={() => apply("dark")}
        className="flex-1 rounded-[5px] py-1.5 text-[11.5px] font-semibold"
        style={
          theme === "dark"
            ? { background: "var(--accent-soft)", color: "var(--accent-strong)" }
            : { color: "var(--text-mute)" }
        }
      >
        🌙 Dark
      </button>
      <button
        type="button"
        onClick={() => apply("light")}
        className="flex-1 rounded-[5px] py-1.5 text-[11.5px] font-semibold"
        style={
          theme === "light"
            ? { background: "var(--accent-soft)", color: "var(--accent-strong)" }
            : { color: "var(--text-mute)" }
        }
      >
        ☀️ Light
      </button>
    </div>
  );
}
