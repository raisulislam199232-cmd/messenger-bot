const { SESSION_IDLE_FLUSH_MS } = require("./config");
const { blankProfile } = require("./utils");
const {
  findRowByChannelAndUserId,
  upsertUserRowByIndex,
  rowToProfile,
} = require("./sheetsService");

const sessions = new Map();
const processedMessageIds = new Map();
const recentTextFingerprints = new Map();

function getSessionKey(channel, userId) {
  return `${channel}:${userId}`;
}

function shouldIgnoreDuplicateMessage(channel, userId, messageId, text) {
  const now = Date.now();

  for (const [key, ts] of processedMessageIds.entries()) {
    if (now - ts > 10 * 60 * 1000) processedMessageIds.delete(key);
  }

  for (const [key, ts] of recentTextFingerprints.entries()) {
    if (now - ts > 8000) recentTextFingerprints.delete(key);
  }

  if (messageId) {
    const dedupeKey = `${channel}:${messageId}`;
    const existingTs = processedMessageIds.get(dedupeKey);
    if (existingTs) return true;
    processedMessageIds.set(dedupeKey, now);
  }

  const fingerprint = `${channel}:${userId}:${String(text || "").trim().toLowerCase()}`;
  const recentTs = recentTextFingerprints.get(fingerprint);

  if (recentTs && now - recentTs < 4000) return true;

  recentTextFingerprints.set(fingerprint, now);
  return false;
}

async function createOrLoadSession(channel, userId) {
  const key = getSessionKey(channel, userId);
  const existing = sessions.get(key);
  if (existing) return existing;

  const existingRow = await findRowByChannelAndUserId(channel, userId);
  const existingProfile = existingRow ? rowToProfile(existingRow.rowData) : blankProfile();

  const session = {
    channel,
    userId,
    rowIndex: existingRow?.rowIndex || null,
    profile: existingProfile,
    history: [],
    isDirty: false,
    endTimer: null,
    createdAt: Date.now(),
    lastSavedAt: null,
  };

  sessions.set(key, session);
  scheduleSessionEnd(channel, userId);
  return session;
}

function resetSessionState(session) {
  session.profile = blankProfile();
  session.history = [];
  session.isDirty = true;
}

function clearSessionTimer(session) {
  if (session.endTimer) {
    clearTimeout(session.endTimer);
    session.endTimer = null;
  }
}

async function flushSession(channel, userId) {
  const key = getSessionKey(channel, userId);
  const session = sessions.get(key);

  if (!session || !session.isDirty) return;

  try {
    const rowIndex = await upsertUserRowByIndex(
      channel,
      userId,
      session.rowIndex,
      session.profile,
      "chat"
    );

    session.rowIndex = rowIndex;
    session.isDirty = false;
    session.lastSavedAt = Date.now();
  } catch (err) {
    console.error("Flush error:", err.message);
  }
}

function scheduleSessionEnd(channel, userId) {
  const key = getSessionKey(channel, userId);
  const session = sessions.get(key);
  if (!session) return;

  clearSessionTimer(session);

  session.endTimer = setTimeout(async () => {
    try {
      await flushSession(channel, userId);
    } finally {
      const current = sessions.get(key);
      if (current) clearSessionTimer(current);
      sessions.delete(key);
    }
  }, SESSION_IDLE_FLUSH_MS);
}

async function flushAllSessionsOnShutdown() {
  const list = [...sessions.values()];
  for (const session of list) {
    await flushSession(session.channel, session.userId);
  }
}

module.exports = {
  shouldIgnoreDuplicateMessage,
  createOrLoadSession,
  resetSessionState,
  scheduleSessionEnd,
  flushSession,
  flushAllSessionsOnShutdown,
};