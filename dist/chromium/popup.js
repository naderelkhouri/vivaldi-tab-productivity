// popup.js - Controle completo da Suite v2.6.0 com Auto-Hibernação, Limite, Duplicadas e Exportação

let currentRules = { productive: [], distracting: [] };
let cachedDailyStats = {};
let cachedAllDailyStats = {};
let cachedTelemetryLogs = [];
let cachedSettings = { autoDiscardEnabled: true, autoDiscardMinutes: 20, dailyDistractionLimitMinutes: 45 };
let updateIntervalId = null;
let currentFilterCategory = "all";
let currentSearchTerm = "";

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason && (event.reason.message?.includes("Extension context invalidated") || event.reason.toString().includes("Extension context invalidated"))) {
    event.preventDefault();
    if (updateIntervalId) clearInterval(updateIntervalId);
    showReloadNotice();
  }
});

function isContextValid() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome?.runtime?.id);
  } catch (e) {
    return false;
  }
}

function showReloadNotice() {
  const toast = document.getElementById("actionFeedback");
  if (!toast) return;
  toast.textContent = "A extensão foi atualizada. Feche e reabra este painel.";
  toast.style.display = "block";
  toast.style.borderColor = "var(--neutral)";
  toast.style.backgroundColor = "rgba(52, 152, 219, 0.25)";
}

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return d.toLocaleString("pt-BR", {
    timeZoneName: "short",
    hour12: false
  });
}

function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds < 1) return "0s";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m ${s}s`;
  return `${h}h ${m % 60}m`;
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getDomain(url) {
  try {
    if (!url || url.startsWith("chrome://") || url.startsWith("vivaldi://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      return "Navegador";
    }
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    return "Outro";
  }
}

function showToast(message, isError = false) {
  const toast = document.getElementById("actionFeedback");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  toast.style.borderColor = isError ? "var(--distracting)" : "var(--productive)";
  toast.style.backgroundColor = isError ? "rgba(231, 76, 60, 0.2)" : "rgba(46, 204, 113, 0.2)";
  setTimeout(() => {
    toast.style.display = "none";
  }, 4000);
}

// Navegação entre abas
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel-content").forEach(p => p.classList.remove("active"));
    
    btn.classList.add("active");
    const targetId = btn.getAttribute("data-target");
    document.getElementById(targetId).classList.add("active");

    if (targetId === "panel-telemetry") {
      renderTelemetryList();
    }
  });
});

async function safeSendMessage(payload) {
  if (!isContextValid()) {
    if (updateIntervalId) clearInterval(updateIntervalId);
    showReloadNotice();
    return null;
  }
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          if (updateIntervalId) clearInterval(updateIntervalId);
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      if (updateIntervalId) clearInterval(updateIntervalId);
      resolve(null);
    }
  });
}

async function loadData() {
  if (!isContextValid()) {
    if (updateIntervalId) clearInterval(updateIntervalId);
    return;
  }

  const response = await safeSendMessage({ type: "SYNC_AND_GET_STATS" });
  if (!response) return;

  const dailyStats = response.dailyStats || {};
  const allDailyStats = response.allDailyStats || {};
  cachedDailyStats = dailyStats;
  cachedAllDailyStats = allDailyStats;
  currentRules = response.rules || currentRules;
  cachedSettings = response.settings || cachedSettings;
  cachedTelemetryLogs = response.telemetryLogs || [];
  const pomodoro = response.pomodoro;
  const ramSaved = response.ramSavedMB || 0;

  // 1. Cards de tempo
  let totalProdSeconds = 0;
  let totalNeutSeconds = 0;
  let totalDistSeconds = 0;

  for (const [dom, data] of Object.entries(dailyStats)) {
    if (data.category === "productive") totalProdSeconds += data.seconds;
    else if (data.category === "distracting") totalDistSeconds += data.seconds;
    else totalNeutSeconds += data.seconds;
  }

  document.getElementById("timeProductive").textContent = formatTime(totalProdSeconds);
  document.getElementById("timeNeutral").textContent = formatTime(totalNeutSeconds);
  document.getElementById("timeDistracting").textContent = formatTime(totalDistSeconds);

  // Destaca com animação o card ativo
  const activeDom = response.activeDomain;
  const cardProd = document.querySelector(".card-productive");
  const cardNeut = document.querySelector(".card-neutral");
  const cardDist = document.querySelector(".card-distracting");

  cardProd.classList.remove("is-ticking");
  cardNeut.classList.remove("is-ticking");
  cardDist.classList.remove("is-ticking");

  if (activeDom && dailyStats[activeDom]) {
    const cat = dailyStats[activeDom].category;
    if (cat === "productive") cardProd.classList.add("is-ticking");
    else if (cat === "distracting") cardDist.classList.add("is-ticking");
    else cardNeut.classList.add("is-ticking");
  }

  // Barra de Orçamento de Distração
  updateDistractionBudgetUI(totalDistSeconds, cachedSettings.dailyDistractionLimitMinutes);

  // Score Badge
  const totalTracked = totalProdSeconds + totalNeutSeconds + totalDistSeconds;
  const scoreBadge = document.getElementById("scoreBadge");
  if (totalTracked > 0) {
    const weightedScore = Math.round(((totalProdSeconds + (totalNeutSeconds * 0.5)) / totalTracked) * 100);
    scoreBadge.textContent = `${weightedScore}%`;
    scoreBadge.style.color = weightedScore >= 70 ? "var(--productive)" : (weightedScore >= 40 ? "var(--neutral)" : "var(--distracting)");
  } else {
    scoreBadge.textContent = "100%";
    scoreBadge.style.color = "var(--productive)";
  }

  // 2. Abas abertas
  await renderTabsList(dailyStats);

  // 3. Pomodoro UI
  if (pomodoro) {
    document.getElementById("pomodoroClock").textContent = formatClock(pomodoro.remainingSeconds);
    document.getElementById("pomodoroMode").textContent = pomodoro.mode === "focus" ? "MODO FOCO" : "HORA DA PAUSA";
    document.getElementById("pomodoroToggleBtn").textContent = pomodoro.active ? "Pausar" : "Iniciar Foco";
    document.getElementById("pomodoroToggleBtn").style.backgroundColor = pomodoro.active ? "var(--focus)" : "var(--productive)";
  }

  // 4. Histórico & RAM
  renderHistoryChart(allDailyStats);
  document.getElementById("ramSavedDisplay").textContent = `~${ramSaved} MB liberados`;

  // 5. Atualizar lista de regras em ordem alfabética
  renderRulesList();
}

// Atualiza barra de orçamento de distração
function updateDistractionBudgetUI(usedSeconds, limitMinutes) {
  const box = document.getElementById("distractionBudgetBox");
  if (!box) return;

  if (!limitMinutes || limitMinutes <= 0) {
    box.style.display = "none";
    return;
  }

  box.style.display = "block";
  const usedMinutes = Math.round(usedSeconds / 60);
  const fill = document.getElementById("budgetProgressFill");
  const label = document.getElementById("budgetUsageLabel");

  const pct = Math.min(100, Math.round((usedMinutes / limitMinutes) * 100));
  fill.style.width = `${pct}%`;
  label.textContent = `${usedMinutes}m / ${limitMinutes}m`;

  fill.classList.remove("budget-warning", "budget-exceeded");
  if (pct >= 100) {
    fill.classList.add("budget-exceeded");
    label.style.color = "var(--distracting)";
  } else if (pct >= 80) {
    fill.classList.add("budget-warning");
    label.style.color = "var(--focus)";
  } else {
    label.style.color = "var(--text-muted)";
  }
}

// Renderiza abas abertas com filtros
async function renderTabsList(dailyStats) {
  if (!isContextValid()) return;

  let tabs = [];
  try {
    tabs = await new Promise((resolve) => {
      chrome.tabs.query({ currentWindow: true }, (result) => {
        if (chrome.runtime.lastError) resolve([]);
        else resolve(result || []);
      });
    });
  } catch (e) {
    return;
  }

  const tabsList = document.getElementById("tabsList");
  tabsList.innerHTML = "";

  const filteredTabs = tabs.filter(tab => {
    const domain = getDomain(tab.url).toLowerCase();
    const title = (tab.title || "").toLowerCase();
    const domainData = dailyStats[domain] || { category: "neutral" };
    const category = domainData.category;

    if (currentFilterCategory !== "all" && category !== currentFilterCategory) {
      return false;
    }

    if (currentSearchTerm) {
      const match = domain.includes(currentSearchTerm) || title.includes(currentSearchTerm);
      if (!match) return false;
    }

    return true;
  });

  if (filteredTabs.length === 0) {
    tabsList.innerHTML = `<div class="empty-state">Nenhuma aba corresponde ao filtro.</div>`;
    return;
  }

  filteredTabs.forEach(tab => {
    const domain = getDomain(tab.url);
    const domainData = dailyStats[domain] || { seconds: 0, category: "neutral" };
    
    const tabEl = document.createElement("div");
    tabEl.className = `tab-item ${tab.active ? 'active-now' : ''}`;
    tabEl.title = "Clique para focar nesta aba";
    
    const catLabel = domainData.category === "productive" ? "Produtivo" : (domainData.category === "distracting" ? "Distração" : "Neutro");
    const tagClass = `tag-${domainData.category}`;
    const favIcon = tab.favIconUrl || "icons/icon16.png";

    tabEl.innerHTML = `
      <div class="tab-info">
        <img class="tab-fav" src="${favIcon}" />
        <div class="tab-texts">
          <span class="tab-title">${tab.title || "Sem título"}</span>
          <span class="tab-domain">${domain}</span>
        </div>
      </div>
      <div class="tab-meta">
        <span class="category-tag ${tagClass}">${catLabel}</span>
        <span class="tab-time">${formatTime(domainData.seconds)}</span>
      </div>
    `;

    const imgEl = tabEl.querySelector(".tab-fav");
    imgEl.addEventListener("error", () => {
      imgEl.src = "icons/icon16.png";
    });

    tabEl.addEventListener("click", () => {
      if (isContextValid()) {
        try {
          chrome.tabs.update(tab.id, { active: true });
        } catch (e) {}
      }
    });

    tabsList.appendChild(tabEl);
  });
}

// Renderiza histórico semanal
function renderHistoryChart(allDailyStats) {
  const chartEl = document.getElementById("historyChart");
  if (!chartEl) return;
  chartEl.innerHTML = "";

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(getLocalDateString(d));
  }

  let maxSeconds = 1;
  days.forEach(dayStr => {
    const dayData = allDailyStats[dayStr] || {};
    let dayTotal = 0;
    for (const item of Object.values(dayData)) {
      dayTotal += item.seconds;
    }
    if (dayTotal > maxSeconds) maxSeconds = dayTotal;
  });

  days.forEach(dayStr => {
    const dayData = allDailyStats[dayStr] || {};
    let prodSec = 0;
    let distSec = 0;

    for (const item of Object.values(dayData)) {
      if (item.category === "productive") prodSec += item.seconds;
      else if (item.category === "distracting") distSec += item.seconds;
    }

    const prodHeight = Math.round((prodSec / maxSeconds) * 110);
    const distHeight = Math.round((distSec / maxSeconds) * 110);
    const dateLabel = dayStr.slice(8, 10) + "/" + dayStr.slice(5, 7);

    const col = document.createElement("div");
    col.className = "chart-col";
    col.innerHTML = `
      <div class="bar-stack" title="${dayStr}: ${formatTime(prodSec)} produtivo, ${formatTime(distSec)} distração">
        <div class="bar-prod" style="height: ${prodHeight}px;"></div>
        <div class="bar-dist" style="height: ${distHeight}px;"></div>
      </div>
      <span class="col-label">${dateLabel}</span>
    `;
    chartEl.appendChild(col);
  });
}

// Renderiza Regras
function renderRulesList() {
  const container = document.getElementById("rulesListContainer");
  if (!container) return;
  container.innerHTML = "";

  const allRules = [];
  (currentRules.productive || []).forEach(d => allRules.push({ domain: String(d).trim().toLowerCase(), cat: "productive" }));
  (currentRules.distracting || []).forEach(d => allRules.push({ domain: String(d).trim().toLowerCase(), cat: "distracting" }));

  // Ordenação estritamente alfabética A-Z (case-insensitive e acentos normatizados)
  allRules.sort((a, b) => a.domain.localeCompare(b.domain, "pt-BR", { sensitivity: "base" }));

  if (allRules.length === 0) {
    container.innerHTML = `<div class="empty-state">Nenhum site classificado ainda.</div>`;
    return;
  }

  allRules.forEach(rule => {
    const item = document.createElement("div");
    item.className = "rule-entry";
    const tagClass = `tag-${rule.cat}`;
    const label = rule.cat === "productive" ? "Produtivo" : "Distração";

    item.innerHTML = `
      <span>${rule.domain}</span>
      <div class="rule-actions">
        <span class="category-tag ${tagClass}">${label}</span>
        <button class="rule-del-btn" title="Remover regra">✕</button>
      </div>
    `;

    item.querySelector(".rule-del-btn").addEventListener("click", async () => {
      await safeSendMessage({
        type: "UPDATE_RULE",
        domain: rule.domain,
        category: "neutral"
      });
      loadData();
    });

    container.appendChild(item);
  });
}

// Renderiza Telemetria
function renderTelemetryList() {
  const container = document.getElementById("telemetryLogsContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!cachedTelemetryLogs || cachedTelemetryLogs.length === 0) {
    container.innerHTML = `<div class="empty-state">Nenhum evento registrado ainda.</div>`;
    return;
  }

  cachedTelemetryLogs.slice(0, 80).forEach(log => {
    const div = document.createElement("div");
    div.className = `log-entry log-${log.level}`;
    const timeFormatted = log.localTime || formatLocalDateTime(log.timestamp);

    div.innerHTML = `
      <div class="log-meta">
        <span class="log-action">[${log.level}] ${log.action}</span>
        <span>${timeFormatted}</span>
      </div>
      <div class="log-details">${JSON.stringify(log.details)}</div>
    `;
    container.appendChild(div);
  });
}

// Exportar Relatório em Markdown
document.getElementById("exportMarkdownBtn").addEventListener("click", () => {
  const today = getLocalDateString();
  const stats = cachedDailyStats || {};

  let prodSec = 0, neutSec = 0, distSec = 0;
  for (const item of Object.values(stats)) {
    if (item.category === "productive") prodSec += item.seconds;
    else if (item.category === "distracting") distSec += item.seconds;
    else neutSec += item.seconds;
  }

  const total = prodSec + neutSec + distSec;
  const score = total > 0 ? Math.round(((prodSec + (neutSec * 0.5)) / total) * 100) : 100;

  let md = `# Relatório de Produtividade Vivaldi - ${today}\n\n`;
  md += `- **Score de Foco**: ${score}%\n`;
  md += `- **Tempo Produtivo**: ${formatTime(prodSec)}\n`;
  md += `- **Tempo Neutro**: ${formatTime(neutSec)}\n`;
  md += `- **Tempo de Distração**: ${formatTime(distSec)}\n\n`;
  md += `## Detalhamento por Site\n\n`;
  md += `| Domínio | Categoria | Tempo Gasto |\n`;
  md += `| :--- | :---: | :--- |\n`;

  const sorted = Object.entries(stats).sort((a, b) => b[1].seconds - a[1].seconds);
  sorted.forEach(([dom, val]) => {
    md += `| \`${dom}\` | ${val.category.toUpperCase()} | ${formatTime(val.seconds)} |\n`;
  });

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-produtividade-${today}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Relatório Markdown exportado!");
});

// Exportar Relatório em CSV
document.getElementById("exportCsvBtn").addEventListener("click", () => {
  const today = getLocalDateString();
  const stats = cachedDailyStats || {};

  let csv = "Data,Dominio,Categoria,Segundos,Formatado\n";
  for (const [dom, val] of Object.entries(stats)) {
    csv += `"${today}","${dom}","${val.category}",${val.seconds},"${formatTime(val.seconds)}"\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `produtividade-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Planilha CSV exportada!");
});

// Ações de Abas
document.getElementById("discardTabsBtn").addEventListener("click", async () => {
  const res = await safeSendMessage({ type: "DISCARD_INACTIVE_TABS" });
  if (res) {
    showToast(`${res.discardedCount} abas suspensas (~${res.ramSavedApproxMB} MB liberados)!`);
    loadData();
  }
});

document.getElementById("closeDuplicatesBtn").addEventListener("click", async () => {
  const res = await safeSendMessage({ type: "CLOSE_DUPLICATE_TABS" });
  if (res && res.success) {
    if (res.closedCount > 0) {
      showToast(`✓ ${res.closedCount} abas duplicadas fechadas com sucesso!`);
    } else {
      showToast(`Nenhuma aba duplicada encontrada nesta janela.`);
    }
    loadData();
  }
});

document.getElementById("closeDistractingBtn").addEventListener("click", async () => {
  const res = await safeSendMessage({ type: "CLOSE_DISTRACTING_TABS" });
  if (res) {
    if (res.closedCount > 0) {
      showToast(`✓ ${res.closedCount} abas de distração fechadas com sucesso!`);
    } else {
      showToast(`Nenhuma aba de distração encontrada entre as ${res.inspectedCount} abas abertas.`, true);
    }
    loadData();
  }
});

// Agrupamento de Abas
document.getElementById("groupByDomainBtn").addEventListener("click", async () => {
  const res = await safeSendMessage({ type: "GROUP_TABS_BY_DOMAIN" });
  if (res && res.success) {
    if (res.groupsCreated > 0) {
      showToast(`✓ ${res.groupsCreated} pilhas de abas criadas por site!`);
    } else {
      showToast(`São necessárias pelo menos 2 abas do mesmo site para agrupar.`, true);
    }
    loadData();
  }
});

document.getElementById("groupByCategoryBtn").addEventListener("click", async () => {
  const res = await safeSendMessage({ type: "GROUP_TABS_BY_CATEGORY" });
  if (res && res.success) {
    if (res.groupsCreated > 0) {
      showToast(`✓ Abas agrupadas por categoria!`);
    } else {
      showToast(`Abas insuficientes para criar grupos de categoria.`, true);
    }
    loadData();
  }
});

// Pomodoro
document.getElementById("pomodoroToggleBtn").addEventListener("click", async () => {
  const currentText = document.getElementById("pomodoroToggleBtn").textContent;
  const action = currentText.includes("Iniciar") ? "START" : "PAUSE";
  await safeSendMessage({ type: "POMODORO_ACTION", action: action });
  loadData();
});

document.getElementById("pomodoroResetBtn").addEventListener("click", async () => {
  await safeSendMessage({ type: "POMODORO_ACTION", action: "RESET" });
  loadData();
});

// Salvar Regra
document.getElementById("saveRuleBtn").addEventListener("click", async () => {
  const input = document.getElementById("newDomainInput");
  const cat = document.getElementById("newDomainCat").value;
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  if (!domain) {
    alert("Digite um domínio válido (ex: trello.com)");
    return;
  }

  await safeSendMessage({
    type: "UPDATE_RULE",
    domain: domain,
    category: cat
  });

  input.value = "";
  showToast(`Regra salva para ${domain}!`);
  loadData();
  renderRulesList();
});

// Ajustes & Configurações
function syncSettingsUI() {
  document.getElementById("settingAutoDiscard").checked = cachedSettings.autoDiscardEnabled !== false;
  document.getElementById("settingAutoDiscardTime").value = String(cachedSettings.autoDiscardMinutes || 20);
  document.getElementById("settingDistractionLimit").value = String(cachedSettings.dailyDistractionLimitMinutes || 45);
}

document.getElementById("settingAutoDiscard").addEventListener("change", async (e) => {
  cachedSettings.autoDiscardEnabled = e.target.checked;
  await safeSendMessage({ type: "UPDATE_SETTINGS", settings: { autoDiscardEnabled: e.target.checked } });
  showToast("Preferência salva!");
});

document.getElementById("settingAutoDiscardTime").addEventListener("change", async (e) => {
  const val = parseInt(e.target.value, 10);
  cachedSettings.autoDiscardMinutes = val;
  await safeSendMessage({ type: "UPDATE_SETTINGS", settings: { autoDiscardMinutes: val } });
  showToast(`Tempo de auto-hibernação alterado para ${val} min!`);
});

document.getElementById("settingDistractionLimit").addEventListener("change", async (e) => {
  const val = parseInt(e.target.value, 10);
  cachedSettings.dailyDistractionLimitMinutes = val;
  await safeSendMessage({ type: "UPDATE_SETTINGS", settings: { dailyDistractionLimitMinutes: val } });
  showToast(`Orçamento diário alterado para ${val} min!`);
  loadData();
});

// Telemetria Exportar e Limpar
document.getElementById("exportTelemetryBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(cachedTelemetryLogs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `telemetria-vivaldi-${getLocalDateString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clearTelemetryBtn").addEventListener("click", async () => {
  await safeSendMessage({ type: "CLEAR_TELEMETRY" });
  cachedTelemetryLogs = [];
  renderTelemetryList();
  showToast("Logs de telemetria limpos!");
});

// Resetar estatísticas de hoje
document.getElementById("clearDataBtn").addEventListener("click", async () => {
  const res = await safeSendMessage({ type: "RESET_TODAY_STATS" });
  if (res && res.success) {
    showToast("Estatísticas de hoje zeradas com sucesso!");
    loadData();
  }
});

document.getElementById("refreshBtn").addEventListener("click", loadData);

// Abrir em aba inteira ou janela dedicada
document.getElementById("openTabBtn").addEventListener("click", () => {
  if (isContextValid()) {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});

// Controles de Busca e Filtros das Abas
document.getElementById("tabSearchInput").addEventListener("input", (e) => {
  currentSearchTerm = e.target.value.trim().toLowerCase();
  loadData();
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentFilterCategory = chip.getAttribute("data-filter");
    loadData();
  });
});

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
  loadData().then(() => {
    syncSettingsUI();
  });
  renderRulesList();
  updateIntervalId = setInterval(loadData, 1000);
});
