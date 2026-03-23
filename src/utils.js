function nowDhakaString() {
  return new Date().toLocaleString("en-GB", {
    hour12: false,
    timeZone: "Asia/Dhaka",
  });
}

function cleanup(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeIncomingText(text) {
  return cleanup(text);
}

function normalizeYesNo(value) {
  const v = cleanup(value).toLowerCase();
  if (v === "yes") return "yes";
  if (v === "no") return "no";
  return "";
}

function normalizeMoreInfoList(value) {
  if (Array.isArray(value)) {
    return value.map(cleanup).filter(Boolean).slice(0, 5);
  }

  if (typeof value === "string") {
    return value
      .split(/[|•;\n]/)
      .map(cleanup)
      .filter(Boolean)
      .slice(0, 5);
  }

  return [];
}

function blankProfile() {
  return {
    full_name: "",
    home_country: "",
    cgpa: "",
    ielts_score: "",
    target_country: "",
    preferred_university: "",
    preferred_subject: "",
    email: "",
    budget: "",
    scholarship_needed: "",
    can_go_without_scholarship: "",
    urgency: "",
    family_constraints: "",
    more_info: [],
  };
}

function mergeMoreInfo(oldList, newList) {
  const merged = [...oldList, ...newList].map(cleanup).filter(Boolean);
  const unique = [];

  for (const item of merged) {
    if (!unique.some((u) => u.toLowerCase() === item.toLowerCase())) {
      unique.push(item);
    }
  }

  return unique.slice(0, 5);
}

function mergeProfiles(oldProfile, patch) {
  const merged = { ...oldProfile };

  for (const key of Object.keys(merged)) {
    if (key === "more_info") continue;
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;

    const nextValue =
      key === "scholarship_needed" || key === "can_go_without_scholarship"
        ? normalizeYesNo(patch[key])
        : cleanup(patch[key]);

    if (nextValue) {
      merged[key] = nextValue;
    }
  }

  merged.more_info = mergeMoreInfo(
    normalizeMoreInfoList(oldProfile.more_info),
    normalizeMoreInfoList(patch.more_info)
  );

  return merged;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  nowDhakaString,
  cleanup,
  normalizeIncomingText,
  normalizeYesNo,
  normalizeMoreInfoList,
  blankProfile,
  mergeProfiles,
  delay,
};