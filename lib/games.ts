import { get } from "@vercel/blob";

export type Game = {
  id: string;
  nickname: string;
  nativeName: string;
  audioPath: string;
  createdAt: string;
};

const ID_PATTERN = /^[a-f0-9]{10}$/;

export async function getGame(id: string): Promise<Game | null> {
  if (!ID_PATTERN.test(id)) return null;
  const result = await get(`games/${id}/game.json`, { access: "private" });
  if (result === null) return null;
  return (await new Response(result.stream).json()) as Game;
}