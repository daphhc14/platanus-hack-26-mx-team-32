// app/server.js — Hilo reviewer UI. Single-file Node server (no build step).
// Runs the pipeline on startup, then serves a reviewer interface with:
//  - side-by-side evidence panel per candidate
//  - REAL clandestine-graves map (Leaflet)
//  - role toggle demonstrating the RBAC safety property (readonly denied)
// Run: node app/server.js  -> http://localhost:3000

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { block } from "../lib/match/block.js";
import { scorePair } from "../lib/match/score.js";
import { verify } from "../lib/match/verify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB_PATH = join(ROOT, "hilo.db");
const GEN = join(ROOT, "data", "generated");
const PORT = process.env.PORT || 3000;

if (!existsSync(DB_PATH)) {
  console.error("Run `npm run seed` first (no hilo.db found).");
  process.exit(1);
}

// ---- pipeline: populate candidate_matches on startup ----
function runPipeline() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  for (const t of ["reviews", "candidate_matches"]) db.prepare(`DELETE FROM ${t}`).run();
  const records = db.prepare("SELECT * FROM records").all().map(normalizeRecord);
  const allFeats = db.prepare("SELECT * FROM features").all().map(f => ({ ...f, tokens: f.tokens ? JSON.parse(f.tokens) : [] }));
  const pairs = block(records);
  const scored = pairs.map(p => scorePair(p, allFeats, allFeats)).sort((a, b) => b.overall_score - a.overall_score);
  const top = scored.slice(0, 12);
  for (const p of top) {
    const mFeats = allFeats.filter(f => f.record_id === p.missing.id);
    const uFeats = allFeats.filter(f => f.record_id === p.unidentified.id);
    // synchronous deterministic verify (no key path)
    const v = detVerify(p);
    db.prepare(`INSERT OR REPLACE INTO candidate_matches
      (id,missing_record_id,unidentified_record_id,overall_score,field_scores,verifier_evidence,verifier_contradictions,verifier_tier,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      randomUUID(), p.missing.id, p.unidentified.id, p.overall_score, JSON.stringify(p.field_scores),
      v.evidence, v.contradictions, v.tier, "in_review");
  }
  console.log(`[pipeline] ${top.length} candidates in review queue (of ${pairs.length} blocked pairs)`);
  db.close();
}

function detVerify(p) {
  const hard = p.contradictions.some(c => /lateralidad|temporal.*ANTES|edad incompatible/i.test(c));
  const tier = hard ? "baja" : p.overall_score >= 0.75 ? "alta" : p.overall_score >= 0.5 ? "media" : "baja";
  return { evidence: p.evidences.join(". ") || "Coincidencia parcial.", contradictions: p.contradictions.join(". ") || "Sin contradicciones duras.", tier };
}
function normalizeRecord(r) { return { ...r, pii_minimized: !!r.pii_minimized, synthetic: !!r.synthetic }; }

runPipeline();

// ---- HTTP server ----
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const role = url.searchParams.get("role") || "reviewer";

  if (url.pathname === "/" ) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html()); return; }

  if (url.pathname === "/api/state") { res.writeHead(200, jsonH()); res.end(JSON.stringify(state(role))); return; }
  if (url.pathname === "/api/fosas") {
    if (!canReadSecure(role)) { res.writeHead(403, jsonH()); res.end(JSON.stringify({ error: "DENIED", message: `role '${role}' cannot read secure_locations` })); return; }
    res.writeHead(200, jsonH()); res.end(readFileSync(join(GEN, "fosas.geojson"))); return;
  }
  if (url.pathname === "/api/confirm" && req.method === "POST") {
    const id = url.searchParams.get("id"); const reviewer = url.searchParams.get("reviewer") || "reviewer-luna";
    const db = new Database(DB_PATH);
    const u = db.prepare("SELECT id FROM app_users WHERE pseudonym=?").get(reviewer);
    db.prepare("INSERT INTO reviews (id,match_id,reviewer_id,decision) VALUES (?,?,?,?)").run(randomUUID(), id, u.id, "confirmed");
    db.prepare("UPDATE candidate_matches SET status='confirmed' WHERE id=?").run(id);
    db.prepare("INSERT INTO audit_log (actor,action,entity) VALUES (?,?,?)").run(role, "review_confirmed", id);
    db.close(); res.writeHead(200, jsonH()); res.end(JSON.stringify({ ok: true })); return;
  }
  if (url.pathname === "/api/reject" && req.method === "POST") {
    const id = url.searchParams.get("id");
    const db = new Database(DB_PATH);
    db.prepare("UPDATE candidate_matches SET status='rejected' WHERE id=?").run(id);
    db.prepare("INSERT INTO audit_log (actor,action,entity) VALUES (?,?,?)").run(role, "review_rejected", id);
    db.close(); res.writeHead(200, jsonH()); res.end(JSON.stringify({ ok: true })); return;
  }
  res.writeHead(404); res.end("not found");
});

function canReadSecure(role) { return role === "reviewer" || role === "liaison" || role === "admin"; }
function jsonH() { return { "content-type": "application/json; charset=utf-8" }; }

function state(role) {
  const db = new Database(DB_PATH);
  const matches = db.prepare("SELECT * FROM candidate_matches WHERE status='in_review' ORDER BY overall_score DESC").all().map(m => {
    const miss = db.prepare("SELECT * FROM records WHERE id=?").get(m.missing_record_id);
    const unk = db.prepare("SELECT * FROM records WHERE id=?").get(m.unidentified_record_id);
    const mf = db.prepare("SELECT description_raw,feature_type,body_region,laterality FROM features WHERE record_id=?").all(m.missing_record_id);
    const uf = db.prepare("SELECT description_raw,feature_type,body_region,laterality FROM features WHERE record_id=?").all(m.unidentified_record_id);
    return { ...m, field_scores: JSON.parse(m.field_scores), missing: normalizeRecord(miss), unidentified: normalizeRecord(unk), missingFeatures: mf, unidentifiedFeatures: uf };
  });
  const ctx = JSON.parse(readFileSync(join(GEN, "context_national.json"), "utf-8"));
  const confirmed = db.prepare("SELECT COUNT(*) c FROM candidate_matches WHERE status='confirmed'").get().c;
  db.close();
  return { role, canReadSecure: canReadSecure(role), matches, context: ctx, confirmedCount: confirmed };
}

function html() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Hilo — cola de revisión</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    :root{--bg:#0e1116;--panel:#161b22;--ink:#e6edf3;--mut:#8b949e;--acc:#58a6ff;--grn:#3fb950;--red:#f85149;--yel:#d29922;--bd:#30363d}
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}
    .ban{background:var(--yel);color:#1b1f24;font-weight:700;text-align:center;padding:6px;font-size:13px}
    header{padding:14px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    h1{margin:0;font-size:18px}h1 small{color:var(--mut);font-weight:400}
    .ctx{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--mut)}
    .ctx b{color:var(--ink)}
    .roles button{background:var(--panel);color:var(--ink);border:1px solid var(--bd);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-left:4px}
    .roles button.on{background:var(--acc);color:#000;border-color:var(--acc);font-weight:700}
    main{display:grid;grid-template-columns:1fr 380px;gap:16px;padding:16px}
    @media(max-width:900px){main{grid-template-columns:1fr}}
    .card{background:var(--panel);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:14px}
    .sbs{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .side{background:#0d1117;border:1px solid var(--bd);border-radius:8px;padding:10px;font-size:13px}
    .side h4{margin:0 0 6px;color:var(--acc);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
    .score{font-size:28px;font-weight:700}.tier{padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700}
    .t-alta{background:#1f6f3b;color:#aff5c4}.t-media{background:#3d2e00;color:#ffe8a3}.t-baja{background:#4a1e1e;color:#ffc9c9}
    .ev{color:var(--grn);font-size:12px;margin:6px 0}.con{color:var(--red);font-size:12px;margin:6px 0}
    .fs{font-size:11px;color:var(--mut)}.fs span{display:inline-block;background:#21262d;padding:2px 6px;margin:2px;border-radius:4px}
    .feat{font-size:11px;color:var(--mut);background:#0d1117;padding:3px 6px;border-radius:4px;display:inline-block;margin:2px}
    .lat-l{color:#f0883e}.lat-r{color:#58a6ff}
    button.act{padding:6px 12px;border-radius:6px;border:1px solid var(--bd);cursor:pointer;font-size:12px;background:var(--panel);color:var(--ink)}
    .yes{border-color:var(--grn);color:var(--grn)}.no{border-color:var(--red);color:var(--red)}
    #map{height:320px;border-radius:8px;border:1px solid var(--bd)}
    .denied{display:flex;height:320px;align-items:center;justify-content:center;color:var(--red);flex-direction:column;border:1px dashed var(--red);border-radius:8px}
    .cnt{color:var(--mut);font-size:12px}
  </style></head><body>
  <div class="ban">⚠ DATOS SINTÉTICOS — DEMO · Los individuos son sintéticos; los agregados (RNPDNO) y las fosas son REALES</div>
  <header>
    <h1>Hilo <small>· cola de revisión forense</small></h1>
    <div class="roles" id="roles">
      <button data-role="reviewer" class="on">revisora</button>
      <button data-role="readonly">readonly (público)</button>
    </div>
    <div class="ctx" id="ctx"></div>
  </header>
  <main>
    <div id="queue"></div>
    <aside>
      <div class="card"><h4 style="margin:0 0 8px;color:var(--mut)">Mapa de fosas clandestinas (REAL)</h4><div id="mapWrap"><div id="map"></div></div>
      <div class="cnt" id="fosaCnt"></div></div>
    </aside>
  </main>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let role="reviewer"; let map=null, layer=null;
    const $=s=>document.querySelector(s);
    function fmt(n){return Number(n).toLocaleString('es-MX')}
    async function load(){
      const s=await (await fetch('/api/state?role='+role)).json();
      $('#ctx').innerHTML=\`<span><b>\${fmt(s.context.total_desaparecidos_no_loc)}</b> desaparecidos/no-loc (RNPDNO)</span>
        <span>año pico <b>\${s.context.peak_year}</b></span>
        <span><b>\${s.confirmedCount}</b> confirmadas</span>\`;
      const q=$('#queue');
      if(!s.matches.length){q.innerHTML='<div class="card">Cola vacía.</div>';return;}
      q.innerHTML=s.matches.map(m=>card(m)).join('');
      q.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=()=>act(b.dataset.confirm,'confirm'));
      q.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>act(b.dataset.reject,'reject'));
      loadMap(role);
    }
    function card(m){
      const fs=Object.entries(m.field_scores).map(([k,v])=>\`<span>\${k}: \${v}</span>\`).join('');
      const mf=m.missingFeatures.map(f=>featPill(f)).join('');const uf=m.unidentifiedFeatures.map(f=>featPill(f)).join('');
      const cls='t-'+(m.verifier_tier||'baja');
      return \`<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><span class="score">\${(m.overall_score*100|0)}</span><span class="cnt">/100</span>
            <span class="tier \${cls}">\${m.verifier_tier||'baja'}</span></div>
          <div><button class="act yes" data-confirm="\${m.id}">✓ Confirmar</button>
               <button class="act no" data-reject="\${m.id}">✕ Descartar</button></div>
        </div>
        <div class="sbs" style="margin-top:10px">
          <div class="side"><h4>Ficha (desaparecido)</h4>
            <div>\${m.missing.sex} · \${m.missing.age_min}-\${m.missing.age_max}a · \${m.missing.height_cm}cm</div>
            <div class="cnt">\${m.missing.estado} · \${m.missing.event_date}</div>
            <div style="margin-top:6px">\${mf||'<span class="cnt">sin señas</span>'}</div>
            <div class="cnt" style="margin-top:4px">\${m.missing.raw_description}</div></div>
          <div class="side"><h4>Cuerpo (no identificado)</h4>
            <div>\${m.unidentified.sex} · \${m.unidentified.age_min}-\${m.unidentified.age_max}a · \${m.unidentified.height_cm}cm</div>
            <div class="cnt">\${m.unidentified.estado} · \${m.unidentified.event_date}</div>
            <div style="margin-top:6px">\${uf||'<span class="cnt">sin señas</span>'}</div>
            <div class="cnt" style="margin-top:4px">\${m.unidentified.raw_description}</div></div>
        </div>
        <div class="ev">✓ \${m.verifier_evidence||''}</div>
        \${m.verifier_contradictions&&m.verifier_contradictions!=='Sin contradicciones duras.'?\`<div class="con">✗ \${m.verifier_contradictions}</div>\`:''}
        <div class="fs">\${fs}</div>
      </div>\`;
    }
    function featPill(f){const lc=f.laterality==='izquierda'?'lat-l':f.laterality==='derecha'?'lat-r':'';
      return \`<span class="feat \${lc}">\${f.feature_type} · \${f.body_region||'?'} · \${f.laterality} <span style="opacity:.6">\${f.description_raw.slice(0,30)}</span></span>\`;}
    async function act(id,kind){
      await fetch('/api/'+kind+'?id='+id+(kind==='confirm'?'&reviewer=reviewer-luna':''),{method:'POST'});load();}
    async function loadMap(r){
      const w=$('#mapWrap');
      if(!canRead(r)){w.innerHTML='<div class="denied"><b>⛔ DENEGADO</b><span>role readonly no puede leer secure_locations</span><span class="cnt">→ así se protegen coordenadas de buscadoras</span></div>';$('#fosaCnt').textContent='';return;}
      w.innerHTML='<div id="map"></div>';initMap();
      const d=await (await fetch('/api/fosas?role='+r)).json();
      $('#fosaCnt').textContent=\`\${d.num_sitios} sitios · \${fmt(d.total_fosas)} fosas · \${fmt(d.total_cuerpos_osamentas)} cuerpos/osamentas\`;
      if(layer)map.removeLayer(layer);
      layer=L.layerGroup().addTo(map);
      d.features.forEach(ft=>{const[lng,lat]=ft.geometry.coordinates;
        L.circleMarker([lat,lng],{radius:4+Math.min(ft.properties.fosas,8),color:'#f85149',fillColor:'#f85149',fillOpacity:.6,weight:1})
        .bindPopup(\`<b>\${ft.properties.estado}</b><br>\${ft.properties.municipio||''}<br>fosas: \${ft.properties.fosas} · cuerpos: \${ft.properties.cuerpos_osamentas}\`)
        .addTo(layer);});
    }
    function canRead(r){return r==='reviewer'||r==='liaison'||r==='admin'}
    function initMap(){if(map)return;map=L.map('map').setView([23.6,-102],4);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM'}).addTo(map);}
    $('#roles').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      role=b.dataset.role;$('#roles').querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');load();});
    load();
  </script></body></html>`;
}

server.listen(PORT, () => console.log(`\n  Hilo UI → http://localhost:${PORT}\n  (toggle readonly to demo the RBAC denial)\n`));
