// logger.js - Sistema de Telemetria e Diagnóstico Local com Fuso Horário Local

const TELEMETRY_KEY = "telemetry_logs";
const MAX_LOGS = 300;

export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalDateTime(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return d.toLocaleString("pt-BR", {
    timeZoneName: "short",
    hour12: false
  });
}

export async function logEvent(level, action, details = {}) {
  const now = new Date();
  const entry = {
    timestamp: now.getTime(),
    localTime: formatLocalDateTime(now),
    dateKey: getLocalDateString(now),
    level, // 'INFO', 'WARN', 'ERROR', 'ACTION'
    action,
    details
  };

  try {
    const data = await chrome.storage.local.get([TELEMETRY_KEY]);
    const logs = data[TELEMETRY_KEY] || [];
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) logs.pop();
    await chrome.storage.local.set({ [TELEMETRY_KEY]: logs });
  } catch (err) {
    console.error("Falha ao registrar telemetria:", err);
  }
}

export async function getTelemetryLogs() {
  const data = await chrome.storage.local.get([TELEMETRY_KEY]);
  return data[TELEMETRY_KEY] || [];
}

export async function clearTelemetryLogs() {
  await chrome.storage.local.set({ [TELEMETRY_KEY]: [] });
}
