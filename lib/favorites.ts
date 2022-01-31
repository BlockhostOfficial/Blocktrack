import { App } from './app'
import { ServerRegistration } from './servers'

export const FAVORITE_SERVERS_STORAGE_KEY = 'minetrack_favorite_servers'

export class FavoritesManager {
  private readonly _app: App

  constructor (app: App) {
    this._app = app
  }

  loadLocalStorage () {
    if (typeof localStorage !== 'undefined') {
      const serverNames = localStorage.getItem(FAVORITE_SERVERS_STORAGE_KEY)
      if (serverNames) {
        const jsonParsed = JSON.parse(serverNames)

        for (let i = 0; i < jsonParsed.length; i++) {
          const serverRegistration = this._app.serverRegistry.getServerRegistration(jsonParsed[i])

          // The serverName may not exist in the backend configuration anymore
          // Ensure serverRegistration is defined before mutating data or considering valid
          if (serverRegistration) {
            serverRegistration.isFavorite = true

            // Update icon since by default it is unfavorited
            document.getElementById(`favorite-toggle_${serverRegistration.serverId}`)!.setAttribute('class', this.getIconClass(serverRegistration.isFavorite))
          }
        }
      }
    }
  }

  updateLocalStorage () {
    if (typeof localStorage !== 'undefined') {
      // Mutate the serverIds array into server names for storage use
      const serverNames = this._app.serverRegistry.getServerRegistrations()
        .filter(serverRegistration => serverRegistration.isFavorite)
        .map(serverRegistration => serverRegistration.data.name)

      if (serverNames.length > 0) {
        // Only save if the array contains data, otherwise clear the item
        localStorage.setItem(FAVORITE_SERVERS_STORAGE_KEY, JSON.stringify(serverNames))
      } else {
        localStorage.removeItem(FAVORITE_SERVERS_STORAGE_KEY)
      }
    }
  }

  handleFavoriteButtonClick = (serverRegistration: ServerRegistration) => {
    serverRegistration.isFavorite = !serverRegistration.isFavorite

    // Update the displayed favorite icon
    document.getElementById(`favorite-toggle_${serverRegistration.serverId}`)!.setAttribute('class', this.getIconClass(serverRegistration.isFavorite))

    // Request the app controller instantly re-sort the server listing
    // This handles the favorite sorting logic internally
    this._app.sortController.sortServers()

    this._app.graphDisplayManager.handleServerIsFavoriteUpdate(serverRegistration)

    // Write an updated settings payload
    this.updateLocalStorage()
  }

  getIconClass (isFavorite: boolean) {
    if (isFavorite) {
      return 'icon-star server-is-favorite'
    } else {
      return 'icon-star-o server-is-not-favorite'
    }
  }
}
