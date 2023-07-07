import { ID } from "./types";

export class LamportTimestamp {
  private clientId: number;
  private clock: number;

  constructor(clientId: number) {
    this.clientId = clientId;
    this.clock = 0;
  }

  get id(): ID {
    return [this.clientId, this.clock++];
  }

  static compare(timestamp1?: ID, timestamp2?: ID) {
    if (!timestamp1 && !timestamp2) return true;

    if (!timestamp1) return false;
    if (!timestamp2) return false;

    if (timestamp1[0] !== timestamp2[0]) return false;
    if (timestamp1[1] !== timestamp2[1]) return false;

    return true;
  }
}
