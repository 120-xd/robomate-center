const winston = require('winston');
const path = require('path');
const fs = require('fs');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'robomate-center' },
    transports: [
        // Console output (colorized for dev)
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length > 1
                        ? ' ' + JSON.stringify(meta, null, 0)
                        : '';
                    return `${timestamp} ${level}: ${message}${metaStr}`;
                })
            )
        }),
        // All logs to file
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'combined.log'),
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5
        }),
        // Errors to separate file
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3
        })
    ]
});

module.exports = logger;
