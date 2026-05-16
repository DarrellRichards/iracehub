"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface DriverSearchBarProps {
  className?: string;
}

export function DriverSearchBar({ className = "" }: DriverSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      router.push("/app/drivers");
    } else {
      router.push(`/app/drivers?q=${encodeURIComponent(trimmed)}`);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim().length >= 2) commit(val);
    }, 500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    commit(query);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative flex items-center ${className}`}
    >
      <span className="pointer-events-none absolute left-3 text-zinc-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      <input
        type="search"
        value={query}
        onChange={handleChange}
        placeholder="Find a driver…"
        className="h-9 w-44 rounded-xl border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-white outline-none transition-all placeholder:text-zinc-500 focus:w-56 focus:border-red-500 focus:bg-zinc-900"
      />
    </form>
  );
}
