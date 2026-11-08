// O Cubo (The Cube) v5.0 Spider & Area Snipper - Background Service Worker (Manifest V3)
// Gerencia Side Panel, captura de screenshot, Recorte de Área, Multi-Select e Site Crawler

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error("[O Cubo] Erro ao configurar Side Panel:", err));
  }
});

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  // 1. Captura de screenshot em Base64 da aba ativa visível
  if (message.type === "CAPTURE_VISIBLE_TAB") {
    const windowId = sender?.tab?.windowId ?? null;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError?.message || "Falha ao capturar aba visível."
        });
        return;
      }
      sendResponse({
        success: true,
        dataUrl
      });
    });
    return true;
  }

  // 2. Progresso de captura Full-Page ou Multi-Page Crawler
  if (message.type === "FULL_PAGE_PROGRESS" || message.type === "CRAWLER_PROGRESS") {
    chrome.runtime.sendMessage({
      type: "FULL_PAGE_PROGRESS_BROADCAST",
      progress: message.progress
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // 3. Atualização da Sacola Multi-Select (Shift+Clique)
  if (message.type === "MULTI_SELECT_UPDATED") {
    chrome.storage.local.set({ multiSelectQueue: message.queue }, () => {});
    chrome.runtime.sendMessage({
      type: "MULTI_SELECT_UPDATED_BROADCAST",
      queue: message.queue
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // 4. Repassa o componente, recorte de área, página inteira ou site multi-páginas para o Side Panel
  if (message.type === "COMPONENT_CAPTURED") {
    // Evita travar o chrome.storage.local quando o payload Multi-Páginas for muito grande (> 2MB)
    try {
      const approxSize = (message.payload?.standaloneHtml || "").length;
      if (approxSize < 2000000) {
        chrome.storage.local.set({ lastCapturedPayload: message.payload }, () => {});
      }
    } catch {}

    chrome.runtime.sendMessage({
      type: "COMPONENT_CAPTURED_BROADCAST",
      payload: message.payload
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // 5. Busca de HTML/CSS de sub-páginas pelo Service Worker com Timeout de 5s (nunca trava em sub-página lenta)
  if (message.type === "FETCH_REMOTE_URL") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);

    fetch(message.url, { credentials: "omit", signal: controller.signal })
      .then(async (resp) => {
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        sendResponse({ ok: true, text, finalUrl: resp.url || message.url });
      })
      .catch((err) => {
        clearTimeout(timer);
        sendResponse({ ok: false, error: err.message || "Timeout" });
      });
    return true;
  }

  // 6. Notificação de cancelamento do modo de inspeção / recorte via tecla ESC
  if (message.type === "INSPECTION_CANCELLED") {
    chrome.runtime.sendMessage({
      type: "INSPECTION_CANCELLED_BROADCAST"
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
