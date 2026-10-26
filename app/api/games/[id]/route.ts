import { NextResponse } from "next/server";
import { getGame } from "@/lib/games";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    nickname: game.nickname,
    nativeName: game.nativeName,
  });
}