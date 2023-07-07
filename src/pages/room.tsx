import { ClientSideSuspense } from "@liveblocks/react";
import { RoomProvider } from "../liveblocks.config";
import { useSearchParams } from "next/navigation";
import { TipTap } from "../components/TipTap";

export default function Room() {
  const params = useSearchParams();

  if (!params.has("roomId")) return <>Roomid is required</>;

  return (
    <RoomProvider
      id={params.get("roomId")!}
      initialPresence={{ user: null, blockId: null }}
    >
      <ClientSideSuspense fallback={<div>Loading...</div>}>
        {() => <TipTap />}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
