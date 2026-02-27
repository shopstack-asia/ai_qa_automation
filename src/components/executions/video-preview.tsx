"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface VideoPreviewProps {
  src: string | null | undefined;
  className?: string;
  poster?: string;
}

export function VideoPreview({ src, className, poster }: VideoPreviewProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground",
          className
        )}
      >
        {error ? "Failed to load video" : "No recording"}
      </div>
    );
  }

  return (
    <video
      src={src}
      poster={poster}
      controls
      className={cn("rounded-lg border border-border", className)}
      onError={() => setError(true)}
    >
      Your browser does not support the video tag.
    </video>
  );
}
