export interface ServerType {
    favicon: string
    port: number
    name: string
    ip: string
    type: string
    color?: string
}

export interface UpdatePayload {
    error?: { message: string }
    graphPeakData?: undefined | { playerCount: any, timestamp: number }
    favicon?: string | undefined
    versions?: number[]
    playerCount: number | null
    recordData?: RecordData
}

export interface RecordData {
    playerCount: number
    timestamp: number
}

export interface ProtocolVersion {
    protocolId: number
    protocolIndex: number
}

export interface PeakData {
    playerCount: number
    timestamp: number
}

export interface PayloadHistory {
    playerCountHistory?: number[]
    playerCount?: number
    graphPeakData?: PeakData
    versions: number[]
    recordData: RecordData | undefined
    favicon: string | undefined
}

export interface HistoryGraphMessage {
    timestamps: number[]
    graphData: number[][];
}

export interface UpdateServersMessage {
    timestamp: number
    updateHistoryGraph: boolean
    updates: UpdatePayload[]
}

export interface ErrorHistory {
    error: {
        message: string
    }
    recordData: RecordData | undefined
    graphPeakData?: PeakData
    favicon: string | undefined
}
