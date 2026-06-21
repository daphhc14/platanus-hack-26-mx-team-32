-- Hilo — Schema para fichas extraídas de Facebook
-- ================================================
-- Ejecutar en Supabase SQL Editor
-- Almacena datos de fichas de personas desaparecidas extraídas con vision

-- Tabla principal: fichas
create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),

  -- Tipo de registro
  tipo text not null default 'ficha_busqueda'
    check (tipo in ('ficha_busqueda', 'reporte_fosa', 'alerta_amber', 'identidad_sin_nombre', 'otro')),

  -- Datos de la persona
  nombre_completo text,
  alias text,
  edad int,
  sexo text check (sexo in ('masculino', 'femenino', null)),
  nacionalidad text default 'mexicana',

  -- Fechas
  fecha_desaparicion date,
  fecha_nacimiento date,

  -- Ubicación de la desaparición
  estado text,
  municipio text,
  localidad text,

  -- Descripción física
  tez text,
  complexion text,
  ojos text,
  cabello text,
  estatura_m numeric,
  vestimenta text,

  -- Señas particulares (array de strings)
  senas_particulares jsonb default '[]'::jsonb,

  -- Señas con lateralidad (array de {lado, descripcion})
  senas_lateralidad jsonb default '[]'::jsonb,

  -- Contacto
  telefono_contacto text,
  fuente text,

  -- Origen (FB scrape)
  fb_group_id text,
  fb_group_name text,
  fb_permalink text,
  fb_image_url text,
  fb_captured_at timestamptz,

  -- Metadata de extracción
  confianza_extraccion numeric default 0,
  modelo_extraccion text,
  necesita_revision boolean default true,
  campos_detectados jsonb default '[]'::jsonb,

  -- Lifecycle
  status text default 'pendiente'
    check (status in ('pendiente', 'revisado', 'descartado', 'confirmado')),
  reviewed_at timestamptz,
  reviewed_by text,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ═══ Indexes para queries comunes de LangGraph ═══
create index if not exists idx_fichas_estado on public.fichas (estado);
create index if not exists idx_fichas_municipio on public.fichas (municipio);
create index if not exists idx_fichas_sexo on public.fichas (sexo);
create index if not exists idx_fichas_edad on public.fichas (edad);
create index if not exists idx_fichas_fecha_desap on public.fichas (fecha_desaparicion);
create index if not exists idx_fichas_tipo on public.fichas (tipo);
create index if not exists idx_fichas_status on public.fichas (status);
create index if not exists idx_fichas_nombre on public.fichas using gin (to_tsvector('spanish', coalesce(nombre_completo, '')));
create index if not exists idx_fichas_senas on public.fichas using gin (senas_particulares jsonb_path_ops);
create index if not exists idx_fichas_group on public.fichas (fb_group_id);
create index if not exists idx_fichas_created on public.fichas (created_at desc);

-- ═══ Dedupe: no insertar la misma ficha dos veces ═══
-- Usa el permalink o el nombre + fecha + estado como unique constraint
create unique index if not exists idx_fichas_dedupe
  on public.fichas (coalesce(fb_permalink, nombre_completo || '|' || coalesce(fecha_desaparicion::text, '') || '|' || coalesce(estado, '')));

-- ═══ Trigger: updated_at automático ═══
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_fichas_updated on public.fichas;
create trigger trg_fichas_updated
  before update on public.fichas
  for each row execute function public.update_updated_at();

-- ═══ RLS (Row Level Security) ═══
-- Los datos son sensibles — solo el service key puede escribir
-- y el anon key solo puede leer agregados (no PII)
alter table public.fichas enable row level security;

-- Service role: acceso total
create policy "service_all_fichas" on public.fichas
  for all using (auth.role() = 'service_role');

-- Anon: solo lectura, sin telefono ni permalink (PII)
create policy "anon_read_fichas_safe" on public.fichas
  for select using (
    true
  ) with check (false);

-- Comentar la línea de arriba si no quieres que anon lea nada
-- y descomentar esta:
-- create policy "anon_no_access" on public.fichas for select using (false);

-- ═══ Vista: fichas_safe (sin PII sensible) ═══
-- Para queries desde LangGraph que no necesitan teléfono/permalink
create or replace view public.fichas_safe as
  select
    id, tipo, nombre_completo, alias, edad, sexo, nacionalidad,
    fecha_desaparicion, fecha_nacimiento,
    estado, municipio, localidad,
    tez, complexion, ojos, cabello, estatura_m, vestimenta,
    senas_particulares, senas_lateralidad,
    fuente, fb_group_id, fb_group_name,
    confianza_extraccion, necesita_revision, status,
    created_at
  from public.fichas;

comment on table public.fichas is 'Fichas de personas desaparecidas extraídas de grupos de Facebook con vision AI';
comment on column public.fichas.senas_lateralidad is 'Array de {lado: izquierda|derecha|ambos, descripcion: string}. Crítico para evitar matches incorrectos.';
comment on column public.fichas.necesita_revision is 'True cuando la confianza de extracción es baja o faltan campos clave';
