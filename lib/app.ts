import Database from './database'
import Server from './server'
import PingController from './ping'

import {TimeTracker} from './time'
import MessageOf from './message'
import ServerRegistration from './servers'
import WebSocket from 'ws'
import {ServerTypeConfig} from "../main";
import {ErrorHistory, HistoryGraphMessage, PayloadHistory} from "./types";

const config = require('../config')
const minecraftVersions: MinecraftVersionsType = require('../minecraft_versions')

interface MinecraftVersionsType {
    [type: string]: Version[]
}

interface Version {
    name: string
    protocolId: number
}

export interface HistoryGraphPayload {

}

export interface ClientConfig {
    graphDurationLabel: any;
    graphMaxLength: number;
    serverGraphMaxLength: number;
    servers: ServerTypeConfig[];
    minecraftVersions: MinecraftVersions;
    isGraphVisible: boolean;
}

export interface MinecraftVersions {
    [index: string]: string[];
}

export interface InitMessage {
    config: ClientConfig;
    timestampPoints: number[];
    servers: (PayloadHistory | ErrorHistory)[]
}


class App {
    serverRegistrations: ServerRegistration[] = []
    timeTracker: TimeTracker
    database: Database | undefined
    pingController: PingController
    server: Server

    constructor() {
        this.pingController = new PingController(this)
        this.server = new Server(this)
        this.timeTracker = new TimeTracker(this)
    }

    loadDatabase(callback: () => void) {
        this.database = new Database(this)

        // Setup database instance
        this.database.ensureIndexes(() => {
            if (this.database == null) return

            this.database.loadGraphPoints(config.graphDuration, () => {
                if (this.database == null) return

                this.database.loadRecords(callback)
            })
        })
    }

    handleReady() {
        this.server.listen(config.site.ip, config.site.port)

        // Allow individual modules to manage their own task scheduling
        this.pingController.schedule()
    }

    handleClientConnection = (client: WebSocket) => {
        if (config.logToDatabase) {
            client.on('message', (message) => {
                if (message.toString() === 'requestHistoryGraph') {
                    // Send historical graphData built from all serverRegistrations
                    const graphData = this.serverRegistrations.map(serverRegistration => serverRegistration.graphData)

                    const message: HistoryGraphMessage = {
                        timestamps: this.timeTracker.getGraphPoints(),
                        graphData
                    }

                    // Send graphData in object wrapper to avoid needing to explicity filter
                    // any header data being appended by #MessageOf since the graph data is fed
                    // directly into the graphing system
                    client.send(MessageOf('historyGraph', message))
                }
            })
        }

        const initMessage: InitMessage = {
            config: (() => {
                // Remap minecraftVersion entries into name values
                const minecraftVersionNames: { [index: string]: string[] } = {}
                for (const key in minecraftVersions) {
                    minecraftVersionNames[key] = minecraftVersions[key].map(version => version.name)
                }

                // Send configuration data for rendering the page
                return {
                    graphDurationLabel: config.graphDurationLabel || (Math.floor(config.graphDuration / (60 * 60 * 1000)) + 'h'),
                    graphMaxLength: TimeTracker.getMaxGraphDataLength(),
                    serverGraphMaxLength: TimeTracker.getMaxServerGraphDataLength(),
                    servers: this.serverRegistrations.map(serverRegistration => serverRegistration.getPublicData()),
                    minecraftVersions: minecraftVersionNames,
                    isGraphVisible: config.logToDatabase
                }
            })(),
            timestampPoints: this.timeTracker.getServerGraphPoints(),
            servers: this.serverRegistrations.map(serverRegistration => serverRegistration.getPingHistory())
        }

        client.send(MessageOf('init', initMessage))
    }
}

export default App
