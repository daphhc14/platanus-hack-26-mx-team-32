-- Hilo — Agent pipeline tables in Supabase
-- ========================================
-- Bus compartido entre LangGraph (Python) y el bridge TS.

-- agent_tasks: cola de trabajo para los agentes
create table if not exists public.agent_tasks (
    id uuid primary key default gen_random_uuid(),
    run_id text not null,
    agent_name text not null,
    status text default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
    input jsonb,
    output jsonb,
    error text,
    created_at timestamptz default now(),
    finished_at timestamptz
);
create index if not exists idx_agent_tasks_status on public.agent_tasks (status);
create index if not exists idx_agent_tasks_run on public.agent_tasks (run_id);

-- match_results: output del matcher bridge (TS)
create table if not exists public.match_results (
    id uuid primary key default gen_random_uuid(),
    ficha_id uuid references public.fichas(id),
    missing_record_id text,
    unidentified_record_id text,
    overall_score numeric check (overall_score >= 0 and overall_score <= 1),
    field_scores jsonb,
    verifier_evidence text,
    verifier_contradictions text,
    verifier_tier text check (verifier_tier in ('alta', 'media', 'baja')),
    status text default 'proposed' check (status in ('proposed', 'in_review', 'confirmed', 'rejected')),
    created_at timestamptz default now()
);
create index if not exists idx_match_results_ficha on public.match_results (ficha_id);
create index if not exists idx_match_results_score on public.match_results (overall_score desc);
create index if not exists idx_match_results_tier on public.match_results (verifier_tier);

-- review_queue: tareas priorizadas para revision humana
create table if not exists public.review_queue (
    id uuid primary key default gen_random_uuid(),
    ficha_id uuid references public.fichas(id),
    match_result_id uuid references public.match_results(id),
    priority numeric check (priority >= 0 and priority <= 1),
    reason text,
    status text default 'pending' check (status in ('pending', 'assigned', 'reviewed', 'archived')),
    assigned_to text,
    created_at timestamptz default now(),
    reviewed_at timestamptz
);
create index if not exists idx_review_queue_priority on public.review_queue (priority desc);
create index if not exists idx_review_queue_status on public.review_queue (status);

alter table public.agent_tasks enable row level security;
alter table public.match_results enable row level security;
alter table public.review_queue enable row level security;

create policy "service_all_agent_tasks" on public.agent_tasks for all using (auth.role() = 'service_role');
create policy "service_all_match_results" on public.match_results for all using (auth.role() = 'service_role');
create policy "service_all_review_queue" on public.review_queue for all using (auth.role() = 'service_role');
