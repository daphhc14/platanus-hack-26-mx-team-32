// lib/acquisition/providers/mock-cnb.ts
// Local-only realistic mock of an official CNB-style source for the discovery
// loop validation. All content is clearly marked [DEMO] and uses synthetic
// aggregate numbers (no individual cases, no PII). Destroy before any real
// demo to external audiences.

import { MockAcquisitionProvider } from "./mock.js";

const PAGES: Record<string, { title?: string; markdown: string }> = {
  "https://cncb-demo.test/registro/2026-q2-estatal": {
    title: "[DEMO] Informe trimestral RNPDNO — cifras estatales Q2 2026",
    markdown: [
      "[DEMO] Informe agregado trimestral. Cifras sinteticas, no corresponden a personas reales.",
      "",
      "La Comision Nacional de Busqueda publica agregados estatales de personas desaparecidas y no localizadas.",
      "",
      "## Cifras por entidad federativa (Q2 2026)",
      "",
      "| Estado | Desaparecidas | No localizadas | Localizadas |",
      "|---|---:|---:|---:|",
      "| Jalisco | 142 | 88 | 38 |",
      "| Nuevo Leon | 121 | 73 | 31 |",
      "| Tamaulipas | 98 | 64 | 22 |",
      "| Sinaloa | 87 | 51 | 19 |",
      "| Estado de Mexico | 76 | 92 | 24 |",
      "",
      "No se exponen fichas individuales ni datos que permitan reidentificar un caso.",
    ].join("\n"),
  },
  "https://cncb-demo.test/alerta/jalisco-sur": {
    title: "[DEMO] Alerta regional — zona sur de Jalisco",
    markdown: [
      "[DEMO] Comunicado regional. Sintetico.",
      "",
      "La Comision Estatal de Busqueda reporta incremento de senales de riesgo laboral en la zona sur de Jalisco.",
      "Patrones de ofertas de empleo con caracteristicas de reclutamiento fraudulento en Ciudad Guzman y Sayula.",
      "Se recomienda precaucion con vacantes que solicitan traslado inmediato, pago por adelantado o contacto exclusivo por WhatsApp.",
    ].join("\n"),
  },
  "https://cncb-demo.test/aviso/empleo-guadalajara": {
    title: "[DEMO] Aviso — oferta de empleo reportada en Guadalajara",
    markdown: [
      "[DEMO] Reporte contextual. Sintetico.",
      "",
      "Se ha difundido en espacios publicos la siguiente oferta de empleo:",
      "Vacante de guardia de seguridad. Contratacion inmediata, sin experiencia. Sueldo $18000 semanal.",
      "Traslado en Uber a entrevista en central de autobuses. Contacto por WhatsApp.",
      "La oferta presenta multiples senales de reclutamiento fraudulento. No compartir datos personales.",
    ].join("\n"),
  },
  "https://cncb-demo.test/quienes-somos": {
    title: "[DEMO] Quienes somos",
    markdown: [
      "[DEMO] Pagina institucional.",
      "",
      "La Comision Nacional de Busqueda coordina la politica nacional de busqueda de personas desaparecidas.",
      "Documento descriptivo sin cifras ni eventos contextuales.",
    ].join("\n"),
  },
};

export function createMockCNBProvider(): MockAcquisitionProvider {
  return new MockAcquisitionProvider(PAGES);
}
