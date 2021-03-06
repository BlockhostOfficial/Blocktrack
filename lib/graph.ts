import uplot from 'uplot'

import { RelativeScale } from './scale'

import { formatNumber, formatTimestampSeconds } from './util'
import { uPlotTooltipPlugin } from './plugins'

import { FAVORITE_SERVERS_STORAGE_KEY } from './favorites'
import { App } from './app'
import { ServerRegistration } from './servers'

const HIDDEN_SERVERS_STORAGE_KEY = 'minetrack_hidden_servers'
const SHOW_FAVORITES_STORAGE_KEY = 'minetrack_show_favorites'

export class GraphDisplayManager {
  private readonly _app: App
  private _hasLoadedSettings: boolean
  private _initEventListenersOnce: boolean
  private _showOnlyFavorites: boolean
  private _graphData: number[][]
  private _graphTimestamps: number[]
  private _plotInstance: uplot | undefined
  private _resizeRequestTimeout: NodeJS.Timeout | undefined

  constructor (app: App) {
    this._app = app
    this._graphData = []
    this._graphTimestamps = []
    this._hasLoadedSettings = false
    this._initEventListenersOnce = false
    this._showOnlyFavorites = false
  }

  addGraphPoint (timestamp: number, playerCounts: number[]) {
    if (!this._hasLoadedSettings) {
      // _hasLoadedSettings is controlled by #setGraphData
      // It will only be true once the context has been loaded and initial payload received
      // #addGraphPoint should not be called prior to that since it means the data is racing
      // and the application has received updates prior to the initial state
      return
    }

    // Calculate isZoomed before mutating graphData otherwise the indexed values
    // are out of date and will always fail when compared to plotScaleX.min/max
    const plotScaleX = this._plotInstance!.scales.x

    if (!plotScaleX.min || !plotScaleX.max) return

    const isZoomed = plotScaleX.min > this._graphTimestamps[0] || plotScaleX.max < this._graphTimestamps[this._graphTimestamps.length - 1]

    this._graphTimestamps.push(timestamp)

    for (let i = 0; i < playerCounts.length; i++) {
      this._graphData[i].push(playerCounts[i])
    }

    // Trim all data arrays to only the relevant portion
    // This keeps it in sync with backend data structures
    const graphMaxLength = this._app.publicConfig!.graphMaxLength

    if (this._graphTimestamps.length > graphMaxLength) {
      this._graphTimestamps.splice(0, this._graphTimestamps.length - graphMaxLength)
    }

    for (const series of this._graphData) {
      if (series.length > graphMaxLength) {
        series.splice(0, series.length - graphMaxLength)
      }
    }

    // Avoid redrawing the plot when zoomed
    this._plotInstance!.setData(this.getGraphData(), !isZoomed)
  }

  loadLocalStorage () {
    if (typeof localStorage !== 'undefined') {
      const showOnlyFavorites = localStorage.getItem(SHOW_FAVORITES_STORAGE_KEY)
      if (showOnlyFavorites) {
        this._showOnlyFavorites = true
      }

      // If only favorites mode is active, use the stored favorite servers data instead
      let serverNames
      if (this._showOnlyFavorites) {
        serverNames = localStorage.getItem(FAVORITE_SERVERS_STORAGE_KEY)
      } else {
        serverNames = localStorage.getItem(HIDDEN_SERVERS_STORAGE_KEY)
      }

      if (serverNames) {
        serverNames = JSON.parse(serverNames)

        // Iterate over all active serverRegistrations
        // This merges saved state with current state to prevent desyncs
        for (const serverRegistration of this._app.serverRegistry.getServerRegistrations()) {
          // isVisible will be true if showOnlyFavorites && contained in FAVORITE_SERVERS_STORAGE_KEY
          // OR, if it is NOT contains within HIDDEN_SERVERS_STORAGE_KEY
          // Checks between FAVORITE/HIDDEN keys are mutually exclusive
          if (this._showOnlyFavorites) {
            serverRegistration.isVisible = serverNames.indexOf(serverRegistration.data.name) >= 0
          } else {
            serverRegistration.isVisible = serverNames.indexOf(serverRegistration.data.name) < 0
          }
        }
      }
    }
  }

  updateLocalStorage () {
    if (typeof localStorage !== 'undefined') {
      // Mutate the serverIds array into server names for storage use
      const serverNames = this._app.serverRegistry.getServerRegistrations()
        .filter(serverRegistration => !serverRegistration.isVisible)
        .map(serverRegistration => serverRegistration.data.name)

      // Only store if the array contains data, otherwise clear the item
      // If showOnlyFavorites is true, do NOT store serverNames since the state will be auto managed instead
      if (serverNames.length > 0 && !this._showOnlyFavorites) {
        localStorage.setItem(HIDDEN_SERVERS_STORAGE_KEY, JSON.stringify(serverNames))
      } else {
        localStorage.removeItem(HIDDEN_SERVERS_STORAGE_KEY)
      }

      // Only store SHOW_FAVORITES_STORAGE_KEY if true
      if (this._showOnlyFavorites) {
        localStorage.setItem(SHOW_FAVORITES_STORAGE_KEY, String(true))
      } else {
        localStorage.removeItem(SHOW_FAVORITES_STORAGE_KEY)
      }
    }
  }

  getVisibleGraphData () {
    return this._app.serverRegistry.getServerRegistrations()
      .filter(serverRegistration => serverRegistration.isVisible)
      .map(serverRegistration => this._graphData[serverRegistration.serverId])
  }

  getPlotSize () {
    return {
      width: Math.max(window.innerWidth, 800) * 0.9,
      height: 400
    }
  }

  getGraphData (): uplot.AlignedData {
    return [
      this._graphTimestamps,
      ...this._graphData
    ]
  }

  getGraphDataPoint (serverId: number, index: number) {
    const graphData = this._graphData[serverId]
    if (graphData && index < graphData.length && typeof graphData[index] === 'number') {
      return graphData[index]
    }
  }

  getClosestPlotSeriesIndex (idx: number) {
    let closestSeriesIndex = -1
    let closestSeriesDist = Number.MAX_VALUE

    if (this._plotInstance == null) return

    const plotHeight = this._plotInstance.bbox.height / devicePixelRatio

    for (let i = 1; i < this._plotInstance.series.length; i++) {
      const series = this._plotInstance.series[i]

      if (!series.show || !series.scale) {
        console.log('Series not found', series)
        continue
      }

      const point = this._plotInstance.data[i][idx]

      if (typeof point === 'number') {
        const scale = this._plotInstance.scales[series.scale]

        if (scale.min && scale.max && this._plotInstance.cursor.top) {
          const posY = (1 - ((point - scale.min) / (scale.max - scale.min))) * plotHeight

          const dist = Math.abs(posY - this._plotInstance.cursor.top)

          if (dist < closestSeriesDist) {
            closestSeriesIndex = i
            closestSeriesDist = dist
          }
        }
      }
    }

    return closestSeriesIndex
  }

  buildPlotInstance (timestamps: number[], data: number[][]) {
    // Lazy load settings from localStorage, if any and if enabled
    if (!this._hasLoadedSettings) {
      this._hasLoadedSettings = true

      this.loadLocalStorage()
    }

    for (const playerCounts of data) {
      // Each playerCounts value corresponds to a ServerRegistration
      // Require each array is the length of timestamps, if not, pad at the start with null values to fit to length
      // This ensures newer ServerRegistrations do not left align due to a lower length
      const lengthDiff = timestamps.length - playerCounts.length

      if (lengthDiff > 0) {
        const padding = Array(lengthDiff).fill(null)

        playerCounts.unshift(...padding)
      }
    }

    this._graphTimestamps = timestamps
    this._graphData = data

    const series = this._app.serverRegistry.getServerRegistrations().map(serverRegistration => {
      const result: uplot.Series = {
        stroke: serverRegistration.data.color,
        width: 2,
        value: (_, raw) => `${formatNumber(raw)} Players`,
        show: serverRegistration.isVisible,
        spanGaps: true,
        points: {
          show: false
        }
      }
      return result
    })

    const tickCount = 10
    const maxFactor = 4

    this._plotInstance = new uplot({
      plugins: [
        uPlotTooltipPlugin((pos, idx) => {
          if ((pos != null) && idx) {
            const closestSeriesIndex = this.getClosestPlotSeriesIndex(idx)
            const registrations = this._app.serverRegistry.getServerRegistrations().filter(serverRegistration => serverRegistration.isVisible)

            const points: {[id: number]: number | undefined} = {}

            registrations.forEach(registration => points[registration.serverId] = this.getGraphDataPoint(registration.serverId, idx))

            const text = registrations
              .sort((a, b) => {
                const aPlayerCount = points[a.serverId]
                const bPlayerCount = points[b.serverId]

                if (a.isFavorite !== b.isFavorite) {
                  return a.isFavorite ? -1 : 1
                } else if (aPlayerCount !== bPlayerCount) {
                  if (!aPlayerCount || !bPlayerCount)
                    return aPlayerCount ? -1 : 1

                  return aPlayerCount > bPlayerCount ? -1 : 1
                } else {
                  return a.data.name.localeCompare(b.data.name)
                }
              })
              .map(serverRegistration => {
                const point = points[serverRegistration.serverId]

                let serverName = serverRegistration.data.name
                if (closestSeriesIndex === serverRegistration.getGraphDataIndex()) {
                  serverName = `<strong>${serverName}</strong>`
                }
                if (serverRegistration.isFavorite) {
                  serverName = `<span class="${this._app.favoritesManager.getIconClass(true)}"></span> ${serverName}`
                }

                return `${serverName}: ${formatNumber(point)}`
              }).join('<br>') + `<br><br><strong>${formatTimestampSeconds(this._graphTimestamps[idx])}</strong>`

            this._app.tooltip.set(pos.left, pos.top, 10, 10, text)
          } else {
            this._app.tooltip.hide()
          }
        })
      ],
      ...this.getPlotSize(),
      cursor: {
        y: false
      },
      series: [
        {},
        ...series
      ],
      axes: [
        {
          font: '14px "Open Sans", sans-serif',
          stroke: '#FFF',
          grid: {
            show: false
          },
          space: 60
        },
        {
          font: '14px "Open Sans", sans-serif',
          stroke: '#FFF',
          size: 65,
          grid: {
            stroke: '#333',
            width: 1
          },
          splits: () => {
            const visibleGraphData = this.getVisibleGraphData()
            const {
              scaledMax,
              scale
            } = RelativeScale.scaleMatrix(visibleGraphData, tickCount, maxFactor)
            return RelativeScale.generateTicks(0, scaledMax, scale)
          }
        }
      ],
      scales: {
        y: {
          auto: false,
          range: () => {
            const visibleGraphData = this.getVisibleGraphData()
            const {
              scaledMin,
              scaledMax
            } = RelativeScale.scaleMatrix(visibleGraphData, tickCount, maxFactor)
            return [scaledMin, scaledMax]
          }
        }
      },
      legend: {
        show: false
      }
    }, this.getGraphData(), document.getElementById('big-graph')!)

    // Show the settings-toggle element
    document.getElementById('settings-toggle')!.style.display = 'inline-block'
  }

  redraw = () => {
    // Use drawing as a hint to update settings
    // This may cause unnecessary localStorage updates, but it's a rare and harmless outcome
    this.updateLocalStorage()

    // Copy application state into the series data used by uPlot
    for (const serverRegistration of this._app.serverRegistry.getServerRegistrations()) {
      this._plotInstance!.series[serverRegistration.getGraphDataIndex()].show = serverRegistration.isVisible
    }

    this._plotInstance!.redraw()
  }

  requestResize () {
    // Only resize when _plotInstance is defined
    // Set a timeout to resize after resize events have not been fired for some duration of time
    // This prevents burning CPU time for multiple, rapid resize events
    if (this._plotInstance != null) {
      if (this._resizeRequestTimeout != null) {
        clearTimeout(this._resizeRequestTimeout)
      }

      // Schedule new delayed resize call
      // This can be cancelled by #requestResize, #resize and #reset
      this._resizeRequestTimeout = setTimeout(this.resize, 200)
    }
  }

  resize = () => {
    this._plotInstance!.setSize(this.getPlotSize())

    // clear value so #clearTimeout is not called
    // This is safe even if #resize is manually called since it removes the pending work
    if (this._resizeRequestTimeout != null) {
      clearTimeout(this._resizeRequestTimeout)
    }

    this._resizeRequestTimeout = undefined
  }

  initEventListeners () {
    if (!this._initEventListenersOnce) {
      this._initEventListenersOnce = true

      // These listeners should only be init once since they attach to persistent elements
      document.getElementById('settings-toggle')!.addEventListener('click', this.handleSettingsToggle, false)

      document.querySelectorAll('.graph-controls-show').forEach((element) => {
        element.addEventListener('click', this.handleShowButtonClick, false)
      })
    }

    // These listeners should be bound each #initEventListeners call since they are for newly created elements
    document.querySelectorAll('.graph-control').forEach((element) => {
      element.addEventListener('click', this.handleServerButtonClick, false)
    })
  }

  handleServerButtonClick = (event: Event) => {
    if ((event.target == null) || !(event.target instanceof HTMLInputElement) || !event.target.hasAttribute('minetrack-server-id')) return

    const serverId = parseInt(event.target.getAttribute('minetrack-server-id')!)
    const serverRegistration = this._app.serverRegistry.getServerRegistration(serverId)

    if (serverRegistration.isVisible !== event.target.checked) {
      serverRegistration.isVisible = event.target.checked

      // Any manual changes automatically disables "Only Favorites" mode
      // Otherwise the auto management might overwrite their manual changes
      this._showOnlyFavorites = false

      this.redraw()
    }
  }

  handleShowButtonClick = (event: Event) => {
    if ((event.target == null) || !(event.target instanceof HTMLAnchorElement) || !event.target.hasAttribute('minetrack-show-type')) return

    const showType = event.target.getAttribute('minetrack-show-type')

    // If set to "Only Favorites", set internal state so that
    // visible graphData is automatically updating when a ServerRegistration's #isVisible changes
    // This is also saved and loaded by #loadLocalStorage & #updateLocalStorage
    this._showOnlyFavorites = showType === 'favorites'

    let redraw = false

    this._app.serverRegistry.getServerRegistrations().forEach(function (serverRegistration) {
      let isVisible
      if (showType === 'all') {
        isVisible = true
      } else if (showType === 'none') {
        isVisible = false
      } else if (showType === 'favorites') {
        isVisible = serverRegistration.isFavorite
      }

      if (isVisible !== undefined && serverRegistration.isVisible !== isVisible) {
        serverRegistration.isVisible = isVisible
        redraw = true
      }
    })

    if (redraw) {
      console.log("a")
      this.redraw()
      this.updateCheckboxes()
    }
  }

  handleSettingsToggle = () => {
    const element = document.getElementById('big-graph-controls-drawer')!

    if (element.style.display !== 'block') {
      element.style.display = 'block'
    } else {
      element.style.display = 'none'
    }
  }

  handleServerIsFavoriteUpdate = (serverRegistration: ServerRegistration) => {
    // When in "Only Favorites" mode, visibility is dependent on favorite status
    // Redraw and update elements as needed
    if (this._showOnlyFavorites && serverRegistration.isVisible !== serverRegistration.isFavorite) {
      serverRegistration.isVisible = serverRegistration.isFavorite

      this.redraw()
      this.updateCheckboxes()
    }
  }

  updateCheckboxes () {
    document.querySelectorAll('.graph-control').forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement) || !checkbox.hasAttribute('minetrack-server-id')) return

      const serverId = parseInt(checkbox.getAttribute('minetrack-server-id')!)
      const serverRegistration = this._app.serverRegistry.getServerRegistration(serverId)

      checkbox.checked = serverRegistration.isVisible
    })
  }

  reset () {
    // Destroy graphs and unload references
    // uPlot#destroy handles listener de-registration, DOM reset, etc
    if (this._plotInstance != null) {
      this._plotInstance.destroy()
      this._plotInstance = undefined
    }

    this._graphTimestamps = []
    this._graphData = []
    this._hasLoadedSettings = false

    // Fire #clearTimeout if the timeout is currently defined
    if (this._resizeRequestTimeout != null) {
      clearTimeout(this._resizeRequestTimeout)

      this._resizeRequestTimeout = undefined
    }

    // Reset modified DOM structures
    document.getElementById('big-graph-checkboxes')!.innerHTML = ''
    document.getElementById('big-graph-controls')!.style.display = 'none'

    document.getElementById('settings-toggle')!.style.display = 'none'
  }
}
