import os
import psycopg2
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import geopandas as gpd

DATABASE_URL = "postgresql://postgres.xhtpgaxndonugpxfvkbk:platanus-super-secret123@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATES_GEOJSON = os.path.join(SCRIPT_DIR, "mx_states.geojson")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "mapa_desaparecidos.png")

query = """
    SELECT nombre, primer_apellido, sexo, estado, municipio, estatus_victima,
           latitud, longitud, edad_anios
    FROM personas_desaparecidas
    WHERE latitud IS NOT NULL AND longitud IS NOT NULL
"""

conn = psycopg2.connect(DATABASE_URL, sslmode="require")
cur = conn.cursor()
cur.execute(query)
rows = cur.fetchall()
cur.close()
conn.close()

lats = [r[6] for r in rows]
lons = [r[7] for r in rows]
colors = ["#d62728" if r[2] == "MUJER" else "#1f77b4" for r in rows]

states = gpd.read_file(STATES_GEOJSON)

fig, ax = plt.subplots(figsize=(14, 10), dpi=150)

states.plot(ax=ax, color="#f0f0f0", edgecolor="#999999", linewidth=0.5, zorder=1)

ax.scatter(
    lons,
    lats,
    c=colors,
    s=22,
    alpha=0.6,
    edgecolors="white",
    linewidths=0.3,
    zorder=3,
)

for r in rows:
    if r[5] != "DESAPARECIDA":
        ax.scatter(
            r[7],
            r[6],
            c="#ff7f0e",
            s=45,
            marker="^",
            edgecolors="black",
            linewidths=0.3,
            zorder=4,
        )

mujer_patch = mpatches.Patch(color="#d62728", label=f'Mujer ({sum(1 for r in rows if r[2] == "MUJER")})')
hombre_patch = mpatches.Patch(color="#1f77b4", label=f'Hombre ({sum(1 for r in rows if r[2] == "HOMBRE")})')
no_desaparecida = mpatches.Patch(
    color="#ff7f0e",
    label=f'No localizada ({sum(1 for r in rows if r[5] != "DESAPARECIDA")})',
)
ax.legend(handles=[mujer_patch, hombre_patch, no_desaparecida], loc="lower left", fontsize=9, framealpha=0.9)

ax.set_xlabel("Longitud", fontsize=11)
ax.set_ylabel("Latitud", fontsize=11)
ax.set_title(
    f"Personas Desaparecidas — {len(rows)} registros con coordenadas",
    fontsize=14,
    fontweight="bold",
)

ax.set_xlim(-118, -86)
ax.set_ylim(14, 33)
ax.set_aspect("equal")
ax.grid(True, alpha=0.2, linestyle="--")

ax.text(
    0.99,
    0.01,
    "Fuente: RNPDNO / Consulta Pública\nGeocodificación: Nominatim (OSM)",
    transform=ax.transAxes,
    fontsize=7,
    color="gray",
    ha="right",
    va="bottom",
    alpha=0.7,
)

plt.tight_layout()
plt.savefig(OUTPUT_FILE, bbox_inches="tight", facecolor="white")
print(f"saved: {OUTPUT_FILE} ({len(rows)} points)")
