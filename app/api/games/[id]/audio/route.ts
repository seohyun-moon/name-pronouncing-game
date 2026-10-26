import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return new NextResponse("Not found", { status: 404 });

  const result = await get(game.audioPath, { access: "private" });
  if (result === null) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(result.stream, {
    headers: {
      "Cache-Control": "private, no-cache",
      "Content-Type": result.blob.contentType ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}