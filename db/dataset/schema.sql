DROP TABLE IF EXISTS personas_desaparecidas;
CREATE TABLE personas_desaparecidas (
  id SERIAL PRIMARY KEY,
  id_victimadirecta UUID UNIQUE NOT NULL,
  id_reporte INTEGER,
  id_dependencia_origen INTEGER,
  id_vinculacion UUID,
  dependencia_origen TEXT,
  estatus_victimadirecta_num INTEGER,
  publicar_ficha_num INTEGER,
  nombre TEXT,
  primer_apellido TEXT,
  segundo_apellido TEXT,
  sexo TEXT,
  fecha_nacimiento DATE,
  edad_actual INTEGER,
  edad_hechos INTEGER,
  edad_anios INTEGER,
  edad_meses INTEGER,
  edad_dias INTEGER,
  estado_nacimiento TEXT,
  lugar_nacimiento TEXT,
  nacionalidad TEXT,
  habla_espaniol BOOLEAN,
  fotografia BOOLEAN,
  sana_particular TEXT,
  prendas_de_vestir TEXT,
  media_filiacion TEXT,
  fecha_hechos TIMESTAMPTZ,
  fecha_percato TIMESTAMPTZ,
  ffecha_hechos DATE,
  ffecha_percato DATE,
  estado TEXT,
  municipio TEXT,
  nombre_asentamiento TEXT,
  calle TEXT,
  no_exterior TEXT,
  no_interior TEXT,
  codigo_postal TEXT,
  estado_hecho TEXT,
  municipio_hecho TEXT,
  tiene_discapacidad BOOLEAN,
  tipo_discapacidad TEXT,
  estatus_victima TEXT,
  solo_busqueda BOOLEAN,
  publicar_ficha BOOLEAN,
  inicio TEXT,
  archivo_migracion TEXT,
  fecha_captura TIMESTAMPTZ,
  pertenencia_dependencia_origen TEXT,
  pertenencia_por_canalizacion TEXT,
  cantidad_registros INTEGER,
  imagen TEXT
);

ALTER TABLE personas_desaparecidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for all" ON personas_desaparecidas FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Example row (all non-TEXT fields shown with their actual typed values):
--
--   id                       | 1
--   id_victimadirecta        | 056acbbc-475f-4b3a-a015-5b0414da8153        (UUID)
--   id_reporte               | 1                                            (INTEGER)
--   id_dependencia_origen    | 28                                           (INTEGER)
--   id_vinculacion           | 50260b41-5548-4ef8-aee0-1d9aeee2360e        (UUID)
--   dependencia_origen       | FISCALÍA GENERAL DE JUSTICIA DEL ESTADO DE TAMAULIPAS  (TEXT)
--   estatus_victimadirecta_num | 4                                          (INTEGER)
--   publicar_ficha_num       | 1                                            (INTEGER)
--   nombre                   | VALENTIN                                     (TEXT)
--   primer_apellido          | MARTINEZ                                     (TEXT)
--   segundo_apellido         | LOPEZ                                        (TEXT)
--   sexo                     | HOMBRE                                       (TEXT)
--   fecha_nacimiento         | 2008-06-02                                   (DATE)
--   edad_actual              | 18                                           (INTEGER)
--   edad_hechos              | 18                                           (INTEGER)
--   edad_anios               | 18                                           (INTEGER)
--   edad_meses               | 0                                            (INTEGER)
--   edad_dias                | 14                                           (INTEGER)
--   estado_nacimiento        | TAMAULIPAS                                   (TEXT)
--   lugar_nacimiento         | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   nacionalidad             | MEXICANA                                     (TEXT)
--   habla_espaniol           | true                                         (BOOLEAN, "SI" -> true)
--   fotografia               | true                                         (BOOLEAN, "SI" -> true)
--   sana_particular          | TATUAJE LADO IZQUIERDO                       (TEXT)
--   prendas_de_vestir        | PRENDA DE VESTIR: PANTALÓN, COLOR: AZUL<br>PRENDA DE VESTIR: PLAYERA, COLOR: NEGRO<br>PRENDA DE VESTIR: TENIS, COLOR: NEGRO  (TEXT, <br>-delimited)
--   media_filiacion          | COMPLEXION: DELGADA<br>CARA: RECTANGULAR<br>COLOR DE LA PIEL: MORENO<br>CABELLO: NEGRO CORTO LISO<br>OJOS: CAFÉS PEQUEÑOS<br>NARIZ: RECTA<br>BOCA: MEDIANA<br>LABIOS: MEDIANOS<br>ESTATURA: 165cm<br>PESO: 65kg  (TEXT, <br>-delimited)
--   fecha_hechos             | 2026-06-16 23:00:00+00                       (TIMESTAMPTZ)
--   fecha_percato            | 2026-06-16 23:00:00+00                       (TIMESTAMPTZ)
--   ffecha_hechos            | 2026-06-16                                   (DATE, parsed from DD/MM/YYYY)
--   ffecha_percato           | 2026-06-16                                   (DATE, parsed from DD/MM/YYYY)
--   estado                   | TAMAULIPAS                                   (TEXT)
--   municipio                | REYNOSA                                      (TEXT)
--   nombre_asentamiento      | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   calle                    | JUSTICIA                                     (TEXT)
--   no_exterior              | 305                                          (TEXT)
--   no_interior              | B                                            (TEXT)
--   codigo_postal            | NULL                                         (TEXT, empty -> NULL)
--   estado_hecho             | TAMAULIPAS                                   (TEXT)
--   municipio_hecho          | REYNOSA                                      (TEXT)
--   tiene_discapacidad       | false                                        (BOOLEAN, "NO" -> false)
--   tipo_discapacidad        | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   estatus_victima          | DESAPARECIDA                                 (TEXT)
--   solo_busqueda            | true                                         (BOOLEAN, "SI" -> true)
--   publicar_ficha           | true                                         (BOOLEAN, "SI" -> true)
--   inicio                   | APLICACIÓN WEB - AUTORIDAD                   (TEXT)
--   archivo_migracion        | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   fecha_captura            | 2026-06-20 11:14:16.490+00                   (TIMESTAMPTZ)
--   pertenencia_dependencia_origen | FISCALÍA GENERAL DE JUSTICIA DEL ESTADO DE TAMAULIPAS  (TEXT)
--   pertenencia_por_canalizacion | NULL                                      (TEXT, "SIN DATO" -> NULL)
--   cantidad_registros       | 1                                            (INTEGER)
--   imagen                   | data:image/png;base64,/9j/4AAQSkZJRg...     (TEXT, base64 data URI, ~90k chars)
--
-- Conversion rules applied at deploy time:
--   "SIN DATO" / ""  ->  NULL
--   "SI" / "NO"      ->  true / false  (BOOLEAN)
--   D/M/YYYY         ->  YYYY-MM-DD    (DATE)
--   ISO 8601 (from original record) -> native DATE / TIMESTAMPTZ
-- ─────────────────────────────────────────────────────────────────────────────