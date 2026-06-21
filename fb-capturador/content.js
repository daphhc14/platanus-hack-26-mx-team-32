/**
 * Hilo Capturador — Content Script
 * ==================================
 * Se inyecta en facebook.com/groups/* y captura posts pasivamente.
 *
 * - MutationObserver detecta nuevos posts (scroll infinito)
 * - Extrae texto, autor (hasheado), timestamp, permalink
 * - Redacta PII inmediatamente
 * - Clasifica: ¿fosa? ¿desaparición? ¿dónde?
 * - Guarda en browser.storage.local
 * - Muestra badge visual en posts capturados
 */
(function () {
  "use strict";

  // Evitar doble-inyección
  if (window.__HILO_CAPTURE_ACTIVE__) return;
  window.__HILO_CAPTURE_ACTIVE__ = true;

  console.log("[Hilo] Capturador activo en:", window.location.href);

  // ═══ Configuración ═══
  const CONFIG = {
    minPostLength: 30,
    maxPostsPerGroup: 5000,
    dedupeKeyLength: 120,
    scrollDelayMs: 800,
    badgeColor: "#d32f2f",
    badgeText: "HILO",
  };

  let captureEnabled = true;
  let capturedCount = 0;
  let stats = { total: 0, fosa: 0, desap: 0, ubi: 0 };

  // ═══ Cargar preferencia de captura ═══
  browser.storage.local.get("hilo_settings").then((data) => {
    const settings = data.hilo_settings || {};
    if (settings.autoCapture === false) {
      captureEnabled = false;
      console.log("[Hilo] Auto-capture deshabilitado por configuración");
    }
    if (settings.stats) stats = settings.stats;
    console.log("[Hilo] Stats cargados:", stats);
  });

  // ═══ Escuchar cambios de configuración ═══
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle_capture") {
      captureEnabled = msg.enabled;
      console.log("[Hilo] Capture:", captureEnabled ? "ON" : "OFF");
    }
    if (msg.type === "capture_now") {
      captureVisiblePosts();
    }
    if (msg.type === "clear_group") {
      clearCurrentGroup();
    }
  });

  // ═══ Obtener ID del grupo de la URL ═══
  function getGroupId() {
    const match = window.location.pathname.match(/\/groups\/([^/?]+)/);
    return match?.[1] ?? "unknown";
  }

  function getGroupName() {
    // El nombre del grupo está en el heading principal
    const heading = document.querySelector(
      'h1 a, [role="heading"] a, h1, [data-pagelet="GroupHeader"] a'
    );
    return heading?.textContent?.trim() ?? getGroupId();
  }

  // ═══ Extraer posts del DOM ═══
  function extractPostsFromDOM() {
    const articles = document.querySelectorAll('[role="article"]');
    const posts = [];

    for (const article of articles) {
      // Texto del post
      const textEl =
        article.querySelector(
          '[data-ad-preview="message"] [dir="auto"], [data-ad-cometpreview="message"] [dir="auto"]'
        ) ||
        article.querySelector(
          'div[dir="auto"] > div[dir="auto"]'
        ) ||
        article.querySelector('div[dir="auto"]');

      if (!textEl) continue;

      // Concatenar todo el texto del contenido del post
      const text = getFullPostText(article);
      if (!text || text.length < CONFIG.minPostLength) continue;

      // Timestamp
      const timeEl = article.querySelector("abbr, time, a[href*='permalink'] span");
      const timestamp =
        timeEl?.getAttribute("title") ||
        timeEl?.getAttribute("datetime") ||
        timeEl?.textContent?.trim() ||
        null;

      // Permalink
      const permalinkEl = article.querySelector(
        "a[href*='permalink'], a[href*='/posts/'], a[aria-label*='historia'], a[aria-label*='story']"
      );
      let permalink = permalinkEl?.href;
      // Limpiar tracking params del permalink
      if (permalink) {
        try {
          const url = new URL(permalink);
          permalink = url.origin + url.pathname;
        } catch {}
      }

      // Author (hash, no nombre crudo)
      const authorEl = article.querySelector(
        'h2 a, h3 a, a[role="link"] span, [data-sigil="feedStoryTitle"] a'
      );
      const authorName = authorEl?.textContent?.trim();
      const authorHash = authorName ? simpleHash(authorName) : null;

      // Post ID único (permalink o hash del texto)
      const postId = permalink || simpleHash(text.slice(0, 200) + getGroupId());

      posts.push({
        post_id: postId,
        group_id: getGroupId(),
        group_name: getGroupName(),
        author_hash: authorHash,
        timestamp_raw: timestamp,
        permalink: permalink,
        captured_at: new Date().toISOString(),
        captured_url: window.location.href.split("?")[0],
        raw_text: text, // Se procesa abajo
      });
    }

    return posts;
  }

  // ═══ Extraer todo el texto de un post (incluye "ver más") ═══
  function getFullPostText(article) {
    // Facebook a veces corta el texto con "Ver más"
    // Intentar obtener todos los elementos de texto del post
    const textParts = [];

    // Selectores comunes para el contenido del post
    const selectors = [
      '[data-ad-preview="message"]',
      '[data-ad-cometpreview="message"]',
      '[data-sigil="message"]',
      'div[dir="auto"] > div[dir="auto"]',
      '[data-testid="post_message"]',
      'div[user-content]',
      'div[data-sigil="message-text"]',
    ];

    for (const sel of selectors) {
      const els = article.querySelectorAll(sel);
      if (els.length > 0) {
        for (const el of els) {
          const text = el.textContent?.trim();
          if (text && text.length > 10 && !textParts.includes(text)) {
            textParts.push(text);
          }
        }
        break; // Usar el primer selector que funcione
      }
    }

    // Fallback: texto completo del artículo
    if (textParts.length === 0) {
      // Intentar obtener solo el texto del cuerpo del post, no los comentarios
      const bodyEl =
        article.querySelector('[data-testid="post_message"]') ||
        article.querySelector('[role="paragraph"]') ||
        article.querySelector("div[dir='auto']");
      const text = bodyEl?.textContent?.trim();
      if (text && text.length > 10) return text;
    }

    // Unir partes, eliminar duplicados
    const unique = [...new Set(textParts)];
    return unique.join(" \n ").trim();
  }

  // ═══ Hash simple (no criptográfico, solo para dedupe) ═══
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return "h_" + Math.abs(hash).toString(36);
  }

  // ═══ Procesar y guardar un post ═══
  async function processAndSave(post) {
    // Procesar con el detector (redacta PII + clasifica + extrae geo)
    const processed = window.HiloDetector.processPost(post.raw_text);

    // No guardar el texto crudo — solo el redactado
    delete post.raw_text;

    const fullPost = {
      ...post,
      ...processed,
      schema: "hilo.fb_post.v1",
    };

    // Guardar en storage
    const key = `hilo_post:${post.post_id}`;
    const existing = await browser.storage.local.get(key);
    if (existing[key]) return false; // Ya capturado

    await browser.storage.local.set({ [key]: fullPost });

    // Actualizar stats
    stats.total++;
    if (processed.fosa_signals.length > 0) stats.fosa++;
    if (processed.desap_signals.length > 0) stats.desap++;
    if (processed.ubi_signals.length > 0) stats.ubi++;
    await browser.storage.local.set({ hilo_settings: { stats, autoCapture: captureEnabled } });

    // Badge visual en el post
    addBadge(fullPost);

    // Notificar al background
    browser.runtime.sendMessage({
      type: "post_captured",
      event_type: fullPost.event_type,
      estado: fullPost.estado,
    });

    return true;
  }

  // ═══ Badge visual en posts capturados ═══
  function addBadge(post) {
    if (!post.event_type || post.event_type === "otro") return;

    // Buscar el artículo correspondiente
    const articles = document.querySelectorAll('[role="article"]');
    for (const article of articles) {
      const permalinkEl = article.querySelector(
        "a[href*='permalink'], a[href*='/posts/']"
      );
      if (permalinkEl?.href === post.permalink || article.textContent.includes(post.text_redacted?.slice(0, 50))) {
        if (article.querySelector(".hilo-badge")) continue;

        const badge = document.createElement("div");
        badge.className = "hilo-badge";
        const color =
          post.event_type === "posible_fosa"
            ? "#b71c1c"
            : post.event_type === "punto_desaparicion"
              ? "#e65100"
              : "#455a64";
        badge.style.cssText = `
          display: inline-block;
          padding: 2px 8px;
          margin: 4px 0;
          border-radius: 4px;
          background: ${color};
          color: white;
          font-size: 11px;
          font-weight: 600;
          font-family: sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        `;
        badge.textContent = `HILO: ${post.event_type} (${Math.round(post.confidence * 100)}%)`;
        if (post.estado) badge.textContent += ` · ${post.estado}`;

        article.prepend(badge);
        break;
      }
    }
  }

  // ═══ Capturar posts visibles ═══
  async function captureVisiblePosts() {
    if (!captureEnabled) {
      console.log("[Hilo] Capture deshabilitado");
      return;
    }

    const posts = extractPostsFromDOM();
    let newCount = 0;

    for (const post of posts) {
      const saved = await processAndSave(post);
      if (saved) newCount++;
    }

    if (newCount > 0) {
      console.log(`[Hilo] ${newCount} nuevos posts capturados (total grupo: ${posts.length} visibles)`);
      capturedCount += newCount;
    }
  }

  async function clearCurrentGroup() {
    const gid = getGroupId();
    const all = await browser.storage.local.get();
    let removed = 0;
    for (const key of Object.keys(all)) {
      if (key.startsWith("hilo_post:") && all[key].group_id === gid) {
        await browser.storage.local.remove(key);
        removed++;
      }
    }
    console.log(`[Hilo] ${removed} posts eliminados del grupo ${gid}`);
  }

  // ═══ MutationObserver para detectar nuevos posts ═══
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    if (!captureEnabled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(captureVisiblePosts, CONFIG.scrollDelayMs);
  });

  // Observar el feed
  function startObserving() {
    const feed = document.querySelector('[role="feed"], [data-pagelet="GroupFeed"], #m_group_stories_container, div[data-sigil="marea"]');
    if (feed) {
      observer.observe(feed, { childList: true, subtree: true });
      console.log("[Hilo] Observando feed");
    } else {
      // Reintentar en 2 segundos si el feed aún no carga
      setTimeout(startObserving, 2000);
    }
  }

  // También observar cambios en el body para detectar navegación entre grupos
  const bodyObserver = new MutationObserver(() => {
    if (!captureEnabled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(captureVisiblePosts, CONFIG.scrollDelayMs);
  });

  // ═══ Inicializar ═══
  function init() {
    console.log("[Hilo] Iniciando capturador para grupo:", getGroupId());

    // Captura inicial
    setTimeout(captureVisiblePosts, 2000);

    // Observar cambios
    startObserving();
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Captura periódica de respaldo (cada 30 segundos)
    setInterval(captureVisiblePosts, 30000);
  }

  // Esperar a que la página cargue
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", () => setTimeout(init, 1000));
  }

  // Re-inicializar en navegación SPA
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (window.location.href.includes("/groups/")) {
        console.log("[Hilo] Navegación a nuevo grupo detectada");
        setTimeout(captureVisiblePosts, 3000);
      }
    }
  }, 2000);
})();
