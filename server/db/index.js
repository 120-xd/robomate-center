const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const DB_PATH = process.env.DB_PATH || './data/robomate.db';
const resolvedPath = path.resolve(DB_PATH);

// Ensure data directory exists
const dataDir = path.dirname(resolvedPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Load sql.js
const initSqlJs = require('sql.js');

// Load existing DB or create new
let db = null;

async function initDb() {
    const SQL = await initSqlJs();

    if (fs.existsSync(resolvedPath)) {
        const buffer = fs.readFileSync(resolvedPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Initialize schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Save initial DB
    saveDb();
}

function saveDb() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(resolvedPath, buffer);
}

// Query helper: run + save
function run(sql, params = []) {
    db.run(sql, params);
    saveDb();
}

// Select helper: returns array of row objects
function select(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// Select single row
function selectOne(sql, params = []) {
    const rows = select(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

// ========== Public API ==========

function logEvent(level, source, message, metadata = null) {
    run('INSERT INTO event_log (level, source, message, metadata) VALUES (?, ?, ?, ?)',
        [level, source, message, metadata ? JSON.stringify(metadata) : null]);
}

function logCommand(command, source = 'manual', rawVoiceText = null) {
    run('INSERT INTO command_log (command, source, raw_voice_text) VALUES (?, ?, ?)',
        [command, source, rawVoiceText]);
}

function logFlash(firmwareVersion, firmwareSize, pageCount, success, errorMsg, durationMs) {
    run('INSERT INTO flash_log (firmware_version, firmware_size, page_count, success, error_message, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
        [firmwareVersion, firmwareSize || null, pageCount || null, success ? 1 : 0, errorMsg || null, durationMs || null]);
}

function getRecentCommands(limit = 50) {
    return select('SELECT * FROM command_log ORDER BY created_at DESC LIMIT ?', [limit]);
}

function getRecentEvents(limit = 100) {
    return select('SELECT * FROM event_log ORDER BY created_at DESC LIMIT ?', [limit]);
}

function getCommandStats() {
    return select('SELECT command, COUNT(*) as count FROM command_log GROUP BY command ORDER BY count DESC');
}

module.exports = {
    initDb,
    db,
    logEvent,
    logCommand,
    logFlash,
    getRecentCommands,
    getRecentEvents,
    getCommandStats
};
