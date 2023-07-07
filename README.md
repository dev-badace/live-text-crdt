# LiveText Tiptap

LiveText is a collaborative text editor built on top of LiveText Crdt, [Liveblocks](https://liveblocks.io/), [TipTap](https://tiptap.dev/) (Prosemirror based) text editor. It works in p2p mode by default, and allows for seamless offline editing. [try it](https://livetext-delta.vercel.app/)
This is a basic basic live text editor demo, which focuses on simplicity over performance and is not suitable for production.

### How it works?

LiveText is the CRDT based on YATA algorithm (same one as [yjs](https://yjs.dev/)). but it is not as performant as yjs, as it was not the purpose of this demo. all the documents are persisited locally in localhost. we're using liveblocks (presence & broadcast) to communicate the changes,

### Protocol

In this section we'll talk about the protocol. When a user joins the room, they load their local document from localhost (if present). they're connected to the particular liveblocks room, and liveblocks further handles the coordination, after loading/initializing the document the user broadcasts their state vectors, we have 2 state vectors one for inserts & one for deletes. the way we handle deletes is a little different from yjs, as yjs stores it's deletes as a state CRDT. After the vectors are broadcasted they're received by the connected peers if any. who then broadcast any newupdates or deletes, the connected peers also see if they're missing any updates from the received state vector, if they do, they broadcast their own stateVectors again. and further during editing all the inserts & deletes are broadcasted. if conflicts occur they're handled automatically

### Performance

This demo was not intended to be optimized for performance , however Here are the few things that can be used to significantly improve the performance, (tbh yjs has not left anything much for us to improve in terms of performance on the javascript land )

- improving lookup, right now the items are stored as an array, by storing it a Record<clientId, Items[]> where items are inserted in a sorted order (this is by default required anyways)
- batching, right now every single character represents a single Item, this is not very efficient batching items will significantly reduce the number of items, improving performance & memory
- better serde (serialization/deserialization), improving the way we encode and decode data for efficiency, yjs does RLE (run length encoding) of it's documents
- minor things that yjs does, skip list (a cache of last 10 accessed items, improves lookups), pruning? not sure ,
- having a length property for our document, right now I'm just using **.toString().length** everywhere to check the length
