-- RoboMate 数据库结构
-- SQLite

-- 指令历史
CREATE TABLE IF NOT EXISTS command_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,           -- e.g. 'FW 3', 'LT 1', 'MW'
    source TEXT DEFAULT 'manual',   -- 'manual' | 'voice' | 'ai'
    raw_voice_text TEXT,            -- original voice text before parsing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 烧录记录
CREATE TABLE IF NOT EXISTS flash_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firmware_version TEXT NOT NULL,
    firmware_size INTEGER,          -- bytes
    page_count INTEGER,
    success INTEGER DEFAULT 1,      -- 1=success, 0=fail
    error_message TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统事件日志
CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT DEFAULT 'info',       -- 'info' | 'warn' | 'error' | 'debug'
    source TEXT DEFAULT 'system',    -- 'system' | 'serial' | 'voice' | 'ai'
    message TEXT NOT NULL,
    metadata TEXT,                   -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI 对话历史 (未来)
CREATE TABLE IF NOT EXISTS voice_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',    -- 'active' | 'ended'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME
);

CREATE TABLE IF NOT EXISTS voice_message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES voice_session(id),
    role TEXT NOT NULL,              -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,
    audio_url TEXT,                  -- path to stored audio if applicable
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_command_log_created ON command_log(created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_level ON event_log(level);
CREATE INDEX IF NOT EXISTS idx_voice_msg_session ON voice_message(session_id);
