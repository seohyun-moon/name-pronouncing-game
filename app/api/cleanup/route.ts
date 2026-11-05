import { del, list } from "@vercel/blob";
import { NextResponse } from "next/server";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  // only Vercel's scheduler (or you) may run this
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  // group every stored file by game
  const games = new Map<string, { urls: string[]; created: number }>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "games/", cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const id = blob.pathname.split("/")[1];
      if (!id) continue;
      const entry = games.get(id) ?? { urls: [], created: Infinity };
      entry.urls.push(blob.url);
      entry.created = Math.min(entry.created, new Date(blob.uploadedAt).getTime());
      games.set(id, entry);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  // delete whole games that are older than 7 days
  const cutoff = Date.now() - MAX_AGE_MS;
  const expired: string[] = [];
  let deletedFiles = 0;
  for (const [id, entry] of games) {
    if (entry.created < cutoff) {
      expired.push(id);
      deletedFiles += entry.urls.length;
      if (!dryRun) await del(entry.urls);
    }
  }

  return NextResponse.json({
    dryRun,
    expiredGames: expired,
    deletedFiles: dryRun ? 0 : deletedFiles,
    remainingGames: games.size - expired.length,
  });
}