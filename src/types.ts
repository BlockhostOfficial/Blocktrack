export interface ServerType {
    favicon: string
    port: number
    name: string
    ip: string
    type: string
    color?: string
}

export interface PublicServerData {
    name: string
    ip: string
    port: number
    type: string
    color?: string
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

export interface HistoryGraphMessage {
    timestamps: number[]
    graphData: number[][];
}

export interface UpdateServersMessage {
    timestamp: number
    updateHistoryGraph: boolean
    updates: UpdatePayload[]
}

export interface UpdatePayload {
    error?: ErrorType
    graphPeakData?: undefined | PeakData
    favicon?: string | undefined
    versions?: number[]
    playerCount: number | null
    recordData?: RecordData
}

export interface PayloadHistory {
    playerCountHistory?: number[]
    playerCount?: number
    versions: number[]
    recordData: RecordData | undefined
    graphPeakData?: PeakData
    favicon: string | undefined
}

export interface PayloadErrorHistory {
    error: ErrorType
    recordData: RecordData | undefined
    graphPeakData?: PeakData
    favicon: string | undefined
}

export interface ErrorType {
    message: string
}
