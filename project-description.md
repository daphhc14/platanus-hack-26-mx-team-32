# Hilo

**La capa conectiva que la ley mandatizó en 2017 y el Estado no hizo funcionar.**

En México hay más de **84,000 personas desaparecidas** y miles de cuerpos no identificados. Los datos viven en silos incompatibles: un Excel de la fiscalía, un WhatsApp del colectivo, una ficha escaneada del SEMEFO. El **Banco Nacional de Datos Forenses (BNDF)** fue creado por ley para conectarlos — y nunca operó.

Hilo demuestra que esa capa funciona, de forma **segura y digna**.

## ¿Qué hace?

Un motor de **record-linkage forense** que cruza:

- **Fichas de búsqueda** (personas desaparecidas, con sus señas)
- **Cuerpos no identificados** (con sus descripciones post-mortem)

…usando **señas particulares** (tatuajes, cicatrices, lunares, estatura) normalizadas al vocabulario del BNDF.

### Por qué es difícil (y por qué nada más lo resuelve)

> "ancla brazo der." (SEMEOF)  ≡  "tatuaje de áncora en antebrazo derecho" (ficha)

Esa equivalencia semántica — entre el léxico burocrático de la morgue y el lenguaje de una familia desesperada — es justo lo que ningún sistema actual resuelve. Hilo sí.

## Cómo funciona (Dual-Plane Verifier)

```
FICHAS + CUERPOS ─▶ INGEST ─▶ BLOCK ─▶ SCORE ─▶ VERIFY ─▶ REVISIÓN HUMANA
                  normaliza    filtra    por campo   evidencia    ⚠ nunca concluye
                  a BNDF                  + lateralidad  + tier
                                                              │
                                                  AUDIT LOG (append-only)
```

- **Block**: corta pares obvios (sexo incompatible, edad no solapada, regla temporal dura: desaparición ≤ hallazgo).
- **Score**: scoring por campo. **La lateralidad es un DISQUALIFIER** — izquierda vs derecha tapa el match sin importar el resto. Así evitamos auto-vinculación errónea.
- **Verify**: segundo plano **separado**. Recibe el par ya puntuado y escribe evidencia + contradicciones + tier. **Ranquea para una revisora humana; nunca declara match.**
- **Revisión humana**: la ÚNICA vía a `confirmed`. Notifica a una **lista cerrada** — nunca a familia ni público.

## Ética (requisitos, no lineamientos)

1. **Individuos sintéticos.** Lo que el matcher cruza es 100% sintético, pero **calibrado por el RNPDNO real**. Nunca PII de víctimas reales.
2. **Datos reales, pero solo agregados.** Contexto visible (conteos, fosas, tendencias) viene de fuentes públicas: RNPDNO (CC0) y mapa de fosas clandestinas (Quinto Elemento Lab / CNB).
3. **El sistema NUNCA concluye un match.** Solo propone candidatos con evidencia.
4. **Coordenadas protegidas por rol (RBAC).** Una sesión `readonly` **estructuralmente no puede** leer `secure_locations`.
5. **Banner "DATOS SINTÉTICOS — DEMO"** siempre visible.

## Demo (el "wow")

1. Cae un cuerpo nuevo en vivo (ancla, antebrazo derecho, Jalisco).
2. Hilo surfacea un **candidato ranqueado** con panel side-by-side: señas ✓ · estatura ✓ · temporal coherente ✓.
3. Un **near-miss se rechaza** por contradicción de lateralidad — claramente no auto-vincula.
4. La revisora confirma → audit + notificación a enlace (lista cerrada).
5. Cambias a `readonly` → **no puede leer ni una coordenada** de fosas.
6. Verificación contra answer-key: **10/10 true matches surfaced, 3/3 near-misses rechazados.**

## Stack

- TypeScript + SQLite (better-sqlite3)
- LLM provider-agnostic (OpenAI-compatible: Anthropic / OpenAI / MiniMax / DeepSeek / Qwen / Moonshot) — **fallback determinístico si no hay key**
- Datos generados por `scripts/prep_data.py` desde fuentes públicas

## Track

**Platanus Hack 26 · Track Legacy.** Lo que faltaba no era el algoritmo: era la capa conectiva. Hilo la demuestra, de forma segura.

> Ver arquitectura técnica completa y pitch para jueces en el `README.md`.
