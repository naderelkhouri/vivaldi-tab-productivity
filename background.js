// background.js - Suite com Telemetria e Fechamento Robusto de Abas
import { logEvent, getLocalDateString } from "./logger.js";

let activeTabId = null;
let activeDomain = null;
let lastTimestamp = Date.now();

const DEFAULT_RULES = {
  productive: [
    "github.com", "gitlab.com", "stackoverflow.com", "notion.so", "figma.com",
    "docs.google.com", "meet.google.com", "chatgpt.com", "claude.ai", "gemini.google.com",
    "google.com", "wikipedia.org", "w3schools.com", "developer.mozilla.org", "localhost"
  ],
  distracting: [
    "youtube.com", "reddit.com", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "tiktok.com", "netflix.com", "twitch.tv", "primevideo.com"
  ]
};

let pomodoroState = {
  active: false,
  mode: "focus",
  remainingSeconds: 25 * 60,
  focusDuration: 25 * 60,
  breakDuration: 5 * 60
};

function getDomain(url) {
  try {
    if (!url) return null;
    if (url.startsWith("chrome://") || url.startsWith("vivaldi://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      return "Navegador";
    }
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return null;
  }
}

async function getRules() {
  const data = await chrome.storage.local.get(["rules"]);
  return data.rules || DEFAULT_RULES;
}

function matchesRule(domain, ruleList) {
  if (!domain || domain === "Navegador" || !ruleList) return false;
  return ruleList.some(rule => {
    const r = rule.trim().toLowerCase();
    return domain === r || domain.endsWith("." + r) || domain.includes(r);
  });
}

function updateBadge(score, category) {
  if (pomodoroState.active) {
    const mins = Math.ceil(pomodoroState.remainingSeconds / 60);
    chrome.action.setBadgeText({ text: `${mins}m` });
    chrome.action.setBadgeBackgroundColor({
      color: pomodoroState.mode === "focus" ? "#e67e22" : "#2ecc71"
    });
    return;
  }

  if (score === null || score === undefined) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  chrome.action.setBadgeText({ text: `${score}%` });
  
  if (category === "productive" || score >= 70) {
    chrome.action.setBadgeBackgroundColor({ color: "#2ecc71" });
  } else if (score >= 40) {
    chrome.action.setBadgeBackgroundColor({ color: "#3498db" });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
  }
}

async function recordTimeSpent() {
  const now = Date.now();
  const elapsedSeconds = Math.round((now - lastTimestamp) / 1000);
  lastTimestamp = now;

  if (elapsedSeconds <= 0 || !activeDomain || activeDomain === "Navegador") {
    return;
  }

  const today = getLocalDateString();
  const data = await chrome.storage.local.get(["dailyStats", "rules"]);
  const dailyStats = data.dailyStats || {};
  const rules = data.rules || DEFAULT_RULES;

  if (!dailyStats[today]) {
    dailyStats[today] = {};
  }

  let category = "neutral";
  if (matchesRule(activeDomain, rules.productive)) {
    category = "productive";
  } else if (matchesRule(activeDomain, rules.distracting)) {
    category = "distracting";
  }

  if (!dailyStats[today][activeDomain]) {
    dailyStats[today][activeDomain] = {
      seconds: 0,
      category: category
    };
  } else {
    dailyStats[today][activeDomain].category = category;
  }

  dailyStats[today][activeDomain].seconds += elapsedSeconds;
  await chrome.storage.local.set({ dailyStats });

  let prod = 0, neut = 0, dist = 0;
  for (const d of Object.values(dailyStats[today])) {
    if (d.category === "productive") prod += d.seconds;
    else if (d.category === "distracting") dist += d.seconds;
    else neut += d.seconds;
  }
  const total = prod + neut + dist;
  if (total > 0) {
    const score = Math.round(((prod + (neut * 0.5)) / total) * 100);
    updateBadge(score, category);
  }
}

async function updateCurrentActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.url) {
      activeTabId = tab.id;
      activeDomain = getDomain(tab.url);
      checkFocusModeDistraction(tab);
    } else {
      activeDomain = null;
    }
  } catch (e) {
    activeDomain = null;
  }
}

async function checkFocusModeDistraction(tab) {
  if (!pomodoroState.active || pomodoroState.mode !== "focus" || !tab || !tab.url) return;
  const domain = getDomain(tab.url);
  if (!domain || domain === "Navegador") return;

  const rules = await getRules();
  if (matchesRule(domain, rules.distracting)) {
    logEvent("WARN", "FOCUS_DISTRACTION_DETECTED", { domain, tabTitle: tab.title });
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Modo Foco Ativo! 🎯",
        message: `Você está na aba ${domain}. Volte ao foco ou pause o Pomodoro!`,
        priority: 2
      });
    } catch (e) {}
  }
}

// Inicialização
(async () => {
  lastTimestamp = Date.now();
  await updateCurrentActiveTab();
  await recordTimeSpent();
  await logEvent("INFO", "SERVICE_WORKER_STARTED", { activeDomain });
})();

setInterval(async () => {
  await recordTimeSpent();

  if (pomodoroState.active) {
    pomodoroState.remainingSeconds--;
    if (pomodoroState.remainingSeconds <= 0) {
      if (pomodoroState.mode === "focus") {
        pomodoroState.mode = "break";
        pomodoroState.remainingSeconds = pomodoroState.breakDuration;
        await logEvent("ACTION", "POMODORO_BREAK_STARTED");
      } else {
        pomodoroState.mode = "focus";
        pomodoroState.remainingSeconds = pomodoroState.focusDuration;
        await logEvent("ACTION", "POMODORO_CYCLE_STARTED");
      }
    }
    updateBadge();
  }
}, 1000);

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await recordTimeSpent();
  activeTabId = activeInfo.tabId;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    activeDomain = getDomain(tab.url);
    checkFocusModeDistraction(tab);
  } catch (err) {
    activeDomain = null;
  }
  lastTimestamp = Date.now();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    await recordTimeSpent();
    activeDomain = getDomain(changeInfo.url);
    checkFocusModeDistraction(tab);
    lastTimestamp = Date.now();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await recordTimeSpent();
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    activeDomain = null;
  } else {
    await updateCurrentActiveTab();
  }
  lastTimestamp = Date.now();
});

// Listener de Mensagens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SYNC_AND_GET_STATS") {
    (async () => {
      await recordTimeSpent();
      const today = getLocalDateString();
      const data = await chrome.storage.local.get(["dailyStats", "rules", "telemetry_logs"]);
      sendResponse({
        dailyStats: (data.dailyStats && data.dailyStats[today]) || {},
        allDailyStats: data.dailyStats || {},
        rules: data.rules || DEFAULT_RULES,
        telemetryLogs: data.telemetry_logs || [],
        activeDomain: activeDomain,
        pomodoro: pomodoroState
      });
    })();
    return true;
  }

  if (message.type === "UPDATE_RULE") {
    (async () => {
      const { domain, category } = message;
      const data = await chrome.storage.local.get(["rules", "dailyStats"]);
      const rules = data.rules || JSON.parse(JSON.stringify(DEFAULT_RULES));
      
      rules.productive = rules.productive.filter(d => d !== domain);
      rules.distracting = rules.distracting.filter(d => d !== domain);

      if (category === "productive") rules.productive.push(domain);
      else if (category === "distracting") rules.distracting.push(domain);

      const today = getLocalDateString();
      const dailyStats = data.dailyStats || {};
      if (dailyStats[today] && dailyStats[today][domain]) {
        dailyStats[today][domain].category = category;
      }

      await chrome.storage.local.set({ rules, dailyStats });
      await logEvent("ACTION", "RULE_UPDATED", { domain, category });
      sendResponse({ success: true, rules });
    })();
    return true;
  }

  if (message.type === "POMODORO_ACTION") {
    if (message.action === "START") pomodoroState.active = true;
    else if (message.action === "PAUSE") pomodoroState.active = false;
    else if (message.action === "RESET") {
      pomodoroState.active = false;
      pomodoroState.mode = "focus";
      pomodoroState.remainingSeconds = pomodoroState.focusDuration;
    }
    logEvent("ACTION", `POMODORO_${message.action}`);
    sendResponse({ pomodoro: pomodoroState });
    return false;
  }

  if (message.type === "DISCARD_INACTIVE_TABS") {
    (async () => {
      // Busca abas em TODAS as janelas ou na janela ativa
      const tabs = await chrome.tabs.query({});
      let discardedCount = 0;
      const discardedTabs = [];

      for (const t of tabs) {
        if (!t.active && !t.pinned && !t.audible) {
          try {
            await chrome.tabs.discard(t.id);
            discardedCount++;
            discardedTabs.push(getDomain(t.url));
          } catch(e) {}
        }
      }

      await logEvent("ACTION", "TABS_DISCARDED", {
        count: discardedCount,
        tabs: discardedTabs
      });

      sendResponse({ discardedCount });
    })();
    return true;
  }

  if (message.type === "CLOSE_DISTRACTING_TABS") {
    (async () => {
      const rules = await getRules();
      // Consulta TODAS as abas abertas no navegador
      const tabs = await chrome.tabs.query({});
      let closedCount = 0;
      const closedDomains = [];
      const inspectedDomains = [];

      for (const t of tabs) {
        const dom = getDomain(t.url);
        inspectedDomains.push({ domain: dom, active: t.active });

        if (dom && matchesRule(dom, rules.distracting)) {
          // Fecha mesmo se estiver em outra janela, mas preserva a aba ativa onde o usuário estiver agora se desejado
          try {
            await chrome.tabs.remove(t.id);
            closedCount++;
            closedDomains.push(dom);
          } catch (e) {
            await logEvent("ERROR", "TAB_REMOVE_FAILED", { tabId: t.id, error: e.message });
          }
        }
      }

      await logEvent("ACTION", "CLOSE_DISTRACTING_TABS_EXECUTED", {
        closedCount,
        closedDomains,
        distractingRules: rules.distracting,
        totalTabsInspected: tabs.length
      });

      sendResponse({
        closedCount,
        closedDomains,
        inspectedCount: tabs.length
      });
    })();
    return true;
  }

  if (message.type === "CLEAR_TELEMETRY") {
    (async () => {
      await chrome.storage.local.set({ telemetry_logs: [] });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === "RESET_TODAY_STATS") {
    (async () => {
      const today = getLocalDateString();
      const data = await chrome.storage.local.get(["dailyStats"]);
      const dailyStats = data.dailyStats || {};
      delete dailyStats[today];
      await chrome.storage.local.set({ dailyStats });
      
      // Reseta timestamp para não computar minutos acumulados da aba ativa
      lastTimestamp = Date.now();
      updateBadge(null);
      await logEvent("ACTION", "DAILY_STATS_RESET", { date: today });
      sendResponse({ success: true });
    })();
    return true;
  }
});
