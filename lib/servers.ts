import uPlot from 'uplot'

import { RelativeScale } from './scale'

import {
  formatDate,
  formatMinecraftServerAddress,
  formatMinecraftVersions,
  formatNumber,
  formatTimestampSeconds
} from './util'
import { uPlotTooltipPlugin } from './plugins'

import MISSING_FAVICON from '../public/missing_favicon.svg'
import { App } from './app'
import { PayloadErrorHistory, PayloadHistory, PeakData, PublicServerData, RecordData, UpdatePayload } from '../src/types'
import { MinecraftVersions } from '../src/app'

export class ServerRegistry {
  private readonly _app: App
  private _serverIdsByName: { [name: string]: number } = {}
  private _serverDataById: { [id: string]: PublicServerData } = {}
  private _registeredServers: ServerRegistration[]

  constructor (app: App) {
    this._app = app
    this._serverIdsByName = {}
    this._serverDataById = {}
    this._registeredServers = []
  }

  assignServers (servers: PublicServerData[]) {
    for (let i = 0; i < servers.length; i++) {
      const data = servers[i]
      this._serverIdsByName[data.name] = i
      this._serverDataById[i] = data
    }
  }

  createServerRegistration (serverId: number) {
    const serverData = this._serverDataById[serverId]
    const serverRegistration = new ServerRegistration(this._app, serverId, serverData)
    this._registeredServers[serverId] = serverRegistration
    return serverRegistration
  }

  getServerRegistration (serverKey: string | number) {
    if (typeof serverKey === 'string') {
      const serverId = this._serverIdsByName[serverKey]
      return this._registeredServers[serverId]
    } else {
      return this._registeredServers[serverKey]
    }
  }

  getServerRegistrations = () => Object.values(this._registeredServers)

  reset () {
    this._serverIdsByName = {}
    this._serverDataById = {}
    this._registeredServers = []

    // Reset modified DOM structures
    document.getElementById('server-list')!.innerHTML = ''
  }
}

export class ServerRegistration {
  playerCount = 0
  isVisible = true
  isFavorite = false
  rankIndex: number | undefined
  lastRecordData: RecordData | undefined
  lastPeakData: PeakData | undefined
  readonly serverId: number
  data: PublicServerData
  private readonly _app: App
  private _graphData: [xValues: number[], ...yValues: Array<Array<number | null | undefined>>]
  private _failedSequentialPings: number
  private _plotInstance: uPlot | undefined

  constructor (app: App, serverId: number, data: PublicServerData) {
    this._app = app
    this.serverId = serverId
    this.data = data
    this._graphData = [[], []]
    this._failedSequentialPings = 0
  }

  getGraphDataIndex () {
    return this.serverId + 1
  }

  addGraphPoints (points: number[], timestampPoints: number[]) {
    this._graphData = [
      timestampPoints.slice(),
      points
    ]
  }

  buildPlotInstance () {
    const tickCount = 4

    // eslint-disable-next-line new-cap
    this._plotInstance = new uPlot({
      plugins: [
        uPlotTooltipPlugin((pos, id) => {
          if ((pos != null) && id) {
            const playerCount = this._graphData[1][id]

            if (typeof playerCount !== 'number') {
              this._app.tooltip.hide()
            } else {
              this._app.tooltip.set(pos.left, pos.top, 10, 10, `${formatNumber(playerCount)} Players<br>${formatTimestampSeconds(this._graphData[0][id])}`)
            }
          } else {
            this._app.tooltip.hide()
          }
        })
      ],
      height: 100,
      width: 400,
      cursor: {
        y: false,
        drag: {
          setScale: false,
          x: false,
          y: false
        },
        sync: {
          key: 'minetrack-server',
          setSeries: true
        }
      },
      series: [
        {},
        {
          stroke: '#E9E581',
          width: 2,
          value: (_, raw) => `${formatNumber(raw)} Players`,
          spanGaps: true,
          points: {
            show: false
          }
        }
      ],
      axes: [
        {
          show: false
        },
        {
          ticks: {
            show: false
          },
          font: '14px "Open Sans", sans-serif',
          stroke: '#A3A3A3',
          size: 55,
          grid: {
            stroke: '#333',
            width: 1
          },
          splits: () => {
            const {
              scaledMin,
              scaledMax,
              scale
            } = RelativeScale.scale(this._graphData[1], tickCount, undefined)
            return RelativeScale.generateTicks(scaledMin, scaledMax, scale)
          }
        }
      ],
      scales: {
        y: {
          auto: false,
          range: () => {
            const {
              scaledMin,
              scaledMax
            } = RelativeScale.scale(this._graphData[1], tickCount, undefined)
            return [scaledMin, scaledMax]
          }
        }
      },
      legend: {
        show: false
      }
    }, this._graphData, document.getElementById(`chart_${this.serverId}`)!)
  }

  handlePing (payload: UpdatePayload, timestamp: number) {
    if (typeof payload.playerCount === 'number') {
      this.playerCount = payload.playerCount

      // Reset failed ping counter to ensure the next connection error
      // doesn't instantly retrigger a layout change
      this._failedSequentialPings = 0
    } else {
      // Attempt to retain a copy of the cached playerCount for up to N failed pings
      // This prevents minor connection issues from constantly reshuffling the layout
      if (++this._failedSequentialPings > 5) {
        this.playerCount = 0
      }
    }

    // Use payload.playerCount so nulls WILL be pushed into the graphing data
    this._graphData[0].push(timestamp)
    this._graphData[1].push(payload.playerCount)

    // Trim graphData to within the max length by shifting out the leading elements
    for (const series of this._graphData) {
      if (series.length > this._app.publicConfig!.serverGraphMaxLength) {
        series.shift()
      }
    }

    // Redraw the plot instance
    this._plotInstance!.setData(this._graphData)
  }

  updateServerRankIndex (rankIndex: number) {
    this.rankIndex = rankIndex

    document.getElementById(`ranking_${this.serverId}`)!.innerText = `#${rankIndex + 1}`
  }

  _renderValue (prefix: string, handler: ((value: HTMLElement) => void) | string) {
    const labelElement = document.getElementById(`${prefix}_${this.serverId}`)!

    labelElement.style.display = 'block'

    const valueElement = document.getElementById(`${prefix}-value_${this.serverId}`)
    const targetElement = (valueElement != null) ? valueElement : labelElement

    if (targetElement) {
      if (typeof handler === 'function') {
        handler(targetElement)
      } else {
        targetElement.innerText = handler
      }
    }
  }

  _hideValue (prefix: string) {
    const element = document.getElementById(`${prefix}_${this.serverId}`)!

    element.style.display = 'none'
  }

  updateServerStatus (ping: UpdatePayload, minecraftVersions: MinecraftVersions) {
    if (ping.versions != null) {
      this._renderValue('version', formatMinecraftVersions(ping.versions, minecraftVersions[this.data.type]) || '')
    }

    if (ping.recordData != null) {
      this._renderValue('record', (element) => {
        if (ping.recordData == null) return

        if (ping.recordData.timestamp > 0) {
          element.innerText = `${formatNumber(ping.recordData.playerCount)} (${formatDate(ping.recordData.timestamp)})`
          element.title = `At ${formatDate(ping.recordData.timestamp)} ${formatTimestampSeconds(ping.recordData.timestamp)}`
        } else {
          element.innerText = formatNumber(ping.recordData.playerCount)
        }
      })

      this.lastRecordData = ping.recordData
    }

    if (ping.graphPeakData != null) {
      this._renderValue('peak', (element) => {
        if (ping.graphPeakData == null) return

        element.innerText = formatNumber(ping.graphPeakData.playerCount)
        element.title = `At ${formatTimestampSeconds(ping.graphPeakData.timestamp)}`
      })

      this.lastPeakData = ping.graphPeakData
    }

    if (ping.error != null) {
      this._hideValue('player-count')
      this._renderValue('error', ping.error.message)
    } else if (ping.playerCount) {
      this._hideValue('error')
      this._renderValue('player-count', formatNumber(ping.playerCount))
    } else {
      this._hideValue('player-count')

      // If the frontend has freshly connection, and the server's last ping was in error, it may not contain an error object
      // In this case playerCount will safely be null, so provide a generic error message instead
      this._renderValue('error', 'Failed to ping')
    }

    // An updated favicon has been sent, update the src
    if (ping.favicon) {
      const faviconElement = document.getElementById(`favicon_${this.serverId}`)!

      // Since favicons may be URLs, only update the attribute when it has changed
      // Otherwise the browser may send multiple requests to the same URL
      if (faviconElement.getAttribute('src') !== ping.favicon) {
        faviconElement.setAttribute('src', ping.favicon)
      }
    }
  }

  initServerStatus (latestPing: (PayloadHistory | PayloadErrorHistory)) {
    const serverElement = document.createElement('div')

    serverElement.id = `container_${this.serverId}`
    serverElement.innerHTML = `<div class="column column-favicon">
        <img class="server-favicon" src="${latestPing.favicon || MISSING_FAVICON.src}" id="favicon_${this.serverId}" title="${this.data.name}\n${formatMinecraftServerAddress(this.data.ip, this.data.port)}" alt="Favicon of ${this.data.name}">
        <span class="server-rank" id="ranking_${this.serverId}"></span>
      </div>
      <div class="column column-status">
        <h3 class="server-name"><span class="${this._app.favoritesManager.getIconClass(this.isFavorite)}" id="favorite-toggle_${this.serverId}"></span> ${this.data.name}</h3>
        <span class="server-error" id="error_${this.serverId}"></span>
        <span class="server-label" id="player-count_${this.serverId}">Players: <span class="server-value" id="player-count-value_${this.serverId}"></span></span>
        <span class="server-label" id="peak_${this.serverId}">${this._app.publicConfig!.graphDurationLabel} Peak: <span class="server-value" id="peak-value_${this.serverId}">-</span></span>
        <span class="server-label" id="record_${this.serverId}">Record: <span class="server-value" id="record-value_${this.serverId}">-</span></span>
        <span class="server-label" id="version_${this.serverId}"></span>
      </div>
      <div class="column column-graph" id="chart_${this.serverId}"></div>`

    serverElement.setAttribute('class', 'server')

    document.getElementById('server-list')!.appendChild(serverElement)
  }

  updateHighlightedValue (selectedCategory: string) {
    ['player-count', 'peak', 'record'].forEach((category) => {
      const labelElement = document.getElementById(`${category}_${this.serverId}`)!
      const valueElement = document.getElementById(`${category}-value_${this.serverId}`)!

      if (selectedCategory && category === selectedCategory) {
        labelElement.setAttribute('class', 'server-highlighted-label')
        valueElement.setAttribute('class', 'server-highlighted-value')
      } else {
        labelElement.setAttribute('class', 'server-label')
        valueElement.setAttribute('class', 'server-value')
      }
    })
  }

  initEventListeners () {
    document.getElementById(`favorite-toggle_${this.serverId}`)!.addEventListener('click', () => {
      this._app.favoritesManager.handleFavoriteButtonClick(this)
    }, false)
  }
}
