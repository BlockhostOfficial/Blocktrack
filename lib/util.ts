import {Payload} from "./ping";

export function getPlayerCountOrNull (resp: Payload) {
  if (resp) {
    return resp.players.online
  } else {
    return null
  }
}
