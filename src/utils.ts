import { LiveText } from "./lib/crdt/LiveText";

export const IsServer = typeof window === "undefined";

export const getStorageKey = (roomId: string) => {
  return `doc${roomId}`;
};

export const initializeDoc = (doc: LiveText, roomId: string) => {
  if (!IsServer) {
    //@ts-ignore used for debugging in console. pretty convinient, to have access to this
    window.myLivetext = doc;

    const localDoc = localStorage.getItem(getStorageKey(roomId));

    if (localDoc) {
      doc.applyDoc(JSON.parse(localDoc));
    } else {
      doc.reset();
    }
  }
};
