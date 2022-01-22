import App from './app'

import crypto from 'crypto'

import DNSResolver from './dns'
import Server from './server'
import { ServerTypeConfig } from '../main'
import { Payload } from './ping'

const {
  GRAPH_UPDATE_TIME_GAP,
  TimeTracker
} = require('./time')
const { getPlayerCountOrNull } = require('./util')

const config = require('../config')
const minecraftVersions = require('../minecraft_versions')

interface PayloadHistory {
  playerCountHistory?: number[]
  playerCount?: number
  graphPeakData?: { playerCount: any, timestamp: number }
  versions: number[]
  recordData: RecordData | undefined
  favicon: string | undefined
}

interface ServerType {
  favicon: string
  port: number
  name: string
  ip: string
  type: string
  color?: string
}

interface UpdatePayload {
  error?: { message: string }
  graphPeakData?: undefined | { playerCount: any, timestamp: number }
  favicon?: string | undefined
  versions?: number[]
  playerCount: number | null
  recordData?: RecordData
}

interface RecordData {
  playerCount: number
  timestamp: number
}

export interface ProtocolVersion {
  protocolId: number
  protocolIndex: number
}

class ServerRegistration {
  serverId
  lastFavicon: string | undefined
  versions: number[] = []
  recordData: RecordData | undefined
  graphData = []
  _app: App
  data: ServerType
  _pingHistory: number[]
  dnsResolver: DNSResolver
  _nextProtocolIndex: number | undefined
  faviconHash: string | undefined
  _graphPeakIndex: number | undefined

  constructor (app: App, serverId: number, data: ServerType) {
    this._app = app
    this.serverId = serverId
    this.data = data
    this._pingHistory = []
    this.dnsResolver = new DNSResolver(this.data.ip, this.data.port)
  }

  handlePing (timestamp: number, resp: Payload | undefined, err: Error | undefined, version: any, updateHistoryGraph: boolean) {
    // Use null to represent a failed ping
    const unsafePlayerCount = getPlayerCountOrNull(resp)

    // Store into in-memory ping data
    TimeTracker.pushAndShift(this._pingHistory, unsafePlayerCount, TimeTracker.getMaxServerGraphDataLength())

    // Only notify the frontend to append to the historical graph
    // if both the graphing behavior is enabled and the backend agrees
    // that the ping is eligible for addition
    if (updateHistoryGraph) {
      TimeTracker.pushAndShift(this.graphData, unsafePlayerCount, TimeTracker.getMaxGraphDataLength())
    }

    // Delegate out update payload generation
    return this.getUpdate(timestamp, resp, err, version)
  }

  getUpdate (timestamp: number, resp: Payload | undefined, err: Error | undefined, version: { protocolId: any, protocolIndex: any }) {
    const update: UpdatePayload = {
      // Always append a playerCount value
      // When resp is undefined (due to an error), playerCount will be null
      playerCount: getPlayerCountOrNull(resp)
    }

    if (resp != null) {
      if (resp.version && this.updateProtocolVersionCompat(resp.version, version.protocolId, version.protocolIndex)) {
        // Append an updated version listing
        update.versions = this.versions
      }

      if (config.logToDatabase && ((this.recordData == null) || resp.players.online > this.recordData.playerCount)) {
        this.recordData = {
          playerCount: resp.players.online,
          timestamp: TimeTracker.toSeconds(timestamp)
        }

        // Append an updated recordData
        update.recordData = this.recordData
      }

      if (this.updateFavicon(resp.favicon)) {
        update.favicon = this.getFaviconUrl()
      }

      if (config.logToDatabase) {
        // Update calculated graph peak regardless if the graph is being updated
        // This can cause a (harmless) desync between live and stored data, but it allows it to be more accurate for long surviving processes
        if (this.findNewGraphPeak()) {
          update.graphPeakData = this.getGraphPeak()
        }
      }
    } else if (err != null) {
      // Append a filtered copy of err
      // This ensures any unintended data is not leaked
      update.error = this.filterError(err)
    }

    return update
  }

  getPingHistory () {
    if (this._pingHistory.length > 0) {
      const payload: PayloadHistory = {
        versions: this.versions,
        recordData: this.recordData,
        favicon: this.getFaviconUrl()
      }

      // Only append graphPeakData if defined
      // The value is lazy computed and conditional that config->logToDatabase == true
      const graphPeakData = this.getGraphPeak()

      if (graphPeakData != null) {
        payload.graphPeakData = graphPeakData
      }

      // Assume the ping was a success and define result
      // pingHistory does not keep error references, so its impossible to detect if this is an error
      // It is also pointless to store that data since it will be short lived
      payload.playerCount = this._pingHistory[this._pingHistory.length - 1]

      // Send a copy of pingHistory
      // Include the last value even though it is contained within payload
      // The frontend will only push to its graphData from playerCountHistory
      payload.playerCountHistory = this._pingHistory

      return payload
    }

    return {
      error: {
        message: 'Pinging...'
      },
      recordData: this.recordData,
      graphPeakData: this.getGraphPeak(),
      favicon: this.data.favicon
    }
  }

  loadGraphPoints (startTime: number, timestamps: number[], points: number[]) {
    this.graphData = TimeTracker.everyN(timestamps, startTime, GRAPH_UPDATE_TIME_GAP, (i: number) => points[i])
  }

  findNewGraphPeak () {
    let index = -1
    for (let i = 0; i < this.graphData.length; i++) {
      const point = this.graphData[i]
      if (point !== null && (index === -1 || point > this.graphData[index])) {
        index = i
      }
    }
    if (index >= 0) {
      const lastGraphPeakIndex = this._graphPeakIndex
      this._graphPeakIndex = index
      return index !== lastGraphPeakIndex
    } else {
      this._graphPeakIndex = undefined
      return false
    }
  }

  getGraphPeak () {
    if (this._graphPeakIndex === undefined) {
      return
    }
    return {
      playerCount: this.graphData[this._graphPeakIndex],
      timestamp: this._app.timeTracker.getGraphPointAt(this._graphPeakIndex)
    }
  }

  updateFavicon (favicon: string | undefined) {
    // If data.favicon is defined, then a favicon override is present
    // Disregard the incoming favicon, regardless if it is different
    if (this.data.favicon) {
      return false
    }

    if (favicon && favicon !== this.lastFavicon) {
      this.lastFavicon = favicon

      // Generate an updated hash
      // This is used by #getFaviconUrl
      this.faviconHash = crypto.createHash('md5').update(favicon).digest('hex').toString()

      return true
    }

    return false
  }

  getFaviconUrl (): string | undefined {
    if (this.faviconHash) {
      return Server.getHashedFaviconUrl(this.faviconHash)
    } else if (this.data.favicon) {
      return this.data.favicon
    } else {
      return undefined
    }
  }

  updateProtocolVersionCompat (incomingId: number, outgoingId: any, protocolIndex: number) {
    // If the result version matches the attempted version, the version is supported
    const isSuccess = incomingId === outgoingId
    const indexOf = this.versions.indexOf(protocolIndex)

    // Test indexOf to avoid inserting previously recorded protocolIndex values
    if (isSuccess && indexOf < 0) {
      this.versions.push(protocolIndex)

      // Sort versions in ascending order
      // This matches protocol ids to Minecraft versions release order
      this.versions.sort((a, b) => a - b)

      return true
    } else if (!isSuccess && indexOf >= 0) {
      this.versions.splice(indexOf, 1)
      return true
    }
    return false
  }

  getNextProtocolVersion (): ProtocolVersion {
    // Minecraft Bedrock Edition does not have protocol versions
    if (this.data.type === 'PE') {
      return {
        protocolId: 0,
        protocolIndex: 0
      }
    }
    const protocolVersions = minecraftVersions[this.data.type]
    if (this._nextProtocolIndex === undefined || this._nextProtocolIndex + 1 >= protocolVersions.length) {
      this._nextProtocolIndex = 0
    } else {
      this._nextProtocolIndex++
    }
    return {
      protocolId: protocolVersions[this._nextProtocolIndex].protocolId,
      protocolIndex: this._nextProtocolIndex
    }
  }

  filterError (err: Error) {
    let message = 'Unknown error'

    // Attempt to match to the first possible value
    for (const key of ['message', 'description', 'errno']) {
      if (err.hasOwnProperty(key)) {
        message = err.message
        break
      }
    }

    // Trim the message if too long
    if (message.length > 28) {
      message = message.substring(0, 28) + '...'
    }

    return {
      message: message
    }
  }

  getPublicData (): ServerTypeConfig {
    // Return a custom object instead of data directly to avoid data leakage
    return {
      name: this.data.name,
      ip: this.data.ip,
      type: this.data.type,
      color: this.data.color
    }
  }
}

export default ServerRegistration
