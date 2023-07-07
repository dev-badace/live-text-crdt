"use client";

import { LamportTimestamp } from "./Lamport";
import {
  DeletedNode,
  DeleteSet,
  EncodedDoc,
  ID,
  Node,
  RemoteNode,
  SimpleNode,
  StateVector,
} from "./types";

const randomInt = (num: number) => {
  return Math.random() * Math.random() * num;
};

//This is a true list crdt
export class LiveText {
  clientId: number; //client id of the user. used for generating lamport timestamps.
  items: Node[]; //the entire state
  deletedItems: DeleteSet; //a ClientId and deleted items id map
  pendingUpdates: RemoteNode[]; //these are a list of out of order updates, waiting for their deps

  __lamportTimestamp: LamportTimestamp; //the lamport timestamp for inserts
  __deletedLamportTimestamp: LamportTimestamp; //the lamport timestamp for deletes
  __head?: Node;
  __tail?: Node;

  constructor() {
    //todo lol better generation of clientIds,
    this.clientId = randomInt(9999999);
    this.items = [];
    this.pendingUpdates = [];
    this.deletedItems = {};
    this.__lamportTimestamp = new LamportTimestamp(this.clientId);
    this.__deletedLamportTimestamp = new LamportTimestamp(this.clientId);
  }

  //convert's the value to a Block
  valueToBlock(val: string, id?: ID): Node {
    return {
      id: id || this.__lamportTimestamp.id,
      value: val,
    };
  }

  buildBlock(block: RemoteNode): Node {
    return {
      ...block,
    };
  }

  toSimpleNode(block: Node): SimpleNode {
    return {
      id: block.id,
      originLeft: block.originLeft,
      originRight: block.originRight,
      value: block.value,
    };
  }

  //find's the node at a given index
  findNodeAtPos(index: number) {
    //if the index is greater than current existing blocks/items
    if (index > this.toString().length - 1) {
      throw new Error("No node at the position");
    }

    //we loop over the linked list to find the correct item at the index and return the node

    let currentPos = 0;
    let currentNode = this.__head;

    let node;
    while (currentPos <= index) {
      if (!currentNode) {
        break;
      }
      node = currentNode;
      if (currentNode?.value) currentPos++;
      currentNode = currentNode?.right!;
    }

    return node as Node;
  }

  //finds a node by id
  findNodeById(nodeId: ID) {
    return this.items.filter(({ id }) => {
      return LamportTimestamp.compare(id, nodeId);
    })[0];
  }

  //finds a node's position
  findNodeAndPosById(nodeId: ID) {
    let pos = 0;
    let nodeFound: boolean = false;

    let right = this.__head;

    while (true) {
      if (!right) break;

      if (right.value) pos++;

      if (LamportTimestamp.compare(right.id, nodeId)) {
        nodeFound = true;
        break;
      }

      right = right.right;
    }

    if (!nodeFound) throw new Error(`node not available ${nodeId}`);
    return pos;
  }

  //Inserts an item/block to the given index
  //This is what a client/user uses to update the doc locally
  insert(index: number, value: string): Node {
    //if the user tries to insert at an index greater than the current document's length
    if (index > this.toString().length) {
      throw new Error(`Invalid Operation ${index}`);
    }

    //convert the value to a block
    const insertedBlock = this.valueToBlock(value);

    //if the insert is at the beginning of the document
    if (index === 0) {
      //if there is no other block present! meaning this is the first entry in the doc
      if (this.items.length < 1) {
        //set the start & end as the block, since it's the first entry
        this.__head = insertedBlock;
        this.__tail = insertedBlock;

        //push the item to the Doc's items
        this.items.push(insertedBlock);
      } else {
        //set the current start block's left to the inserted block
        this.__head!.left = insertedBlock;

        //set the right of the current block to the current Start
        insertedBlock.right = this.__head;

        //set the originRight to the start block's id
        insertedBlock.originRight = this.__head!.id;

        //set the current elemnt as the starting element
        this.__head = insertedBlock;
        //increase the length of the document and push the block to Doc's items
        this.items.push(insertedBlock);
      }

      return insertedBlock;
    }

    //if the insert is at the end of the document
    if (index === this.toString().length) {
      //set the current end's right to the inserted block
      this.__tail!.right = insertedBlock;

      //set the inserted block's left & origin left to the current ending block
      insertedBlock.left = this.__tail;
      insertedBlock.originLeft = this.__tail!.id;

      //set the inserted block as the current ending block of the document
      this.__tail = insertedBlock;

      //increase the length of the document and push the block to Doc's items
      this.items.push(insertedBlock);

      return insertedBlock;
    }

    //if we're here that means, that the document is inserted between 2 blocks.

    //find the current block at the index
    const currentNodeAtPos = this.findNodeAtPos(index);

    //get the left of the node at pos
    const left = currentNodeAtPos!.left;

    //change the left's right to the inserted block
    left!.right = insertedBlock;

    //change the current node at postion's left to inserted block
    currentNodeAtPos!.left = insertedBlock;

    //set the insertedBloc's left to left
    insertedBlock.left = left;
    //set the insertedbllock's right to the currentNodeAtPos
    insertedBlock.right = currentNodeAtPos;

    //set the respective origins
    insertedBlock.originLeft = left!.id;
    insertedBlock.originRight = currentNodeAtPos!.id;

    //increase the length && push the element/item/block to the doc
    this.items.push(insertedBlock);
    return insertedBlock;
  }

  //deletes an item/block at a given index
  //this is what a user uses to delete an item locally
  delete(index: number) {
    //if the user tries to delete  a  block at an index greater than the current document's length
    if (index > this.toString().length || index < 0) {
      console.log(this.toString().length);
      throw new Error(`Invalid Operation ${index}`);
    }

    //find the node at the given index
    const nodeAtIndex = this.findNodeAtPos(index);

    // if(nodeAtIndex)

    //set the value to undefined & reduce the length
    nodeAtIndex!.value = undefined;

    const deletedNode: DeletedNode = {
      id: this.__deletedLamportTimestamp.id,
      deletedItemId: nodeAtIndex!.id,
    };

    //Push it to the delete vector
    if (!this.deletedItems[this.clientId]) {
      this.deletedItems[this.clientId] = [deletedNode];
    } else {
      this.deletedItems[this.clientId].push(deletedNode);
    }

    return deletedNode;
  }

  //deletes a node by it's id
  deleteNodeById(deletedItem: DeletedNode) {
    const node = this.findNodeById(deletedItem.deletedItemId);

    //todo add a can delete method, to check if the delete exists or not

    //if the node exists locally
    if (node) {
      if (this.deletedItems[deletedItem.id[0]]) {
        const item =
          this.deletedItems[deletedItem.id[0]][
            this.deletedItems[deletedItem.id[0]].length - 1
          ];

        //duplicate
        if (deletedItem.id[1] <= item.id[1]) {
          //   console.log(`we coninuted`);
          return;
        }

        if (item.id[1] + 1 !== deletedItem.id[1]) {
          console.warn(
            `todo!, out of order delete, ignoring it`,
            item,
            deletedItem
          );
          return;
        }

        node.value = "";
        this.deletedItems[deletedItem.id[0]].push(deletedItem);
      } else {
        if (deletedItem.id[1] !== 0) {
          //   console.log(`out or order delete, ignoring it`);
          return;
        }

        node.value = "";
        this.deletedItems[deletedItem.id[0]] = [deletedItem];
      }
    } else {
      console.log(`node not found`);
      console.log(deletedItem);
    }
  }

  //returns the current value of the document
  toString() {
    // console.log(this.simpleDoc());
    let str = (this.__head?.value ?? "") as string;

    let right = this.__head?.right;

    while (true) {
      if (!right) break;

      str += right.value ?? ("" as string);

      right = right.right;
    }

    return str;
  }

  canInsert = (block: Node) => {
    const origin = this.findNodeById(block.originLeft!);
    const originRight = this.findNodeById(block.originRight!);
    if (block.originLeft && !origin) return false;
    if (block.originRight && !originRight) return false;

    const node = this.findNodeById(block.id);

    if (node) return false;

    //check for correct order of insert

    const stateVector = this.getStateVector();

    if (typeof stateVector[block.id[0]] === "undefined" && block.id[1] !== 0) {
      return false;
    } else if (
      typeof stateVector[block.id[0]] === "number" &&
      stateVector[block.id[0]] !== block.id[1] - 1
    ) {
      return false;
    }

    return true;
  };

  findChanges(state: Node[]) {
    const unseenUpdates: Node[] = [];
    const newDeletes: Node[] = [];

    //remote state's map
    state.map((block) => {
      const item = this.items.find((item) => {
        return LamportTimestamp.compare(item.id, block.id);
      });

      if (item) {
        if (item.value !== block.value) newDeletes.push(item);
      } else {
        unseenUpdates.push(block);
      }
    });

    return { unseenUpdates, newDeletes };
  }

  //merge with a remote/other Doc's state
  merge(remoteState: RemoteNode[]) {
    const { unseenUpdates } = this.findChanges(remoteState);
    let isPending: boolean = false;

    //* loop over all new updates
    for (let item of unseenUpdates) {
      const newItem = this.buildBlock(item);

      //if we can't insert now skip
      if (!this.canInsert(newItem)) {
        //   pendingUpdates.push(newItem);

        //todo
        // this.pendingUpdates.push(newItem)
        isPending = true;

        console.log(`pending item `, newItem);

        continue;
      }

      //if this is the first insert, on a empty doc
      if (this.items.length < 1) {
        this.__head = newItem;
        this.__tail = newItem;
        this.items.push(newItem);
        continue;
      }

      //find the parent origins
      const ol = this.findNodeById(newItem.originLeft!);
      const or = this.findNodeById(newItem.originRight!);

      //set the left to the current parent
      //we will use this as pointer after which we want to insert
      let left = ol;

      //item inserted at start [no conflicts version]
      if (!ol && or === this.__head) {
        // console.log(`start insettion  ${newItem.value}  ${this.userId}`);
        const right = this.__head;
        this.__head = newItem;
        newItem.right = right;

        right.left = newItem;

        this.items.push(newItem);
        continue;
      }

      //item inserted at end! [no conflicts version]
      if (!or && ol === this.__tail) {
        if (newItem.right?.value) {
          console.log(newItem.right?.value);
        }
        // console.log(
        //   `end insertion ${newItem.value}  ${this.userId} ${newItem.right?.value}`
        // );
        const left = this.__tail;
        this.__tail = newItem;

        newItem.left = left;
        left.right = newItem;

        this.items.push(newItem);
        continue;
      }

      //this is a conflicting update
      //case 1 -> if the parent (origin left) is there && parent's right is not equal to the (origin right). that means this update was not aware of the parent's right so a conflicting update
      //case 2 ->
      //  if both parents are not defined. please note that we already took care if the update was on a empty document in the beginning of this funciton
      // so not having both parents will be conflicting update
      // if origin left is not defined and origin right 's current left is not defined. that means this update was not aware of the current left. so a conflicting update
      if ((ol && ol.right !== or) || (!ol && (!or || or.left !== undefined))) {
        // console.log(`conflicting! -> ${newItem.value}  ${this.userId}`);

        //we use this variable to loop over our linkedlist
        let o;

        //set o to the first conflicting item
        if (left) {
          o = left.right;
        } else {
          o = this.__head;
        }

        //current counter of conflicting blocks
        const conflictingCounter = new Set();

        //all the blocks that we've seen after the origin and before the origin right
        const seen = new Set();

        while (o !== undefined) {
          if (!o) break;
          if (LamportTimestamp.compare(o.id, or?.id)) break;
          //check now?
          //This is going to be all the items from you originLeft to the actual left where you want to insert the item
          seen.add(o);

          //this is used to track current iteration of conflicting items
          conflictingCounter.add(o);

          //if they have the same parent
          if (LamportTimestamp.compare(o?.originLeft, newItem.originLeft)) {
            // console.log(`same parent `);

            //if they both have same origin left and same origin right
            //and the newItem has a greater id , then we break and insert
            if (
              newItem.id[0] > o!.id[0] &&
              LamportTimestamp.compare(newItem!.originRight, o.originRight)
            )
              break;

            //else they might have a smaller id or a diffferent right origin,
            //but due to same origin left. we mark the current item as the left and clear the conflict counter
            if (newItem.id[0] < o!.id[0]) {
              left = o!;
              conflictingCounter.clear();
            }
          }

          //if they don't have the same origin but they are still within our origin left
          else if (
            o!.originLeft &&
            seen.has(this.findNodeById(o!.originLeft!))
          ) {
            //if we have seen the items's origin left/ and the parent was cleared from conflicting set. we also want to skip this item as well
            //because we come to the right hand side of this.
            if (!conflictingCounter.has(this.findNodeById(o!.originLeft!))) {
              //   console.log(`hey i'm being called? ${o.value}`);
              left = o!;
              conflictingCounter.clear();
            }
          }
          //reaching this point, where the block/item does not have the same origin left and also the origin left is not within the new item's origin left. we break
          else {
            break;
          }
          o = o!.right;
        }

        // if()
      }

      //   if (
      //     this.userId === "doc1" &&
      //     (newItem.value === "1" ||
      //       newItem.value === "A" ||
      //       newItem.value === "Q")
      //   ) {
      //     // console.log(`${newItem.value}  -> ${left?.value}`);
      //   }

      if (left) {
        let right = left.right;
        left.right = newItem;
        newItem.left = left;
        if (right) {
          newItem.right = right;
          right.left = newItem;
        } else {
          //   console.log(`end is ${newItem.value}`);
          this.__tail = newItem;
        }

        this.items.push(newItem);
      } else {
        // console.log(`bomb`);
        let right = this.__head;
        this.__head = newItem;
        newItem.right = right;
        right!.left = newItem;

        this.items.push(newItem);
      }
    }

    return isPending;

    //* loop for merging the pending updates.
  }

  //since deletes do not have a merge conflict
  syncDeletes(deleteSet: DeleteSet) {
    for (let clientId in deleteSet) {
      deleteSet[clientId].map((deletedItem) => {
        this.deleteNodeById(deletedItem);
      });
    }

    //todo add the pending structs to the list of pending deletes struts
  }

  //internal & protocol representations will be state vectors, for items/records. as well as another state vector for deletes for syncronization

  toProsemirrorJson() {
    const baseDoc = {
      type: "doc",
      content: [] as any[],
    };

    let currentDoc: any = {};

    if (this.__head) {
      if (this.__head.value) {
        if (this.__head.value === "\n") {
          const newDoc = { type: "hardBreak" };
          baseDoc.content.push(newDoc);
          currentDoc = undefined;
        } else {
          if (currentDoc && currentDoc.type === "text") {
            currentDoc.text += this.__head.value;
          } else {
            const newDoc = { type: "text", text: this.__head.value };
            baseDoc.content.push(newDoc);
            currentDoc = newDoc;
          }
        }
      }
    }

    let right = this.__head?.right;

    while (true) {
      if (!right) break;

      if (right.value) {
        if (right.value === "\n") {
          const newDoc = { type: "hardBreak" };
          baseDoc.content.push(newDoc);
          currentDoc = undefined;
        } else {
          if (currentDoc && currentDoc.type === "text") {
            currentDoc.text += right.value;
          } else {
            const newDoc = { type: "text", text: right.value };
            baseDoc.content.push(newDoc);
            currentDoc = newDoc;
          }
        }
      }

      right = right.right;
    }

    return baseDoc;
  }

  //getting the state vector
  getStateVector() {
    let stateVector: StateVector = {};

    for (let i = 0; i < this.items.length; i++) {
      let itemId = this.items[i].id;

      const [client, clock] = itemId;

      if (stateVector[client]) {
        stateVector[client] =
          stateVector[client] > clock ? stateVector[client] : clock;
      } else {
        stateVector[client] = clock;
      }
    }

    return stateVector;

    //going through all the items, and building the state vector
  }

  //create a getState function
  getState(): Node[] {
    const items: Node[] = [];
    this.items.forEach((item) => {
      items.push({
        id: item.id,
        originRight: item.originRight,
        originLeft: item.originLeft,
        value: item.value,
      });
    });

    return items;
  }

  getEncodedDoc(): EncodedDoc {
    const items = this.getState();
    const deletes = this.deletedItems;

    return {
      items,
      deletes,
    };
  }

  applyDoc(doc: EncodedDoc) {
    //reset if applying on an existing loaded doc!
    this.reset();
    this.merge(doc.items);
    this.syncDeletes(doc.deletes);
  }

  compareVectors(localVector: StateVector, remoteVector: StateVector) {
    const weLack: Record<number, ID[]> = {};
    const theyLack: Record<number, ID[]> = {};

    for (let client in localVector) {
      if (
        !remoteVector[client] &&
        typeof remoteVector[client] === "undefined"
      ) {
        theyLack[client] = [];
        for (let i = 0; i < localVector[client]; i++) {
          theyLack[client].push([parseInt(client), i]);
        }
      } else if (remoteVector[client] > localVector[client]) {
        //we lack this
      } else if (remoteVector[client] < localVector[client]) {
        theyLack[client] = [];
        for (let i = remoteVector[client]; i < localVector[client]; i++) {
          theyLack[client].push([parseInt(client), i]);
        }
      }
    }

    for (let client in remoteVector) {
      if (!localVector[client] && typeof remoteVector[client] === "undefined") {
        // console.log(`we lack this ${client}`);
        // console.log(localVector);
        weLack[client] = [];
        for (let i = 0; i < remoteVector[client]; i++) {
          weLack[client].push([parseInt(client), i]);
        }
      } else if (localVector[client] > remoteVector[client]) {
        //they lack this
      } else if (localVector[client] < remoteVector[client]) {
        weLack[client] = [];
        for (let i = localVector[client]; i < remoteVector[client]; i++) {
          weLack[client].push([parseInt(client), i]);
        }
      }
    }

    return { weLack, theyLack };

    //return what we lack
    //return what they lack
    //return equal
  }

  //
  sendableUpdates(remoteVector: StateVector) {
    //the problemo is sending updates in a somewhat correct order?
    //or adding the ability to add pending updates in the merge function
    const sendableUpdates: SimpleNode[] = [];

    //this tells us, if we should broadcast our state vector to others, to ask for updates if we lag behind
    let shouldBroadcastVector: boolean = false;

    //if the remote user is a new Doc
    if (!remoteVector || Object.keys(remoteVector).length < 1) {
      return {
        sendableUpdates: this.getState(),
        shouldBroadcastVector,
      };
    }

    const { theyLack, weLack } = this.compareVectors(
      this.getStateVector(),
      remoteVector
    );
    // console.log(`welack`, weLack);

    if (Object.keys(weLack).length >= 1) shouldBroadcastVector = true;

    if (Object.keys(theyLack).length < 1)
      return {
        shouldBroadcastVector,
        sendableUpdates,
      };

    //todo, improvement needed

    for (let i = 0; i < this.items.length; i++) {
      const [client, clock] = this.items[i].id;

      //if the remote client does not have the client, or a lesser clock
      if (!remoteVector[client] || remoteVector[client] < clock) {
        sendableUpdates.push(this.toSimpleNode(this.items[i]));
      }
    }

    return {
      shouldBroadcastVector,
      sendableUpdates,
    };

    //returning all the items not in that remote vector
  }

  sendableDeletes(remoteVector: StateVector) {
    const sendableDeletes: DeleteSet = {};
    let shouldBroadcastDeleteVector: boolean = false;

    const localVector = this.getDeleteStateVector();

    const { theyLack, weLack } = this.compareVectors(localVector, remoteVector);

    if (Object.keys(weLack).length >= 1) shouldBroadcastDeleteVector = true;

    if (Object.keys(theyLack).length < 1)
      return {
        shouldBroadcastDeleteVector,
        sendableDeletes,
      };

    for (let clientId in this.deletedItems) {
      if (remoteVector[clientId]) {
        //send only the new reamining updates

        if (remoteVector[clientId] === localVector[clientId]) continue;

        if (remoteVector[clientId] > localVector[clientId]) continue;
        sendableDeletes[clientId] = [
          ...this.deletedItems[clientId].slice(remoteVector[clientId] - 1),
        ];
      } else {
        sendableDeletes[clientId] = [...this.deletedItems[clientId]];
      }
    }

    return { sendableDeletes, shouldBroadcastDeleteVector };
  }

  //todo!, we're storing deletes as there own state vector. bo
  //! or we can just have deletes as a count? or a simple state crdt
  getDeleteStateVector(): StateVector {
    const vector: StateVector = {};

    for (let client in this.deletedItems) {
      vector[client] = this.deletedItems[client].length - 1;
    }

    return vector;
  }

  reset() {
    if (this.items.length < 1) return;

    this.clientId = randomInt(9999999);
    this.items = [];
    this.pendingUpdates = [];
    this.deletedItems = {};
    this.__lamportTimestamp = new LamportTimestamp(this.clientId);
    this.__deletedLamportTimestamp = new LamportTimestamp(this.clientId);
    this.__head = undefined;
    this.__tail = undefined;
  }
}
