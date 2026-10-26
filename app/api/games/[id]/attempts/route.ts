import { get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

type Attempt = {
  id: string;
  nickname: string;
  score: number;
  createdAt: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const nickname = String(form.get("nickname") ?? "").trim().slice(0, 30);
  const score = Number(form.get("score"));
  const audio = form.get("audio");

  if (
    !nickname ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100 ||
    !(audio instanceof File)
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const attemptId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const base = `games/${id}/attempts/${attemptId}`;
  const ext = audio.type.includes("mp4") ? "mp4" : "webm";

  await put(`${base}.${ext}`, audio, {
    access: "private",
    contentType: audio.type,
    addRandomSuffix: false,
  });

  const attempt: Attempt = {
    id: attemptId,
    nickname,
    score,
    createdAt: new Date().toISOString(),
  };

  await put(`${base}.json`, JSON.stringify(attempt), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
  });

  return NextResponse.json(attempt);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { blobs } = await list({ prefix: `games/${id}/attempts/` });
  const jsonBlobs = blobs.filter((b) => b.pathname.endsWith(".json")).slice(0, 200);

  const loaded = await Promise.all(
    jsonBlobs.map(async (b) => {
      const result = await get(b.pathname, { access: "private" });
      if (result === null) return null;
      return (await new Response(result.stream).json()) as Attempt;
    })
  );
  const attempts = loaded.filter((a): a is Attempt => a !== null);

  // keep each nickname's best score only
  const best = new Map<string, Attempt>();
  for (const a of attempts) {
    const key = a.nickname.toLowerCase();
    const current = best.get(key);
    if (!current || a.score > current.score) best.set(key, a);
  }

  const ranking = [...best.values()]
    .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
    .map((a) => ({ nickname: a.nickname, score: a.score }));

  return NextResponse.json({ attempts: ranking });
}