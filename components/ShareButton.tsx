"use client";

import { useState } from "react";

export default function ShareButton({
  url,
  label,
  title = "Say my name",
  text = "Can you say my name right? Try it and see your score.",
}: {
  url: string;
  label?: string;
  title?: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // phones: open the built-in share sheet (iMessage, KakaoTalk, Copy, ...)
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        // the person closed the sheet, so do nothing
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    // fallback for browsers without a share sheet: copy the link
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // text button version (friend results page)
  if (label) {
    return (
      <button
        onClick={share}
        className="rounded-full bg-neutral-900 text-yellow-200 px-6 py-3 font-semibold"
      >
        {copied ? "Link copied!" : label}
      </button>
    );
  }

  // icon version (owner page)
  return (
    <button
      onClick={share}
      aria-label="Share link"
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-yellow-200"
    >
      {copied ? (
        <span className="text-xs font-semibold">Copied</span>
      ) : (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12" />
          <path d="M8 7l4-4 4 4" />
          <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
        </svg>
      )}
    </button>
  );
}