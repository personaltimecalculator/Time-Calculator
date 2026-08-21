const $ = (id) => document.getElementById(id);

const UPT_BLOCK = 15;
const UPT_RATE_PER_HOUR = 5;
const UPT_CAP = 80 * 60;
const LUNCH_MINUTES = 30;
const STORAGE_KEY = "timebank-state-v3";
const SAVE_FLAG = "timebank-save-v3";

let mode = "earliest";

const stateIds = [
  "enableUpt", "enableFlex", "enableStandard",
  "uptHours", "uptMinutes", "flexHours", "flexMinutes", "standardHours", "standardMinutes",
  "shiftStart", "shiftEnd", "lunchStart", "desiredLeave", "priority", "ptoOrder", "predictStart", "predictEnd", "actualClockIn"
];

function num(id) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function parseTime(value) {
  if (!value || !value.includes(":")) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function normalizeEnd(start, end) {
  return end <= start ? end + 1440 : end;
}

function normalizeIntoShift(value, start, end) {
  let t = value;
  while (t < start) t += 1440;
  return t;
}

function displayClock(absMinutes) {
  if (absMinutes == null) return "—";
  const mins = ((Math.round(absMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const h = h24 % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

function displayDuration(minutes) {
  const mins = Math.max(0, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr${h === 1 ? "" : "s"}`;
  return `${m} min`;
}

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function getShift() {
  const start = parseTime($("shiftStart").value);
  const rawEnd = parseTime($("shiftEnd").value);
  const rawLunch = parseTime($("lunchStart").value);
  if (start == null || rawEnd == null || rawLunch == null) return null;

  const end = normalizeEnd(start, rawEnd);
  let lunchStart = normalizeIntoShift(rawLunch, start, end);
  let lunchEnd = lunchStart + LUNCH_MINUTES;

  // If the configured lunch is outside a custom shift, it simply contributes no deduction.
  return { start, end, lunchStart, lunchEnd };
}

function workMinutesBetween(a, b, shift) {
  if (!shift || b <= a) return 0;
  const elapsed = b - a;
  const lunch = overlap(a, b, shift.lunchStart, shift.lunchEnd);
  return Math.max(0, Math.round(elapsed - lunch));
}

function totalShiftWork(shift) {
  return workMinutesBetween(shift.start, shift.end, shift);
}

function leaveTimeForCoverage(coverageMinutes, shift) {
  let remaining = Math.min(Math.max(0, Math.round(coverageMinutes)), totalShiftWork(shift));
  let cursor = shift.end;

  while (remaining > 0 && cursor > shift.start) {
    cursor -= 1;
    const duringLunch = cursor >= shift.lunchStart && cursor < shift.lunchEnd;
    if (!duringLunch) remaining -= 1;
  }

  // If coverage carries us to the lunch window, leaving at lunch start does not cost extra time.
  if (cursor > shift.lunchStart && cursor <= shift.lunchEnd) cursor = shift.lunchStart;
  return Math.max(shift.start, cursor);
}

function enabledBalance(kind) {
  const enabled = $(kind === "upt" ? "enableUpt" : kind === "flex" ? "enableFlex" : "enableStandard").checked;
  if (!enabled) return 0;
  const prefix = kind === "standard" ? "standard" : kind;
  return Math.round(num(prefix + "Hours") * 60 + num(prefix + "Minutes"));
}

function usableUpt() {
  const balance = enabledBalance("upt");
  return Math.floor(balance / UPT_BLOCK) * UPT_BLOCK;
}

function splitPaid(amount, flexBalance, standardBalance, order) {
  let remaining = Math.max(0, Math.round(amount));
  let flex = 0;
  let standard = 0;

  if (order === "standard_first") {
    standard = Math.min(standardBalance, remaining);
    remaining -= standard;
    flex = Math.min(flexBalance, remaining);
  } else {
    flex = Math.min(flexBalance, remaining);
    remaining -= flex;
    standard = Math.min(standardBalance, remaining);
  }
  return { flex, standard };
}

function planForRequired(required, priority) {
  const flexBalance = enabledBalance("flex");
  const standardBalance = enabledBalance("standard");
  const paidBalance = flexBalance + standardBalance;
  const uptBalance = usableUpt();
  const order = $("ptoOrder").value;

  let upt = 0;
  let paid = 0;

  if (priority === "save_pto") {
    // UPT first. A partial final 15-minute block is allowed only by charging the full block.
    if (required > 0) upt = Math.min(uptBalance, Math.ceil(required / UPT_BLOCK) * UPT_BLOCK);
    paid = Math.max(0, required - upt);
    if (paid > paidBalance) {
      // If the first pass cannot cover it, use every UPT block and fill the rest with paid time.
      upt = uptBalance;
      paid = Math.max(0, required - upt);
    }
  } else {
    // Paid time first, then add only enough full UPT blocks to cover any shortage.
    const shortage = Math.max(0, required - paidBalance);
    upt = Math.min(uptBalance, Math.ceil(shortage / UPT_BLOCK) * UPT_BLOCK);
    paid = Math.max(0, required - upt);
  }

  if (paid > paidBalance || upt > uptBalance || paid + upt < required) return null;
  const paidSplit = splitPaid(paid, flexBalance, standardBalance, order);
  return {
    upt,
    flex: paidSplit.flex,
    standard: paidSplit.standard,
    charged: upt + paid,
    rounding: Math.max(0, upt + paid - required),
    flexBalance,
    standardBalance,
    uptRawBalance: enabledBalance("upt")
  };
}

function maxCoverage() {
  return enabledBalance("flex") + enabledBalance("standard") + usableUpt();
}

function setMode(nextMode) {
  mode = nextMode;
  $("modeEarliest").classList.toggle("active", mode === "earliest");
  $("modeDesired").classList.toggle("active", mode === "desired");
  $("desiredWrap").classList.toggle("hidden", mode !== "desired");
  $("resultCard").classList.add("hidden");
  maybeSave();
}

function updateBalanceVisibility() {
  $("uptInputs").classList.toggle("hidden", !$("enableUpt").checked);
  $("flexInputs").classList.toggle("hidden", !$("enableFlex").checked);
  $("standardInputs").classList.toggle("hidden", !$("enableStandard").checked);
  $("resultCard").classList.add("hidden");
  maybeSave();
}

function updateShiftSummary() {
  const shift = getShift();
  if (!shift) return;
  $("shiftSummary").textContent = `${displayClock(shift.start)} → ${displayClock(shift.end)} · ${displayDuration(totalShiftWork(shift))} worked`;
  $("predictionLunch").innerHTML = `Lunch: <strong>${displayClock(shift.lunchStart)}–${displayClock(shift.lunchEnd)}</strong> · 30 min unpaid`;
  maybeSave();
}

function renderResult({ error = false, kicker, time, message, needed, upt, flex, standard, extra = "" }) {
  const card = $("resultCard");
  card.classList.toggle("error", error);
  $("resultKicker").textContent = kicker;
  $("resultTime").textContent = time;
  $("resultMessage").textContent = message;
  $("resultNeeded").textContent = needed;
  $("resultUpt").textContent = upt;
  $("resultFlex").textContent = flex;
  $("resultStandard").textContent = standard;
  $("resultExtra").textContent = extra;
  card.classList.remove("hidden");
  setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
}

function calculateEarliest(shift) {
  const coverage = Math.min(maxCoverage(), totalShiftWork(shift));
  const leave = leaveTimeForCoverage(coverage, shift);
  const required = workMinutesBetween(leave, shift.end, shift);
  const plan = planForRequired(required, $("priority").value);

  if (!plan || coverage <= 0) {
    renderResult({
      kicker: "Earliest you can leave",
      time: displayClock(shift.end),
      message: "No enabled time balance is available to cover an early leave.",
      needed: "0 min", upt: "0 min", flex: "0 min", standard: "0 min"
    });
    return;
  }

  const rawUpt = enabledBalance("upt");
  const uptRemainder = Math.max(0, rawUpt - plan.upt);
  const extraParts = [];
  if ($("enableUpt").checked && rawUpt % UPT_BLOCK) {
    extraParts.push(`${displayDuration(rawUpt % UPT_BLOCK)} of UPT is not part of a full 15-minute block.`);
  }
  if (plan.rounding) extraParts.push(`UPT rounding adds ${displayDuration(plan.rounding)} of charged time.`);
  if (plan.upt) extraParts.push(`UPT remaining: ${displayDuration(uptRemainder)}.`);

  renderResult({
    kicker: "Earliest you can leave",
    time: displayClock(leave),
    message: `Your enabled balances can cover ${displayDuration(required)} of scheduled work.`,
    needed: displayDuration(required),
    upt: displayDuration(plan.upt),
    flex: displayDuration(plan.flex),
    standard: displayDuration(plan.standard),
    extra: extraParts.join(" ")
  });
}

function calculateDesired(shift) {
  const rawTarget = parseTime($("desiredLeave").value);
  if (rawTarget == null) return;
  const target = normalizeIntoShift(rawTarget, shift.start, shift.end);

  if (target < shift.start || target > shift.end) {
    renderResult({
      error: true,
      kicker: "Time is outside your shift",
      time: displayClock(target),
      message: `Choose a leave time between ${displayClock(shift.start)} and ${displayClock(shift.end)}.`,
      needed: "—", upt: "—", flex: "—", standard: "—"
    });
    return;
  }

  const required = workMinutesBetween(target, shift.end, shift);
  const plan = planForRequired(required, $("priority").value);

  if (plan) {
    const extraParts = [];
    if (plan.rounding) extraParts.push(`UPT rounding charges ${displayDuration(plan.rounding)} beyond the exact gap.`);
    if (plan.upt) extraParts.push(`UPT remaining: ${displayDuration(Math.max(0, plan.uptRawBalance - plan.upt))}.`);
    renderResult({
      kicker: "Yes — you can leave at",
      time: displayClock(target),
      message: `You need ${displayDuration(required)} of coverage after that time.`,
      needed: displayDuration(required),
      upt: displayDuration(plan.upt),
      flex: displayDuration(plan.flex),
      standard: displayDuration(plan.standard),
      extra: extraParts.join(" ")
    });
    return;
  }

  const coverage = Math.min(maxCoverage(), totalShiftWork(shift));
  const earliest = leaveTimeForCoverage(coverage, shift);
  const short = Math.max(0, required - maxCoverage());
  const earliestRequired = workMinutesBetween(earliest, shift.end, shift);
  const fallbackPlan = planForRequired(earliestRequired, $("priority").value);

  renderResult({
    error: true,
    kicker: "Earliest available time",
    time: displayClock(earliest),
    message: `You cannot cover ${displayClock(target)}. You're short by ${displayDuration(short)}.`,
    needed: displayDuration(required),
    upt: fallbackPlan ? displayDuration(fallbackPlan.upt) : displayDuration(usableUpt()),
    flex: fallbackPlan ? displayDuration(fallbackPlan.flex) : displayDuration(enabledBalance("flex")),
    standard: fallbackPlan ? displayDuration(fallbackPlan.standard) : displayDuration(enabledBalance("standard")),
    extra: `Using all available enabled time, ${displayClock(earliest)} is the earliest leave time.`
  });
}

function calculate() {
  const shift = getShift();
  if (!shift) return;
  updateShiftSummary();
  if (mode === "desired") calculateDesired(shift);
  else calculateEarliest(shift);

  const button = $("calculateBtn");
  const old = button.textContent;
  button.textContent = "Done ✓";
  setTimeout(() => button.textContent = old, 850);
  maybeSave();
}

function earnedUpt(workMinutes) {
  return Math.floor((workMinutes * UPT_RATE_PER_HOUR) / 60 + 1e-9);
}

function predictUpt() {
  const start = parseTime($("predictStart").value);
  const rawEnd = parseTime($("predictEnd").value);
  if (start == null || rawEnd == null) return;
  const end = normalizeEnd(start, rawEnd);

  // Prediction uses the shift lunch setting (11:00 PM by default) and always treats it as 30 minutes unpaid.
  let lunchStart = parseTime($("lunchStart").value);
  lunchStart = normalizeIntoShift(lunchStart, start, end);
  const lunchEnd = lunchStart + LUNCH_MINUTES;
  const elapsed = Math.max(0, end - start);
  const lunchDeducted = overlap(start, end, lunchStart, lunchEnd);
  const worked = Math.max(0, elapsed - lunchDeducted);
  const earned = earnedUpt(worked);

  $("predictWorked").textContent = displayDuration(worked);
  $("predictEarned").textContent = displayDuration(earned);
  $("predictionResult").classList.remove("hidden");
  $("predictionNote").textContent = `${displayDuration(elapsed)} elapsed − ${displayDuration(lunchDeducted)} lunch = ${displayDuration(worked)} worked. At 5 minutes per hour, that's ${displayDuration(earned)} UPT.`;
  maybeSave();
}

function checkLate() {
  const shift = getShift();
  const rawActual = parseTime($("actualClockIn").value);
  if (!shift || rawActual == null) return;
  let actual = normalizeIntoShift(rawActual, shift.start, shift.end);
  actual = Math.min(actual, shift.end);

  const missed = workMinutesBetween(shift.start, actual, shift);
  const charge = missed > 0 ? Math.ceil(missed / UPT_BLOCK) * UPT_BLOCK : 0;
  $("lateBy").textContent = displayDuration(missed);
  $("lateCharge").textContent = displayDuration(charge);
  $("lateResult").classList.remove("hidden");
  $("lateNote").textContent = missed
    ? `${displayClock(actual)} leaves ${displayDuration(missed)} uncovered after ${displayClock(shift.start)}, so UPT rounds up to ${displayDuration(charge)}.`
    : "No late UPT is needed.";
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.__timebankToast);
  window.__timebankToast = setTimeout(() => el.classList.remove("show"), 2200);
}

async function shareSite() {
  try {
    if (navigator.share) {
      await navigator.share({ title: "TimeBank", text: "UPT & PTO calculator", url: location.href });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied");
    }
  } catch (_) {}
}

function serializeState() {
  const data = { mode };
  stateIds.forEach(id => {
    const el = $(id);
    data[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return data;
}

function maybeSave() {
  if (!$("saveEntries").checked) return;
  try {
    localStorage.setItem(SAVE_FLAG, "1");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
  } catch (_) {}
}

function setSaveEnabled(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(SAVE_FLAG, "1");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
      toast("Entries will be saved on this device");
    } else {
      localStorage.removeItem(SAVE_FLAG);
      localStorage.removeItem(STORAGE_KEY);
      toast("Saved entries cleared");
    }
  } catch (_) {}
}

function loadSavedState() {
  try {
    const enabled = localStorage.getItem(SAVE_FLAG) === "1";
    $("saveEntries").checked = enabled;
    if (!enabled) return;
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (data.mode === "desired" || data.mode === "earliest") mode = data.mode;
    stateIds.forEach(id => {
      if (!(id in data)) return;
      const el = $(id);
      if (el.type === "checkbox") el.checked = Boolean(data[id]);
      else el.value = data[id];
    });
  } catch (_) {}
}

$("modeEarliest").addEventListener("click", () => setMode("earliest"));
$("modeDesired").addEventListener("click", () => setMode("desired"));
$("enableUpt").addEventListener("change", updateBalanceVisibility);
$("enableFlex").addEventListener("change", updateBalanceVisibility);
$("enableStandard").addEventListener("change", updateBalanceVisibility);
$("calculateBtn").addEventListener("click", calculate);
$("predictBtn").addEventListener("click", predictUpt);
$("lateBtn").addEventListener("click", checkLate);
$("shareBtn").addEventListener("click", shareSite);

$("editShiftBtn").addEventListener("click", () => {
  $("shiftEditor").classList.toggle("hidden");
  $("editShiftBtn").textContent = $("shiftEditor").classList.contains("hidden") ? "Edit" : "Close";
});
$("doneShiftBtn").addEventListener("click", () => {
  updateShiftSummary();
  $("shiftEditor").classList.add("hidden");
  $("editShiftBtn").textContent = "Edit";
  $("resultCard").classList.add("hidden");
});

$("saveEntries").addEventListener("change", (e) => setSaveEnabled(e.target.checked));

["uptHours", "uptMinutes", "flexHours", "flexMinutes", "standardHours", "standardMinutes", "desiredLeave", "priority", "ptoOrder", "shiftStart", "shiftEnd", "lunchStart"].forEach(id => {
  $(id).addEventListener("change", () => {
    if (["shiftStart", "shiftEnd", "lunchStart"].includes(id)) updateShiftSummary();
    $("resultCard").classList.add("hidden");
    maybeSave();
  });
});

["predictStart", "predictEnd"].forEach(id => $(id).addEventListener("change", maybeSave));

loadSavedState();
setMode(mode);
updateBalanceVisibility();
updateShiftSummary();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
