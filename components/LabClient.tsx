"use client";

import { useState } from "react";
import Recorder from "./Recorder";
import { scoreAttempt } from "../lib/score";
import { compareWithModel } from "../lib/embed";

type Row = { label: string; mfcc: string; model: string; info: string };

export default function LabClient() {
  const [original, setOriginal] = useState<Blob | null>(null);
  const [attempt, setAttempt] = useState<Blob | null>(null);
  const [gameId, setGameId] = useState("");
  const [label, setLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function loadOriginal() {
    setStatus("Loading original...");
    try {
      const res = await fetch(`/api/games/${gameId.trim()}/audio`);
      if (!res.ok) throw new Error();
      setOriginal(await res.blob());
      setStatus("Original loaded from that game.");
    } catch {
      setStatus("Couldn't load that game.");
    }
  }

  async function compare() {
    if (!original || !attempt) return;
    setBusy(true);
    setStatus("Comparing... the first run downloads the model (about 96 MB).");
    try {
      const mfcc = await scoreAttempt(original, attempt);
      const model = await compareWithModel(original, attempt);
      setRows((r) => [
        ...r,
        {
          label: label.trim() || `#${r.length + 1}`,
          mfcc: mfcc.distance.toFixed(3),
          model: model.distance.toFixed(3),
          info: `${model.key} ${model.dims.join("x")}`,
        },
      ]);
      setStatus(null);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : "something went wrong"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-yellow-200 text-neutral-900 flex flex-col items-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Scoring lab</h1>
      <p className="text-sm text-center max-w-md">
        Lower distance means closer to the original. Compare how the two methods order your test attempts.
      </p>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        <span className="text-sm font-semibold">Original: load from a game</span>
        <div className="flex gap-2">
          <input
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="Game ID (the end of the link)"
            className="flex-1 rounded-xl bg-white px-4 py-3"
          />
          <button
            onClick={loadOriginal}
            disabled={!gameId.trim()}
            className="rounded-full bg-neutral-900 text-yellow-200 px-5 font-semibold disabled:opacity-40"
          >
            Load
          </button>
        </div>
        <span className="text-sm opacity-70">or record an original below</span>
      </div>

      <Recorder label="Original" doneLabel="Original recorded" onRecorded={setOriginal} />
      <Recorder
        label="Attempt"
        doneLabel="Attempt recorded. Compare, or redo."
        onRecorded={setAttempt}
      />

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label for this attempt (e.g. mom, correct)"
          className="rounded-xl bg-white px-4 py-3"
        />
        <button
          onClick={compare}
          disabled={!original || !attempt || busy}
          className="rounded-full bg-neutral-900 text-yellow-200 px-6 py-3 font-semibold disabled:opacity-40"
        >
          {busy ? "Comparing..." : "Compare"}
        </button>
        {status && <p className="text-sm text-center">{status}</p>}
      </div>

      {rows.length > 0 && (
        <table className="w-full max-w-md text-left text-sm bg-yellow-100 rounded-2xl overflow-hidden">
          <thead>
            <tr className="font-semibold">
              <th className="p-3">Label</th>
              <th className="p-3">MFCC</th>
              <th className="p-3">Model</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-yellow-200">
                <td className="p-3">{r.label}</td>
                <td className="p-3">{r.mfcc}</td>
                <td className="p-3">{r.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <p className="text-xs opacity-60">Model output: {rows[0].info}</p>}
    </main>
  );
}