"use client";

import { useRef, useState } from "react";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
    <main className="min-h-screen bg-yellow-200 text-neutral-900 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold text-center">Are your friends saying your name correctly?</h1>
      <p className="text-center max-w-md">
        Record how you say your name, then score others.
      </p>

      {!isRecording ? (
        <button
          onClick={startRecording}
          className="rounded-full bg-neutral-900 text-yellow-200 px-8 py-4 text-lg font-semibold"
        >
          Record my name
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="rounded-full bg-red-600 text-white px-8 py-4 text-lg font-semibold animate-pulse"
        >
          Stop
        </button>
      )}

      {audioUrl && <audio controls src={audioUrl} />}
      {error && <p className="text-red-700">{error}</p>}
    </main>
  );
}