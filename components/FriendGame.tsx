"use client";

import { useEffect, useState } from "react";
import Recorder from "./Recorder";
import { preloadModel, scoreWithModel } from "../lib/embed";

type GameInfo = { nickname: string; nativeName: string };
type Step = "nickname" | "play" | "result";
type RankRow = { nickname: string; score: number };

export default function FriendGame({ id }: { id: string }) {
  const [game, setGame] = useState<GameInfo | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<Step>("nickname");
  const [friendName, setFriendName] = useState("");
  const [attempt, setAttempt] = useState<Blob | null>(null);
  const [result, setResult] = useState<{ score: number; distance: number } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [ranking, setRanking] = useState<RankRow[] | null>(null);
  const [rankingError, setRankingError] = useState(false);

  useEffect(() => {
    preloadModel();
    let objectUrl: string | null = null;

    async function load() {
      try {
        const infoRes = await fetch(`/api/games/${id}`);
        if (!infoRes.ok) {
          setNotFound(true);
          return;
        }
        setGame(await infoRes.json());

        const audioRes = await fetch(`/api/games/${id}/audio`);
        if (!audioRes.ok) {
          setNotFound(true);
          return;
        }
        const blob = await audioRes.blob();
        setOriginalBlob(blob);
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      } catch {
        setNotFound(true);
      }
    }

    load();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  async function saveAndLoadRanking(score: number, audio: Blob) {
    try {
      const form = new FormData();
      form.append("nickname", friendName.trim());
      form.append("score", String(score));
      form.append("audio", new File([audio], "attempt", { type: audio.type }));

      const saveRes = await fetch(`/api/games/${id}/attempts`, {
        method: "POST",
        body: form,
      });
      if (!saveRes.ok) throw new Error();

      const listRes = await fetch(`/api/games/${id}/attempts`);
      if (!listRes.ok) throw new Error();
      const data = await listRes.json();
      setRanking(data.attempts);
    } catch {
      setRankingError(true);
    }
  }

  async function getScore() {
    if (!originalBlob || !attempt) return;
    setScoring(true);
    setScoreError(null);
    try {
      const r = await scoreWithModel(originalBlob, attempt);
      setResult(r);
      setShareUrl(`${window.location.origin}/g/${id}`);
      setCopied(false);
      setRanking(null);
      setRankingError(false);
      setStep("result");
      saveAndLoadRanking(r.score, attempt);
    } catch {
      setScoreError("Couldn't score that one. Try recording again.");
    } finally {
      setScoring(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-yellow-200 text-neutral-900 flex items-center justify-center p-8 text-center">
        <p>This game doesn&apos;t exist anymore.</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen bg-yellow-200 text-neutral-900 flex items-center justify-center p-8">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-yellow-200 text-neutral-900 flex flex-col items-center justify-center gap-6 p-8">
      {step !== "result" && (
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-4xl font-bold">
            Are you saying {game.nickname}&apos;s name right?
          </h1>
          <p>Listen, follow, and check your ranking.</p>
        </div>
      )}

      {step === "nickname" && (
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Your nickname</span>
            <input
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              placeholder="Name for the ranking board"
              className="rounded-xl bg-white text-neutral-900 px-4 py-3"
            />
          </label>
          <button
            onClick={() => setStep("play")}
            disabled={!friendName.trim()}
            className="rounded-full bg-neutral-900 text-yellow-200 px-6 py-3 font-semibold disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {step === "play" && (
        <>
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-yellow-100 p-6 w-full max-w-sm text-center">
            <h2 className="text-xl font-semibold">The OG way:</h2>
            {audioUrl && <audio controls src={audioUrl} />}
          </div>

          <div className="relative w-full max-w-sm flex flex-col items-center gap-4">
            <Recorder
              label={"Now you try"}
              doneLabel={"Sounds good? Click next."}
              onRecorded={(blob) => {
                setAttempt(blob);
                setScoreError(null);
              }}
            />
            <button
              onClick={getScore}
              disabled={!attempt || scoring}
              aria-label="Get my score"
              className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-neutral-900 text-yellow-200 disabled:opacity-40 sm:absolute sm:left-full sm:top-1/2 sm:ml-4 sm:-translate-y-1/2"
            >
              {scoring ? (
                <span className="text-sm">...</span>
              ) : (
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12h16M14 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>

          {scoring && (
            <div className="flex items-center gap-3 text-sm">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
              <span>Listening closely... this can take a moment the first time.</span>
            </div>
          )}
        </>
      )}

      {step === "result" && result && (
        <>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-lg">Your score is...</p>
            <p className="text-7xl font-bold">{result.score}</p>
            <p className="text-xs opacity-60">
              (testing only: raw distance {result.distance.toFixed(2)})
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl bg-yellow-100 p-6 w-full max-w-sm">
            <h2 className="text-xl font-semibold text-center">Ranking</h2>
            {rankingError && (
              <p className="text-sm text-center">
                Couldn&apos;t load the ranking. Try again in a bit.
              </p>
            )}
            {!rankingError && !ranking && (
              <p className="text-sm text-center opacity-70">Loading...</p>
            )}
            {ranking && (
              <ol className="flex flex-col gap-1">
                {ranking.slice(0, 10).map((row, i) => {
                  const isYou =
                    row.nickname.toLowerCase() === friendName.trim().toLowerCase();
                  return (
                    <li
                      key={row.nickname}
                      className={`flex justify-between rounded-lg px-3 py-2 ${isYou ? "bg-yellow-300 font-semibold" : ""
                        }`}
                    >
                      <span>
                        {i + 1}. {row.nickname}
                      </span>
                      <span>{row.score}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 rounded-2xl bg-yellow-100 p-6 w-full max-w-sm text-center">
            <h2 className="text-xl font-semibold">
              Think your friends can beat {result.score}?
            </h2>
            <p className="break-all text-sm">{shareUrl}</p>
            <button
              onClick={copyLink}
              className="rounded-full bg-neutral-900 text-yellow-200 px-6 py-3 font-semibold"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>

          <button
            onClick={() => {
              setStep("play");
              setAttempt(null);
              setResult(null);
            }}
            className="underline"
          >
            Try again
          </button>
        </>
      )}
    </main>
  );
}