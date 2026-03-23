const { google } = require("googleapis");
const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SHEET_ID,
  GOOGLE_SHEET_NAME,
} = require("./config");
const {
  nowDhakaString,
  cleanup,
  normalizeMoreInfoList,
  normalizeYesNo,
} = require("./utils");

const SHEET_HEADERS = [
  "Timestamp",
  "Channel",
  "User ID",
  "Full Name",
  "Home Country",
  "CGPA",
  "IELTS Score",
  "Target Country",
  "Preferred University",
  "Preferred Subject",
  "Email",
  "Budget",
  "Scholarship Needed",
  "Can Go Without Scholarship",
  "Urgency",
  "Family Constraints",
  "More Info",
  "Source",
];

const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({
  version: "v4",
  auth,
});

function quotedSheetName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function profileToSheetRow(channel, userId, profile, source = "chat") {
  return [
    nowDhakaString(),
    channel,
    userId,
    profile.full_name || "",
    profile.home_country || "",
    profile.cgpa || "",
    profile.ielts_score || "",
    profile.target_country || "",
    profile.preferred_university || "",
    profile.preferred_subject || "",
    profile.email || "",
    profile.budget || "",
    profile.scholarship_needed || "",
    profile.can_go_without_scholarship || "",
    profile.urgency || "",
    profile.family_constraints || "",
    normalizeMoreInfoList(profile.more_info).join(" | "),
    source,
  ];
}

function rowToProfile(row) {
  return {
    full_name: cleanup(row[3]),
    home_country: cleanup(row[4]),
    cgpa: cleanup(row[5]),
    ielts_score: cleanup(row[6]),
    target_country: cleanup(row[7]),
    preferred_university: cleanup(row[8]),
    preferred_subject: cleanup(row[9]),
    email: cleanup(row[10]),
    budget: cleanup(row[11]),
    scholarship_needed: normalizeYesNo(row[12]),
    can_go_without_scholarship: normalizeYesNo(row[13]),
    urgency: cleanup(row[14]),
    family_constraints: cleanup(row[15]),
    more_info: normalizeMoreInfoList(row[16]),
  };
}

async function ensureSheetHeaders() {
  const sheetRef = quotedSheetName(GOOGLE_SHEET_NAME);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetRef}!A1:R1`,
  });

  const row = res.data.values?.[0] || [];
  const same =
    row.length === SHEET_HEADERS.length &&
    row.every((value, index) => value === SHEET_HEADERS[index]);

  if (!same) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetRef}!A1:R1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [SHEET_HEADERS],
      },
    });
  }
}

async function getAllRows() {
  const sheetRef = quotedSheetName(GOOGLE_SHEET_NAME);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetRef}!A:R`,
  });

  return res.data.values || [];
}

async function findRowByChannelAndUserId(channel, userId) {
  const rows = await getAllRows();

  for (let i = 1; i < rows.length; i++) {
    if (cleanup(rows[i][1]) === cleanup(channel) && cleanup(rows[i][2]) === cleanup(userId)) {
      return {
        rowIndex: i + 1,
        rowData: rows[i],
      };
    }
  }

  return null;
}

async function upsertUserRowByIndex(channel, userId, rowIndex, profile, source = "chat") {
  const row = profileToSheetRow(channel, userId, profile, source);
  const sheetRef = quotedSheetName(GOOGLE_SHEET_NAME);

  if (rowIndex) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${sheetRef}!A${rowIndex}:R${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });

    return rowIndex;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${sheetRef}!A:R`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  const inserted = await findRowByChannelAndUserId(channel, userId);
  return inserted?.rowIndex || null;
}

async function initializeSheets() {
  await auth.authorize();
  await ensureSheetHeaders();
}

module.exports = {
  initializeSheets,
  findRowByChannelAndUserId,
  upsertUserRowByIndex,
  rowToProfile,
};