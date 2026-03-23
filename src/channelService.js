const axios = require("axios");
const {
  GRAPH_API_VERSION,
  FACEBOOK_PAGE_ACCESS_TOKEN,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
} = require("./config");
const { normalizeIncomingText, mergeProfiles, delay } = require("./utils");
const {
  shouldIgnoreDuplicateMessage,
  createOrLoadSession,
  resetSessionState,
  scheduleSessionEnd,
} = require("./sessionStore");
const { analyzeMessageAndBuildReply } = require("./aiService");

function extractMessengerMessages(body) {
  const out = [];

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.sender?.id) continue;
      if (!event.message?.text) continue;
      if (event.message.is_echo) continue;

      out.push({
        channel: "messenger",
        userId: event.sender.id,
        text: normalizeIncomingText(event.message.text),
        messageId: event.message.mid,
      });
    }
  }

  return out;
}

function extractWhatsAppMessages(body) {
  const out = [];

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const msg of value.messages || []) {
        if (msg.type !== "text") continue;
        if (!msg.from || !msg.text?.body) continue;

        out.push({
          channel: "whatsapp",
          userId: msg.from,
          text: normalizeIncomingText(msg.text.body),
          messageId: msg.id,
        });
      }
    }
  }

  return out;
}

async function sendMessengerTextMessage(psid, text) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
    {
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text },
    },
    {
      params: { access_token: FACEBOOK_PAGE_ACCESS_TOKEN },
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function sendMessengerAction(psid, action) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`,
    {
      recipient: { id: psid },
      sender_action: action,
    },
    {
      params: { access_token: FACEBOOK_PAGE_ACCESS_TOKEN },
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function sendWhatsAppTextMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: text,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendChannelText(channel, userId, text) {
  if (channel === "messenger") {
    return sendMessengerTextMessage(userId, text);
  }

  if (channel === "whatsapp") {
    return sendWhatsAppTextMessage(userId, text);
  }

  throw new Error(`Unsupported channel: ${channel}`);
}

async function typingOn(channel, userId) {
  if (channel === "messenger") {
    await sendMessengerAction(userId, "typing_on");
  }
}

async function typingOff(channel, userId) {
  if (channel === "messenger") {
    await sendMessengerAction(userId, "typing_off");
  }
}

async function processInboundMessage({ channel, userId, text, messageId }) {
  if (!userId || !text) return;

  if (shouldIgnoreDuplicateMessage(channel, userId, messageId, text)) {
    console.log("Duplicate ignored:", { channel, userId, messageId, text });
    return;
  }

  const session = await createOrLoadSession(channel, userId);
  scheduleSessionEnd(channel, userId);

  let typingStarted = false;

  try {
    await typingOn(channel, userId);
    typingStarted = true;

    const aiResult = await analyzeMessageAndBuildReply({
      channel,
      userText: text,
      session,
    });

    if (aiResult.reset_session) {
      resetSessionState(session);
    }

    const oldProfileSerialized = JSON.stringify(session.profile);
    const mergedProfile = mergeProfiles(session.profile, aiResult.profile_patch);

    session.profile = mergedProfile;

    if (aiResult.reset_session || oldProfileSerialized !== JSON.stringify(mergedProfile)) {
      session.isDirty = true;
    }

    session.history.push({ role: "user", content: text });
    session.history.push({ role: "assistant", content: aiResult.reply });
    session.history = session.history.slice(-12);

    const fakeTypingMs =
      channel === "messenger"
        ? Math.min(5000, Math.max(1000, aiResult.reply.length * 30))
        : 0;

    if (fakeTypingMs) {
      await delay(fakeTypingMs);
    }

    await sendChannelText(channel, userId, aiResult.reply);
  } catch (err) {
    console.error("Message processing error:", err.response?.data || err.message || err);

    await sendChannelText(
      channel,
      userId,
      "Sorry, something went wrong. Please send your message again."
    );
  } finally {
    if (typingStarted) {
      try {
        await typingOff(channel, userId);
      } catch (err) {
        console.error("Typing off error:", err.response?.data || err.message || err);
      }
    }

    scheduleSessionEnd(channel, userId);
  }
}

module.exports = {
  extractMessengerMessages,
  extractWhatsAppMessages,
  processInboundMessage,
};