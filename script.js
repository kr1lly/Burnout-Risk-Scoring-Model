"use strict";

const STORAGE_KEY = "brsm_processed_entries_v2";
const CSV_HEADERS = [
  "academic_workload",
  "sleep_duration_quality",
  "academic_stress",
  "coping_strategies",
  "burnout_score",
  "burnout_label"
];

const surveyGroups = [
  {
    key: "academic_workload",
    title: "Academic Workload",
    note: "Higher scores indicate greater workload-related risk.",
    questions: [
      "I feel that my academic workload is difficult to manage.",
      "I feel overwhelmed by my academic responsibilities.",
      "I feel pressured by the number of academic tasks I need to complete.",
      "I frequently find it challenging to complete academic requirements on time.",
    ]
  },
  {
    key: "sleep_duration_quality",
    title: "Sleep Duration and Quality",
    note: "A protective variable; higher scores indicate better sleep.",
    questions: [
      "I usually get sufficient sleep to feel rested during the day.",
      "I wake up feeling refreshed and ready for academic activities.",
      "I am satisfied with the quality of my sleep.",
      "I typically experience uninterrupted sleep on school nights."
    ]
  },
  {
    key: "academic_stress",
    title: "Academic Stress",
    note: "Higher scores indicate greater stress-related risk.",
    questions: [
      "I feel emotionally drained because of my academic responsibilities.",
      "I feel overwhelmed by my academic demands.",
      "I struggle to relax due to concerns related to school.",
      "I feel mentally exhausted after completing academic tasks."
    ]
  },
  {
    key: "coping_strategies",
    title: "Coping Strategies",
    note: "A protective variable; higher scores indicate healthier coping.",
    questions: [
      "I feel capable of coping with academic stress effectively.",
      "I feel capable of handling academic challenges.",
      "I am able to recover quickly after facing academic pressure.",
      "I can stay calm when facing school-related difficulties."
    ]
  }
];

const scaleOptions = [
  [1, "Strongly Disagree", "Strongly disagree"],
  [2, "Disagree", "Disagree"],
  [3, "Agree", "Agree"],
  [4, "Strongly Agree", "Strongly agree"]
];

const form = document.querySelector("#brsm-form");
const sectionsHost = document.querySelector("#survey-sections");
const validationMessage = document.querySelector("#validation-message");
const resultsBody = document.querySelector("#results-body");
const emptyState = document.querySelector("#empty-state");
const countElement = document.querySelector("#entry-count");
const copyButton = document.querySelector("#copy-csv");
const downloadButton = document.querySelector("#download-csv");
const clearButton = document.querySelector("#clear-entries");
const statusElement = document.querySelector("#action-status");

let entries = loadEntries();
let statusTimer;

renderSurvey();
renderTable();

function renderSurvey() {
  sectionsHost.innerHTML = surveyGroups.map((group, groupIndex) => `
    <fieldset class="survey-section">
      <legend>
        <span class="legend-title"><span class="legend-number">0${groupIndex + 1}</span>${group.title}</span>
        <span class="legend-note">${group.note}</span>
      </legend>
      ${group.questions.map((question, questionIndex) => {
        const name = `${group.key}_${questionIndex + 1}`;
        return `
          <div class="question" data-question="${name}">
            <p class="question-text"><span class="question-index">${questionIndex + 1}.</span>${question}</p>
            <div class="likert-options" role="radiogroup" aria-label="${escapeHtml(question)}">
              ${scaleOptions.map(([value, shortLabel, ariaLabel]) => `
                <span class="likert-option">
                  <input type="radio" id="${name}_${value}" name="${name}" value="${value}" aria-label="${ariaLabel}">
                  <label for="${name}_${value}"><strong>${value}</strong><span>${shortLabel}</span></label>
                </span>
              `).join("")}
            </div>
          </div>`;
      }).join("")}
    </fieldset>
  `).join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  })[character]);
}

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return [];
    return saved.filter(entry => CSV_HEADERS.every(header => Object.hasOwn(entry, header)));
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function classifyBurnout(score) {
  if (score >= 3.0) return "High";
  if (score >= 2.0) return "Moderate";
  return "Low";
}

function collectResponses() {
  const missing = [];
  const groupScores = {};

  document.querySelectorAll(".question").forEach(element => element.classList.remove("unanswered"));

  surveyGroups.forEach(group => {
    const values = group.questions.map((_, index) => {
      const name = `${group.key}_${index + 1}`;
      const checked = form.querySelector(`input[name="${name}"]:checked`);
      if (!checked) missing.push(name);
      return checked ? Number(checked.value) : null;
    });
    if (values.every(value => value !== null)) groupScores[group.key] = average(values);
  });

  return { missing, groupScores };
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const { missing, groupScores } = collectResponses();

  if (missing.length) {
    missing.forEach(name => document.querySelector(`[data-question="${name}"]`).classList.add("unanswered"));
    validationMessage.textContent = `Please answer all questions. ${missing.length} ${missing.length === 1 ? "response is" : "responses are"} still missing.`;
    validationMessage.hidden = false;
    const firstMissing = document.querySelector(`[data-question="${missing[0]}"]`);
    firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
    firstMissing.querySelector("input").focus({ preventScroll: true });
    return;
  }

  validationMessage.hidden = true;
  const sleepRisk = 5 - groupScores.sleep_duration_quality;
  const copingRisk = 5 - groupScores.coping_strategies;
  const rawBurnoutScore =
    0.30 * groupScores.academic_stress +
    0.30 * groupScores.academic_workload +
    0.20 * sleepRisk +
    0.20 * copingRisk;

  const entry = {
    academic_workload: groupScores.academic_workload.toFixed(2),
    sleep_duration_quality: groupScores.sleep_duration_quality.toFixed(2),
    academic_stress: groupScores.academic_stress.toFixed(2),
    coping_strategies: groupScores.coping_strategies.toFixed(2),
    burnout_score: rawBurnoutScore.toFixed(2),
    burnout_label: classifyBurnout(rawBurnoutScore)
  };

  entries.push(entry);
  saveEntries();
  renderTable();
  showLatest(entry);
  form.reset();
  document.querySelector("#latest-result").scrollIntoView({ behavior: "smooth", block: "center" });
  showStatus("Entry processed and saved locally.");
});

form.addEventListener("change", event => {
  if (event.target.matches('input[type="radio"]')) {
    event.target.closest(".question").classList.remove("unanswered");
    if (!document.querySelector(".question.unanswered")) validationMessage.hidden = true;
  }
});

form.addEventListener("reset", () => {
  document.querySelectorAll(".question.unanswered").forEach(element => element.classList.remove("unanswered"));
  validationMessage.hidden = true;
});

function renderTable() {
  resultsBody.innerHTML = entries.map(entry => `
    <tr>
      <td>${entry.academic_workload}</td>
      <td>${entry.sleep_duration_quality}</td>
      <td>${entry.academic_stress}</td>
      <td>${entry.coping_strategies}</td>
      <td>${entry.burnout_score}</td>
      <td class="label-${entry.burnout_label.toLowerCase()}">${entry.burnout_label}</td>
    </tr>
  `).join("");

  emptyState.hidden = entries.length > 0;
  countElement.textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  copyButton.disabled = entries.length === 0;
  downloadButton.disabled = entries.length === 0;
  clearButton.disabled = entries.length === 0;
}

function showLatest(entry) {
  document.querySelector("#latest-workload").textContent = entry.academic_workload;
  document.querySelector("#latest-sleep").textContent = entry.sleep_duration_quality;
  document.querySelector("#latest-stress").textContent = entry.academic_stress;
  document.querySelector("#latest-coping").textContent = entry.coping_strategies;
  document.querySelector("#latest-score").textContent = entry.burnout_score;

  const label = document.querySelector("#latest-label");
  label.textContent = `${entry.burnout_label} risk`;
  label.className = `risk-badge risk-${entry.burnout_label.toLowerCase()}`;
  document.querySelector("#latest-result").hidden = false;
}

function buildCsv() {
  const lines = [CSV_HEADERS.join(",")];
  entries.forEach(entry => {
    lines.push(CSV_HEADERS.map(header => entry[header]).join(","));
  });
  return lines.join("\r\n");
}

copyButton.addEventListener("click", async () => {
  const csv = buildCsv();
  try {
    await navigator.clipboard.writeText(csv);
    showStatus("CSV copied to the clipboard.");
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = csv;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
    showStatus("CSV copied to the clipboard.");
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "brsm_dataset.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to begin reading the Blob before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus("brsm_dataset.csv downloaded.");
});

clearButton.addEventListener("click", () => {
  if (!window.confirm(`Delete all ${entries.length} saved ${entries.length === 1 ? "entry" : "entries"}? This cannot be undone.`)) return;
  entries = [];
  saveEntries();
  renderTable();
  document.querySelector("#latest-result").hidden = true;
  showStatus("All saved entries were cleared.");
});

function showStatus(message) {
  window.clearTimeout(statusTimer);
  statusElement.textContent = message;
  statusTimer = window.setTimeout(() => { statusElement.textContent = ""; }, 4000);
}
