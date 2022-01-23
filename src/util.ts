import { Payload } from './ping'

export function getPlayerCountOrNull (resp: Payload | undefined) {
  if (resp != null) {
    return resp.players.online
  } else {
    return null
  }
}
