"use client";

import { useState } from "react";
import Recorder from "../components/Recorder";

type Step = "name" | "record" | "share";

export default function Home() {
  const [step, setStep] = useState<Step>("name");
  const [nickname, setNickname] = useState("");
  const [nativeName, setNativeName] = useState("");
  const [recording, setRecording] = useState<Blob | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function createGame() {
    if (!recording) return;
    setStep("share");
    setShareUrl(null);
    setSaveError(null);
    try {
      const form = new FormData();
      form.append("nickname", nickname);
      form.append("nativeName", nativeName);
      form.append("audio", new File([recording], "original", { type: recording.type }));
      const res = await fetch("/api/games", { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const { id } = await res.json();
      setShareUrl(`${window.location.origin}/g/${id}`);
    } catch {
      setSaveError("Couldn't save your recording. Please try again.");
    }
  }

  return (
    <main className="min-h-screen bg-yellow-200 text-neutral-900 flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold">
          Are your friends saying your name right?
        </h1>
        <p className="mt-2 text-lg text-[#5c5a3d]">
          {step === "name"
            ? "Record your name. Share it to friends. See who says it best."
            : `Hi, ${nickname} / ${nativeName}`}
        </p>
      </div>

      {step === "name" && (
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Name in English</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g., Seohyun Moon"
              className="rounded-xl bg-white text-neutral-900 px-4 py-3"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Name in your language</span>
            <input
              value={nativeName}
              onChange={(e) => setNativeName(e.target.value)}
              placeholder="e.g., 문서현"
              className="rounded-xl bg-white text-neutral-900 px-4 py-3"
            />
          </label>

          <button
            onClick={() => setStep("record")}
            disabled={!nickname.trim() || !nativeName.trim()}
            className="rounded-full bg-neutral-900 text-yellow-200 px-6 py-3 font-semibold disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {step === "record" && (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="relative w-full flex flex-col items-center gap-4">
            <Recorder
              label={"Say your name\nthe way it's supposed to sound."}
              onRecorded={setRecording}
            />
            <button
              onClick={createGame}
              disabled={!recording}
              aria-label="Next"
              className="absolute left-full top-1/2 ml-4 -translate-y-1/2 flex h-[55px] w-[55px] items-center justify-center rounded-xl bg-neutral-900 text-yellow-200 disabled:opacity-40"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12h16M14 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {step === "share" && (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm text-center">
          <p>
            Perfect!
            <br />
            Share it to your friends and see who says it best!
          </p>
          <div className="rounded-xl bg-yellow-100 px-4 py-3 w-full break-all">
            {saveError ? (
              <span className="text-red-700">{saveError}</span>
            ) : shareUrl ? (
              <a href={shareUrl} className="underline">
                {shareUrl}
              </a>
            ) : (
              "Saving…"
            )}
          </div>
          <button onClick={() => setStep("record")} className="underline">
            Back
          </button>
        </div>
      )}
    </main>
  );
}