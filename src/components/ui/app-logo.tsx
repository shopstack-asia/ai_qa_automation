"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const LOGO_SRC = "/ai_qa_logo.png";
const FALLBACK_LABEL = "AI QA Platform";

export function AppLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <Link
        href="/"
        className={`flex items-center font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded ${className ?? ""}`}
      >
        {FALLBACK_LABEL}
      </Link>
    );
  }

  return (
    <Link href="/" className={`flex items-center focus:outline-none focus:ring-2 focus:ring-accent rounded ${className ?? ""}`}>
      <Image
        src={LOGO_SRC}
        alt={FALLBACK_LABEL}
        width={140}
        height={36}
        className="w-auto object-contain h-9"
        priority
        unoptimized
        onError={() => setFailed(true)}
      />
    </Link>
  );
}
