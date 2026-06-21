#!/usr/bin/env python3
"""
prep_data.py — Hilo data preparation.

Turns REAL public data into clean, aggregated, demo-ready assets.
NO individual victim PII is emitted: only aggregates + demographic
distributions used to calibrate the synthetic seed.

Inputs (data/raw/):
  rnpdno_desaparecidos.csv  — RNPDNO public records (133K rows, CC0)
  fosas_raw.json            — Mapbox dataset of clandestine graves (487 pts)
  poblacion.csv             — municipal population (for rates)
  timeseries_victimas.csv   — SESNSP victims (homicide correlation)

Outputs (data/generated/):
  context_national.json     — totals, by-year, by-sex
  context_estatal.json      — by-state totals + rates
  context_age_sex.json      — age/sex distribution
  distributions.json        — calibrated probs for synthetic seed
  fosas.geojson             — slim clandestine-graves map (487 pts)
  provenance.json           — sources, license, fetch dates

Ethics: aggregates only. The 133K records inform counts/trends and the
demographic SHAPE of synthetic individuals. No real victim is displayed.
"""
import csv, json, re, sys, os
from collections import Counter, defaultdict
from datetime import datetime

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "generated")
os.makedirs(OUT, exist_ok=True)

PROVENANCE = {
    "rnpdno": {
        "source": "Registro Nacional de Personas Desaparecidas y No Localizadas (RNPDNO)",
        "via": "Consulta Publica RNPDNO (consultapublicarnpdno.segob.gob.mx) / datamx.io (CC0)",
        "repo": "github.com/lapanquecita/personas-desaparecidas",
        "license": "CC0 1.0 (Public Domain Dedication)",
        "note": "Individual records have NO names, photos, or senas particulares. Used for aggregates + demographic calibration only.",
    },
    "fosas": {
        "source": "Mapa de fosas clandestinas (Quinto Elemento Lab / Mapbox dataset)",
        "via": "api.mapbox.com dataset (jorgerure/ckb9upb462fwg22msf7t3zcag)",
        "note": "Aggregate point data: estado, municipio, # fosas, # cuerpos. No individual victim identity.",
    },
    "poblacion": {"source": "Proyecciones de poblacion municipal (inegi/conapo-style), via lapanquecita repo"},
    "sesnsp": {"source": "SESNSP datos abiertos de incidencia delictiva (victimas)"},
}


def parse_year(s):
    if not s:
        return None
    m = re.match(r"(\d{4})", str(s).strip())
    return int(m.group(1)) if m else None


def main():
    # ------------------------------------------------------------------
    # 1. RNPDNO aggregates
    # ------------------------------------------------------------------
    total = 0
    by_year = Counter()
    by_sex = Counter()
    by_state = Counter()
    by_state_year = defaultdict(Counter)
    age_sex = Counter()  # (age_bucket, sex) -> count
    status = Counter()
    origen = Counter()
    # calibration distributions
    cal_state = Counter()
    cal_sex = Counter()
    cal_age = []  # list of ages

    path = os.path.join(RAW, "rnpdno_desaparecidos.csv")
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            total += 1
            st = (r.get("ESTATUS_VICTIMA") or "").strip()
            status[st] += 1
            org = (r.get("ORIGEN_REPORTE") or "").strip()
            origen[org] += 1
            sexo = (r.get("SEXO") or "").strip().upper()
            ent = (r.get("ENTIDAD") or "").strip()
            if sexo in ("HOMBRE", "MUJER"):
                cal_sex[sexo] += 1
                by_sex[sexo] += 1
            yr = parse_year(r.get("FECHA_DESAPARICION"))
            if yr and 1960 <= yr <= 2026:
                by_year[yr] += 1
                if ent:
                    by_state_year[ent][yr] += 1
            if ent:
                by_state[ent] += 1
                cal_state[ent] += 1
            # age at disappearance
            try:
                fb = datetime.strptime(r.get("FECHA_NACIMIENTO", "")[:10], "%Y-%m-%d")
                fd_s = (r.get("FECHA_DESAPARICION") or "")[:10]
                fd = datetime.strptime(fd_s, "%Y-%m-%d")
                age = fd.year - fb.year - ((fd.month, fd.day) < (fb.month, fb.day))
                if 0 <= age <= 100:
                    cal_age.append(age)
                    bucket = "0-17" if age < 18 else "18-29" if age < 30 else "30-44" if age < 45 else "45-59" if age < 60 else "60+"
                    age_sex[(bucket, sexo if sexo in ("HOMBRE", "MUJER") else "NOINFO")] += 1
            except Exception:
                pass

    # national context
    context_national = {
        "total_registros": total,
        "total_desaparecidos_no_loc": sum(v for k, v in status.items() if k in ("DESAPARECIDA", "NO LOCALIZADA")),
        "by_status": dict(status.most_common()),
        "by_sex": dict(by_sex),
        "by_year": {str(y): c for y, c in sorted(by_year.items())},
        "peak_year": max(by_year.items(), key=lambda x: x[1])[0] if by_year else None,
        "fuente_instituciones": len(origen),
        "top_origenes": dict(origen.most_common(8)),
    }

    # estatal context with population-based rate (use 2024 pop col)
    estatal = []
    pop_by_ent = _pop_by_state()
    for ent, cnt in by_state.most_common():
        pop = pop_by_ent.get(ent, 0)
        rate = round(cnt / pop * 100000, 1) if pop else None
        years = by_state_year.get(ent, Counter())
        estatal.append({
            "entidad": ent,
            "total": cnt,
            "poblacion_2024": pop,
            "tasa_por_100k": rate,
            "serie_anual": {str(y): c for y, c in sorted(years.items())[-10:]},
        })
    context_estatal = {"estados": estatal, "nacional_total": total}

    # age/sex
    ages = defaultdict(dict)
    for (bucket, sx), c in age_sex.items():
        ages[bucket][sx] = c
    context_age_sex = {
        "buckets": ["0-17", "18-29", "30-44", "45-59", "60+"],
        "matrix": ages,
        "edad_media": round(sum(cal_age) / len(cal_age), 1) if cal_age else None,
        "edad_mediana": sorted(cal_age)[len(cal_age) // 2] if cal_age else None,
    }

    # ------------------------------------------------------------------
    # 2. Distributions for synthetic-seed calibration
    # ------------------------------------------------------------------
    def norm(counter):
        s = sum(counter.values()) or 1
        return {k: round(v / s, 4) for k, v in counter.items()}

    # top states only (keep demo focused on 5-6)
    top_states = dict(cal_state.most_common(6))
    distributions = {
        "state_prob": norm(Counter(top_states)),
        "sex_prob": norm(cal_sex),
        "age_mean": round(sum(cal_age) / len(cal_age), 1) if cal_age else 30.0,
        "age_std": round((sum((a - (sum(cal_age) / len(cal_age))) ** 2 for a in cal_age) / len(cal_age)) ** 0.5, 1) if cal_age else 10.0,
        "age_buckets_prob": norm(Counter(a // 1 for a in cal_age)) if False else None,
        "note": "Used to shape synthetic individuals so demo demographics mirror real RNPDNO distributions.",
    }
    # simpler: bucketed age prob
    if cal_age:
        bucket_c = Counter()
        for a in cal_age:
            b = "0-17" if a < 18 else "18-29" if a < 30 else "30-44" if a < 45 else "45-59" if a < 60 else "60+"
            bucket_c[b] += 1
        distributions["age_bucket_prob"] = norm(bucket_c)
    distributions.pop("age_buckets_prob", None)

    # ------------------------------------------------------------------
    # 3. Fosas -> slim geojson
    # ------------------------------------------------------------------
    with open(os.path.join(RAW, "fosas_raw.json"), encoding="utf-8") as f:
        fdata = json.load(f)
    feats = fdata.get("features", [])
    slim_feats = []
    tot_fosas = 0
    tot_cuerpos = 0
    for ft in feats:
        p = ft.get("properties", {}) or {}
        try:
            nf = int(p.get("Fosas", 0) or 0)
        except Exception:
            nf = 0
        try:
            nc = int(p.get("CuerposOsamentas", 0) or 0)
        except Exception:
            nc = 0
        tot_fosas += nf
        tot_cuerpos += nc
        c = ft.get("geometry", {}).get("coordinates")
        if c and len(c) == 2:
            slim_feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": c},
                "properties": {
                    "estado": p.get("Estado"),
                    "municipio": p.get("Municipio"),
                    "fosas": nf,
                    "cuerpos_osamentas": nc,
                },
            })
    fosas_geojson = {
        "type": "FeatureCollection",
        "total_fosas": tot_fosas,
        "total_cuerpos_osamentas": tot_cuerpos,
        "num_sitios": len(slim_feats),
        "features": slim_feats,
    }

    # ------------------------------------------------------------------
    # 4. Write outputs
    # ------------------------------------------------------------------
    def w(name, obj):
        p = os.path.join(OUT, name)
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
        print(f"  wrote {name}")

    PROVENANCE["generated_at"] = datetime.now().isoformat(timespec="seconds")
    print("Writing generated data...")
    w("context_national.json", context_national)
    w("context_estatal.json", context_estatal)
    w("context_age_sex.json", context_age_sex)
    w("distributions.json", distributions)
    w("fosas.geojson", fosas_geojson)
    w("provenance.json", PROVENANCE)

    print("\n=== SUMMARY ===")
    print(f"RNPDNO records processed: {total:,}")
    print(f"  desaparecidas + no localizadas: {context_national['total_desaparecidos_no_loc']:,}")
    print(f"  peak year: {context_national['peak_year']} ({by_year[context_national['peak_year']]:,})")
    print(f"  top states: {[e['entidad'] for e in estatal[:5]]}")
    print(f"Fosas sites: {len(slim_feats)} | total fosas: {tot_fosas:,} | cuerpos/osamentas: {tot_cuerpos:,}")
    print(f"Age mean: {distributions['age_mean']} (std {distributions['age_std']})")
    print("Done.")


def _pop_by_state():
    """Sum municipal population (2024 col) into state totals from poblacion.csv."""
    # poblacion.csv: CVE,Entidad,Municipio,1990..2040 ; Entidad repeats per municipio
    pop = Counter()
    path = os.path.join(RAW, "poblacion.csv")
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames
        year_col = "2024" if "2024" in cols else cols[-12]
        for r in reader:
            ent = (r.get("Entidad") or "").strip().upper()
            ent = (ent.replace("MEXICO", "MÉXICO")
                      .replace("LEON", "LEÓN")
                      .replace("MICHOACAN", "MICHOACÁN")
                      .replace("QUERETARO", "QUERÉTARO")
                      .replace("POTOSI", "POTOSÍ")
                      .replace("YUCATAN", "YUCATÁN"))
            try:
                pop[ent] += int(float(r.get(year_col) or 0))
            except Exception:
                pass
    return pop


if __name__ == "__main__":
    main()
