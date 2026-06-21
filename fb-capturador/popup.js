/**
 * Hilo Capturador — Popup logic
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Cargar stats
  const data = await browser.storage.local.get(["hilo_settings"]);
  const settings = data.hilo_settings || {};
  const stats = settings.stats || { total: 0, fosa: 0, desap: 0, ubi: 0 };

  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statFosa").textContent = stats.fosa;
  document.getElementById("statDesap").textContent = stats.desap;
  document.getElementById("statUbi").textContent = stats.ubi;

  // Grupo actual
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.url?.includes("/groups/")) {
    const match = tabs[0].url.match(/\/groups\/([^/?]+)/);
    document.getElementById("currentGroup").textContent = "Grupo: " + (match?.[1] ?? "?");
  } else {
    document.getElementById("currentGroup").textContent = "⚠ Navega a un grupo de Facebook";
  }

  // Auto-capture toggle
  const autoCheckbox = document.getElementById("autoCapture");
  autoCheckbox.checked = settings.autoCapture !== false;
  autoCheckbox.addEventListener("change", async () => {
    const newData = { ...settings, autoCapture: autoCheckbox.checked };
    await browser.storage.local.set({ hilo_settings: newData });

    // Notificar al content script
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      browser.tabs.sendMessage(tabs[0].id, {
        type: "toggle_capture",
        enabled: autoCheckbox.checked,
      });
    }
  });

  // Export JSON
  document.getElementById("exportBtn").addEventListener("click", exportJson);

  // Export CSV (solo ubicaciones)
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);

  // Clear
  document.getElementById("clearBtn").addEventListener("click", clearAll);
});

async function getAllPosts() {
  const all = await browser.storage.local.get();
  const posts = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("hilo_post:")) {
      posts.push(value);
    }
  }
  return posts;
}

async function exportJson() {
  const posts = await getAllPosts();
  if (posts.length === 0) {
    alert("No hay posts capturados todavía.");
    return;
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    export_schema: "hilo.fb_export.v1",
    total_posts: posts.length,
    stats: {
      posibles_fosas: posts.filter((p) => p.event_type === "posible_fosa").length,
      puntos_desaparicion: posts.filter((p) => p.event_type === "punto_desaparicion").length,
      con_estado: posts.filter((p) => p.estado).length,
      con_municipio: posts.filter((p) => p.municipio).length,
    },
    groups: [...new Set(posts.map((p) => p.group_id))],
    posts: posts,
  };

  const filename = `hilo-captura-${new Date().toISOString().slice(0, 10)}.json`;
  browser.runtime.sendMessage({
    type: "download_export",
    data: exportData,
    filename: filename,
  });
}

async function exportCsv() {
  const posts = await getAllPosts();
  if (posts.length === 0) {
    alert("No hay posts capturados todavía.");
    return;
  }

  // Solo posts con señales de fosa o desaparición Y ubicación
  const relevant = posts.filter(
    (p) =>
      (p.event_type === "posible_fosa" || p.event_type === "punto_desaparicion") &&
      (p.estado || p.municipio || p.locality_approx)
  );

  if (relevant.length === 0) {
    alert("No hay posts con señales + ubicación todavía.");
    return;
  }

  const headers = [
    "event_type",
    "estado",
    "municipio",
    "locality_approx",
    "confidence",
    "fosa_signals",
    "desap_signals",
    "ubi_signals",
    "timestamp_raw",
    "group_name",
    "permalink",
    "text_redacted",
  ];

  const rows = relevant.map((p) =>
    headers
      .map((h) => {
        let val = p[h];
        if (Array.isArray(val)) val = val.join(";");
        if (typeof val === "string") {
          val = val.replace(/"/g, '""');
          val = `"${val}"`;
        }
        return val ?? "";
      })
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  const filename = `hilo-ubicaciones-${new Date().toISOString().slice(0, 10)}.csv`;
  browser.runtime.sendMessage({
    type: "download_export",
    data: csv,
    filename: filename,
  });
}

async function clearAll() {
  if (!confirm("¿Borrar TODOS los posts capturados? Esto no se puede deshacer.")) return;

  const all = await browser.storage.local.get();
  const keys = Object.keys(all).filter((k) => k.startsWith("hilo_post:") || k === "hilo_settings");
  await browser.storage.local.remove(keys);

  // Reset stats
  await browser.storage.local.set({
    hilo_settings: { stats: { total: 0, fosa: 0, desap: 0, ubi: 0 }, autoCapture: true },
  });

  document.getElementById("statTotal").textContent = "0";
  document.getElementById("statFosa").textContent = "0";
  document.getElementById("statDesap").textContent = "0";
  document.getElementById("statUbi").textContent = "0";
}
