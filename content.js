// O Cubo (The Cube) v5.0 Spider & Area Snipper - Content Script
// Recursos Completos:
// 1. ✂️ Recorte de Tela Livre (Area Crop / Lasso Snipper): desenhe um retângulo na tela para capturar todos os elementos dentro da região + print exato!
// 2. 🕸️ Clonador Multi-Páginas (Web Spider / Crawler de Links Internos): descobre todos os links internos do site, clona as sub-páginas e gera um Site Navegável Completo!
// 3. 🌐 Clonagem Visual Fiel 1:1 (True DOM + CSS Rules + Base64 Assets + Fonts + SVGs intactos)
// 4. 🎯 Inspetor Dinâmico (↑/↓, Alt+Scroll, Espaço, H para congelar Hover, Shift+Clique para Sacola Multi-Select)

(() => {
  if (window.__oCuboInitialized) return;
  window.__oCuboInitialized = true;

  let isInspecting = false;
  let isAreaSnipping = false;
  let isHoverFrozen = false;
  let hoveredElement = null;
  let navigationStack = [];
  let multiSelectBag = [];
  let multiSelectPinsContainer = null;

  // Estado do Recorte de Área (Drag & Crop)
  let dragStartPos = null;
  let currentCropRect = null;
  let areaBackdropEl = null;
  let areaSelectionEl = null;
  let areaSelectionLabelEl = null;

  let shadowHost = null;
  let shadowRoot = null;
  let highlightBox = null;
  let badgeEl = null;
  let hudBarEl = null;

  const ESSENTIAL_CSS_PROPS = [
    "display",
    "flex-direction",
    "flex-wrap",
    "justify-content",
    "align-items",
    "gap",
    "grid-template-columns",
    "grid-template-rows",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "padding",
    "margin",
    "background",
    "background-color",
    "background-image",
    "background-size",
    "background-position",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "text-transform",
    "text-decoration",
    "border",
    "border-radius",
    "box-shadow",
    "opacity",
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "z-index",
    "overflow",
    "transform",
    "backdrop-filter",
    "transition",
    "animation"
  ];

  const IGNORED_DEFAULT_VALUES = new Set([
    "",
    "none",
    "normal",
    "auto",
    "0px",
    "0px 0px",
    "0px 0px 0px 0px",
    "rgba(0, 0, 0, 0)",
    "transparent",
    "static",
    "visible",
    "1",
    "start",
    "stretch",
    "row",
    "0px none rgb(0, 0, 0)",
    "all 0s ease 0s",
    "none 0s ease 0s 1 normal none running"
  ]);

  const hasChromeRuntime =
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function";

  function safeSendMessage(msg, cb) {
    if (hasChromeRuntime) {
      try {
        chrome.runtime.sendMessage(msg, cb);
      } catch {
        if (cb) cb(null);
      }
    } else if (cb) {
      cb(null);
    }
  }

  function requestTabScreenshot() {
    return new Promise((resolve) => {
      safeSendMessage({ type: "CAPTURE_VISIBLE_TAB" }, (response) => {
        if (response && response.success && response.dataUrl) {
          resolve(response.dataUrl);
        } else {
          resolve(null);
        }
      });
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function toAbsoluteUrl(rawUrl, baseHref = window.location.href) {
    if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
    const trimmed = rawUrl.trim();
    if (
      !trimmed ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("blob:") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:") ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("#")
    ) {
      return trimmed;
    }
    try {
      return new URL(trimmed, baseHref).href;
    } catch {
      return trimmed;
    }
  }

  function absolutizeCssUrls(cssText, baseUrl = window.location.href) {
    if (!cssText) return "";
    return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote, innerUrl) => {
      const trimmed = (innerUrl || "").trim();
      if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) {
        return match;
      }
      const abs = toAbsoluteUrl(trimmed, baseUrl);
      return `url("${abs}")`;
    });
  }

  function tryInlineImageAsDataUrl(imgEl) {
    try {
      if (!imgEl || !imgEl.complete || !imgEl.naturalWidth || !imgEl.naturalHeight) {
        return null;
      }
      if (imgEl.naturalWidth > 1600 || imgEl.naturalHeight > 1600) {
        return null;
      }
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, 0, 0);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  // Cache global de CSS por sessão para não baixar o mesmo CSS do Next.js 6 vezes nas sub-páginas
  const stylesheetTextCache = new Map();

  async function fetchWithTimeout(url, timeoutMs = 4500) {
    if (stylesheetTextCache.has(url)) {
      return stylesheetTextCache.get(url);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const txt = await resp.text();
        stylesheetTextCache.set(url, txt);
        return txt;
      }
    } catch {
      clearTimeout(timer);
    }

    // Fallback via Service Worker (com timeout embutido no background.js)
    const swRes = await new Promise((resolve) => {
      const swTimer = setTimeout(() => resolve(null), timeoutMs + 500);
      safeSendMessage({ type: "FETCH_REMOTE_URL", url }, (r) => {
        clearTimeout(swTimer);
        resolve(r);
      });
    });

    if (swRes && swRes.ok && swRes.text) {
      stylesheetTextCache.set(url, swRes.text);
      return swRes.text;
    }
    return "";
  }

  function triggerDirectHtmlDownload(htmlContent, prefix = "o-cubo-site-completo") {
    if (!htmlContent) return;
    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${prefix}-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.warn("[O Cubo] Erro no download direto:", err);
    }
  }

  async function extractFullPageStylesAndLinks(doc = document, baseHref = window.location.href) {
    const collectedCssChunks = [];
    const externalStylesheetLinks = [];

    doc.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]').forEach((link) => {
      const rawHref = link.getAttribute("href");
      if (rawHref) {
        externalStylesheetLinks.push(
          `<link rel="${link.getAttribute("rel")}" href="${toAbsoluteUrl(rawHref, baseHref)}" crossorigin="anonymous" />`
        );
      }
    });

    doc.querySelectorAll("style").forEach((styleNode) => {
      if (styleNode.textContent && styleNode.textContent.trim()) {
        collectedCssChunks.push(absolutizeCssUrls(styleNode.textContent, baseHref));
      }
    });

    if (doc === document) {
      for (const sheet of Array.from(document.styleSheets)) {
        const sheetBaseUrl = sheet.href || baseHref;
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules && rules.length > 0) {
            const sheetCss = Array.from(rules)
              .map((r) => absolutizeCssUrls(r.cssText, sheetBaseUrl))
              .join("\n");
            if (sheetCss.trim()) {
              if (sheet.href) stylesheetTextCache.set(sheet.href, sheetCss);
              collectedCssChunks.push(`/* Stylesheet: ${sheet.href || "cssom"} */\n${sheetCss}`);
            }
            continue;
          }
        } catch {
          if (sheet.href) {
            const rawCss = await fetchWithTimeout(sheet.href, 4000);
            if (rawCss) {
              collectedCssChunks.push(
                `/* Fetched Stylesheet: ${sheet.href} */\n${absolutizeCssUrls(rawCss, sheet.href)}`
              );
            }
          }
        }
      }
    } else {
      // Para sub-páginas: os <link rel="stylesheet" href="https://..."> já estão no <head> da sub-página!
      // Buscamos em paralelo com timeout curto apenas folhas principais para garantir rapidez sem travar
      const styleLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).slice(0, 8);
      const cssResults = await Promise.all(
        styleLinks.map(async (lnk) => {
          const href = toAbsoluteUrl(lnk.getAttribute("href"), baseHref);
          if (!href) return "";
          const cssText = await fetchWithTimeout(href, 3500);
          return cssText
            ? `/* Subpage CSS: ${href} */\n${absolutizeCssUrls(cssText, href)}`
            : "";
        })
      );
      collectedCssChunks.push(...cssResults.filter(Boolean));
    }

    return {
      externalLinksHtml: [...new Set(externalStylesheetLinks)].join("\n  "),
      combinedCssText: collectedCssChunks.join("\n\n")
    };
  }

  function normalizeAndFixAssetsInClone(origRoot, cloneRoot, inlineBase64Images = true, baseHref = window.location.href) {
    const origNodes = [origRoot, ...origRoot.querySelectorAll("*")];
    const cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll("*")];
    const count = Math.min(origNodes.length, cloneNodes.length);

    for (let i = 0; i < count; i++) {
      const origEl = origNodes[i];
      const cloneEl = cloneNodes[i];
      if (!origEl || !cloneEl || !origEl.tagName) continue;

      const tag = origEl.tagName.toLowerCase();

      if (tag === "img") {
        const bestSrc =
          origEl.currentSrc ||
          origEl.getAttribute("src") ||
          origEl.getAttribute("data-src") ||
          origEl.getAttribute("data-lazy-src") ||
          origEl.getAttribute("data-original") ||
          "";

        const absSrc = toAbsoluteUrl(bestSrc, baseHref);
        const inlined = inlineBase64Images ? tryInlineImageAsDataUrl(origEl) : null;

        cloneEl.setAttribute("src", inlined || absSrc);
        cloneEl.removeAttribute("srcset");
        cloneEl.removeAttribute("data-srcset");
        cloneEl.removeAttribute("loading");
        cloneEl.style.opacity = "1";
        cloneEl.style.visibility = "visible";
      }

      // 2. Elementos <source> dentro de <picture> ou <video>: converte srcSet e src para URLs absolutas!
      if (tag === "source") {
        if (cloneEl.hasAttribute("srcset")) {
          const rawSrcset = cloneEl.getAttribute("srcset") || "";
          const absSrcset = rawSrcset
            .split(",")
            .map((part) => {
              const tokens = part.trim().split(/\s+/);
              if (!tokens[0]) return part;
              tokens[0] = toAbsoluteUrl(tokens[0], baseHref);
              return tokens.join(" ");
            })
            .join(", ");
          cloneEl.setAttribute("srcset", absSrcset);
        }
        if (cloneEl.hasAttribute("src")) {
          cloneEl.setAttribute("src", toAbsoluteUrl(cloneEl.getAttribute("src"), baseHref));
        }
      }

      // Reescreve também qualquer url(...) em atributos style="" inline (ex: --value:url(/./imgs/next/bg.png) da FIAP!)
      if (cloneEl.hasAttribute("style")) {
        const inlineStyle = cloneEl.getAttribute("style") || "";
        if (inlineStyle.includes("url(")) {
          cloneEl.setAttribute("style", absolutizeCssUrls(inlineStyle, baseHref));
        }
      }
      // Ativa seções lazy-background customizadas (como data-lazy da FIAP)
      if (cloneEl.hasAttribute("data-lazy")) {
        cloneEl.setAttribute("data-lazy", "false");
      }

      if (tag === "video") {
        if (origEl.getAttribute("poster")) {
          cloneEl.setAttribute("poster", toAbsoluteUrl(origEl.getAttribute("poster"), baseHref));
        }
        if (origEl.getAttribute("src")) {
          cloneEl.setAttribute("src", toAbsoluteUrl(origEl.getAttribute("src"), baseHref));
        }
      }

      if (tag === "canvas" && typeof origEl.toDataURL === "function") {
        try {
          const dataUrl = origEl.toDataURL("image/png");
          const r = origEl.getBoundingClientRect();
          const replacementImg = document.createElement("img");
          replacementImg.src = dataUrl;
          replacementImg.className = cloneEl.className;
          if (r.width > 0) replacementImg.style.width = `${Math.round(r.width)}px`;
          if (r.height > 0) replacementImg.style.height = `${Math.round(r.height)}px`;
          cloneEl.replaceWith(replacementImg);
          continue;
        } catch {
          // Canvas protegido por CORS
        }
      }

      if (tag === "a" && cloneEl.hasAttribute("href")) {
        cloneEl.setAttribute("href", toAbsoluteUrl(cloneEl.getAttribute("href"), baseHref));
      }

      if (tag === "svg" && origRoot.ownerDocument === document) {
        const r = origEl.getBoundingClientRect();
        const cs = window.getComputedStyle(origEl);
        if (r.width > 0 && r.height > 0) {
          if (!cloneEl.getAttribute("width") && !cloneEl.style.width) {
            cloneEl.style.width = `${Math.round(r.width)}px`;
          }
          if (!cloneEl.getAttribute("height") && !cloneEl.style.height) {
            cloneEl.style.height = `${Math.round(r.height)}px`;
          }
        }
        if (cs.color) cloneEl.style.color = cs.color;
        if (cs.fill && cs.fill !== "none") cloneEl.style.fill = cs.fill;
      }

      if (tag === "use") {
        const href = origEl.getAttribute("href") || origEl.getAttribute("xlink:href") || "";
        if (href.startsWith("#")) {
          const refSymbol = document.querySelector(href);
          if (refSymbol && cloneEl.parentElement) {
            const viewBox = refSymbol.getAttribute("viewBox");
            if (viewBox && !cloneEl.parentElement.getAttribute("viewBox")) {
              cloneEl.parentElement.setAttribute("viewBox", viewBox);
            }
            cloneEl.replaceWith(...Array.from(refSymbol.childNodes).map((n) => n.cloneNode(true)));
            continue;
          }
        } else if (href) {
          cloneEl.setAttribute("href", toAbsoluteUrl(href, baseHref));
        }
      }

      if (origRoot.ownerDocument === document) {
        const cs = window.getComputedStyle(origEl);
        if (cs.backgroundImage && cs.backgroundImage !== "none" && cs.backgroundImage.includes("url(")) {
          cloneEl.style.backgroundImage = absolutizeCssUrls(cs.backgroundImage, baseHref);
        }
        if (cs.opacity === "0" && origEl.getBoundingClientRect().height > 10) {
          cloneEl.style.opacity = "1";
        }
      }
    }
  }

  /**
   * Constrói um Documento HTML5 Standalone Completo e 100% Visual
   */
  async function buildStandaloneVisualHtmlDocument(targetNodeOrNodes, options = {}) {
    const isFullPage = Boolean(options.isFullPage);
    const { externalLinksHtml, combinedCssText } = await extractFullPageStylesAndLinks();

    const htmlAttrs = Array.from(document.documentElement.attributes)
      .map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
      .join(" ");
    const bodyAttrs = Array.from(document.body.attributes)
      .map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
      .join(" ");

    const bodyCs = window.getComputedStyle(document.body);
    const htmlCs = window.getComputedStyle(document.documentElement);

    let bodyInnerContent = "";
    let scopedComputedCss = "";

    if (isFullPage) {
      const bodyClone = document.body.cloneNode(true);
      bodyClone.querySelectorAll("#o-cubo-host, script, noscript").forEach((n) => n.remove());
      normalizeAndFixAssetsInClone(document.body, bodyClone, true);
      bodyInnerContent = bodyClone.innerHTML;
    } else {
      const nodesArray = Array.isArray(targetNodeOrNodes) ? targetNodeOrNodes : [targetNodeOrNodes];
      const rules = [];
      let ruleCounter = 0;

      const fragments = nodesArray.map((origTarget) => {
        const clone = origTarget.cloneNode(true);
        clone.querySelectorAll("#o-cubo-host, script, noscript").forEach((n) => n.remove());
        normalizeAndFixAssetsInClone(origTarget, clone, true);

        const origList = [origTarget, ...origTarget.querySelectorAll("*")];
        const cloneList = [clone, ...clone.querySelectorAll("*")];
        const len = Math.min(origList.length, cloneList.length, 650);

        for (let i = 0; i < len; i++) {
          const oEl = origList[i];
          const cEl = cloneList[i];
          if (!oEl || !cEl || !cEl.classList) continue;
          const cs = window.getComputedStyle(oEl);
          const decls = [];
          for (const prop of ESSENTIAL_CSS_PROPS) {
            const val = (cs.getPropertyValue(prop) || "").trim();
            if (!val || IGNORED_DEFAULT_VALUES.has(val)) continue;
            if (prop === "border" && val.startsWith("0px none")) continue;
            decls.push(`${prop}: ${absolutizeCssUrls(val)}`);
          }
          if (decls.length > 0) {
            ruleCounter++;
            const clsName = `ocubo-snap-${ruleCounter}`;
            cEl.classList.add(clsName);
            rules.push(`.${clsName} { ${decls.join("; ")}; }`);
          }
        }
        return clone.outerHTML;
      });

      scopedComputedCss = rules.join("\n");
      bodyInnerContent = `<div style="padding: 24px; display: flex; flex-direction: column; gap: 20px; align-items: center;">\n${fragments.join("\n\n")}\n</div>`;
    }

    return `<!DOCTYPE html>
<html ${htmlAttrs || 'lang="pt-BR"'}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${window.location.href}" />
  <title>${(document.title || "Clone Visual").replace(/</g, "&lt;")} — Clonado pelo O Cubo</title>
  ${externalLinksHtml}
  <style id="o-cubo-base-reset">
    html {
      background-color: ${htmlCs.backgroundColor || "transparent"};
      color: ${bodyCs.color || "inherit"};
      font-family: ${bodyCs.fontFamily || "sans-serif"};
    }
    body {
      margin: 0;
      background-color: ${bodyCs.backgroundColor || "transparent"};
      background-image: ${absolutizeCssUrls(bodyCs.backgroundImage || "none")};
      color: ${bodyCs.color || "inherit"};
      font-family: ${bodyCs.fontFamily || "sans-serif"};
      overflow-x: hidden;
    }
  </style>
  <style id="o-cubo-original-stylesheets">
${combinedCssText}
  </style>
  ${scopedComputedCss ? `<style id="o-cubo-computed-snapshot">\n${scopedComputedCss}\n  </style>` : ""}
</head>
<body ${bodyAttrs}>
${bodyInnerContent}
</body>
</html>`;
  }

  /**
   * 🕸️ DESCOBRIDOR DE LINKS INTERNOS (`discoverInternalLinks`):
   * Encontra todos os links `<a href="...">` da página que apontam para outras páginas do site
   * (ou seções internas quando em arquivo local de demonstração).
   */
  function discoverInternalLinks() {
    const currentUrl = new URL(window.location.href);
    const currentOrigin = currentUrl.origin;
    const currentBaseNoHash = currentUrl.href.split("#")[0];

    const seenUrls = new Set([currentBaseNoHash]);
    const discovered = [];
    const hashLinks = [];

    const anchors = Array.from(document.querySelectorAll("a[href]"));
    for (const a of anchors) {
      if (shadowHost && shadowHost.contains(a)) continue;
      const rawHref = (a.getAttribute("href") || "").trim();
      if (
        !rawHref ||
        rawHref.startsWith("javascript:") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:")
      ) {
        continue;
      }

      let resolved;
      try {
        resolved = new URL(rawHref, window.location.href);
      } catch {
        continue;
      }

      // Ignora arquivos binários/downloads
      if (/\.(pdf|zip|rar|exe|dmg|mp4|mp3|png|jpg|jpeg|webp|svg|gif)$/i.test(resolved.pathname)) {
        continue;
      }

      const labelText =
        (a.textContent || "").trim().slice(0, 45) ||
        a.getAttribute("aria-label") ||
        resolved.pathname.split("/").filter(Boolean).pop() ||
        "Sub-página";

      // Se for link de âncora na mesma página (#pricing, #docs), guarda como fallback para páginas SPA/Demo
      if (rawHref.startsWith("#") && rawHref.length > 1) {
        if (!hashLinks.some((h) => h.hash === rawHref)) {
          hashLinks.push({
            url: resolved.href,
            hash: rawHref,
            path: rawHref,
            title: labelText,
            isHashSection: true
          });
        }
        continue;
      }

      // Verifica se pertence ao mesmo domínio ou subdomínio raiz (ex: www.fiap.com.br e postech.fiap.com.br)
      const getRootDomain = (host) => {
        const parts = (host || "").toLowerCase().split(".");
        if (parts.length <= 2) return host.toLowerCase();
        return parts.slice(-3).join(".");
      };
      const sameOrigin =
        resolved.origin === currentOrigin ||
        (resolved.hostname &&
          currentUrl.hostname &&
          getRootDomain(resolved.hostname) === getRootDomain(currentUrl.hostname)) ||
        (currentUrl.protocol === "file:" && resolved.protocol === "file:");
      if (!sameOrigin) continue;

      const cleanHref = resolved.href.split("#")[0];
      if (seenUrls.has(cleanHref)) continue;
      seenUrls.add(cleanHref);

      discovered.push({
        url: cleanHref,
        path: resolved.pathname + resolved.search,
        title: labelText,
        isHashSection: false
      });
    }

    // Se o site tiver links de outras páginas reais, retorna eles; se for uma Single-Page/Demo com #seções, inclui também!
    return discovered.length > 0 ? discovered.slice(0, 15) : hashLinks.slice(0, 10);
  }

  /**
   * 🕸️ CLONADOR MULTI-PÁGINAS (`crawlAndCloneMultiPageSite`):
   * Clona a Página Inicial + as Sub-Páginas selecionadas dos links de redirecionamento,
   * empacotando tudo em uma Aplicação Multi-Páginas Interativa com Barra de Navegação Superior
   * e interceptação automática de cliques nos `<a href="...">` para navegar entre as páginas clonadas!
   */
  async function crawlAndCloneMultiPageSite(targetUrls = null, maxPages = 6) {
    stopInspection();
    hideOverlay();
    await sleep(50);

    const allDiscovered = discoverInternalLinks();
    const linksToCrawl = Array.isArray(targetUrls) && targetUrls.length > 0
      ? allDiscovered.filter((l) => targetUrls.includes(l.url))
      : allDiscovered.slice(0, maxPages - 1);

    const pagesOutput = [];

    // 1. Clona a Página Atual (Home / Página #1)
    safeSendMessage({
      type: "CRAWLER_PROGRESS",
      progress: {
        step: 1,
        total: linksToCrawl.length + 1,
        message: `Clonando Página Principal (1/${linksToCrawl.length + 1}): ${document.title || window.location.pathname}...`
      }
    });

    const homeHtml = await buildStandaloneVisualHtmlDocument(document.body, { isFullPage: true });
    const homeShot = await requestTabScreenshot();

    pagesOutput.push({
      id: "page-0",
      title: document.title || "Página Inicial (Home)",
      url: window.location.href,
      path: window.location.pathname || "/",
      standaloneHtml: homeHtml
    });

    // 2. Clona cada uma das Sub-Páginas dos links internos
    for (let i = 0; i < linksToCrawl.length; i++) {
      const linkItem = linksToCrawl[i];
      const stepNum = i + 2;

      safeSendMessage({
        type: "CRAWLER_PROGRESS",
        progress: {
          step: stepNum,
          total: linksToCrawl.length + 1,
          message: `Clonando Sub-Página (${stepNum}/${linksToCrawl.length + 1}): ${linkItem.title} (${linkItem.path})...`
        }
      });

      // Caso A: É uma rota/seção de âncora (#section) na página
      if (linkItem.isHashSection) {
        const targetSec =
          document.querySelector(linkItem.hash) ||
          document.getElementById(linkItem.hash.slice(1));
        if (targetSec) {
          const secHtml = await buildStandaloneVisualHtmlDocument(targetSec, { isFullPage: false });
          pagesOutput.push({
            id: `page-${i + 1}`,
            title: linkItem.title,
            url: linkItem.url,
            path: linkItem.path,
            standaloneHtml: secHtml
          });
        }
        continue;
      }

      // Caso B: É uma URL de outra página real do site — faz fetch rápido com timeout + fallback pelo Service Worker!
      try {
        let rawHtmlText = "";
        let finalPageUrl = linkItem.url;

        try {
          const controller = new AbortController();
          const fetchTimer = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(linkItem.url, {
            credentials: "include",
            signal: controller.signal
          });
          clearTimeout(fetchTimer);
          if (resp.ok) {
            rawHtmlText = await resp.text();
            finalPageUrl = resp.url || linkItem.url;
          }
        } catch {
          // Fallback via Service Worker (bypassa CORS em subdomínios como postech.fiap.com.br)
        }

        if (!rawHtmlText) {
          const swFetch = await new Promise((resolve) => {
            const swTimer = setTimeout(() => resolve(null), 5500);
            safeSendMessage({ type: "FETCH_REMOTE_URL", url: linkItem.url }, (r) => {
              clearTimeout(swTimer);
              resolve(r);
            });
          });
          if (swFetch && swFetch.ok && swFetch.text) {
            rawHtmlText = swFetch.text;
            finalPageUrl = swFetch.finalUrl || linkItem.url;
          }
        }

        if (!rawHtmlText) continue;

        const parser = new DOMParser();
        const subDoc = parser.parseFromString(rawHtmlText, "text/html");

        // Remove scripts e preloaders de tela cheia (ex: styles_loader da FIAP que no HTML bruto SSR vem em 0% cobrindo a tela)
        subDoc
          .querySelectorAll('script, noscript, #loader, [class*="styles_loader__"], [class*="preloader"]')
          .forEach((s) => s.remove());
        normalizeAndFixAssetsInClone(subDoc.body, subDoc.body, false, finalPageUrl);

        const { externalLinksHtml, combinedCssText } = await extractFullPageStylesAndLinks(
          subDoc,
          finalPageUrl
        );

        const subPageStandalone = `<!DOCTYPE html>
<html lang="pt-BR" style="overflow: auto !important;">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${finalPageUrl}" />
  <title>${(subDoc.title || linkItem.title).replace(/</g, "&lt;")}</title>
  ${externalLinksHtml}
  <style>
    html, body { overflow-y: auto !important; height: auto !important; }
    #loader, [class*="styles_loader__"], [class*="preloader"] { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
${combinedCssText}
  </style>
</head>
<body class="${subDoc.body.className || ""}" style="${subDoc.body.getAttribute("style") || "margin:0;"}">
${subDoc.body.innerHTML}
</body>
</html>`;

        pagesOutput.push({
          id: `page-${i + 1}`,
          title: subDoc.title || linkItem.title,
          url: finalPageUrl,
          path: linkItem.path,
          standaloneHtml: subPageStandalone
        });
      } catch (err) {
        console.warn("[O Cubo Spider] Aviso ao clonar sub-página:", linkItem.url, err);
      }
    }

    safeSendMessage({
      type: "CRAWLER_PROGRESS",
      progress: {
        step: linksToCrawl.length + 1,
        total: linksToCrawl.length + 1,
        message: `Empacotando todas as ${pagesOutput.length} páginas e baixando arquivo .html...`
      }
    });

    // 3. Constrói um Arquivo HTML Multi-Páginas Unificado (com Navegador de Abas entre todas as páginas clonadas + Interceptador de cliques nos links!)
    const multiPageBundleHtml = buildMultiPageInteractiveBundle(pagesOutput);

    // Faz o download automático imediato direto na aba do usuário para garantir que mesmo sites gigantes (como FIAP) baixem instantaneamente!
    triggerDirectHtmlDownload(multiPageBundleHtml, "o-cubo-site-multipage");

    const designTokens = extractPageDesignTokens();
    const assets = extractComponentAssets(document.body);

    const payload = {
      captureMode: "multi-page",
      autoDownloaded: true,
      capturedAt: Date.now(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      elementLabel: `🕸️ Site Completo (${pagesOutput.length} páginas clonadas)`,
      rect: {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      designTokens,
      assets,
      pagesCount: pagesOutput.length,
      crawledPages: pagesOutput.map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        path: p.path
      })),
      standaloneHtml: multiPageBundleHtml,
      cleanHtml: `<!-- Clone Multi-Páginas (${pagesOutput.length} páginas: ${pagesOutput.map((p) => p.title).join(", ")}) -->`,
      screenshotDataUrl: homeShot,
      sliceScreenshots: homeShot ? [homeShot] : []
    };

    safeSendMessage({
      type: "COMPONENT_CAPTURED",
      payload
    });

    window.dispatchEvent(new CustomEvent("o-cubo-captured", { detail: payload }));
    return payload;
  }

  /**
   * Empacota múltiplas páginas clonadas em um único arquivo `.html` interativo:
   * - Possui uma barra superior flutuante para alternar entre todas as páginas clonadas;
   * - Intercepta cliques nos links `<a href="...">` dentro de cada página clonada: se o link clicado
   *   corresponder a uma das sub-páginas clonadas, ele troca para aquela página clonada instantaneamente!
   */
  function buildMultiPageInteractiveBundle(pages) {
    if (!pages || pages.length === 0) return "";
    if (pages.length === 1) return pages[0].standaloneHtml;

    const serializedPagesJson = JSON.stringify(
      pages.map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        path: p.path,
        html: p.standaloneHtml
      }))
    ).replace(/<\/script>/gi, "<\\/script>");

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Clone Multi-Páginas (${pages.length} Páginas) — O Cubo 5.0</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070b09;
      color: #e6fff3;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ocubo-multipage-nav {
      background: #0b1410;
      border-bottom: 1px solid rgba(0, 255, 136, 0.4);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .ocubo-nav-badge {
      font-family: monospace;
      font-size: 11px;
      font-weight: 800;
      color: #00ff88;
      white-space: nowrap;
      margin-right: 6px;
    }
    .ocubo-page-tab {
      background: rgba(0, 255, 136, 0.08);
      border: 1px solid rgba(0, 255, 136, 0.3);
      color: #a7f3d0;
      padding: 5px 11px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .ocubo-page-tab:hover,
    .ocubo-page-tab.active {
      background: #00ff88;
      color: #05100a;
      border-color: #00ff88;
      font-weight: 800;
      box-shadow: 0 0 12px rgba(0, 255, 136, 0.5);
    }
    #ocubo-page-viewer {
      flex: 1;
      width: 100%;
      border: none;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <nav class="ocubo-multipage-nav" id="ocubo-nav">
    <span class="ocubo-nav-badge">🕸️ SITE CLONADO (${pages.length} PÁGINAS):</span>
  </nav>
  <iframe id="ocubo-page-viewer" title="Visualizador Multi-Páginas"></iframe>

  <script>
    const CLONED_PAGES = ${serializedPagesJson};
    const navBar = document.getElementById("ocubo-nav");
    const viewer = document.getElementById("ocubo-page-viewer");

    function normalizeUrlKey(u) {
      try {
        const parsed = new URL(u, window.location.href);
        return (parsed.origin + parsed.pathname).replace(/\\/+$/, "").toLowerCase();
      } catch {
        return String(u || "").toLowerCase();
      }
    }

    function showClonedPage(index) {
      const page = CLONED_PAGES[index];
      if (!page) return;

      document.querySelectorAll(".ocubo-page-tab").forEach((btn, i) => {
        btn.classList.toggle("active", i === index);
      });

      viewer.srcdoc = page.html;
    }

    // Intercepta cliques em links dentro do iframe para navegar automaticamente entre as páginas clonadas!
    viewer.addEventListener("load", () => {
      try {
        const doc = viewer.contentDocument;
        if (!doc) return;
        // Remove possíveis telas de preloader SSR que ficariam travadas sem JS
        doc
          .querySelectorAll('#loader, [class*="styles_loader__"], [class*="preloader"]')
          .forEach((el) => {
            el.style.display = "none";
            el.style.opacity = "0";
            el.style.visibility = "hidden";
            el.style.pointerEvents = "none";
          });
        doc.addEventListener("click", (e) => {
          const anchor = e.target.closest && e.target.closest("a[href]");
          if (!anchor) return;
          const rawHref = anchor.getAttribute("href") || "";
          const targetKey = normalizeUrlKey(anchor.href || rawHref);

          const matchedIdx = CLONED_PAGES.findIndex(
            (p) =>
              normalizeUrlKey(p.url) === targetKey ||
              (rawHref.startsWith("#") && p.path === rawHref) ||
              p.path === rawHref
          );

          if (matchedIdx !== -1) {
            e.preventDefault();
            e.stopPropagation();
            showClonedPage(matchedIdx);
          }
        }, true);
      } catch {}
    });

    CLONED_PAGES.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.className = "ocubo-page-tab" + (idx === 0 ? " active" : "");
      btn.textContent = (idx + 1) + ". " + p.title + " (" + p.path + ")";
      btn.addEventListener("click", () => showClonedPage(idx));
      navBar.appendChild(btn);
    });

    showClonedPage(0);
  </script>
</body>
</html>`;
  }

  /**
   * ✂️ MODO RECORTE DE TELA LIVRE (`startAreaSnipper`):
   * O usuário clica e arrasta na tela desenhando um retângulo neon.
   * Captura todos os elementos visuais que estão dentro daquele retângulo + recorta o screenshot exato da área!
   */
  function findElementsInsideCropRect(cropRect) {
    const candidates = Array.from(document.body.querySelectorAll("*")).filter((el) => {
      if (!el || el === shadowHost || (shadowHost && shadowHost.contains(el))) return false;
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (tag === "script" || tag === "style" || tag === "noscript" || tag === "link") return false;

      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;

      // Calcula área de interseção com o retângulo desenhado
      const ix1 = Math.max(cropRect.x, r.left);
      const iy1 = Math.max(cropRect.y, r.top);
      const ix2 = Math.min(cropRect.x + cropRect.width, r.right);
      const iy2 = Math.min(cropRect.y + cropRect.height, r.bottom);

      if (ix2 <= ix1 || iy2 <= iy1) return false;

      const intersectionArea = (ix2 - ix1) * (iy2 - iy1);
      const elementArea = r.width * r.height;

      // Inclui elementos que têm pelo menos 55% de sua área dentro do recorte e que não sejam maiores que 2x o recorte
      return intersectionArea / elementArea >= 0.55 && elementArea <= cropRect.width * cropRect.height * 2.2;
    });

    // Filtra apenas os elementos-raiz da seleção (se o pai já está na lista, não duplica o filho)
    const rootSelected = candidates.filter(
      (el) => !candidates.some((other) => other !== el && other.contains(el))
    );

    if (rootSelected.length > 0) {
      return rootSelected.slice(0, 15);
    }

    // Fallback: pega o elemento no ponto central do retângulo
    const centerX = cropRect.x + cropRect.width / 2;
    const centerY = cropRect.y + cropRect.height / 2;
    const centerEl = document.elementFromPoint(centerX, centerY);
    return centerEl && centerEl !== document.body ? [centerEl] : [document.body];
  }

  /**
   * Extrai HTML limpo com estilos computados resumidos em `data-cube-style` (para prompt de IA)
   */
  function extractCleanComponent(rootEl, options = {}) {
    if (!rootEl) return "";
    const maxNodes = options.maxNodes || 350;
    const maxChars = options.maxChars || 30000;

    const clone = rootEl.cloneNode(true);
    clone.querySelectorAll("#o-cubo-host, script, noscript, style").forEach((n) => n.remove());

    const origNodes = [rootEl, ...rootEl.querySelectorAll("*")];
    const cloneNodes = [clone, ...clone.querySelectorAll("*")];
    const limit = Math.min(origNodes.length, cloneNodes.length, maxNodes);

    for (let i = 0; i < limit; i++) {
      const oEl = origNodes[i];
      const cEl = cloneNodes[i];
      if (!oEl || !cEl || !oEl.tagName) continue;

      if (oEl.tagName.toLowerCase() === "img") {
        const src = oEl.currentSrc || oEl.getAttribute("src") || "";
        if (src) cEl.setAttribute("src", toAbsoluteUrl(src));
      }

      const cs = window.getComputedStyle(oEl);
      const summary = [];
      for (const prop of ESSENTIAL_CSS_PROPS) {
        const val = (cs.getPropertyValue(prop) || "").trim();
        if (!val || IGNORED_DEFAULT_VALUES.has(val)) continue;
        summary.push(`${prop}:${val}`);
      }
      if (summary.length > 0) {
        cEl.setAttribute("data-cube-style", summary.slice(0, 18).join("; "));
      }
    }

    const htmlOut = clone.outerHTML || "";
    return htmlOut.length > maxChars ? htmlOut.slice(0, maxChars) + "\n<!-- ...truncado -->" : htmlOut;
  }

  /**
   * Extrai Design Tokens globais (cores de fundo, texto, fontes) da página atual
   */
  function extractPageDesignTokens() {
    const bodyCs = window.getComputedStyle(document.body || document.documentElement);
    const fontsSet = new Set();
    const surfaceColors = new Set();
    const textColors = new Set();

    const sampleNodes = Array.from(
      document.querySelectorAll("body, header, nav, main, section, h1, h2, h3, p, a, button")
    ).slice(0, 80);

    for (const el of sampleNodes) {
      if (shadowHost && shadowHost.contains(el)) continue;
      const cs = window.getComputedStyle(el);
      if (cs.fontFamily) {
        const primaryFont = cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
        if (primaryFont) fontsSet.add(primaryFont);
      }
      if (cs.backgroundColor && !IGNORED_DEFAULT_VALUES.has(cs.backgroundColor)) {
        surfaceColors.add(cs.backgroundColor);
      }
      if (cs.color && !IGNORED_DEFAULT_VALUES.has(cs.color)) {
        textColors.add(cs.color);
      }
    }

    return {
      bodyBackground: bodyCs.backgroundColor || "#ffffff",
      bodyColor: bodyCs.color || "#000000",
      fonts: Array.from(fontsSet).slice(0, 6),
      surfaceColors: Array.from(surfaceColors).slice(0, 8),
      textColors: Array.from(textColors).slice(0, 8)
    };
  }

  /**
   * Extrai SVGs, Imagens e Fontes contidos no elemento ou página
   */
  function extractComponentAssets(rootEl = document.body) {
    if (!rootEl) return { svgs: [], images: [], fonts: [] };

    const svgs = [];
    const seenSvgs = new Set();
    rootEl.querySelectorAll("svg").forEach((svg) => {
      if (shadowHost && shadowHost.contains(svg)) return;
      const code = svg.outerHTML;
      if (code && code.length < 25000 && !seenSvgs.has(code)) {
        seenSvgs.add(code);
        svgs.push(code);
      }
    });

    const images = [];
    const seenImgs = new Set();
    rootEl.querySelectorAll("img").forEach((img) => {
      if (shadowHost && shadowHost.contains(img)) return;
      const raw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || "";
      const abs = toAbsoluteUrl(raw);
      if (abs && !seenImgs.has(abs)) {
        seenImgs.add(abs);
        images.push({
          src: abs,
          alt: img.getAttribute("alt") || "Imagem",
          width: img.naturalWidth || Math.round(img.getBoundingClientRect().width) || 0,
          height: img.naturalHeight || Math.round(img.getBoundingClientRect().height) || 0
        });
      }
    });

    const tokens = extractPageDesignTokens();
    return {
      svgs: svgs.slice(0, 24),
      images: images.slice(0, 30),
      fonts: tokens.fonts
    };
  }

  /**
   * 🌐 CLONADOR DE PÁGINA INTEIRA (`captureFullSite`):
   * Faz auto-scroll rápido para disparar lazy-load, captura fatias panorâmicas e gera o HTML5 1:1 standalone
   */
  async function captureFullSite() {
    stopInspection();
    stopAreaSnipper();
    hideOverlay();
    await sleep(60);

    const originalScrollY = window.scrollY;
    const totalHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      window.innerHeight
    );
    const viewportHeight = window.innerHeight || 800;
    const maxSlices = Math.min(5, Math.max(1, Math.ceil(totalHeight / viewportHeight)));
    const sliceScreenshots = [];

    for (let i = 0; i < maxSlices; i++) {
      safeSendMessage({
        type: "FULL_PAGE_PROGRESS",
        progress: {
          step: i + 1,
          total: maxSlices,
          message: `Varrendo e ativando seções da página (${i + 1}/${maxSlices})...`
        }
      });
      window.scrollTo({ top: i * viewportHeight, behavior: "instant" });
      await sleep(160);
      const shot = await requestTabScreenshot();
      if (shot) sliceScreenshots.push(shot);
    }

    window.scrollTo({ top: originalScrollY, behavior: "instant" });
    await sleep(80);

    const standaloneHtml = await buildStandaloneVisualHtmlDocument(document.body, {
      isFullPage: true
    });

    // Inicia o download direto do arquivo .html na aba para garantir entrega imediata
    triggerDirectHtmlDownload(standaloneHtml, "o-cubo-pagina-completa");

    const sections = Array.from(
      document.body.querySelectorAll("header, nav, main > *, section, article, footer")
    ).filter((el) => !(shadowHost && shadowHost.contains(el)));

    const designTokens = extractPageDesignTokens();
    const assets = extractComponentAssets(document.body);

    const payload = {
      captureMode: "full-page",
      autoDownloaded: true,
      capturedAt: Date.now(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      elementLabel: `🌐 Página Completa (${sections.length || 1} seções)`,
      rect: {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      sectionsCount: sections.length || 1,
      designTokens,
      assets,
      standaloneHtml,
      cleanHtml: `<!-- Clone Página Completa: ${document.title} -->`,
      screenshotDataUrl: sliceScreenshots[0] || null,
      sliceScreenshots
    };

    safeSendMessage({
      type: "COMPONENT_CAPTURED",
      payload
    });

    window.dispatchEvent(new CustomEvent("o-cubo-captured", { detail: payload }));
    return payload;
  }

  /**
   * 🧩 SACOLA MULTI-SELECT (`addElementToMultiSelectBag` & `finalizeMultiSelectBag`)
   */
  function addElementToMultiSelectBag(target) {
    if (!target || target === shadowHost) return;
    const exists = multiSelectBag.some((item) => item.element === target);
    if (!exists) {
      const rect = target.getBoundingClientRect();
      multiSelectBag.push({
        element: target,
        label: formatShortTag(target),
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        }
      });
    }
    renderMultiSelectPins();
    updateHudBar();
    safeSendMessage({
      type: "MULTI_SELECT_UPDATED",
      queue: multiSelectBag.map((it, idx) => ({ index: idx + 1, label: it.label }))
    });
  }

  async function finalizeMultiSelectBag() {
    if (multiSelectBag.length === 0) return null;
    const elements = multiSelectBag.map((item) => item.element).filter(Boolean);
    multiSelectBag = [];
    stopInspection();
    hideOverlay();
    await sleep(60);

    const screenshotDataUrl = await requestTabScreenshot();
    const standaloneHtml = await buildStandaloneVisualHtmlDocument(elements, {
      isFullPage: false
    });

    const cleanHtml = elements
      .map(
        (el, i) =>
          `<!-- === COMPONENTE #${i + 1}: ${formatShortTag(el)} === -->\n${extractCleanComponent(el, {
            maxNodes: 250,
            maxChars: 14000
          })}`
      )
      .join("\n\n");

    const designTokens = extractPageDesignTokens();
    const assets = {
      svgs: elements.flatMap((el) => extractComponentAssets(el).svgs).slice(0, 20),
      images: elements.flatMap((el) => extractComponentAssets(el).images).slice(0, 20),
      fonts: designTokens.fonts
    };

    const payload = {
      captureMode: "multi-select",
      capturedAt: Date.now(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      elementLabel: `🧩 Sacola Multi-Select (${elements.length} itens)`,
      rect: {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      sectionsCount: elements.length,
      designTokens,
      assets,
      standaloneHtml,
      cleanHtml,
      screenshotDataUrl
    };

    safeSendMessage({
      type: "COMPONENT_CAPTURED",
      payload
    });

    window.dispatchEvent(new CustomEvent("o-cubo-captured", { detail: payload }));
    return payload;
  }

  function ensureShadowInspector() {
    if (shadowHost && document.documentElement.contains(shadowHost)) {
      return;
    }

    shadowHost = document.createElement("div");
    shadowHost.id = "o-cubo-host";
    Object.assign(shadowHost.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      zIndex: "2147483647",
      pointerEvents: "none"
    });

    shadowRoot = shadowHost.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host {
        all: initial;
      }
      .cube-overlay {
        position: fixed;
        pointer-events: none;
        border: 2px solid #00ff88;
        background: rgba(0, 255, 136, 0.08);
        box-shadow:
          0 0 16px rgba(0, 255, 136, 0.7),
          inset 0 0 12px rgba(0, 255, 136, 0.22);
        border-radius: 5px;
        transition: top 0.04s ease-out, left 0.04s ease-out, width 0.04s ease-out, height 0.04s ease-out;
        display: none;
        box-sizing: border-box;
        z-index: 2147483647;
      }
      .cube-overlay.frozen {
        border-color: #00e5ff;
        background: rgba(0, 229, 255, 0.12);
        box-shadow:
          0 0 22px rgba(0, 229, 255, 0.85),
          inset 0 0 14px rgba(0, 229, 255, 0.3);
      }
      .cube-badge {
        position: fixed;
        pointer-events: none;
        background: rgba(7, 11, 9, 0.96);
        color: #00ff88;
        border: 1px solid #00ff88;
        font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.35;
        padding: 5px 9px;
        border-radius: 6px;
        white-space: nowrap;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.85), 0 0 10px rgba(0, 255, 136, 0.45);
        display: none;
        z-index: 2147483647;
      }
      .cube-badge .breadcrumb {
        color: #7aa892;
        font-size: 10px;
        font-weight: 500;
        display: block;
        margin-bottom: 2px;
      }
      .cube-badge .target-line {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cube-pin-box {
        position: fixed;
        pointer-events: none;
        border: 2px dashed #00e5ff;
        background: rgba(0, 229, 255, 0.07);
        border-radius: 5px;
        z-index: 2147483646;
      }
      .cube-pin-label {
        position: absolute;
        top: -20px;
        left: -2px;
        background: #00e5ff;
        color: #051014;
        font-family: "JetBrains Mono", Consolas, monospace;
        font-size: 10px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
      }
      /* OVERLAY DE RECORTE DE TELA (AREA CROP) */
      .cube-area-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(4, 10, 7, 0.32);
        cursor: crosshair;
        pointer-events: auto;
        display: none;
        z-index: 2147483646;
      }
      .cube-area-selection {
        position: fixed;
        border: 2px dashed #00ff88;
        background: rgba(0, 255, 136, 0.12);
        box-shadow: 0 0 0 9999px rgba(4, 10, 7, 0.48), 0 0 20px rgba(0, 255, 136, 0.8);
        border-radius: 6px;
        pointer-events: none;
        display: none;
        z-index: 2147483647;
      }
      .cube-area-label {
        position: absolute;
        top: -26px;
        left: 0;
        background: #00ff88;
        color: #041009;
        font-family: "JetBrains Mono", Consolas, monospace;
        font-size: 11px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }
      .cube-hud {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        pointer-events: none;
        background: rgba(7, 11, 9, 0.95);
        border: 1px solid rgba(0, 255, 136, 0.7);
        color: #e6fff3;
        font-family: Inter, system-ui, -apple-system, sans-serif;
        font-size: 11px;
        padding: 7px 14px;
        border-radius: 999px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.85), 0 0 18px rgba(0, 255, 136, 0.35);
        display: none;
        align-items: center;
        gap: 10px;
        z-index: 2147483647;
        white-space: nowrap;
      }
      .cube-hud kbd {
        background: rgba(0, 255, 136, 0.16);
        border: 1px solid rgba(0, 255, 136, 0.55);
        color: #00ff88;
        border-radius: 4px;
        padding: 1px 5px;
        font-family: "JetBrains Mono", Consolas, monospace;
        font-size: 10px;
        font-weight: 700;
      }
      .cube-hud .bag-counter {
        background: #00e5ff;
        color: #041014;
        font-weight: 800;
        padding: 1px 7px;
        border-radius: 999px;
        font-size: 10px;
      }
    `;

    highlightBox = document.createElement("div");
    highlightBox.className = "cube-overlay";

    badgeEl = document.createElement("div");
    badgeEl.className = "cube-badge";

    multiSelectPinsContainer = document.createElement("div");

    areaBackdropEl = document.createElement("div");
    areaBackdropEl.className = "cube-area-backdrop";

    areaSelectionEl = document.createElement("div");
    areaSelectionEl.className = "cube-area-selection";

    areaSelectionLabelEl = document.createElement("span");
    areaSelectionLabelEl.className = "cube-area-label";
    areaSelectionEl.appendChild(areaSelectionLabelEl);

    hudBarEl = document.createElement("div");
    hudBarEl.className = "cube-hud";
    updateHudBar();

    shadowRoot.appendChild(styleEl);
    shadowRoot.appendChild(areaBackdropEl);
    shadowRoot.appendChild(areaSelectionEl);
    shadowRoot.appendChild(multiSelectPinsContainer);
    shadowRoot.appendChild(highlightBox);
    shadowRoot.appendChild(badgeEl);
    shadowRoot.appendChild(hudBarEl);
    document.documentElement.appendChild(shadowHost);
  }

  function updateHudBar() {
    if (!hudBarEl) return;
    if (isAreaSnipping) {
      hudBarEl.innerHTML = `
        <span style="color:#00ff88;font-weight:800;">✂️ MODO RECORTE DE TELA:</span>
        <span>Clique e arraste para desenhar a área que deseja capturar</span>
        <span><kbd>ESC</kbd> Cancelar</span>
      `;
      return;
    }

    const bagBadge =
      multiSelectBag.length > 0
        ? `<span class="bag-counter">Sacola: ${multiSelectBag.length} (<kbd>Enter</kbd> Concluir)</span>`
        : "";
    const freezeBadge = isHoverFrozen
      ? `<span style="color:#00e5ff;font-weight:700;">❄️ HOVER CONGELADO</span>`
      : `<span><kbd>H</kbd> Hover</span>`;

    hudBarEl.innerHTML = `
      <span><kbd>Clique</kbd> Capturar</span>
      <span><kbd>Shift+Clique</kbd> +Sacola</span>
      <span><kbd>↑</kbd>/<kbd>↓</kbd> Pai/Filho</span>
      <span><kbd>Espaço</kbd> Seção</span>
      ${freezeBadge}
      <span><kbd>P</kbd> Site Inteiro</span>
      ${bagBadge}
      <span><kbd>ESC</kbd> Sair</span>
    `;
  }

  function renderMultiSelectPins() {
    if (!multiSelectPinsContainer) return;
    multiSelectPinsContainer.innerHTML = "";
    multiSelectBag.forEach((item, index) => {
      if (!item.element || !document.body.contains(item.element)) return;
      const r = item.element.getBoundingClientRect();
      const pin = document.createElement("div");
      pin.className = "cube-pin-box";
      pin.style.top = `${r.top}px`;
      pin.style.left = `${r.left}px`;
      pin.style.width = `${r.width}px`;
      pin.style.height = `${r.height}px`;

      const lbl = document.createElement("span");
      lbl.className = "cube-pin-label";
      lbl.textContent = `#${index + 1} ${item.label}`;
      pin.appendChild(lbl);
      multiSelectPinsContainer.appendChild(pin);
    });
  }

  function formatShortTag(el) {
    if (!el || !el.tagName) return "node";
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    if (typeof el.className === "string" && el.className.trim()) {
      const firstClass = el.className.trim().split(/\s+/)[0];
      if (firstClass) return `${tag}.${firstClass}`;
    }
    return tag;
  }

  function buildBreadcrumb(el) {
    const chain = [];
    let curr = el;
    let depth = 0;
    while (curr && curr !== document.documentElement && depth < 4) {
      chain.unshift(formatShortTag(curr));
      curr = curr.parentElement;
      depth++;
    }
    return chain.join(" › ");
  }

  function formatElementLabel(el, rect) {
    const tag = el.tagName.toLowerCase();
    let classPart = "";
    if (typeof el.className === "string" && el.className.trim()) {
      const firstClasses = el.className
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join(".");
      if (firstClasses) {
        classPart = `.${firstClasses}`;
      }
    }
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    return `<${tag}${classPart}> ${w} x ${h}`;
  }

  function updateOverlay(target) {
    if (!highlightBox || !badgeEl) return;
    if (!target || target === document.documentElement) {
      highlightBox.style.display = "none";
      badgeEl.style.display = "none";
      return;
    }

    const rect = target.getBoundingClientRect();
    highlightBox.style.display = "block";
    highlightBox.classList.toggle("frozen", isHoverFrozen);
    highlightBox.style.top = `${rect.top}px`;
    highlightBox.style.left = `${rect.left}px`;
    highlightBox.style.width = `${rect.width}px`;
    highlightBox.style.height = `${rect.height}px`;

    const breadcrumbText = buildBreadcrumb(target);
    const mainLabel = formatElementLabel(target, rect);
    badgeEl.innerHTML = "";

    const breadSpan = document.createElement("span");
    breadSpan.className = "breadcrumb";
    breadSpan.textContent = isHoverFrozen
      ? `❄️ [CONGELADO] ${breadcrumbText}`
      : breadcrumbText;

    const lineSpan = document.createElement("div");
    lineSpan.className = "target-line";
    lineSpan.textContent = mainLabel;

    badgeEl.appendChild(breadSpan);
    badgeEl.appendChild(lineSpan);
    badgeEl.style.display = "block";

    const badgeTop = rect.top >= 44 ? rect.top - 42 : Math.min(window.innerHeight - 44, rect.bottom + 6);
    const badgeLeft = Math.max(8, Math.min(window.innerWidth - 260, rect.left));
    badgeEl.style.top = `${badgeTop}px`;
    badgeEl.style.left = `${badgeLeft}px`;
  }

  function hideOverlay() {
    if (highlightBox) highlightBox.style.display = "none";
    if (badgeEl) badgeEl.style.display = "none";
    if (hudBarEl) hudBarEl.style.display = "none";
    if (areaBackdropEl) areaBackdropEl.style.display = "none";
    if (areaSelectionEl) areaSelectionEl.style.display = "none";
    if (multiSelectPinsContainer) multiSelectPinsContainer.innerHTML = "";
  }

  function selectParentElement() {
    if (!hoveredElement) return false;
    const parent = hoveredElement.parentElement;
    if (parent && parent !== document.documentElement && parent !== shadowHost) {
      navigationStack.push(hoveredElement);
      hoveredElement = parent;
      updateOverlay(hoveredElement);
      return true;
    }
    return false;
  }

  function selectChildElement() {
    if (!hoveredElement) return false;
    if (navigationStack.length > 0) {
      hoveredElement = navigationStack.pop();
      updateOverlay(hoveredElement);
      return true;
    }
    const firstChild = Array.from(hoveredElement.children).find(
      (ch) => ch !== shadowHost && ch.tagName !== "SCRIPT" && ch.tagName !== "STYLE"
    );
    if (firstChild) {
      hoveredElement = firstChild;
      updateOverlay(hoveredElement);
      return true;
    }
    return false;
  }

  function selectNearestSection(el) {
    if (!el) return document.body;
    const semantic = el.closest("section, article, header, footer, nav, main, aside");
    if (semantic) return semantic;
    let curr = el;
    while (curr.parentElement && curr.parentElement !== document.body) {
      curr = curr.parentElement;
    }
    return curr;
  }

  /**
   * Eventos do Modo Recorte de Tela Livre (Area Snipper)
   */
  function onAreaMouseDown(e) {
    if (!isAreaSnipping) return;
    e.preventDefault();
    e.stopPropagation();

    dragStartPos = { x: e.clientX, y: e.clientY };
    currentCropRect = { x: e.clientX, y: e.clientY, width: 1, height: 1 };

    areaSelectionEl.style.display = "block";
    areaSelectionEl.style.left = `${e.clientX}px`;
    areaSelectionEl.style.top = `${e.clientY}px`;
    areaSelectionEl.style.width = "1px";
    areaSelectionEl.style.height = "1px";
    areaSelectionLabelEl.textContent = "0 x 0 px";
  }

  function onAreaMouseMove(e) {
    if (!isAreaSnipping || !dragStartPos) return;
    e.preventDefault();
    e.stopPropagation();

    const x = Math.min(dragStartPos.x, e.clientX);
    const y = Math.min(dragStartPos.y, e.clientY);
    const width = Math.max(4, Math.abs(e.clientX - dragStartPos.x));
    const height = Math.max(4, Math.abs(e.clientY - dragStartPos.y));

    currentCropRect = { x, y, width, height };
    areaSelectionEl.style.left = `${x}px`;
    areaSelectionEl.style.top = `${y}px`;
    areaSelectionEl.style.width = `${width}px`;
    areaSelectionEl.style.height = `${height}px`;

    const matchedNodes = findElementsInsideCropRect(currentCropRect);
    areaSelectionLabelEl.textContent = `✂️ ${Math.round(width)} x ${Math.round(height)} px (${matchedNodes.length} itens na área)`;
  }

  async function onAreaMouseUp(e) {
    if (!isAreaSnipping || !dragStartPos) return;
    e.preventDefault();
    e.stopPropagation();

    const finalRect = currentCropRect
      ? {
          x: currentCropRect.x,
          y: currentCropRect.y,
          width: Math.max(16, currentCropRect.width),
          height: Math.max(16, currentCropRect.height),
          devicePixelRatio: window.devicePixelRatio || 1,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        }
      : null;

    dragStartPos = null;
    currentCropRect = null;
    stopAreaSnipper();
    hideOverlay();

    if (!finalRect || (finalRect.width < 18 && finalRect.height < 18)) {
      return;
    }

    await sleep(60); // Esconde o overlay de recorte para o print sair limpo
    const screenshotDataUrl = await requestTabScreenshot();
    const elementsInArea = findElementsInsideCropRect(finalRect);

    const standaloneHtml = await buildStandaloneVisualHtmlDocument(elementsInArea, {
      isFullPage: false
    });

    const cleanHtml = elementsInArea
      .map(
        (el, i) =>
          `<!-- === ITEM #${i + 1} DENTRO DO RECORTE DE TELA: ${formatShortTag(el)} === -->\n${extractCleanComponent(
            el,
            { maxNodes: 250, maxChars: 14000 }
          )}`
      )
      .join("\n\n");

    const designTokens = extractPageDesignTokens();
    const mergedAssets = {
      svgs: elementsInArea.flatMap((el) => extractComponentAssets(el).svgs).slice(0, 20),
      images: elementsInArea.flatMap((el) => extractComponentAssets(el).images).slice(0, 20),
      fonts: designTokens.fonts
    };

    const payload = {
      captureMode: "area-crop",
      capturedAt: Date.now(),
      pageUrl: window.location.href,
      pageTitle: document.title,
      elementLabel: `✂️ Recorte ${Math.round(finalRect.width)}x${Math.round(finalRect.height)} (${elementsInArea.length} itens)`,
      rect: finalRect,
      sectionsCount: elementsInArea.length,
      designTokens,
      assets: mergedAssets,
      standaloneHtml,
      cleanHtml,
      screenshotDataUrl
    };

    safeSendMessage({
      type: "COMPONENT_CAPTURED",
      payload
    });

    window.dispatchEvent(new CustomEvent("o-cubo-captured", { detail: payload }));
  }

  function startAreaSnipper() {
    stopInspection();
    ensureShadowInspector();
    isAreaSnipping = true;
    dragStartPos = null;
    currentCropRect = null;
    areaBackdropEl.style.display = "block";
    updateHudBar();
    if (hudBarEl) hudBarEl.style.display = "flex";

    window.addEventListener("mousedown", onAreaMouseDown, true);
    window.addEventListener("mousemove", onAreaMouseMove, true);
    window.addEventListener("mouseup", onAreaMouseUp, true);
    window.addEventListener("keydown", onKeyDown, true);
  }

  function stopAreaSnipper() {
    isAreaSnipping = false;
    dragStartPos = null;
    currentCropRect = null;
    hideOverlay();
    window.removeEventListener("mousedown", onAreaMouseDown, true);
    window.removeEventListener("mousemove", onAreaMouseMove, true);
    window.removeEventListener("mouseup", onAreaMouseUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
  }

  function captureSingleElement(target) {
    if (!target || target === shadowHost) return;

    const rect = target.getBoundingClientRect();
    const rectData = {
      x: Math.max(0, rect.left),
      y: Math.max(0, rect.top),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      devicePixelRatio: window.devicePixelRatio || 1,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };

    const elementLabel = formatElementLabel(target, rect);
    const breadcrumb = buildBreadcrumb(target);

    const cleanHtml = extractCleanComponent(target, { maxNodes: 400, maxChars: 35000 });
    const designTokens = extractPageDesignTokens();
    const assets = extractComponentAssets(target);

    stopInspection();
    hideOverlay();

    setTimeout(async () => {
      const screenshotDataUrl = await requestTabScreenshot();
      const standaloneHtml = await buildStandaloneVisualHtmlDocument(target, {
        isFullPage: false
      });

      const payload = {
        captureMode: "element",
        capturedAt: Date.now(),
        pageUrl: window.location.href,
        pageTitle: document.title,
        elementLabel,
        breadcrumb,
        rect: rectData,
        designTokens,
        assets,
        standaloneHtml,
        cleanHtml,
        screenshotDataUrl
      };

      safeSendMessage({
        type: "COMPONENT_CAPTURED",
        payload
      });

      window.dispatchEvent(new CustomEvent("o-cubo-captured", { detail: payload }));
    }, 50);
  }

  function onMouseMove(e) {
    if (!isInspecting || isHoverFrozen) return;
    const target = e.target;
    if (!target || target === shadowHost) return;
    if (target !== hoveredElement) {
      navigationStack = [];
      hoveredElement = target;
      updateOverlay(target);
    }
  }

  function onWheel(e) {
    if (!isInspecting) return;
    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        selectParentElement();
      } else if (e.deltaY > 0) {
        selectChildElement();
      }
    }
  }

  function onKeyDown(e) {
    if (!isInspecting && !isAreaSnipping) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      multiSelectBag = [];
      stopInspection();
      stopAreaSnipper();
      safeSendMessage({ type: "INSPECTION_CANCELLED" });
      return;
    }

    if (isAreaSnipping) return;

    if (e.key === "ArrowUp" || e.key === "[") {
      e.preventDefault();
      e.stopPropagation();
      selectParentElement();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "]") {
      e.preventDefault();
      e.stopPropagation();
      selectChildElement();
      return;
    }

    if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (hoveredElement) {
        const sec = selectNearestSection(hoveredElement);
        if (sec && sec !== hoveredElement) {
          navigationStack.push(hoveredElement);
          hoveredElement = sec;
          updateOverlay(hoveredElement);
        }
      }
      return;
    }

    if (e.key === "h" || e.key === "H" || e.key === "f" || e.key === "F") {
      e.preventDefault();
      e.stopPropagation();
      isHoverFrozen = !isHoverFrozen;
      updateHudBar();
      if (hoveredElement) updateOverlay(hoveredElement);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (multiSelectBag.length > 0) {
        finalizeMultiSelectBag();
      } else if (hoveredElement) {
        captureSingleElement(hoveredElement);
      }
      return;
    }

    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      e.stopPropagation();
      captureFullSite();
    }
  }

  function onClick(e) {
    if (!isInspecting) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = hoveredElement || e.target;
    if (!target || target === shadowHost) return;

    if (e.shiftKey) {
      addElementToMultiSelectBag(target);
      return;
    }

    if (multiSelectBag.length > 0) {
      addElementToMultiSelectBag(target);
      finalizeMultiSelectBag();
      return;
    }

    captureSingleElement(target);
  }

  function startInspection() {
    stopAreaSnipper();
    ensureShadowInspector();
    isInspecting = true;
    isHoverFrozen = false;
    navigationStack = [];
    document.documentElement.style.cursor = "crosshair";
    updateHudBar();
    if (hudBarEl) hudBarEl.style.display = "flex";
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown, true);
  }

  function stopInspection() {
    isInspecting = false;
    isHoverFrozen = false;
    hoveredElement = null;
    navigationStack = [];
    document.documentElement.style.cursor = "";
    hideOverlay();
    window.removeEventListener("mousemove", onMouseMove, true);
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !message.type) return false;

      if (message.type === "TOGGLE_INSPECTOR") {
        if (typeof message.active === "boolean") {
          if (message.active) startInspection();
          else stopInspection();
        } else {
          if (isInspecting) stopInspection();
          else startInspection();
        }
        sendResponse({ inspecting: isInspecting });
        return false;
      }

      if (message.type === "START_AREA_SNIPPER") {
        if (isAreaSnipping) {
          stopAreaSnipper();
        } else {
          startAreaSnipper();
        }
        sendResponse({ snipping: isAreaSnipping });
        return false;
      }

      if (message.type === "DISCOVER_INTERNAL_LINKS") {
        const links = discoverInternalLinks();
        sendResponse({ ok: true, links });
        return false;
      }

      if (message.type === "CRAWL_MULTI_PAGE_SITE") {
        crawlAndCloneMultiPageSite(message.urls, message.maxPages || 6).then((payload) => {
          sendResponse({ ok: true, pagesCount: payload?.pagesCount || 1 });
        });
        return true;
      }

      if (message.type === "CAPTURE_FULL_SITE") {
        captureFullSite().then((payload) => {
          sendResponse({ ok: true, sectionsCount: payload?.sectionsCount || 1 });
        });
        return true;
      }

      if (message.type === "FINALIZE_MULTI_SELECT") {
        finalizeMultiSelectBag().then((payload) => {
          sendResponse({ ok: Boolean(payload) });
        });
        return true;
      }

      if (message.type === "GET_INSPECTOR_STATUS") {
        sendResponse({
          inspecting: isInspecting,
          snipping: isAreaSnipping,
          bagCount: multiSelectBag.length
        });
        return false;
      }

      return false;
    });
  }

  window.__oCuboDebug = {
    extractCleanComponent,
    buildStandaloneVisualHtmlDocument,
    discoverInternalLinks,
    crawlAndCloneMultiPageSite,
    findElementsInsideCropRect,
    extractPageDesignTokens,
    extractComponentAssets,
    captureFullSite,
    startAreaSnipper,
    stopAreaSnipper,
    addElementToMultiSelectBag,
    finalizeMultiSelectBag,
    startInspection,
    stopInspection,
    selectParentElement,
    selectChildElement
  };
})();
