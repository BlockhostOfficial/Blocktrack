import dns from 'dns'

import logger from './logger'

import { TimeTracker } from './time'
import { ConfigType } from '../main'

const config: ConfigType = require('../config/config')

const SKIP_SRV_TIMEOUT = config.skipSrvTimeout || 60 * 60 * 1000

class DNSResolver {
  _ip: string
  _port: number
  private _skipSrvUntil: any

  constructor (ip: string, port: number) {
    this._ip = ip
    this._port = port
  }

  _skipSrv () {
    this._skipSrvUntil = TimeTracker.getEpochMillis() + SKIP_SRV_TIMEOUT
  }

  _isSkipSrv () {
    return this._skipSrvUntil && TimeTracker.getEpochMillis() <= this._skipSrvUntil
  }

  resolve (callback: (ip: string, port: number, remainingTimeout: number) => void) {
    if (this._isSkipSrv()) {
      callback(this._ip, this._port, config.rates.connectTimeout)

      return
    }

    const startTime = TimeTracker.getEpochMillis()

    let callbackFired = false

    const fireCallback = (ip: string | undefined, port: number | undefined) => {
      if (!callbackFired) {
        callbackFired = true

        // Send currentTime - startTime to provide remaining connectionTime allowance
        const remainingTime = config.rates.connectTimeout - (TimeTracker.getEpochMillis() - startTime)

        callback(ip || this._ip, port || this._port, remainingTime)
      }
    }

    const timeoutCallback = setTimeout(fireCallback, config.rates.connectTimeout)

    dns.resolveSrv('_minecraft._tcp.' + this._ip, (err, addresses) => {
      // Cancel the timeout handler if not already fired
      if (!callbackFired) {
        clearTimeout(timeoutCallback)
      }

      // Test if the error indicates a miss, or if the records returned are empty
      if (((err != null) && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')) || !addresses || addresses.length === 0) {
        // Compare config.skipSrvTimeout directly since SKIP_SRV_TIMEOUT has an or'd value
        // isSkipSrvTimeoutDisabled == whether the config has a valid skipSrvTimeout value set
        const isSkipSrvTimeoutDisabled = typeof config.skipSrvTimeout === 'number' && config.skipSrvTimeout === 0

        // Only activate _skipSrv if the skipSrvTimeout value is either NaN or > 0
        // 0 represents a disabled flag
        if (!this._isSkipSrv() && !isSkipSrvTimeoutDisabled) {
          this._skipSrv()

          logger.log('warn', 'No SRV records were resolved for %s. Minetrack will skip attempting to resolve %s SRV records for %d minutes.', this._ip, this._ip, SKIP_SRV_TIMEOUT / (60 * 1000))
        }

        fireCallback(undefined, undefined)
      } else {
        // Only fires if !err && records.length > 0
        fireCallback(addresses[0].name, addresses[0].port)
      }
    })
  }
}

export default DNSResolver
