/**
 * Hilo Capturador — Background Script
 * Maneja storage, exportación y notificaciones.
 */
(function () {
  "use strict";

  // Notificación cuando se detecta algo de alto valor
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "post_captured") {
      if (msg.event_type === "posible_fosa") {
        browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon-48.png"),
          title: "HILO — Posible fosa detectada",
          message: msg.estado
            ? `Post con señales de fosa en ${msg.estado}`
            : "Post con señales de fosa detectado",
        });
      }
    }
  });

  // Descargar JSON exportado
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "download_export") {
      const json = JSON.stringify(msg.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const reader = new FileReader();
      reader.onload = () => {
        browser.downloads
          .download({
            url: reader.result,
            filename: msg.filename,
            saveAs: true,
          })
          .catch((err) => console.error("[Hilo] Download error:", err));
      };
      reader.readAsDataURL(blob);
    }
  });

  console.log("[Hilo] Background script listo");
})();
