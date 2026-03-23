const OpenAI = require("openai");
const { OPENAI_API_KEY, OPENAI_MODEL, GOOGLE_FORM_LINK } = require("./config");
const { cleanup, normalizeYesNo, normalizeMoreInfoList } = require("./utils");

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

function normalizeAiResult(result) {
  return {
    intent: cleanup(result?.intent).toLowerCase() || "normal",
    reset_session: !!result?.reset_session,
    profile_patch: {
      full_name: cleanup(result?.profile_patch?.full_name),
      home_country: cleanup(result?.profile_patch?.home_country),
      cgpa: cleanup(result?.profile_patch?.cgpa),
      ielts_score: cleanup(result?.profile_patch?.ielts_score),
      target_country: cleanup(result?.profile_patch?.target_country),
      preferred_university: cleanup(result?.profile_patch?.preferred_university),
      preferred_subject: cleanup(result?.profile_patch?.preferred_subject),
      email: cleanup(result?.profile_patch?.email),
      budget: cleanup(result?.profile_patch?.budget),
      scholarship_needed: normalizeYesNo(result?.profile_patch?.scholarship_needed),
      can_go_without_scholarship: normalizeYesNo(
        result?.profile_patch?.can_go_without_scholarship
      ),
      urgency: cleanup(result?.profile_patch?.urgency),
      family_constraints: cleanup(result?.profile_patch?.family_constraints),
      more_info: normalizeMoreInfoList(result?.profile_patch?.more_info),
    },
    reply: cleanup(result?.reply) || "Please tell me your study plan and I will guide you.",
  };
}

async function analyzeMessageAndBuildReply({ channel, userText, session }) {
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `
You are a study abroad counseling assistant working across Messenger and WhatsApp.

Your job in ONE response:
1. Detect the user's intent.
2. Decide whether the user wants to reset the conversation.
3. Extract only the structured profile fields clearly supported by the latest message.
4. Write the final user-facing reply.

Rules:
- Be concise, natural, and helpful.
- Do not invent profile data.
- Use empty strings for unknown scalar fields.
- Use an empty array for unknown more_info.
- If the user is greeting, reply naturally.
- If the user wants to restart, set reset_session=true.
- If the user asks study abroad questions, answer directly.
- If useful, ask for at most one missing field naturally inside the reply.
- Plain text reply only.
- Channel is ${channel}.
- The counseling context is study abroad guidance, admission chances, universities, scholarships, and next steps.
- If the user has very little profile data and wants a faster assessment, you may mention this form link: ${GOOGLE_FORM_LINK}
`,
      },
      {
        role: "user",
        content: `Current saved profile:
${JSON.stringify(session.profile, null, 2)}

Recent conversation history:
${JSON.stringify(session.history.slice(-6), null, 2)}

Latest user message:
${userText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "channel_bot_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: {
              type: "string",
              enum: ["greeting", "reset", "profile_update", "question", "smalltalk", "normal"],
            },
            reset_session: { type: "boolean" },
            profile_patch: {
              type: "object",
              additionalProperties: false,
              properties: {
                full_name: { type: "string" },
                home_country: { type: "string" },
                cgpa: { type: "string" },
                ielts_score: { type: "string" },
                target_country: { type: "string" },
                preferred_university: { type: "string" },
                preferred_subject: { type: "string" },
                email: { type: "string" },
                budget: { type: "string" },
                scholarship_needed: {
                  type: "string",
                  enum: ["", "yes", "no"],
                },
                can_go_without_scholarship: {
                  type: "string",
                  enum: ["", "yes", "no"],
                },
                urgency: { type: "string" },
                family_constraints: { type: "string" },
                more_info: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 5,
                },
              },
              required: [
                "full_name",
                "home_country",
                "cgpa",
                "ielts_score",
                "target_country",
                "preferred_university",
                "preferred_subject",
                "email",
                "budget",
                "scholarship_needed",
                "can_go_without_scholarship",
                "urgency",
                "family_constraints",
                "more_info",
              ],
            },
            reply: { type: "string" },
          },
          required: ["intent", "reset_session", "profile_patch", "reply"],
        },
      },
    },
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return normalizeAiResult(parsed);
}

module.exports = {
  analyzeMessageAndBuildReply,
};