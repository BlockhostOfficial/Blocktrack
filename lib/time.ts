import App from './app'

const config = require('../config.json')

const GRAPH_UPDATE_TIME_GAP = 60 * 1000 // 60 seconds

class TimeTracker {
  _app: any
  _serverGraphPoints: any[]
  _graphPoints: any[]
  _lastHistoryGraphUpdate: number | undefined

  constructor (app: App) {
    this._app = app
    this._serverGraphPoints = []
    this._graphPoints = []
  }

  static toSeconds = (timestamp: number) => {
    return Math.floor(timestamp / 1000)
  }

  static getEpochMillis () {
    return new Date().getTime()
  }

  static getMaxServerGraphDataLength () {
    return Math.ceil(config.serverGraphDuration / config.rates.pingAll)
  }

  static getMaxGraphDataLength () {
    return Math.ceil(config.graphDuration / GRAPH_UPDATE_TIME_GAP)
  }

  static everyN (array: any[], start: number, diff: number, adapter: (item: number) => any) {
    const selected = []
    let lastPoint = start

    for (let i = 0; i < array.length; i++) {
      const point = array[i]

      if (point - lastPoint >= diff) {
        lastPoint = point
        selected.push(adapter(i))
      }
    }

    return selected
  }

  static pushAndShift (array: any[], value: any, maxLength: number) {
    array.push(value)

    if (array.length > maxLength) {
      array.splice(0, array.length - maxLength)
    }
  }

  newPointTimestamp () {
    const timestamp = TimeTracker.getEpochMillis()

    TimeTracker.pushAndShift(this._serverGraphPoints, timestamp, TimeTracker.getMaxServerGraphDataLength())

    // Flag each group as history graph additions each minute
    // This is sent to the frontend for graph updates
    const updateHistoryGraph: boolean = config.logToDatabase && (!this._lastHistoryGraphUpdate || timestamp - this._lastHistoryGraphUpdate >= GRAPH_UPDATE_TIME_GAP)

    if (updateHistoryGraph) {
      this._lastHistoryGraphUpdate = timestamp

      // Push into timestamps array to update backend state
      TimeTracker.pushAndShift(this._graphPoints, timestamp, TimeTracker.getMaxGraphDataLength())
    }

    return {
      timestamp,
      updateHistoryGraph
    }
  }

  loadGraphPoints (startTime: number, timestamps: number[]) {
    // This is a copy of ServerRegistration#loadGraphPoints
    // timestamps contains original timestamp data and needs to be filtered into minutes
    this._graphPoints = TimeTracker.everyN(timestamps, startTime, GRAPH_UPDATE_TIME_GAP, (i) => timestamps[i])
  }

  getGraphPointAt (i: number) {
    return TimeTracker.toSeconds(this._graphPoints[i])
  }

  getServerGraphPoints () {
    return this._serverGraphPoints.map(TimeTracker.toSeconds)
  }

  getGraphPoints () {
    return this._graphPoints.map(TimeTracker.toSeconds)
  }
}

export {
  GRAPH_UPDATE_TIME_GAP,
  TimeTracker
}
