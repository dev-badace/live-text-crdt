import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Editor } from "@tiptap/react";
import { myLivetext, Presence } from "../../liveblocks.config";

export const CollaborationExtensionKey = "myCollab";

interface User {
  color: string;
  name: string;
  inActive?: boolean;
}

export const myCursor = (user: User) => {
  var cursorclass = "cursor";
  var displayname = user.name;
  var displaycolor =
    'style="background-color:' +
    user.color +
    "; border-top-color:" +
    user.color +
    '"';

  const dom = document.createElement("div");
  if (user.inActive) {
    cursorclass += " inactive";
  }

  dom.innerHTML =
    '<span class="' +
    cursorclass +
    '" ' +
    displaycolor +
    ">" +
    displayname +
    "</span>";
  dom.style.display = "inline";
  return dom;
};

export const createDecorations = (editor: Editor, users: Presence[]) => {
  const cursorDecorations: Decoration[] = [];

  users.map(({ blockId, user, inActive }) => {
    try {
      if (blockId) {
        let pos: number;

        if (blockId === "END") {
          console.log(`getting the end cursor`);
          pos = myLivetext.toString().length;
        } else {
          //check the position of the node
          const nodePos = myLivetext.findNodeAndPosById(blockId);

          pos = nodePos - 1;
        }

        cursorDecorations.push(
          Decoration.widget(
            pos,
            () =>
              myCursor({
                name: user?.name || "bob",
                color: user?.color || "teal",
                inActive,
              }),
            {
              side: 10,
            }
          )
        );
      }
    } catch (error) {}
  });

  editor.view.setProps({
    decorations() {
      return DecorationSet.create(editor.state.doc, cursorDecorations);
    },
  });
};

export const randCol = () =>
  `rgb(${Math.floor(Math.random() * 254)},${Math.floor(
    Math.random() * 254
  )},${Math.floor(Math.random() * 254)})`;

export const Collab = Extension.create({
  name: CollaborationExtensionKey,
  addOptions() {
    return {
      updateCursor(editor: Editor, presence: Presence[]) {
        createDecorations(editor, presence);
      },
    };
  },
});
