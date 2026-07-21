const logger = require('../services/logger');

function requestLogger(req, res, next) {
    const start = Date.now();
    const { method, url } = req;

    res.on('finish', () => {
        const duration = Date.now() - start;
        const { statusCode } = res;
        const level = statusCode >= 400 ? 'warn' : 'info';

        logger.log(level, `${method} ${url} ${statusCode} ${duration}ms`, {
            method,
            url,
            statusCode,
            duration,
            ip: req.ip
        });
    });

    next();
}

module.exports = requestLogger;
