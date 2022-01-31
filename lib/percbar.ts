import { formatNumber, formatPercent } from './util'
import { App } from './app'
import { ServerRegistration } from './servers'

export class PercentageBar {
  private readonly _app: App
  private _parent: HTMLElement

  constructor (app: App) {
    this._app = app
    this._parent = document.getElementById('perc-bar')!
  }

  redraw = () => {
    const serverRegistrations = this._app.serverRegistry.getServerRegistrations().sort(function (a, b) {
      return a.playerCount - b.playerCount
    })

    const totalPlayers = this._app.getTotalPlayerCount()

    let leftPadding = 0

    for (const serverRegistration of serverRegistrations) {
      const width = Math.round((serverRegistration.playerCount / totalPlayers) * this._parent.offsetWidth)

      // Update position/width
      // leftPadding is a sum of previous iterations width value
      const div = (document.getElementById(`perc-bar-part_${serverRegistration.serverId}`) != null) || this.createPart(serverRegistration)

      const widthPixels = `${width}px`
      const leftPaddingPixels = `${leftPadding}px`

      // Only redraw if needed
      if (div.style.width !== widthPixels || div.style.left !== leftPaddingPixels) {
        div.style.width = widthPixels
        div.style.left = leftPaddingPixels
      }

      leftPadding += width
    }
  }

  createPart (serverRegistration: ServerRegistration) {
    const div = document.createElement('div')

    div.id = `perc-bar-part_${serverRegistration.serverId}`

    if (serverRegistration.data.color) { div.style.background = serverRegistration.data.color }

    div.setAttribute('class', 'perc-bar-part')
    div.setAttribute('minetrack-server-id', String(serverRegistration.serverId))

    this._parent.appendChild(div)

    // Define events once during creation
    div.addEventListener('mouseover', this.handleMouseOver, false)
    div.addEventListener('mouseout', this.handleMouseOut, false)

    return div
  }

  handleMouseOver = (event: MouseEvent) => {
    if ((event.target == null) || !(event.target instanceof HTMLElement) || !event.target.hasAttribute('minetrack-server-id')) {
      return
    }

    const serverId = parseInt(event.target.getAttribute('minetrack-server-id')!)
    const serverRegistration = this._app.serverRegistry.getServerRegistration(serverId)

    if (!serverRegistration) {
      return
    }

    this._app.tooltip.set(event.target.offsetLeft, event.target.offsetTop, 10, this._parent.offsetTop + this._parent.offsetHeight + 10,
            `${typeof serverRegistration.rankIndex !== 'undefined' ? `#${serverRegistration.rankIndex + 1} ` : ''}
      ${serverRegistration.data.name}<br>
      ${formatNumber(serverRegistration.playerCount)} Players<br>
      <strong>${formatPercent(serverRegistration.playerCount, this._app.getTotalPlayerCount())}</strong>`)
  }

  handleMouseOut = () => {
    this._app.tooltip.hide()
  }

  reset () {
    // Reset modified DOM elements
    this._parent.innerHTML = ''
  }
}
