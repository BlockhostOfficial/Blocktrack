import http, { IncomingMessage } from 'http'

import * as WebSocket from 'ws'
import App from './app'
const format = require('lib/util').format
import finalHttpHandler from 'finalhandler'
import serveStatic from 'serve-static'

import logger = require('./logger')

const HASHED_FAVICON_URL_REGEX = /hashedfavicon_([a-z0-9]{32}).png/g

function getRemoteAddr (req: IncomingMessage): string | undefined | string[] {
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip']
  } else if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for']
  } else {
    return req.socket.remoteAddress
  }
}

class Server {
  _http: http.Server
  _wss: WebSocket.Server
  _app: App

  constructor (app: App) {
    this._app = app

    this.createHttpServer()
    this.createWebSocketServer()
  }

  static getHashedFaviconUrl (hash: string) {
    // Format must be compatible with HASHED_FAVICON_URL_REGEX
    return format(`/hashedfavicon_${hash}.png`)
  }

  createHttpServer () {
    const distServeStatic = serveStatic('dist/')
    const faviconsServeStatic = serveStatic('favicons/')

    this._http = http.createServer((req, res) => {
      logger.log('info', '%s requested: %s', getRemoteAddr(req), req.url)

      // Test the URL against a regex for hashed favicon URLs
      // Require only 1 match ([0]) and test its first captured group ([1])
      // Any invalid value or hit miss will pass into static handlers below
      const faviconHash = [...req.url.matchAll(HASHED_FAVICON_URL_REGEX)]

      if (faviconHash.length === 1 && this.handleFaviconRequest(res, faviconHash[0][1])) {
        return
      }

      // Attempt to handle req using distServeStatic, otherwise fail over to faviconServeStatic
      // If faviconServeStatic fails, pass to finalHttpHandler to terminate
      distServeStatic(req, res, () => {
        faviconsServeStatic(req, res, finalHttpHandler(req, res))
      })
    })
  }

  handleFaviconRequest = (res: ServerResponse, faviconHash) => {
    for (const serverRegistration of this._app.serverRegistrations) {
      if (serverRegistration.faviconHash && serverRegistration.faviconHash === faviconHash) {
        const buf = Buffer.from(serverRegistration.lastFavicon.split(',')[1], 'base64')

        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=604800' // Cache hashed favicon for 7 days
        }).end(buf)

        return true
      }
    }

    return false
  }

  createWebSocketServer () {
    this._wss = new WebSocket.Server({
      server: this._http
    })

    this._wss.on('connection', (client, req) => {
      logger.log('info', '%s connected, total clients: %d', getRemoteAddr(req), this.getConnectedClients())

      // Bind disconnect event for logging
      client.on('close', () => {
        logger.log('info', '%s disconnected, total clients: %d', getRemoteAddr(req), this.getConnectedClients())
      })

      // Pass client off to proxy handler
      this._app.handleClientConnection(client)
    })
  }

  listen (host: string, port: number) {
    this._http.listen(port, host)

    logger.log('info', 'Started on %s:%d', host, port)
  }

  broadcast (payload: string) {
    this._wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    })
  }

  getConnectedClients () {
    let count = 0
    this._wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        count++
      }
    })
    return count
  }
}

export default Server
