const express = require("express");
const { META_VERIFY_TOKEN } = require("../config");
const {
  extractMessengerMessages,
  processInboundMessage,
} = require("../channelService");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  try {
    if (req.body.object !== "page") {
      return res.sendStatus(404);
    }

    const incomingMessages = extractMessengerMessages(req.body);

    for (const incoming of incomingMessages) {
      await processInboundMessage(incoming);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Messenger webhook error:", error.response?.data || error.message || error);
    return res.sendStatus(500);
  }
});

module.exports = router;