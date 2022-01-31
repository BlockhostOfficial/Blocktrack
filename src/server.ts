import http, { IncomingMessage, ServerResponse } from 'http'

import * as WebSocket from 'ws'
import App from './app'
import serveStatic from 'serve-static'

import logger from './logger'
import { RequestHandler } from 'next/dist/server/base-server'

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
  _http: http.Server | undefined
  _wss1: WebSocket.Server | undefined
  _app: App

  constructor (app: App, nextHandler: RequestHandler) {
    this._app = app

    this.createHttpServer(nextHandler)
    this.createWebSocketServer()
  }

  static getHashedFaviconUrl (hash: string) {
    // Format must be compatible with HASHED_FAVICON_URL_REGEX
    return `/hashedfavicon_${hash}.png`
  }

  createHttpServer (nextHandler: RequestHandler) {
    const faviconsServeStatic = serveStatic('favicons/')

    this._http = http.createServer((req, res) => {
      if (!req.url) return

      logger.log('info', '%s requested: %s', getRemoteAddr(req), req.url)

      // Test the URL against a regex for hashed favicon URLs
      // Require only 1 match ([0]) and test its first captured group ([1])
      // Any invalid value or hit miss will pass into static handlers below
      const faviconHash = [...req.url.matchAll(HASHED_FAVICON_URL_REGEX)]

      if (faviconHash.length === 1 && this.handleFaviconRequest(res, faviconHash[0][1])) {
        return
      }

      nextHandler(req, res)
    })
  }

  handleFaviconRequest = (res: ServerResponse, faviconHash: string) => {
    for (const serverRegistration of this._app.serverRegistrations) {
      if (serverRegistration.faviconHash && serverRegistration.lastFavicon && serverRegistration.faviconHash === faviconHash) {
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
    this._wss1 = new WebSocket.Server({
      noServer: true
    })

    this._wss1.on('connection', (client, req) => {
      logger.log('info', '%s connected, total clients: %d', getRemoteAddr(req), this.getConnectedClients())

      // Bind disconnect event for logging
      client.on('close', () => {
        logger.log('info', '%s disconnected, total clients: %d', getRemoteAddr(req), this.getConnectedClients())
      })

      // Pass client off to proxy handler
      this._app.handleClientConnection(client)
    })

    this._http!.on('upgrade', (request, socket, head) => {
      if (request.url !== '/_next/webpack-hmr') {
        this._wss1!.handleUpgrade(request, socket, head, (ws) => {
          this._wss1!.emit('connection', ws, request)
        })
      }
    })
  }

  listen (host: string, port: number) {
    if (this._http == null) {
      throw new Error('Cannot listen without an http server')
    }

    this._http.listen(port, host)

    logger.log('info', 'Started on http://%s:%d', host, port)
  }

  broadcast (payload: string) {
    if (this._wss1! == null) {
      throw new Error('Cannot broadcast without a websocket server')
    }

    this._wss1.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    })
  }

  getConnectedClients () {
    if (this._wss1! == null) {
      throw new Error('Cannot get connected clients without a websocket server')
    }

    let count = 0
    this._wss1.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        count++
      }
    })
    return count
  }
}

export default Server
