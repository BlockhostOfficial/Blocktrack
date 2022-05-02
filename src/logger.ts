import winston, {format, transports} from 'winston'

export default winston.createLogger({
    format: format.combine(format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }), format.splat(), format.cli(),  format.colorize()),
    defaultMeta: { service: 'minetrack' },
    transports: [
        new transports.File({ filename: 'minetrack.log' }),
        new transports.Console()
    ]
})

