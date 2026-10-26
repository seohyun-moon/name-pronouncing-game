import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const nickname = String(form.get("nickname") ?? "").trim();
  const nativeName = String(form.get("nativeName") ?? "").trim();
  const audio = form.get("audio");

  if (!nickname || !nativeName || !(audio instanceof File)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // short random ID that becomes the link
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  const ext = audio.type.includes("mp4") ? "mp4" : "webm";
  const audioBlob = await put(`games/${id}/original.${ext}`, audio, {
    access: "private",
    contentType: audio.type,
    addRandomSuffix: false,
  });

  const game = {
    id,
    nickname,
    nativeName,
    audioPath: audioBlob.pathname,
    createdAt: new Date().toISOString(),
  };

  await put(`games/${id}/game.json`, JSON.stringify(game), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  return NextResponse.json({ id });
}