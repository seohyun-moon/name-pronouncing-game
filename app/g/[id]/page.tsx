import { Suspense } from "react";
import FriendGame from "@/components/FriendGame";

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FriendGame id={id} />;
}

export default function FriendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-yellow-200 text-neutral-900 flex items-center justify-center">
          Loading...
        </main>
      }
    >
      <Loader params={params} />
    </Suspense>
  );
}