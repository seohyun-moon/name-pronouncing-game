"use client";

import { useRef, useState } from "react";

type Props = {
  label: string;
  doneLabel?: string;
  onRecorded: (blob: Blob) => void;
};

export default function Recorder({
  label,
  doneLabel = "Sounds good? Click next.",
  onRecorded,
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const hasRecorded = audioUrl !== null;

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
        onRecorded(blob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Couldn't access your microphone. Please allow mic access and try again.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-yellow-100 p-6 w-full max-w-sm text-center">
      <h2 className="text-xl font-semibold whitespace-pre-line">
        {hasRecorded ? doneLabel : label}
      </h2>

      {isRecording ? (
        <button
          onClick={stopRecording}
          className="rounded-full bg-red-600 text-white px-6 py-3 font-semibold animate-pulse"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={startRecording}
          className="rounded-full bg-neutral-900 text-yellow-200 px-6 py-3 font-semibold"
        >
          {hasRecorded ? "Redo" : "Record"}
        </button>
      )}

      {audioUrl && <audio controls src={audioUrl} />}
      {error && <p className="text-red-700 text-sm">{error}</p>}
    </div>
  );
}