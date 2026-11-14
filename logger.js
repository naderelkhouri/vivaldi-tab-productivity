// logger.js - Sistema de Telemetria e Diagnóstico Local

const TELEMETRY_KEY = "telemetry_logs";
const MAX_LOGS = 200;

export async function logEvent(level, action, details = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
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
