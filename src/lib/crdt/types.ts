//* This is a lamport timestamp. we will not store a global counter like RGA, but instead one clock for each client
export type ID = [number, number];

//* A single node is responsible for representing a single character in the text
export interface Node {
  id: ID; //* the id of the node
  originLeft?: ID; //* the id of the parent/left node, during the time of creation
  originRight?: ID; //* the id of the next/right node , during the time of creation

  left?: Node; //* the current parent/left node
  right?: Node; //* the current next/right node

  value?: string; //* value of the item,  undefined in case the object was deleted
}

//* this is a simple node that does not have left & right. convertible to json without any circular deps
export interface SimpleNode {
  id: ID; //* the id of the node
  originLeft?: ID; //* the id of the parent/left node, during the time of creation
  originRight?: ID; //* the id of the next/right node , during the time of creation

  value?: string; //* value of the item,  undefined in case the object was deleted
}

export interface RemoteNode extends SimpleNode {}

export interface StateVector {
  [clientId: number]: number;
}
export interface DeletedNode {
  id: ID;
  deletedItemId: ID;
}

export interface DeleteSet {
  [clientId: number]: DeletedNode[];
}

export interface EncodedDoc {
  items: SimpleNode[];
  deletes: DeleteSet;
}
