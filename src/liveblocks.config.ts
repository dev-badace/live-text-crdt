import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import { LiveText } from "./lib/crdt/LiveText";
import { DeleteSet, ID, RemoteNode, StateVector } from "./lib/crdt/types";

const client = createClient({
  publicApiKey:
    "pk_dev_g9RToUhHAMZhIwR5G9nANAv_f-gI5BoyTeXLQY4Gbgq72c4zJpAq1n7CRONBV7Gs",
});

export type RelativeBlockSelectionId = ID | "END";

export type Presence = {
  user: {
    name: string;
    color: string;
  } | null;

  blockId: RelativeBlockSelectionId | null;
  inActive?: boolean;
};

type Storage = {};
export type UserMeta = {};

type BroadcastEvent =
  | {
      type: "vectorState";
      vectors: [StateVector, StateVector];
    }
  | { type: "insert"; val: RemoteNode }
  | { type: "delete"; val: DeleteSet }
  | { type: "deletes"; deletes: DeleteSet }
  | { type: "updates"; updates: RemoteNode[] };

export const {
  RoomProvider,
  useOthers,
  useUpdateMyPresence,
  useBroadcastEvent,
  useEventListener, //@ts-ignore  umm ignoring this ts error
} = createRoomContext<Presence, Storage, UserMeta, BroadcastEvent>(client);

export const myLivetext = new LiveText();
