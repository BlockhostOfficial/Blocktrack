import App from './app'

import minecraftJavaPing, { NewPingResult, OldPingResult } from 'minecraft-protocol'
import minecraftBedrockPing from 'bedrock-protocol'

import logger from './logger'
import MessageOf from './message'
import { TimeTracker } from './time'
import { getPlayerCountOrNull } from './util'
import ServerRegistration, { ProtocolVersion } from './servers'

minecraftJavaPing.ping({ host: 'play.minecraft.net', port: 25565 }, (err, data) => {
  if (err) {
    console.log(err)
  } else {
    console.log(data)
  }
})

const config = require('../config')

export interface Payload {
  players: Players
  version?: number
  favicon?: string
}

export interface Players {
  online: number
}

interface PingResults {
  [key: string]: {resp: Payload | undefined, err: Error | undefined, version: ProtocolVersion}
}

function isNewResult (result: OldPingResult | NewPingResult): result is NewPingResult {
  return (result as NewPingResult).latency !== undefined
}

function ping (serverRegistration: ServerRegistration, timeout: number, callback: (error: Error | undefined, payload?: Payload | undefined) => void, version: number) {
  switch (serverRegistration.data.type) {
    case 'PC':
      serverRegistration.dnsResolver.resolve((ip: string, port: number, remainingTimeout: number) => {
        minecraftJavaPing.ping({ host: ip, port: port || 25565, protocolVersion: version.toString() }, (err, data) => {
          if (err != null) {
            callback(err, undefined)
          } else if (data) {
            if (isNewResult(data)) {
              const payload: Payload = {
                players: {
                  online: capPlayerCount(serverRegistration.data.ip, data.players.online)
                },
                version: parseInt(data.version.protocol)
              }

              // Ensure the returned favicon is a data URI
              if (data.favicon && data.favicon.startsWith('data:image/')) {
                payload.favicon = data.favicon
              }

              callback(undefined, payload)
            } else {
              callback(new Error('Old ping result'), undefined)
            }
          }
        })
      })
      break

    case 'PE':
      minecraftBedrockPing.ping({ host: serverRegistration.data.ip, port: serverRegistration.data.port || 19132 }).then(data => {
        callback(undefined, {
          players: {
            online: capPlayerCount(serverRegistration.data.ip, data.playersOnline)
          }
        })
      }).catch(err => {
        callback(err)
      })
      break

    default:
      throw new Error('Unsupported type: ' + serverRegistration.data.type)
  }
}

// player count can be up to 1^32-1, which is a massive scale and destroys browser performance when rendering graphs
// Artificially cap and warn to prevent propogating garbage
function capPlayerCount (host: string, playerCount: number) {
  const maxPlayerCount = 250000

  if (playerCount !== Math.min(playerCount, maxPlayerCount)) {
    logger.log('warn', '%s returned a player count of %d, Minetrack has capped it to %d to prevent browser performance issues with graph rendering. If this is in error, please edit maxPlayerCount in ping.js!', host, playerCount, maxPlayerCount)

    return maxPlayerCount
  } else if (playerCount !== Math.max(playerCount, 0)) {
    logger.log('warn', '%s returned an invalid player count of %d, setting to 0.', host, playerCount)

    return 0
  }
  return playerCount
}

class PingController {
  private readonly _app: App
  private _isRunningTasks: boolean

  constructor (app: App) {
    this._app = app
    this._isRunningTasks = false
  }

  schedule () {
    setInterval(this.pingAll, config.rates.pingAll)

    this.pingAll()
  }

  pingAll = () => {
    const {
      timestamp,
      updateHistoryGraph
    } = this._app.timeTracker.newPointTimestamp()

    this.startPingTasks(results => {
      const updates = []

      for (const serverRegistration of this._app.serverRegistrations) {
        const result = results[serverRegistration.serverId]

        // Log to database if enabled
        // Use null to represent a failed ping
        if (config.logToDatabase) {
          const unsafePlayerCount = getPlayerCountOrNull(result.resp)

          if (this._app.database != null) {
            this._app.database.insertPing(serverRegistration.data.ip, timestamp, unsafePlayerCount)
          }
        }

        // Generate a combined update payload
        // This includes any modified fields and flags used by the frontend
        // This will not be cached and can contain live metadata
        updates[serverRegistration.serverId] = serverRegistration.handlePing(timestamp, result.resp, result.err, result.version, updateHistoryGraph)
      }

      // Send object since updates uses serverIds as keys
      // Send a single timestamp entry since it is shared
      this._app.server.broadcast(MessageOf('updateServers', {
        timestamp: TimeTracker.toSeconds(timestamp),
        updateHistoryGraph,
        updates
      }))
    })
  }

  startPingTasks = (callback: (results: PingResults) => void) => {
    if (this._isRunningTasks) {
      logger.log('warn', 'Started re-pinging servers before the last loop has finished! You may need to increase "rates.pingAll" in config.json')

      return
    }

    this._isRunningTasks = true

    const results: PingResults = {}

    for (const serverRegistration of this._app.serverRegistrations) {
      const version = serverRegistration.getNextProtocolVersion()

      ping(serverRegistration, config.rates.connectTimeout, (err, resp) => {
        if ((err != null) && config.logFailedPings) {
          logger.log('error', 'Failed to ping %s: %s', serverRegistration.data.ip, err.message)
        }

        results[serverRegistration.serverId] = {
          resp,
          err,
          version
        }

        if (Object.keys(results).length === this._app.serverRegistrations.length) {
          // Loop has completed, release the locking flag
          this._isRunningTasks = false

          callback(results)
        }
      }, version.protocolId)
    }
  }
}

export default PingController
