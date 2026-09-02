require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const logger = require('./services/logger');
const profileManager = require('./services/profileManager');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------- Middleware ---------------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// HTTP 请求日志 (dev-friendly format)
app.use(morgan('dev', {
    stream: { write: msg => logger.info(msg.trim()) }
}));

// --------------- Static Files ---------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/firmware', express.static(path.join(__dirname, '..', 'firmware')));

// --------------- API Routes ---------------
app.use('/api', require('./routes/api'));
app.use('/api/voice', require('./routes/voice'));

// --------------- SPA fallback ---------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --------------- 404 ---------------
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// --------------- Error Handler ---------------
app.use((err, req, res, _next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

// --------------- Startup ---------------
async function start() {
    // Initialize database
    await db.initDb();
    logger.info('Database: SQLite initialized (sql.js)');

    // Load robot profiles
    profileManager.loadAll();

    app.listen(PORT, () => {
        logger.info('========================================');
        logger.info('  RoboMate Control Center v1.0');
        logger.info(`  http://localhost:${PORT}`);
        logger.info(`  Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`  Models: ${profileManager.list().map(m => m.id).join(', ')} (request-scoped selection)`);
        logger.info('========================================');

        // Check voice service
        if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
            logger.info('Voice service: azure configured');
        } else if (process.env.OPENAI_API_KEY) {
            logger.info('Voice service: openai configured');
        } else {
            logger.info('Voice service: not configured (set AZURE_SPEECH_KEY or OPENAI_API_KEY in .env)');
        }

        logger.info('Ready to accept connections.');
    });
}

start().catch(err => {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
});
