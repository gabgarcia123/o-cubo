// O Cubo (The Cube) v5.0 Spider & Area Snipper - Side Panel Controller
// Recursos Completos:
// - 4 Modos de Captura: 🎯 Inspecionar UI, ✂️ Recorte de Tela Livre, 🌐 Página Atual, 🕸️ Site + Sub-Páginas (Links)
// - Clone Visual 1:1 Nativo (gera .html completo com CSS, SVGs, imagens e navegação entre sub-páginas mesmo sem IA)
// - Hub Multi-IA (Gemini 2.5 Pro/Flash, OpenAI GPT-4o/4.1, Anthropic Claude Sonnet 4, OpenRouter)
// - Streaming SSE em Tempo Real + Refinamento Incremental + Editor Live Sync + Preview em Tela Cheia

(() => {
  const AI_PROVIDERS = {
    gemini: {
      name: "Google Gemini",
      keyPlaceholder: "Gemini API Key (opcional p/ Clone Visual 1:1)...",
      models: [
        { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Rápido / Padrão)" },
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Alta Precisão / Full-Site)" },
        { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (Ultra Rápido)" },
        { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }
      ]
    },
    openai: {
      name: "OpenAI",
      keyPlaceholder: "OpenAI API Key (sk-...)...",
      models: [
        { id: "gpt-4o", label: "GPT-4o (Vision Multimodal)" },
        { id: "gpt-4.1", label: "GPT-4.1 (Coding & UI Pro)" },
        { id: "gpt-4o-mini", label: "GPT-4o Mini (Rápido)" },
        { id: "o4-mini", label: "o4-mini (Raciocínio Rápido)" }
      ]
    },
    anthropic: {
      name: "Anthropic Claude",
      keyPlaceholder: "Anthropic API Key (sk-ant-...)...",
      models: [
        { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Front-end Master)" },
        { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet (Extended UI)" },
        { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (Rápido)" }
      ]
    },
    openrouter: {
      name: "OpenRouter (Universal)",
      keyPlaceholder: "OpenRouter Key (sk-or-v1-...)...",
      models: [
        { id: "google/gemini-2.5-pro-preview", label: "Google: Gemini 2.5 Pro (OpenRouter)" },
        { id: "anthropic/claude-sonnet-4", label: "Anthropic: Claude Sonnet 4 (OpenRouter)" },
        { id: "openai/gpt-4o", label: "OpenAI: GPT-4o (OpenRouter)" },
        { id: "qwen/qwen2.5-vl-72b-instruct", label: "Qwen 2.5 VL 72B (Vision UI)" },
        { id: "meta-llama/llama-4-maverick", label: "Meta: Llama 4 Maverick Multimodal" }
      ]
    }
  };

  // Referências de DOM
  const cubeScene = document.getElementById("cube-scene");
  const cubeStateLabel = document.getElementById("cube-state-label");
  const stateChips = document.querySelectorAll(".state-chip");
  const btnToggleInspect = document.getElementById("btn-toggle-inspect");
  const btnAreaSnipper = document.getElementById("btn-area-snipper");
  const btnCaptureFullsite = document.getElementById("btn-capture-fullsite");
  const btnSpiderMultipage = document.getElementById("btn-spider-multipage");
  const spiderDrawer = document.getElementById("spider-drawer");
  const spiderLinksList = document.getElementById("spider-links-list");
  const btnCloseSpider = document.getElementById("btn-close-spider");
  const btnStartCrawl = document.getElementById("btn-start-crawl");
  const bagBar = document.getElementById("bag-bar");
  const bagCountLabel = document.getElementById("bag-count-label");
  const btnFinalizeBag = document.getElementById("btn-finalize-bag");
  const selectProvider = document.getElementById("select-provider");
  const selectModel = document.getElementById("select-model");
  const providerBadge = document.getElementById("provider-badge");
  const inputApiKey = document.getElementById("input-api-key");
  const btnSaveKey = document.getElementById("btn-save-key");
  const selectStack = document.getElementById("select-stack");
  const inputExtraPrompt = document.getElementById("input-extra-prompt");
  const btnRegenerate = document.getElementById("btn-regenerate");
  const btnRefineCode = document.getElementById("btn-refine-code");
  const capturedElementTag = document.getElementById("captured-element-tag");
  const croppedPreviewImg = document.getElementById("cropped-preview-img");
  const cropPlaceholder = document.getElementById("crop-placeholder");
  const tokensBar = document.getElementById("tokens-bar");
  const statusMessage = document.getElementById("status-message");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const codeOutput = document.getElementById("code-output");
  const codeMetaLabel = document.getElementById("code-meta-label");
  const btnCopyCode = document.getElementById("btn-copy-code");
  const btnDownloadCode = document.getElementById("btn-download-code");
  const btnVpDesktop = document.getElementById("btn-vp-desktop");
  const btnVpMobile = document.getElementById("btn-vp-mobile");
  const btnExpandPreview = document.getElementById("btn-expand-preview");
  const btnFullscreenPreview = document.getElementById("btn-fullscreen-preview");
  const sandboxIframe = document.getElementById("sandbox-iframe");
  const assetsGrid = document.getElementById("assets-grid");
  const assetsCountLabel = document.getElementById("assets-count-label");
  const historyList = document.getElementById("history-list");
  const btnClearHistory = document.getElementById("btn-clear-history");

  // Estado em memória
  let isInspecting = false;
  let isSnipping = false;
  let lastCapture = null;
  let lastCroppedBase64 = null;
  let generatedCode = "";
  let fullscreenPreviewWin = null;
  let discoveredLinksCache = [];
  let apiKeysByProvider = {
    gemini: "",
    openai: "",
    anthropic: "",
    openrouter: ""
  };
  let captureHistory = [];
  let isPreviewExpanded = false;

  const hasChromeStorage =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  const hasChromeTabs =
    typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query;

  function setCubeState(state) {
    const validStates = ["idle", "scanning", "absorbing", "ready"];
    const nextState = validStates.includes(state) ? state : "idle";

    cubeScene.setAttribute("data-state", nextState);
    cubeStateLabel.textContent = nextState.toUpperCase();

    stateChips.forEach((chip) => {
      chip.classList.toggle("active", chip.getAttribute("data-cube-state") === nextState);
    });
  }

  function setStatus(text, isError = false) {
    statusMessage.textContent = text;
    statusMessage.classList.toggle("error", Boolean(isError));
  }

  function populateModelsForProvider(providerKey, preferredModelId) {
    const provider = AI_PROVIDERS[providerKey] || AI_PROVIDERS.gemini;
    selectModel.innerHTML = "";
    provider.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      selectModel.appendChild(opt);
    });

    if (preferredModelId && provider.models.some((m) => m.id === preferredModelId)) {
      selectModel.value = preferredModelId;
    }

    inputApiKey.placeholder = provider.keyPlaceholder;
    inputApiKey.value = apiKeysByProvider[providerKey] || "";
    providerBadge.textContent = provider.name;
  }

  function cropComponentImage(screenshotDataUrl, rect) {
    return new Promise((resolve, reject) => {
      if (!screenshotDataUrl || !rect) {
        resolve(null);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const dpr = rect.devicePixelRatio || window.devicePixelRatio || 1;
          const sx = Math.max(0, Math.round(rect.x * dpr));
          const sy = Math.max(0, Math.round(rect.y * dpr));
          const sw = Math.min(img.width - sx, Math.max(1, Math.round(rect.width * dpr)));
          const sh = Math.min(img.height - sy, Math.max(1, Math.round(rect.height * dpr)));

          const canvas = document.createElement("canvas");
          canvas.width = sw;
          canvas.height = sh;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = screenshotDataUrl;
    });
  }

  async function stitchFullPageSlices(sliceDataUrls) {
    if (!Array.isArray(sliceDataUrls) || sliceDataUrls.length === 0) return null;
    if (sliceDataUrls.length === 1) return sliceDataUrls[0];

    const loadedImages = await Promise.all(
      sliceDataUrls.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
          })
      )
    );

    const validImgs = loadedImages.filter(Boolean);
    if (validImgs.length === 0) return null;

    const firstWidth = validImgs[0].width;
    const scale = firstWidth > 1200 ? 1200 / firstWidth : 1;
    const targetWidth = Math.round(firstWidth * scale);
    const totalHeight = validImgs.reduce((acc, im) => acc + Math.round(im.height * scale), 0);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");

    let offsetY = 0;
    for (const im of validImgs) {
      const h = Math.round(im.height * scale);
      ctx.drawImage(im, 0, offsetY, targetWidth, h);
      offsetY += h;
    }

    return canvas.toDataURL("image/png");
  }

  function renderDesignTokens(tokens) {
    if (!tokens || (!tokens.textColors?.length && !tokens.surfaceColors?.length)) {
      tokensBar.style.display = "none";
      return;
    }

    tokensBar.innerHTML = "";
    tokensBar.style.display = "flex";

    const uniqueColors = [
      ...new Set([...(tokens.surfaceColors || []), ...(tokens.textColors || [])])
    ].slice(0, 6);

    uniqueColors.forEach((col) => {
      const swatch = document.createElement("span");
      swatch.className = "color-swatch";
      swatch.style.backgroundColor = col;
      swatch.title = `Cor detectada: ${col} (Clique para copiar)`;
      swatch.addEventListener("click", () => {
        navigator.clipboard.writeText(col).catch(() => {});
        setStatus(`Cor copiada: ${col}`);
      });
      tokensBar.appendChild(swatch);
    });

    if (tokens.fonts && tokens.fonts.length > 0) {
      const fontPill = document.createElement("span");
      fontPill.className = "token-pill";
      fontPill.textContent = `Aa ${tokens.fonts[0]}`;
      tokensBar.appendChild(fontPill);
    }
  }

  function renderExtractedAssets(assets) {
    const svgs = assets?.svgs || [];
    const images = assets?.images || [];
    const total = svgs.length + images.length;

    assetsCountLabel.textContent = `${svgs.length} SVGs • ${images.length} Imagens`;

    if (total === 0) {
      assetsGrid.innerHTML = `<div class="crop-placeholder" style="grid-column: span 2;">Nenhum SVG ou imagem encontrado neste alvo.</div>`;
      return;
    }

    assetsGrid.innerHTML = "";

    svgs.forEach((svgItem, idx) => {
      const card = document.createElement("div");
      card.className = "asset-card";
      card.innerHTML = `
        <div class="asset-preview">${svgItem.outerHTML}</div>
        <span style="font-size:10px;color:var(--text-dim);">SVG #${idx + 1} (${svgItem.width}x${svgItem.height})</span>
        <button type="button" class="btn-secondary" style="width:100%;">Copiar SVG</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        navigator.clipboard.writeText(svgItem.outerHTML).catch(() => {});
        setStatus(`SVG #${idx + 1} copiado para a área de transferência!`);
      });
      assetsGrid.appendChild(card);
    });

    images.forEach((imgItem, idx) => {
      const card = document.createElement("div");
      card.className = "asset-card";
      card.innerHTML = `
        <div class="asset-preview"><img src="${imgItem.url}" alt="Asset" /></div>
        <span style="font-size:10px;color:var(--text-dim);">${imgItem.type.toUpperCase()} #${idx + 1}</span>
        <button type="button" class="btn-secondary" style="width:100%;">Copiar URL</button>
      `;
      card.querySelector("button").addEventListener("click", () => {
        navigator.clipboard.writeText(imgItem.url).catch(() => {});
        setStatus(`URL da imagem #${idx + 1} copiada!`);
      });
      assetsGrid.appendChild(card);
    });
  }

  function loadSavedSettings() {
    if (hasChromeStorage) {
      chrome.storage.local.get(
        [
          "geminiApiKey",
          "apiKeysByProvider",
          "selectedProvider",
          "selectedModel",
          "preferredStack",
          "lastCapturedPayload",
          "captureHistory"
        ],
        (res) => {
          if (res.apiKeysByProvider) {
            apiKeysByProvider = { ...apiKeysByProvider, ...res.apiKeysByProvider };
          }
          if (res.geminiApiKey && !apiKeysByProvider.gemini) {
            apiKeysByProvider.gemini = res.geminiApiKey;
          }

          const prov = res.selectedProvider || "gemini";
          selectProvider.value = AI_PROVIDERS[prov] ? prov : "gemini";
          populateModelsForProvider(selectProvider.value, res.selectedModel);

          if (res.preferredStack) {
            selectStack.value = res.preferredStack;
          }
          if (Array.isArray(res.captureHistory)) {
            captureHistory = res.captureHistory;
            renderHistoryList();
          }
          if (res.lastCapturedPayload) {
            handleIncomingCapture(res.lastCapturedPayload, false);
          }
        }
      );
    } else {
      const savedGemini = localStorage.getItem("geminiApiKey") || "";
      apiKeysByProvider.gemini = savedGemini;
      populateModelsForProvider("gemini");
    }
  }

  function saveApiKey() {
    const provider = selectProvider.value;
    const keyVal = inputApiKey.value.trim();
    apiKeysByProvider[provider] = keyVal;

    const storagePayload = {
      apiKeysByProvider,
      selectedProvider: provider,
      selectedModel: selectModel.value
    };
    if (provider === "gemini") {
      storagePayload.geminiApiKey = keyVal;
    }

    if (hasChromeStorage) {
      chrome.storage.local.set(storagePayload, () => {
        setStatus(`API Key salva para ${AI_PROVIDERS[provider].name}.`);
      });
    } else {
      localStorage.setItem("geminiApiKey", keyVal);
      setStatus(`API Key salva localmente para ${AI_PROVIDERS[provider].name}.`);
    }
  }

  function setEditorCodePreview(fullCode) {
    generatedCode = fullCode || "";
    if (generatedCode.length > 180000) {
      const sizeKb = Math.round(generatedCode.length / 1024);
      codeOutput.value =
        generatedCode.slice(0, 100000) +
        `\n\n<!-- [ Exibição no editor resumida para alta performance (${sizeKb} KB totais). A aba Preview e o botão 💾 Baixar .html contêm 100% do projeto completo! ] -->`;
    } else {
      codeOutput.value = generatedCode;
    }
  }

  function addEntryToHistory(payload, code, stack, modelUsed) {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      elementLabel: payload.elementLabel || "<componente>",
      captureMode: payload.captureMode || "element",
      stack,
      modelUsed,
      code
    };
    captureHistory = [entry, ...captureHistory].slice(0, 15);
    if (hasChromeStorage) {
      const safeStorageHistory = captureHistory
        .filter((it) => !it.code || it.code.length < 350000)
        .slice(0, 10);
      chrome.storage.local.set({ captureHistory: safeStorageHistory }, () => {
        if (chrome.runtime.lastError) {
          // Ignora silenciosamente se exceder cota de storage local
        }
      });
    }
    renderHistoryList();
  }

  function renderHistoryList() {
    if (!captureHistory || captureHistory.length === 0) {
      historyList.innerHTML = `<div class="crop-placeholder">Nenhuma captura no histórico ainda.</div>`;
      return;
    }

    historyList.innerHTML = "";
    captureHistory.forEach((item) => {
      const iconMap = {
        "full-page": "🌐",
        "multi-page": "🕸️",
        "area-crop": "✂️",
        "multi-select": "🧩"
      };
      const icon = iconMap[item.captureMode] || "🎯";
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-meta">
          <span class="history-title">${icon} ${item.elementLabel}</span>
          <span class="history-sub">${item.timestamp} • ${item.stack} • ${item.modelUsed}</span>
        </div>
        <span style="color: var(--neon); font-size: 10.5px; font-weight: 700;">Abrir ›</span>
      `;
      row.addEventListener("click", () => {
        setEditorCodePreview(item.code);
        selectStack.value = item.stack;
        sendCodeToSandbox(
          generatedCode,
          item.stack,
          item.captureMode !== "element"
        );
        setCubeState("ready");
        setStatus(`Restaurado do histórico: ${item.elementLabel}`);
        document.querySelector('[data-tab="tab-preview"]').click();
      });
      historyList.appendChild(row);
    });
  }

  /**
   * Comandos de Captura (Elemento, Recorte de Tela, Página Atual & Multi-Páginas)
   */
  function ensureContentScriptAndSend(message, onSuccess) {
    if (!hasChromeTabs) {
      if (message.type === "TOGGLE_INSPECTOR") {
        isInspecting = !isInspecting;
        isSnipping = false;
        updateButtonsUI();
        setCubeState(isInspecting ? "scanning" : "idle");
        setStatus(isInspecting ? "Modo demonstração: Inspetor ativo." : "Inspetor pausado.");
      } else if (message.type === "START_AREA_SNIPPER") {
        isSnipping = !isSnipping;
        isInspecting = false;
        updateButtonsUI();
        setCubeState(isSnipping ? "scanning" : "idle");
        setStatus(isSnipping ? "Modo demonstração: Recorte de Tela ativo." : "Recorte cancelado.");
      }
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        setStatus("Nenhuma aba ativa encontrada.", true);
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          if (chrome.scripting) {
            chrome.scripting.executeScript(
              {
                target: { tabId: activeTab.id },
                files: ["content.js"]
              },
              () => {
                if (chrome.runtime.lastError) {
                  setStatus("Página restrita do navegador. Abra um site http/https ou arquivo local.", true);
                  return;
                }
                chrome.tabs.sendMessage(activeTab.id, message, (retryRes) => {
                  if (onSuccess) onSuccess(retryRes);
                });
              }
            );
          } else {
            setStatus("Recarregue a página alvo para ativar O Cubo.", true);
          }
          return;
        }
        if (onSuccess) onSuccess(response);
      });
    });
  }

  function updateButtonsUI() {
    if (isInspecting) {
      btnToggleInspect.classList.add("active");
      btnToggleInspect.innerHTML = "<span>⏹ Parar (ESC)</span>";
    } else {
      btnToggleInspect.classList.remove("active");
      btnToggleInspect.innerHTML = "<span>🎯 Inspecionar UI</span>";
    }

    if (isSnipping) {
      btnAreaSnipper.classList.add("active");
      btnAreaSnipper.innerHTML = "<span>⏹ Cancelar Área</span>";
    } else {
      btnAreaSnipper.classList.remove("active");
      btnAreaSnipper.innerHTML = "<span>✂️ Recorte de Tela</span>";
    }
  }

  function togglePageInspector() {
    const nextInspectState = !isInspecting;
    isSnipping = false;
    spiderDrawer.style.display = "none";

    ensureContentScriptAndSend(
      { type: "TOGGLE_INSPECTOR", active: nextInspectState },
      (res) => {
        isInspecting = Boolean(res && res.inspecting);
        updateButtonsUI();
        setCubeState(isInspecting ? "scanning" : "idle");
        setStatus(
          isInspecting
            ? "Inspetor ativo! Clique no elemento ou use Shift+Clique para Sacola Multi-Select."
            : "Inspetor pausado."
        );
      }
    );
  }

  function toggleAreaSnipper() {
    isInspecting = false;
    spiderDrawer.style.display = "none";

    ensureContentScriptAndSend({ type: "START_AREA_SNIPPER" }, (res) => {
      isSnipping = Boolean(res && res.snipping);
      updateButtonsUI();
      setCubeState(isSnipping ? "scanning" : "idle");
      setStatus(
        isSnipping
          ? "✂️ Clique e arraste na página para desenhar o retângulo e capturar tudo dentro dele!"
          : "Recorte de tela cancelado."
      );
    });
  }

  function triggerFullSiteCapture() {
    isInspecting = false;
    isSnipping = false;
    spiderDrawer.style.display = "none";
    updateButtonsUI();
    setCubeState("scanning");
    setStatus("Clonando página atual inteira (Auto-Scroll + CSS + Assets)...");

    ensureContentScriptAndSend({ type: "CAPTURE_FULL_SITE" }, (res) => {
      if (res && res.ok) {
        setStatus(`Página atual clonada (${res.sectionsCount} seções). Abrindo Preview...`);
      }
    });
  }

  function openSpiderMultiPageDrawer() {
    isInspecting = false;
    isSnipping = false;
    updateButtonsUI();
    spiderDrawer.style.display = "flex";
    spiderLinksList.innerHTML = `<div class="crop-placeholder">Varrendo links internos da página...</div>`;

    ensureContentScriptAndSend({ type: "DISCOVER_INTERNAL_LINKS" }, (res) => {
      const links = res?.links || [];
      discoveredLinksCache = links;

      if (links.length === 0) {
        spiderLinksList.innerHTML = `<div class="crop-placeholder">Nenhum link interno adicional encontrado. Clique abaixo para clonar a página principal.</div>`;
        return;
      }

      spiderLinksList.innerHTML = "";
      links.forEach((lnk, idx) => {
        const label = document.createElement("label");
        label.className = "spider-link-item";
        label.innerHTML = `
          <input type="checkbox" class="spider-link-checkbox" value="${lnk.url}" ${
          idx < 6 ? "checked" : ""
        } />
          <span title="${lnk.url}">${idx + 1}. <strong>${lnk.title}</strong> (${lnk.path})</span>
        `;
        spiderLinksList.appendChild(label);
      });

      setStatus(`🕸️ ${links.length} links internos descobertos! Selecione quais deseja clonar junto.`);
    });
  }

  function startMultiPageCrawl() {
    const checkedBoxes = Array.from(
      spiderLinksList.querySelectorAll(".spider-link-checkbox:checked")
    );
    const selectedUrls = checkedBoxes.map((cb) => cb.value);

    spiderDrawer.style.display = "none";
    setCubeState("scanning");
    setStatus(`🕸️ Clonando Página Inicial + ${selectedUrls.length} sub-páginas...`);

    ensureContentScriptAndSend(
      {
        type: "CRAWL_MULTI_PAGE_SITE",
        urls: selectedUrls,
        maxPages: selectedUrls.length + 1
      },
      (res) => {
        if (res && res.ok) {
          setStatus(`🕸️ Site completo clonado (${res.pagesCount} páginas navegáveis)!`);
        }
      }
    );
  }

  function triggerFinalizeMultiSelectBag() {
    ensureContentScriptAndSend({ type: "FINALIZE_MULTI_SELECT" }, () => {
      bagBar.style.display = "none";
    });
  }

  /**
   * Recebimento da Captura (Elemento, Recorte de Área, Sacola, Página Atual ou Multi-Páginas)
   */
  async function handleIncomingCapture(payload, autoGenerate = true) {
    if (!payload) return;

    lastCapture = payload;
    isInspecting = false;
    isSnipping = false;
    bagBar.style.display = "none";
    spiderDrawer.style.display = "none";
    updateButtonsUI();

    const isFullLayout =
      payload.captureMode === "full-page" ||
      payload.captureMode === "multi-page" ||
      payload.captureMode === "multi-select" ||
      payload.captureMode === "area-crop";

    capturedElementTag.textContent = payload.elementLabel || "<alvo>";
    renderDesignTokens(payload.designTokens);
    renderExtractedAssets(payload.assets);

    try {
      if (
        payload.captureMode === "full-page" &&
        Array.isArray(payload.sliceScreenshots) &&
        payload.sliceScreenshots.length > 0
      ) {
        const stitchedDataUrl = await stitchFullPageSlices(payload.sliceScreenshots);
        if (stitchedDataUrl) {
          croppedPreviewImg.src = stitchedDataUrl;
          croppedPreviewImg.style.display = "block";
          cropPlaceholder.style.display = "none";
          lastCroppedBase64 = stitchedDataUrl.replace(/^data:image\/png;base64,/, "");
        }
      } else if (payload.screenshotDataUrl && payload.rect) {
        const croppedDataUrl = await cropComponentImage(payload.screenshotDataUrl, payload.rect);
        if (croppedDataUrl) {
          croppedPreviewImg.src = croppedDataUrl;
          croppedPreviewImg.style.display = "block";
          cropPlaceholder.style.display = "none";
          lastCroppedBase64 = croppedDataUrl.replace(/^data:image\/png;base64,/, "");
        }
      }
    } catch (err) {
      console.warn("[O Cubo] Aviso ao processar recorte de imagem:", err);
    }

    // Carrega imediatamente o Clone Visual Standalone (100% fiel com CSS, SVGs, Fontes, Imagens e Sub-páginas)
    const visualCloneHtml = payload.standaloneHtml || payload.cleanHtml || "";
    if (visualCloneHtml) {
      setEditorCodePreview(visualCloneHtml);
      codeMetaLabel.textContent =
        payload.captureMode === "multi-page"
          ? `🕸️ Clone Multi-Páginas (${payload.pagesCount || 1} páginas navegáveis)`
          : payload.captureMode === "area-crop"
          ? `✂️ Clone da Área Recortada (.html pronto)`
          : isFullLayout
          ? "Clone Visual Completo (.html standalone pronto)"
          : "Clone Visual do Componente (.html pronto)";
      sendCodeToSandbox(generatedCode, "html-css", isFullLayout);
    }

    if (autoGenerate) {
      const currentKey = inputApiKey.value.trim();
      // No modo Multi-Páginas, o bundle interativo já contém todas as páginas prontas para navegar,
      // então exibimos direto no Preview sem sobrescrever com um componente único!
      if (currentKey && payload.captureMode !== "multi-page") {
        await generateRefactoredComponent(false);
      } else {
        setCubeState("ready");
        addEntryToHistory(payload, generatedCode, "html-css", "Clone Visual Nativo");
        const previewTabBtn = document.querySelector('[data-tab="tab-preview"]');
        if (previewTabBtn) previewTabBtn.click();

        if (payload.captureMode === "multi-page" || payload.captureMode === "full-page") {
          if (!payload.autoDownloaded) {
            downloadGeneratedCode();
          }
          setStatus(
            payload.captureMode === "multi-page"
              ? `✅ ${payload.pagesCount} páginas clonadas e arquivo .html baixado na sua pasta Downloads!`
              : "✅ Página inteira clonada e arquivo .html baixado na sua pasta Downloads!"
          );
        } else {
          setStatus(
            payload.captureMode === "area-crop"
              ? "✅ Área recortada e itens capturados! Veja no Preview ou clique em 💾 Baixar .html."
              : "✅ Clone Visual pronto! Veja na aba Preview ou clique em 💾 Baixar .html."
          );
        }
      }
    } else {
      setStatus("Clone visual carregado. Veja no Preview ou clique em 💾 Baixar .html.");
    }
  }

  function buildClonePrompt(capture, stack, extraPrompt) {
    const mode = capture.captureMode;
    const tokensInfo = capture.designTokens
      ? `PALETA E FONTES DETECTADAS NA PÁGINA:
- Fundo Principal: ${capture.designTokens.bodyBackground || "auto"}
- Cor de Texto: ${capture.designTokens.bodyColor || "auto"}
- Fontes: ${(capture.designTokens.fonts || []).join(", ") || "Inter, sans-serif"}
- Cores de Superfície: ${(capture.designTokens.surfaceColors || []).join(", ")}
- Cores de Destaque/Texto: ${(capture.designTokens.textColors || []).join(", ")}`
      : "";

    const stackGuides = {
      "react-tailwind": `Gere um componente funcional React moderno (.tsx/.jsx) utilizando classes utilitárias do Tailwind CSS.
- Retorne APENAS o código do componente (sem explicações ou cercas markdown).
- Exporte como export default function ClonedUI().`,
      "nextjs-tailwind": `Gere um componente/página Next.js (App Router) com "use client" no topo e estilizado com Tailwind CSS.
- Retorne APENAS o código (sem explicações ou cercas markdown).`,
      "vue-tailwind": `Gere um Single-File Component Vue 3 (<template>, <script setup>, <style>) estilizado com classes do Tailwind CSS.
- Retorne APENAS o código Vue SFC (sem explicações ou cercas markdown).`,
      "html-tailwind": `Gere um arquivo HTML5 completo e semântico incluindo <script src="https://cdn.tailwindcss.com"></script> no <head>.
- Retorne APENAS o código HTML (sem explicações ou cercas markdown).`,
      "html-css": `Gere código HTML5 semântico com uma tag <style> embutida usando CSS moderno (Flexbox, Grid, Custom Properties).
- Retorne APENAS o código HTML/CSS (sem explicações ou cercas markdown).`
    };

    let modeInstructions = "";
    if (mode === "full-page" || mode === "multi-page") {
      modeInstructions = `MODO DE CAPTURA: SITE COMPLETO (${capture.sectionsCount || 1} seções).
Recrie todas as seções principais em uma página completa, coesa, responsiva e fiel ao panorama visual enviado.`;
    } else if (mode === "area-crop") {
      modeInstructions = `MODO DE CAPTURA: RECORTE DE TELA (${capture.sectionsCount || 1} itens capturados dentro da região demarcada pelo usuário).
Recrie fielmente o layout e todos os elementos visíveis na imagem recortada em anexo.`;
    } else if (mode === "multi-select") {
      modeInstructions = `MODO DE CAPTURA: SACOLA MULTI-SELECT (${capture.sectionsCount || 2} componentes escolhidos).
Combine harmoniosamente todos os componentes numerados abaixo em um único layout coeso.`;
    } else {
      modeInstructions = `MODO DE CAPTURA: COMPONENTE ESPECÍFICO (${capture.elementLabel || "Elemento UI"}).
Recrie este componente com precisão pixel-perfect de cores, gradientes, bordas, sombras e tipografia.`;
    }

    return `Você é um Engenheiro Front-end Sênior especialista em Design Systems e clonagem visual de UI ("O Cubo 5.0").
Analise a imagem em anexo e o HTML limpo extraído com estilos computados no atributo "data-cube-style".

${modeInstructions}

DIRETRIZES DA STACK (${stack}):
${stackGuides[stack] || stackGuides["react-tailwind"]}

${tokensInfo}

${extraPrompt ? `INSTRUÇÃO PERSONALIZADA DO USUÁRIO:\n"${extraPrompt}"\n` : ""}
ESTRUTURA HTML E ESTILOS COMPUTADOS (data-cube-style):
${capture.cleanHtml}`;
  }

  function buildRefinementPrompt(currentCode, stack, extraPrompt) {
    return `Você é um Engenheiro Front-end Sênior ("O Cubo 5.0").
Abaixo está o código atual de um componente/página na stack "${stack}".
Aplique EXATAMENTE a seguinte modificação solicitada pelo usuário mantendo o restante da estrutura e qualidade visual intactos:

SOLICITAÇÃO DO USUÁRIO:
"${extraPrompt || "Melhore o acabamento visual, responsividade, micro-interações hover e contraste."}"

REGRAS:
- Retorne APENAS o código atualizado completo (sem explicações e sem cercas markdown \`\`\`).

CÓDIGO ATUAL:
${currentCode}`;
  }

  function stripMarkdownFences(rawText) {
    if (!rawText) return "";
    return rawText
      .trim()
      .replace(/^```[a-zA-Z0-9_-]*\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  async function callGeminiStreamingAPI(apiKey, modelId, promptText, base64Image, onChunk) {
    const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId
    )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

    const parts = [{ text: promptText }];
    if (base64Image) {
      parts.push({
        inline_data: {
          mime_type: "image/png",
          data: base64Image
        }
      });
    }

    const response = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini HTTP ${response.status}: ${errText.slice(0, 180)}`);
    }

    if (!response.body) {
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let accumulated = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const chunkText =
            parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
          if (chunkText) {
            accumulated += chunkText;
            if (onChunk) onChunk(accumulated);
          }
        } catch {}
      }
    }

    return accumulated;
  }

  async function callOpenAICompatibleAPI(endpointUrl, apiKey, modelId, promptText, base64Image, extraHeaders = {}) {
    const contentArray = [{ type: "text", text: promptText }];
    if (base64Image) {
      contentArray.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64Image}`
        }
      });
    }

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: contentArray }],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API HTTP ${response.status}: ${errText.slice(0, 180)}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  }

  async function callAnthropicAPI(apiKey, modelId, promptText, base64Image) {
    const contentBlocks = [];
    if (base64Image) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: base64Image
        }
      });
    }
    contentBlocks.push({ type: "text", text: promptText });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 8192,
        messages: [{ role: "user", content: contentBlocks }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${errText.slice(0, 180)}`);
    }

    const data = await response.json();
    return (data?.content || []).map((b) => b.text || "").join("\n");
  }

  async function generateRefactoredComponent(isRefinement = false) {
    const provider = selectProvider.value;
    const modelId = selectModel.value;
    const apiKey = inputApiKey.value.trim();
    const stack = selectStack.value;
    const extraPrompt = inputExtraPrompt.value.trim();

    if (isRefinement) {
      const currentEditorCode = codeOutput.value.trim();
      if (!currentEditorCode || currentEditorCode.startsWith("//")) {
        setStatus("Capture ou gere um código primeiro antes de refinar.", true);
        return;
      }
    } else if (!lastCapture) {
      setStatus("Capture primeiro um elemento, área ou site.", true);
      return;
    }

    const isFullPage = lastCapture?.captureMode !== "element";

    if (apiKey) {
      apiKeysByProvider[provider] = apiKey;
    }

    if (!apiKey) {
      setCubeState("ready");
      const fallbackHtml = lastCapture?.standaloneHtml || lastCapture?.cleanHtml || "";
      if (fallbackHtml) {
        generatedCode = fallbackHtml;
        codeOutput.value = generatedCode;
        codeMetaLabel.textContent = `Clone Visual Nativo (.html standalone)`;
        sendCodeToSandbox(generatedCode, "html-css", isFullPage);
      }
      setStatus(
        `Clone Visual 1:1 exibido no Preview! (Para converter p/ React/Vue via IA, insira uma API Key).`
      );
      const previewTabBtn = document.querySelector('[data-tab="tab-preview"]');
      if (previewTabBtn) previewTabBtn.click();
      return;
    }

    setCubeState("absorbing");
    setStatus(
      isRefinement
        ? `Refinando código atual com ${modelId}...`
        : `Gerando em tempo real com ${modelId} (${AI_PROVIDERS[provider].name})...`
    );

    const promptText = isRefinement
      ? buildRefinementPrompt(codeOutput.value, stack, extraPrompt)
      : buildClonePrompt(lastCapture, stack, extraPrompt);

    const imagePayload = isRefinement ? null : lastCroppedBase64;

    try {
      let rawResponse = "";
      if (provider === "gemini") {
        rawResponse = await callGeminiStreamingAPI(
          apiKey,
          modelId,
          promptText,
          imagePayload,
          (partialText) => {
            codeOutput.value = stripMarkdownFences(partialText);
            codeOutput.scrollTop = codeOutput.scrollHeight;
          }
        );
      } else if (provider === "openai") {
        rawResponse = await callOpenAICompatibleAPI(
          "https://api.openai.com/v1/chat/completions",
          apiKey,
          modelId,
          promptText,
          imagePayload
        );
      } else if (provider === "anthropic") {
        rawResponse = await callAnthropicAPI(apiKey, modelId, promptText, imagePayload);
      } else if (provider === "openrouter") {
        rawResponse = await callOpenAICompatibleAPI(
          "https://openrouter.ai/api/v1/chat/completions",
          apiKey,
          modelId,
          promptText,
          imagePayload,
          {
            "HTTP-Referer": "https://ocubo.ai",
            "X-Title": "O Cubo AI Cloner"
          }
        );
      }

      const cleanCode = stripMarkdownFences(rawResponse);
      if (!cleanCode) {
        throw new Error("O modelo retornou uma resposta vazia.");
      }

      generatedCode = cleanCode;
      codeOutput.value = generatedCode;
      codeMetaLabel.textContent = `${modelId} • ${stack}`;
      sendCodeToSandbox(generatedCode, stack, isFullPage);

      if (lastCapture) {
        addEntryToHistory(lastCapture, generatedCode, stack, modelId);
      }

      setCubeState("ready");
      setStatus(`Concluído com sucesso via ${modelId}!`);
    } catch (err) {
      console.error("[O Cubo] Erro na chamada de IA:", err);
      setCubeState("idle");
      setStatus(`Erro (${AI_PROVIDERS[provider].name}): ${err.message}`, true);
    }
  }

  function sendCodeToSandbox(code, stack, isFullPage = false) {
    const payload = {
      type: "RENDER_PREVIEW",
      code,
      stack,
      isFullPage
    };

    if (sandboxIframe && sandboxIframe.contentWindow) {
      sandboxIframe.contentWindow.postMessage(payload, "*");
    }

    if (fullscreenPreviewWin && !fullscreenPreviewWin.closed) {
      fullscreenPreviewWin.postMessage(payload, "*");
    }
  }

  function openFullscreenPreviewTab() {
    const sandboxUrl =
      typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
        ? chrome.runtime.getURL("sandbox.html")
        : "sandbox.html";

    fullscreenPreviewWin = window.open(sandboxUrl, "_blank");
    setStatus("Preview aberto em Nova Aba (Tela Cheia)!");
  }

  function getFullActiveCode() {
    const editorVal = codeOutput.value || "";
    if (
      generatedCode &&
      (editorVal.includes("[ Exibição no editor resumida") || !editorVal.trim())
    ) {
      return generatedCode;
    }
    return editorVal || generatedCode || "";
  }

  function downloadGeneratedCode() {
    const content = getFullActiveCode();
    if (!content.trim()) return;

    const isFullHtmlDoc =
      /^<!doctype html>/i.test(content.trim()) || /^<html[\s>]/i.test(content.trim());
    const stack = selectStack.value;
    const extMap = {
      "react-tailwind": "tsx",
      "nextjs-tailwind": "tsx",
      "vue-tailwind": "vue",
      "html-tailwind": "html",
      "html-css": "html"
    };
    const ext = isFullHtmlDoc ? "html" : extMap[stack] || "html";
    const mimeType = ext === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8";
    const filename = `o-cubo-clone-${Date.now()}.${ext}`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`Arquivo baixado: ${filename} (Abra no navegador!)`);
  }

  // Eventos de UI
  stateChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      setCubeState(chip.getAttribute("data-cube-state"));
    });
  });

  selectProvider.addEventListener("change", () => {
    const provider = selectProvider.value;
    populateModelsForProvider(provider);
    if (hasChromeStorage) {
      chrome.storage.local.set({
        selectedProvider: provider,
        selectedModel: selectModel.value
      });
    }
  });

  selectModel.addEventListener("change", () => {
    if (hasChromeStorage) {
      chrome.storage.local.set({ selectedModel: selectModel.value });
    }
  });

  selectStack.addEventListener("change", () => {
    if (hasChromeStorage) {
      chrome.storage.local.set({ preferredStack: selectStack.value });
    }
  });

  btnToggleInspect.addEventListener("click", togglePageInspector);
  btnAreaSnipper.addEventListener("click", toggleAreaSnipper);
  btnCaptureFullsite.addEventListener("click", triggerFullSiteCapture);
  btnSpiderMultipage.addEventListener("click", openSpiderMultiPageDrawer);
  btnCloseSpider.addEventListener("click", () => {
    spiderDrawer.style.display = "none";
  });
  btnStartCrawl.addEventListener("click", startMultiPageCrawl);
  btnFinalizeBag.addEventListener("click", triggerFinalizeMultiSelectBag);
  btnSaveKey.addEventListener("click", saveApiKey);
  btnRegenerate.addEventListener("click", () => generateRefactoredComponent(false));
  btnRefineCode.addEventListener("click", () => generateRefactoredComponent(true));

  let liveSyncTimer = null;
  codeOutput.addEventListener("input", () => {
    generatedCode = codeOutput.value;
    clearTimeout(liveSyncTimer);
    liveSyncTimer = setTimeout(() => {
      sendCodeToSandbox(
        generatedCode,
        selectStack.value,
        lastCapture?.captureMode !== "element"
      );
    }, 250);
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
      tabPanes.forEach((pane) => pane.classList.toggle("active", pane.id === targetTab));

      const activeCode = getFullActiveCode();
      if (targetTab === "tab-preview" && activeCode.trim()) {
        sendCodeToSandbox(
          activeCode,
          selectStack.value,
          lastCapture?.captureMode !== "element"
        );
      }
    });
  });

  btnCopyCode.addEventListener("click", async () => {
    const textToCopy = getFullActiveCode();
    try {
      await navigator.clipboard.writeText(textToCopy);
      const orig = btnCopyCode.textContent;
      btnCopyCode.textContent = "✅ Copiado!";
      setTimeout(() => {
        btnCopyCode.textContent = orig;
      }, 1500);
    } catch {
      setStatus("Erro ao copiar para a área de transferência.", true);
    }
  });

  btnDownloadCode.addEventListener("click", downloadGeneratedCode);

  btnVpDesktop.addEventListener("click", () => {
    sandboxIframe.classList.remove("viewport-mobile");
  });

  btnVpMobile.addEventListener("click", () => {
    sandboxIframe.classList.add("viewport-mobile");
  });

  const btnDownloadPreview = document.getElementById("btn-download-preview");
  if (btnDownloadPreview) {
    btnDownloadPreview.addEventListener("click", downloadGeneratedCode);
  }

  btnFullscreenPreview.addEventListener("click", openFullscreenPreviewTab);

  btnClearHistory.addEventListener("click", () => {
    captureHistory = [];
    if (hasChromeStorage) {
      chrome.storage.local.set({ captureHistory: [] });
    }
    renderHistoryList();
    setStatus("Histórico limpo.");
  });

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SANDBOX_FULLSCREEN_READY") {
      sendCodeToSandbox(
        getFullActiveCode(),
        selectStack.value,
        lastCapture?.captureMode !== "element"
      );
    }
  });

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || !message.type) return;

      if (message.type === "COMPONENT_CAPTURED_BROADCAST") {
        handleIncomingCapture(message.payload, true);
      } else if (message.type === "MULTI_SELECT_UPDATED_BROADCAST") {
        const count = Array.isArray(message.queue) ? message.queue.length : 0;
        if (count > 0) {
          bagBar.style.display = "flex";
          bagCountLabel.textContent = `🧩 ${count} ${
            count === 1 ? "item" : "itens"
          } na Sacola Multi-Select`;
          setStatus(`Item #${count} adicionado à Sacola! Clique em 'Clonar Sacola' ou pressione Enter.`);
        } else {
          bagBar.style.display = "none";
        }
      } else if (message.type === "FULL_PAGE_PROGRESS_BROADCAST") {
        setCubeState("scanning");
        if (message.progress && message.progress.message) {
          setStatus(message.progress.message);
        }
      } else if (message.type === "INSPECTION_CANCELLED_BROADCAST") {
        isInspecting = false;
        isSnipping = false;
        bagBar.style.display = "none";
        updateButtonsUI();
        setCubeState("idle");
        setStatus("Modo de captura cancelado pelo usuário (ESC).");
      }
    });
  }

  populateModelsForProvider("gemini");
  setCubeState("idle");
  loadSavedSettings();

  window.__oCuboPanel = {
    setCubeState,
    cropComponentImage,
    stitchFullPageSlices,
    sendCodeToSandbox,
    AI_PROVIDERS
  };
})();
