// Activity Logger - Tracks user YouTube searches and watched videos

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, 'users');

// Ensure logs directory exists
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Get compact timestamp - Unix timestamp + day of week
 */
function getCompactTimestamp() {
    const now = new Date();
    const unix = Math.floor(now.getTime() / 1000); // 10 digits
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[now.getDay()];
    return `${unix}(${day})`;
}

/**
 * Parse compact timestamp back to ISO
 */
function parseCompactTimestamp(compact) {
    const match = compact.match(/(\d+)\((\w+)\)/);
    if (!match) return null;
    const unix = parseInt(match[1]);
    return new Date(unix * 1000).toISOString();
}

/**
 * Get log file path for a user
 */
function getLogPath(userId) {
    return join(LOGS_DIR, `${userId}.json`);
}

/**
 * Initialize log file for a user if it doesn't exist
 */
function initUserLog(userId) {
    const logPath = getLogPath(userId);
    if (!existsSync(logPath)) {
        const initialLog = {
            userId: userId,
            createdAt: Date.now()
        };
        writeFileSync(logPath, JSON.stringify(initialLog));
        return initialLog;
    }
    return JSON.parse(readFileSync(logPath, 'utf-8'));
}

/**
 * Log a YouTube search
 */
export function logSearch(userId, query, results = {}) {
    const log = initUserLog(userId);

    const entry = {
        timestamp: getCompactTimestamp(),
        type: 'search',
        query: query,
        resultsCount: results.results_count || 0,
        topResults: (results.top_results || []).slice(0, 3)
    };

    if (!log.entries) log.entries = [];
    log.entries.push(entry);
    writeFileSync(getLogPath(userId), JSON.stringify(log));

    return entry;
}

/**
 * Log a video watch event
 */
export function logVideoWatch(userId, videoId, title, duration = null) {
    const log = initUserLog(userId);

    const entry = {
        timestamp: getCompactTimestamp(),
        type: 'watch',
        videoId: videoId,
        title: title,
        duration: duration
    };

    if (!log.entries) log.entries = [];
    log.entries.push(entry);
    writeFileSync(getLogPath(userId), JSON.stringify(log));

    return entry;
}

/**
 * Log a page visit
 */
export function logPageVisit(userId, pageType, metadata = {}) {
    const log = initUserLog(userId);

    const entry = {
        timestamp: getCompactTimestamp(),
        type: 'page',
        pageType: pageType,
        metadata: metadata
    };

    if (!log.entries) log.entries = [];
    log.entries.push(entry);
    writeFileSync(getLogPath(userId), JSON.stringify(log));

    return entry;
}

/**
 * Get recent activity for a user
 */
export function getRecentActivity(userId, limit = 50) {
    const logPath = getLogPath(userId);
    if (!existsSync(logPath)) {
        return [];
    }

    const log = JSON.parse(readFileSync(logPath, 'utf-8'));
    if (!log.entries) return [];
    return log.entries.slice(-limit);
}

/**
 * Get activity within a time window
 */
export function getActivityInTimeWindow(userId, startTime, endTime) {
    const logPath = getLogPath(userId);
    if (!existsSync(logPath)) {
        return [];
    }

    const log = JSON.parse(readFileSync(logPath, 'utf-8'));
    if (!log.entries) return [];

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    return log.entries.filter(entry => {
        const entryTime = parseCompactTimestamp(entry.timestamp);
        if (!entryTime) return false;
        const time = new Date(entryTime).getTime();
        return time >= start && time <= end;
    });
}

/**
 * Get activity summary for analysis
 * Returns concise summary for mood assessment
 */
export function getActivitySummary(userId, hours = 24) {
    const logPath = getLogPath(userId);
    if (!existsSync(logPath)) {
        return null;
    }

    const log = JSON.parse(readFileSync(logPath, 'utf-8'));
    if (!log.entries || log.entries.length === 0) return null;

    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    // Filter entries within time window
    const recentEntries = log.entries.filter(entry => {
        const entryTime = parseCompactTimestamp(entry.timestamp);
        return entryTime && new Date(entryTime).getTime() >= cutoff;
    });

    if (recentEntries.length === 0) return null;

    // Count by type
    const searches = recentEntries.filter(e => e.type === 'search').length;
    const watches = recentEntries.filter(e => e.type === 'watch').length;
    const pageVisits = recentEntries.filter(e => e.type === 'page').length;

    // Get time range
    const firstTime = parseCompactTimestamp(recentEntries[0].timestamp);
    const lastTime = parseCompactTimestamp(recentEntries[recentEntries.length - 1].timestamp);

    const summary = {
        userId: userId,
        timeWindow: `${hours}h`,
        startTime: firstTime,
        endTime: lastTime,
        totalEntries: recentEntries.length,
        searchCount: searches,
        watchCount: watches,
        pageVisitCount: pageVisits,
        recentEntries: recentEntries.slice(-10)
    };

    // Calculate sessions
    const sessions = estimateSessions(recentEntries);
    if (sessions.length > 0) {
        summary.sessions = sessions;
        summary.currentState = estimateCurrentState(recentEntries, sessions);
    }

    return summary;
}

/**
 * Estimate activity sessions from entries
 */
function estimateSessions(entries) {
    if (entries.length === 0) return [];

    const sessions = [];
    const SESSION_GAP = 30 * 60 * 1000; // 30 minutes gap

    let currentSession = {
        startTime: entries[0].timestamp,
        entries: []
    };

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const entryTime = parseCompactTimestamp(entry.timestamp);
        if (!entryTime) continue;

        const entryMs = new Date(entryTime).getTime();

        if (i > 0) {
            const prevEntry = entries[i - 1];
            const prevTime = parseCompactTimestamp(prevEntry.timestamp);
            if (prevTime) {
                const prevMs = new Date(prevTime).getTime();
                if (entryMs - prevMs > SESSION_GAP && currentSession.entries.length > 0) {
                    // End current session
                    const sessionStart = parseCompactTimestamp(currentSession.startTime);
                    if (sessionStart) {
                        currentSession.durationMinutes = Math.round((entryMs - new Date(sessionStart).getTime()) / 60000);
                    }
                    sessions.push(currentSession);
                    currentSession = { startTime: entry.timestamp, entries: [] };
                }
            }
        }

        currentSession.entries.push(entry);
    }

    // Don't forget the last session
    if (currentSession.entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        const lastTime = parseCompactTimestamp(lastEntry.timestamp);
        const sessionStart = parseCompactTimestamp(currentSession.startTime);
        if (sessionStart && lastTime) {
            currentSession.durationMinutes = Math.round((new Date(lastTime).getTime() - new Date(sessionStart).getTime()) / 60000);
        }
        sessions.push(currentSession);
    }

    return sessions;
}

/**
 * Estimate current user state from activity
 */
function estimateCurrentState(entries, sessions) {
    if (entries.length === 0 || sessions.length === 0) return 'unknown';

    const currentSession = sessions[sessions.length - 1];
    const lastEntry = entries[entries.length - 1];
    const lastTime = parseCompactTimestamp(lastEntry.timestamp);

    if (!lastTime) return 'unknown';

    const now = Date.now();
    const lastMs = new Date(lastTime).getTime();
    const timeSinceLast = (now - lastMs) / 60000; // minutes

    // If no activity for 2+ hours, likely offline
    if (timeSinceLast > 120) return 'offline';

    // Analyze session
    const searchesInSession = currentSession.entries.filter(e => e.type === 'search').length;
    const watchesInSession = currentSession.entries.filter(e => e.type === 'watch').length;
    const sessionDuration = currentSession.durationMinutes || 0;

    // Working: focused searches
    if (searchesInSession > watchesInSession && sessionDuration > 15) {
        return 'working';
    }

    // Distracted: lots of video watching
    if (watchesInSession > 3 || (watchesInSession > searchesInSession && sessionDuration > 20)) {
        return 'distracted';
    }

    // Browsing: short session
    if (sessionDuration < 15) {
        return 'browsing';
    }

    return 'active';
}
