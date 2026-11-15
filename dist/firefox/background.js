// background.js - Suite Completa: Produtividade, Auto-Hibernação, Limite Diário, Duplicadas e Grupos
import { logEvent, getLocalDateString } from "./logger.js";

let activeTabId = null;
let activeDomain = null;
let lastTimestamp = Date.now();

// Rastreamento de tempo de inatividade das abas para auto-hibernação
const tabLastActiveTimes = {};

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

// Configurações padrão
const DEFAULT_SETTINGS = {
  autoDiscardEnabled: true,
  autoDiscardMinutes: 20,
  dailyDistractionLimitMinutes: 45 // 0 = desativado
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

async function getSettings() {
  const data = await chrome.storage.local.get(["settings"]);
  return Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
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

async function checkDistractionLimit(dailyStats, today) {
  const settings = await getSettings();
  if (!settings.dailyDistractionLimitMinutes || settings.dailyDistractionLimitMinutes <= 0) return;

  let distSeconds = 0;
  if (dailyStats && dailyStats[today]) {
    for (const d of Object.values(dailyStats[today])) {
      if (d.category === "distracting") distSeconds += d.seconds;
    }
  }

  const limitSeconds = settings.dailyDistractionLimitMinutes * 60;
  if (distSeconds >= limitSeconds) {
    // Limite atingido
    const alertedTodayKey = `limit_alerted_${today}`;
    const storage = await chrome.storage.local.get([alertedTodayKey]);
    if (!storage[alertedTodayKey]) {
      await chrome.storage.local.set({ [alertedTodayKey]: true });
      try {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Limite Diário de Distrações Atingido! 🛑",
          message: `Você atingiu seu orçamento de ${settings.dailyDistractionLimitMinutes} minutos em sites de distração hoje.`,
          priority: 2
        });
      } catch (e) {}
      await logEvent("WARN", "DISTRACTION_DAILY_LIMIT_EXCEEDED", {
        limitMinutes: settings.dailyDistractionLimitMinutes,
        usedMinutes: Math.round(distSeconds / 60)
      });
    }
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

  // Checagem de limite de distração
  if (category === "distracting") {
    await checkDistractionLimit(dailyStats, today);
  }

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
      tabLastActiveTimes[tab.id] = Date.now();
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

// Rotina periódica de auto-hibernação de abas ociosas
async function runAutoDiscardCheck() {
  const settings = await getSettings();
  if (!settings.autoDiscardEnabled) return;

  const thresholdMs = (settings.autoDiscardMinutes || 20) * 60 * 1000;
  const now = Date.now();

  try {
    const tabs = await chrome.tabs.query({});
    let discardedCount = 0;

    for (const t of tabs) {
      if (t.active || t.pinned || t.audible || t.discarded) continue;
      
      const lastActive = tabLastActiveTimes[t.id] || now;
      if (now - lastActive >= thresholdMs) {
        try {
          await chrome.tabs.discard(t.id);
          discardedCount++;
        } catch (e) {}
      }
    }

    if (discardedCount > 0) {
      const data = await chrome.storage.local.get(["ramSavedMB"]);
      const currentSaved = data.ramSavedMB || 0;
      // Média estimada de 50MB economizados por aba suspensa
      const newSaved = currentSaved + (discardedCount * 50);
      await chrome.storage.local.set({ ramSavedMB: newSaved });
      await logEvent("ACTION", "AUTO_DISCARD_TABS_EXECUTED", {
        discardedCount,
        estimatedMbSaved: discardedCount * 50
      });
    }
  } catch (err) {}
}

// Inicialização
(async () => {
  lastTimestamp = Date.now();
  await updateCurrentActiveTab();
  await recordTimeSpent();
  await logEvent("INFO", "SERVICE_WORKER_STARTED", { activeDomain });
})();

// Loop de 1s para tempo e pomodoro
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

// Alarme para auto-hibernação a cada 2 minutos
chrome.alarms.create("autoDiscardAlarm", { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "autoDiscardAlarm") {
    await runAutoDiscardCheck();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await recordTimeSpent();
  activeTabId = activeInfo.tabId;
  tabLastActiveTimes[activeTabId] = Date.now();
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
  tabLastActiveTimes[tabId] = Date.now();
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
      const data = await chrome.storage.local.get(["dailyStats", "rules", "telemetry_logs", "settings", "ramSavedMB"]);
      sendResponse({
        dailyStats: (data.dailyStats && data.dailyStats[today]) || {},
        allDailyStats: data.dailyStats || {},
        rules: data.rules || DEFAULT_RULES,
        settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {}),
        ramSavedMB: data.ramSavedMB || 0,
        telemetryLogs: data.telemetry_logs || [],
        activeDomain: activeDomain,
        pomodoro: pomodoroState
      });
    })();
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    (async () => {
      const current = await getSettings();
      const updated = Object.assign({}, current, message.settings || {});
      await chrome.storage.local.set({ settings: updated });
      await logEvent("ACTION", "SETTINGS_UPDATED", updated);
      sendResponse({ success: true, settings: updated });
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
      const tabs = await chrome.tabs.query({});
      let discardedCount = 0;
      const discardedTabs = [];

      for (const t of tabs) {
        if (!t.active && !t.pinned && !t.audible && !t.discarded) {
          try {
            await chrome.tabs.discard(t.id);
            discardedCount++;
            discardedTabs.push(getDomain(t.url));
          } catch(e) {}
        }
      }

      if (discardedCount > 0) {
        const data = await chrome.storage.local.get(["ramSavedMB"]);
        const currentSaved = data.ramSavedMB || 0;
        await chrome.storage.local.set({ ramSavedMB: currentSaved + (discardedCount * 50) });
      }

      await logEvent("ACTION", "TABS_DISCARDED", {
        count: discardedCount,
        tabs: discardedTabs
      });

      sendResponse({ discardedCount, ramSavedApproxMB: discardedCount * 50 });
    })();
    return true;
  }

  // Limpeza de Abas Duplicadas
  if (message.type === "CLOSE_DUPLICATE_TABS") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const seenUrls = new Set();
        let closedCount = 0;
        const closedDetails = [];

        // Prioriza manter a aba ativa caso seja uma das duplicadas
        for (const t of tabs) {
          if (t.active && t.url) {
            seenUrls.add(t.url);
          }
        }

        for (const t of tabs) {
          if (t.pinned || !t.url) continue;

          if (seenUrls.has(t.url)) {
            if (!t.active) {
              await chrome.tabs.remove(t.id);
              closedCount++;
              closedDetails.push(t.url);
            }
          } else {
            seenUrls.add(t.url);
          }
        }

        await logEvent("ACTION", "CLOSE_DUPLICATES_EXECUTED", { closedCount });
        sendResponse({ success: true, closedCount });
      } catch (err) {
        await logEvent("ERROR", "CLOSE_DUPLICATES_FAILED", { error: err.message });
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "CLOSE_DISTRACTING_TABS") {
    (async () => {
      const rules = await getRules();
      const tabs = await chrome.tabs.query({});
      let closedCount = 0;
      const closedDomains = [];

      for (const t of tabs) {
        const dom = getDomain(t.url);
        if (dom && matchesRule(dom, rules.distracting)) {
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
        closedDomains
      });

      sendResponse({ closedCount, closedDomains, inspectedCount: tabs.length });
    })();
    return true;
  }

  if (message.type === "GROUP_TABS_BY_DOMAIN") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const domainGroups = {};

        for (const t of tabs) {
          if (t.pinned) continue;
          const dom = getDomain(t.url);
          if (!dom || dom === "Navegador" || dom === "Outro") continue;
          if (!domainGroups[dom]) domainGroups[dom] = [];
          domainGroups[dom].push(t.id);
        }

        let groupsCreated = 0;
        const colorPalette = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
        let colorIdx = 0;

        for (const [dom, tabIds] of Object.entries(domainGroups)) {
          if (tabIds.length >= 2) {
            const groupId = await chrome.tabs.group({ tabIds: tabIds });
            const color = colorPalette[colorIdx % colorPalette.length];
            colorIdx++;
            await chrome.tabGroups.update(groupId, {
              title: dom,
              color: color
            });
            groupsCreated++;
          }
        }

        await logEvent("ACTION", "GROUP_TABS_BY_DOMAIN_EXECUTED", { groupsCreated });
        sendResponse({ success: true, groupsCreated });
      } catch (err) {
        await logEvent("ERROR", "GROUP_BY_DOMAIN_FAILED", { error: err.message });
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "GROUP_TABS_BY_CATEGORY") {
    (async () => {
      try {
        const rules = await getRules();
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const categoryGroups = { productive: [], neutral: [], distracting: [] };

        for (const t of tabs) {
          if (t.pinned) continue;
          const dom = getDomain(t.url);
          if (!dom || dom === "Navegador" || dom === "Outro") continue;

          if (matchesRule(dom, rules.productive)) categoryGroups.productive.push(t.id);
          else if (matchesRule(dom, rules.distracting)) categoryGroups.distracting.push(t.id);
          else categoryGroups.neutral.push(t.id);
        }

        let groupsCreated = 0;
        const config = {
          productive: { title: "🟢 Produtivo", color: "green" },
          neutral: { title: "🔵 Neutro / Pesquisa", color: "blue" },
          distracting: { title: "🔴 Distração", color: "red" }
        };

        for (const [cat, tabIds] of Object.entries(categoryGroups)) {
          if (tabIds.length >= 2) {
            const groupId = await chrome.tabs.group({ tabIds: tabIds });
            await chrome.tabGroups.update(groupId, {
              title: config[cat].title,
              color: config[cat].color
            });
            groupsCreated++;
          }
        }

        await logEvent("ACTION", "GROUP_TABS_BY_CATEGORY_EXECUTED", { groupsCreated });
        sendResponse({ success: true, groupsCreated });
      } catch (err) {
        await logEvent("ERROR", "GROUP_BY_CATEGORY_FAILED", { error: err.message });
        sendResponse({ success: false, error: err.message });
      }
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
      
      lastTimestamp = Date.now();
      updateBadge(null);
      await logEvent("ACTION", "DAILY_STATS_RESET", { date: today });
      sendResponse({ success: true });
    })();
    return true;
  }
});
