import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { Collab, CollaborationExtensionKey } from "../lib/extension/collab";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import { Node } from "@tiptap/core";
import {
  myLivetext,
  Presence,
  RelativeBlockSelectionId,
  useBroadcastEvent,
  useEventListener,
  useOthers,
  UserMeta,
  useUpdateMyPresence,
} from "../liveblocks.config";
import { RemoteNode } from "../lib/crdt/types";
import { useEffect, useState } from "react";
import { getStorageKey, initializeDoc } from "../utils";
import { useSearchParams } from "next/navigation";
import { Others } from "@liveblocks/client";

export const Document = Node.create({
  name: "doc",
  topNode: true,
  content: "inline*",
});

function getExtensionOptions(editor: Editor, name: string) {
  const extension = editor.extensionManager.extensions.find(
    (extension) => extension.name === name
  );
  if (!extension) throw new Error("extension not found");
  return extension.options;
}

//todo Presence for range, instead of the single block one

export const TipTap = () => {
  const params = useSearchParams();
  const broadcast = useBroadcastEvent();
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();
  const [localBlockSelection, setLocalBlockSelection] =
    useState<RelativeBlockSelectionId>();

  useEffect(() => {
    updateMyPresence({
      user: {
        name: params.get("name")!,
        color: `#${params.get("color")}`,
      },
    });
  }, [params, updateMyPresence]);

  useEffect(() => {
    broadcast(
      {
        type: "vectorState",
        vectors: [
          myLivetext.getStateVector(),
          myLivetext.getDeleteStateVector(),
        ],
      },
      { shouldQueueEventIfNotReady: true }
    );
  }, [broadcast]);

  useEffect(() => {
    updateCursors(others);
  }, [others]);

  const updateCursors = (others: Others<Presence, UserMeta>) => {
    let presences: Presence[] = [];
    others.map((other) => {
      if (other.presence) {
        presences.push(other.presence);
      }
    });

    if (editor) {
      const ext = getExtensionOptions(editor, CollaborationExtensionKey);
      ext.updateCursor(editor, presences);
    }
  };

  const editor = useEditor({
    extensions: [
      Document,
      HardBreak.extend({
        addKeyboardShortcuts() {
          return {
            Enter: () => this.editor.commands.setHardBreak(),
          };
        },
      }),
      Text,
      Collab,
    ],
    content: myLivetext.toProsemirrorJson(),
    editable: false,

    onSelectionUpdate: ({ transaction }) => {
      if (!transaction.docChanged) {
        try {
          if (
            transaction.selection.ranges[0].$to.pos ===
            myLivetext.toString().length
          ) {
            setLocalBlockSelection("END");
            //todo imporve, we will need both the 'END' indicator, and the relative block id
            //todo otherwise, the docs that might lag behind may show the wrong cursor position
            updateMyPresence({ blockId: "END" });
            return;
          }

          const node = myLivetext.findNodeAtPos(
            transaction.selection.ranges[0].$to.pos
          );

          console.log(node);
          setLocalBlockSelection(node.id);
          updateMyPresence({ blockId: node.id });
          // console.log(transaction.curSelection);
          // console.log(transaction.selection);
        } catch (error) {}

        // editor?.commands.setTextSelection(parsedStep.to - 1);
      } else {
        // console.log(`doc has changed`);
        // console.log(transaction.selection.ranges[0].$to.pos);
      }
    },

    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;

      //* beginning step is to transform the event so that it makes some sense for the local liveText instance

      const broadcastInsert = (index: number, value: string) => {
        const block = myLivetext.insert(index, value);

        const sendBlock: RemoteNode = {
          id: block.id,
          originLeft: block.originLeft,
          originRight: block.originRight,
          value: block.value,
        };
        broadcast({ type: "insert", val: sendBlock } as never);
        updateMyPresence({ blockId: block.id });
        updateCursors(others);
        localStorage.setItem(
          getStorageKey(params.get("roomId")!),
          JSON.stringify(myLivetext.getEncodedDoc())
        );
        // console.log(myLivetext.getStateVector());
      };

      const broadcastDelete = (index: number) => {
        const block = myLivetext.delete(index);

        updateCursors(others);
        if (block) {
          broadcast({
            type: "delete",
            val: { [block.id[0]]: [block] },
          } as never);
          localStorage.setItem(
            getStorageKey(params.get("roomId")!),
            JSON.stringify(myLivetext.getEncodedDoc())
          );
        }
        // console.log(myLivetext.getDeleteStateVector());
      };

      transaction.steps.map((step) => {
        let index: number;

        const parsedStep = step.toJSON();

        // console.log(parsedStep);

        if (parsedStep.stepType !== "replace")
          console.error(`unsupported step type ${parsedStep.stepType}`);

        if (parsedStep.to === parsedStep.from) {
          index = parsedStep.from;

          parsedStep.slice.content.map((content: any) => {
            if (content.type === "text") {
              for (let i = 0; i < content.text.length; i++) {
                broadcastInsert(index, content.text[i]);
                index++;
              }
            } else if (content.type === "hardBreak") {
              broadcastInsert(index, "\n");
              index++;
            } else {
              console.warn(`unsupported content type `, parsedStep);
            }
          });
        } else {
          //edge case or maybe special case, dunno
          // if (parsedStep.from === 0 && parsedStep.to > myLivetext.__length) {
          //   console.log(`isssuing full delete?`);
          //   for (let i = myLivetext.__length - 1; i >= 0; i--) {
          //     myLivetext.delete(i);
          //   }
          //   return;
          // }

          const deleteIndex = parsedStep.to - 1;

          for (let i = deleteIndex; i >= parsedStep.from; i--) {
            if (i < 0) break;
            broadcastDelete(i);
          }

          index = parsedStep.from;
          parsedStep.slice?.content?.map((content: any) => {
            if (content.type === "text") {
              for (let i = 0; i < content.text.length; i++) {
                broadcastInsert(index, content.text[i]);
                index++;
              }
            } else if (content.type === "hardBreak") {
              broadcastInsert(index, "\n");
              index++;
            } else {
              console.warn(`unsupported content type `, parsedStep);
            }
          });
        }
        editor?.commands.setContent(myLivetext.toProsemirrorJson());
        if (parsedStep.slice?.content) {
          editor?.commands.setTextSelection(index);
        } else {
          if (parsedStep.from === parsedStep.to) {
            editor?.commands.setTextSelection(parsedStep.to);
          } else {
            if (parsedStep.to - parsedStep.from === 1) {
              editor?.commands.setTextSelection(parsedStep.to - 1);
            } else {
              editor?.commands.setTextSelection(parsedStep.from);
              //this is the case of multiple deletes with no insert
            }
          }
        }

        //        editor?.commands.setTextSelection(parsedStep.to + 1);
        // }else {
        //   editor?.commands.setTextSelection(parsedStep.to);
        // }

        // console.log(editor.getJSON());
        // console.log(myLivetext.toProsemirrorJson());

        // if (parsedStep.to === parsedStep.from) {
        //   console.log(parsedStep);
        //   index = parsedStep.from - 1;

        //   parsedStep.slice.content.map((content: any, i: number) => {
        //     if (content.type === "text") {
        //       for (let i = 0; i < content.text.length; i++) {
        //         myLivetext.insert(index, content.text[i]);
        //         index++;
        //       }

        //       // console.log(`inserted -> ${content.text}`);
        //     } else if (content.type === "paragraph") {
        //       if (!content.content) {
        //         if (index !== 0 || i !== 0) {
        //           console.log(`adding`);
        //           myLivetext.insert(index, "\n");
        //           index++;
        //         }
        //         // console.log(`line break`);
        //       } else {
        //         if (index !== 0 || i !== 0) {
        //           console.log(`adding`);
        //           myLivetext.insert(index, "\n");
        //           index++;
        //         }
        //         for (let i = 0; i < content.content[0].text.length; i++) {
        //           myLivetext.insert(index, content.content[0].text[i]);
        //           index++;
        //         }

        //         // console.log(
        //         //   `line break with content ${content.content[0].text}`
        //         // );
        //       }
        //     } else {
        //       console.warn(`unsupprted text type`);
        //       console.log(content);
        //     }
        //   });
        // } else {
        //   //delete index from to
        //   //Edge case, i dunno, when a user does ctrl+a or select all
        //   //and removes all of it, the replace step that is produced is kinda wrong, as the 'to' property exceeds the size of the doc itself
        //   //note that this does not happens, when a user replaces the content with a copied string
        //   if (parsedStep.from === 1 && parsedStep.to > myLivetext.__length) {
        //     console.log(`delete/remove all`);

        //     console.log(myLivetext.__length);
        //     for (let i = myLivetext.__length - 1; i >= 0; i--) {
        //       console.log(`deleting ${i} `);
        //       myLivetext.delete(i);
        //     }

        //     return;
        //   }

        //   //insert-to starting from index

        //   console.log(parsedStep);
        //   let deleted: number = parsedStep.to - parsedStep.from;
        //   let addCount: number = 0;

        //   const deleteIndex = parsedStep.to - 2;

        //   console.log(`deleting form ${deleteIndex} -> ${parsedStep.to - 2}`);
        //   for (let i = deleteIndex; i > parsedStep.from - 2; i--) {
        //     console.log(`deleting ${i}`);
        //     if (i < 0) break;
        //     myLivetext.delete(i);
        //   }

        //   console.log(`adding content to ${parsedStep.from - 1} ?`);

        //   parsedStep.slice?.content?.map((content: any, i: number) => {
        //     let index = parsedStep.from - 1 < 0 ? 0 : parsedStep.from - 1;
        //     if (content.type === "text") {
        //       for (let i = 0; i < content.text.length; i++) {
        //         myLivetext.insert(index, content.text[i]);
        //         index++;
        //       }

        //       // console.log(`inserted -> ${content.text}`);
        //     } else if (content.type === "paragraph") {
        //       console.log(parsedStep);
        //       if (!content.content) {
        //         if (index !== 0 && i !== 0) {
        //           myLivetext.insert(index, "\n");
        //           index++;
        //         }
        //         // console.log(`line break`);
        //       } else {
        //         if (index !== 0 && i !== 0) {
        //           myLivetext.insert(index, "\n");
        //           index++;
        //         }
        //         for (let i = 0; i < content.content[0].text.length; i++) {
        //           myLivetext.insert(index, content.content[0].text[i]);
        //           index++;
        //         }

        //         // console.log(
        //         //   `line break with content ${content.content[0].text}`
        //         // );
        //       }
        //     } else {
        //       console.warn(`unsupprted text type`);
        //       console.log(content);
        //     }
        //   });

        //   // console.log(`delete -> ${deleted}`);
        //   // console.log(`inserted -> ${addCount}`);
        // }
        // console.log(myLivetext.toString());

        // console.log(editor.getText());
        // console.log(myLivetext.toString().length);
        // console.log(editor.getText().length);
      });
    },

    onBlur: () => {
      updateMyPresence({ inActive: true });
    },
    onFocus: () => {
      updateMyPresence({ inActive: false });
    },

    onCreate: ({ editor }) => {
      editor.setEditable(true);
    },
  });

  useEffect(() => {
    initializeDoc(myLivetext, params.get("roomId")!);

    editor?.commands.setContent(myLivetext.toProsemirrorJson());
  }, [params, editor]);

  const setLocalCursorAndSaveDoc = (
    localSelection?: RelativeBlockSelectionId
  ) => {
    if (localSelection) {
      if (localSelection === "END") {
        updateMyPresence({ blockId: "END" });
        editor?.commands.setTextSelection(myLivetext.toString().length);
      } else {
        try {
          const pos = myLivetext.findNodeAndPosById(localSelection);

          editor?.commands.setTextSelection(
            myLivetext.toString().length === pos ? pos : pos - 1
          );

          //todo check if needed
          updateMyPresence({ blockId: localSelection });
        } catch (error) {
          console.log(error);
        }
      }
    }

    localStorage.setItem(
      getStorageKey(params.get("roomId")!),
      JSON.stringify(myLivetext.getEncodedDoc())
    );
  };

  useEventListener(({ connectionId, event }) => {
    // console.log(`event recieved`);
    // console.log(connectionId, event);

    const localSelection = localBlockSelection;

    switch (event.type) {
      case "vectorState": {
        const { sendableUpdates, shouldBroadcastVector } =
          myLivetext.sendableUpdates(event.vectors[0] || {});

        const { sendableDeletes, shouldBroadcastDeleteVector } =
          myLivetext.sendableDeletes(event.vectors[1] || {});
        if (sendableUpdates.length >= 1)
          broadcast({ type: "updates", updates: sendableUpdates });

        if (Object.keys(sendableDeletes).length >= 1)
          broadcast({ type: "deletes", deletes: sendableDeletes });

        if (shouldBroadcastVector || shouldBroadcastDeleteVector)
          broadcast({
            type: "vectorState",
            vectors: [
              myLivetext.getStateVector(),
              myLivetext.getDeleteStateVector(),
            ],
          });
        break;
      }

      case "updates": {
        myLivetext.merge(event.updates);
        editor?.commands.setContent(myLivetext.toProsemirrorJson());

        setLocalCursorAndSaveDoc(localSelection);
        break;
      }

      case "deletes": {
        myLivetext.syncDeletes(event.deletes);
        editor?.commands.setContent(myLivetext.toProsemirrorJson());

        setLocalCursorAndSaveDoc(localSelection);
        break;
      }

      case "delete": {
        myLivetext.syncDeletes(event.val);
        editor?.commands.setContent(myLivetext.toProsemirrorJson());

        setLocalCursorAndSaveDoc(localSelection);
        break;
      }

      case "insert": {
        const pendingUpdates = myLivetext.merge([event.val] as any);

        if (pendingUpdates) {
          broadcast({
            type: "vectorState",
            vectors: [
              myLivetext.getStateVector(),
              myLivetext.getDeleteStateVector(),
            ],
          });

          // console.log(`braodcastin`);
        }

        // console.log(myLivetext.toString());
        editor?.commands.setContent(myLivetext.toProsemirrorJson());

        setLocalCursorAndSaveDoc(localSelection);

        break;
      }

      default: {
        console.error(`Unknown broadcast event`, event, connectionId);
      }
    }
  });
  return (
    <div className="textEditorContainer">
      <EditorContent className="textEditor" editor={editor} />
    </div>
  );
};
