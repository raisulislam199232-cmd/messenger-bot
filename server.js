require("dotenv").config();

const express = require("express");
const messengerRouter = require("./src/routes/messengerWebhook");
const whatsappRouter = require("./src/routes/whatsappWebhook");
const { initializeSheets } = require("./src/sheetsService");
const { flushAllSessionsOnShutdown } = require("./src/sessionStore");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/webhook/messenger", messengerRouter);
app.use("/webhook/whatsapp", whatsappRouter);

app.get("/", (req, res) => {
  res.send("Messenger + WhatsApp + OpenAI + Google Sheets bot is running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  try {
    await initializeSheets();
    console.log(`Server running on port ${PORT}`);
  } catch (err) {
    console.error("Startup error:", err.message);
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Flushing sessions...`);
  try {
    await flushAllSessionsOnShutdown();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));