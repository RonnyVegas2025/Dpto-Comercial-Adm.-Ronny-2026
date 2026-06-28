-- ============================================================
-- CartãoLog — Schema completo
-- Fluxo: Vegas cria remessa → NEX7 vê e comenta → Vegas registra e aprova
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── ENUMS ────────────────────────────────────────────────────

create type perfil_usuario as enum (
  'admin',        -- Vegas: controle total
  'financeiro',   -- Vegas: só fechamento
  'parceiro'      -- NEX7: só visualiza e adiciona obs
);

create type status_remessa as enum (
  'rascunho',     -- sendo montada
  'enviada',      -- enviada para NEX7
  'recebida',     -- NEX7 confirmou recebimento
  'concluida'     -- todas as entregas finalizadas
);

create type status_entrega as enum (
  'pendente',       -- aguardando entregador
  'em_andamento',   -- entregador definido, indo entregar
  'entregue',       -- entregue com sucesso
  'insucesso',      -- tentativa sem sucesso
  'reagendada'      -- reagendada para outra data
);

create type tipo_comprovante as enum (
  'protocolo_fisico',
  'sedex',
  'outro'
);

create type tipo_pagamento_fechamento as enum (
  'nex7',         -- paga para a NEX7 como empresa
  'entregador'    -- paga direto para o entregador
);

create type status_fechamento as enum (
  'pendente',
  'aprovado',
  'pago'
);

-- ── PARCEIROS (ex: NEX7) ────────────────────────────────────

create table parceiros (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  cnpj        text,
  email       text,
  telefone    text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ── USUÁRIOS ────────────────────────────────────────────────

create table usuarios (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  email         text not null,
  perfil        perfil_usuario not null default 'admin',
  parceiro_id   uuid references parceiros(id), -- preenchido só para perfil 'parceiro'
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── EMPRESAS DESTINATÁRIAS ───────────────────────────────────

create table empresas (
  id                  uuid primary key default uuid_generate_v4(),
  razao_social        text not null,
  nome_fantasia       text,
  cnpj                text,
  -- Endereço
  logradouro          text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  estado              char(2),
  cep                 text,
  -- Contato
  telefone            text,
  email_contato       text,
  -- Valor padrão de entrega (pode ser sobrescrito por entrega)
  valor_entrega_padrao numeric(10,2),
  -- Parceiro padrão para entregas desta empresa
  parceiro_padrao_id  uuid references parceiros(id),
  observacoes         text,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- ── ENTREGADORES ────────────────────────────────────────────

create table entregadores (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  documento     text,
  telefone      text,
  email         text,
  -- Vínculo: pode ser da NEX7 ou autônomo
  parceiro_id   uuid references parceiros(id),
  -- Dados de pagamento
  tipo_chave_pix text,
  chave_pix     text,
  banco         text,
  agencia       text,
  conta         text,
  observacoes   text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── REMESSAS (o "malote X" diário) ──────────────────────────

create table remessas (
  id              uuid primary key default uuid_generate_v4(),
  codigo          text unique not null,          -- ex: REM-2026-0041
  data_envio      date not null default current_date,
  data_recebimento date,
  parceiro_id     uuid not null references parceiros(id),
  status          status_remessa not null default 'rascunho',
  observacao      text,                          -- obs interna da Vegas
  criado_por      uuid references usuarios(id),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Código automático
create sequence remessa_seq start 1;
create or replace function gerar_codigo_remessa()
returns trigger language plpgsql as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := 'REM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('remessa_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
create trigger trg_codigo_remessa before insert on remessas
  for each row execute function gerar_codigo_remessa();

-- ── ENTREGAS (cada empresa dentro da remessa) ────────────────

create table entregas (
  id                    uuid primary key default uuid_generate_v4(),
  remessa_id            uuid not null references remessas(id) on delete cascade,
  empresa_id            uuid not null references empresas(id),
  -- Snapshot do endereço no momento do lançamento
  endereco_logradouro   text,
  endereco_numero       text,
  endereco_complemento  text,
  endereco_bairro       text,
  endereco_cidade       text,
  endereco_estado       char(2),
  endereco_cep          text,
  -- Valor acordado (padrão da empresa, mas pode ser editado)
  valor_entrega         numeric(10,2) not null,
  -- Entregador (definido pelo admin Vegas)
  entregador_id         uuid references entregadores(id),
  atribuido_por         uuid references usuarios(id),
  atribuido_em          timestamptz,
  -- Status
  status                status_entrega not null default 'pendente',
  -- Observação do PARCEIRO (NEX7 digita aqui quem foi entregar)
  obs_parceiro          text,
  obs_parceiro_em       timestamptz,
  obs_parceiro_usuario  uuid references usuarios(id),
  -- Confirmação da entrega (preenchido pelo admin Vegas)
  data_entrega          date,
  nome_recebedor        text,
  obs_entrega           text,
  -- Comprovante
  tipo_comprovante      tipo_comprovante,
  comprovante_url       text,       -- foto do protocolo ou SEDEX
  -- Insucesso
  motivo_insucesso      text,
  -- Auditoria
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- ── FECHAMENTOS FINANCEIROS ──────────────────────────────────

create table fechamentos (
  id                    uuid primary key default uuid_generate_v4(),
  remessa_id            uuid references remessas(id),
  -- A quem pagar
  tipo_pagamento        tipo_pagamento_fechamento not null,
  parceiro_id           uuid references parceiros(id),    -- se pagar NEX7
  entregador_id         uuid references entregadores(id), -- se pagar entregador
  -- Valores
  quantidade_entregas   int not null default 0,
  valor_total           numeric(10,2) not null default 0,
  valor_acordado        numeric(10,2),   -- pode haver desconto/ajuste
  -- Status
  status                status_fechamento not null default 'pendente',
  aprovado_por          uuid references usuarios(id),
  aprovado_em           timestamptz,
  pago_em               timestamptz,
  comprovante_pag_url   text,
  observacoes           text,
  criado_por            uuid references usuarios(id),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- Entregas incluídas num fechamento
create table fechamento_entregas (
  fechamento_id uuid not null references fechamentos(id) on delete cascade,
  entrega_id    uuid not null references entregas(id),
  valor_unitario numeric(10,2),
  primary key (fechamento_id, entrega_id)
);

-- ── AUDITORIA ────────────────────────────────────────────────

create table auditoria (
  id          uuid primary key default uuid_generate_v4(),
  usuario_id  uuid references usuarios(id),
  entidade    text not null,
  entidade_id uuid,
  acao        text not null,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em   timestamptz not null default now()
);

-- ── TRIGGERS: atualizado_em ──────────────────────────────────

create or replace function set_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end;
$$;

create trigger t_usuarios_upd    before update on usuarios    for each row execute function set_atualizado_em();
create trigger t_empresas_upd    before update on empresas    for each row execute function set_atualizado_em();
create trigger t_entregadores_upd before update on entregadores for each row execute function set_atualizado_em();
create trigger t_remessas_upd    before update on remessas    for each row execute function set_atualizado_em();
create trigger t_entregas_upd    before update on entregas    for each row execute function set_atualizado_em();
create trigger t_fechamentos_upd before update on fechamentos for each row execute function set_atualizado_em();

-- ── RLS ──────────────────────────────────────────────────────

alter table parceiros     enable row level security;
alter table usuarios      enable row level security;
alter table empresas      enable row level security;
alter table entregadores  enable row level security;
alter table remessas      enable row level security;
alter table entregas      enable row level security;
alter table fechamentos   enable row level security;
alter table fechamento_entregas enable row level security;
alter table auditoria     enable row level security;

-- Função: perfil do usuário logado
create or replace function get_perfil()
returns perfil_usuario language sql stable security definer as $$
  select perfil from usuarios where id = auth.uid();
$$;

-- Função: parceiro_id do usuário logado
create or replace function get_parceiro_id()
returns uuid language sql stable security definer as $$
  select parceiro_id from usuarios where id = auth.uid();
$$;

-- Parceiros
create policy "parceiros_admin" on parceiros for all using (get_perfil() in ('admin','financeiro'));
create policy "parceiros_parceiro_select" on parceiros for select using (get_perfil() = 'parceiro' and id = get_parceiro_id());

-- Usuários
create policy "usuarios_admin" on usuarios for all using (get_perfil() = 'admin');
create policy "usuarios_own" on usuarios for select using (id = auth.uid());

-- Empresas: parceiro só vê, admin gerencia
create policy "empresas_admin" on empresas for all using (get_perfil() in ('admin','financeiro'));
create policy "empresas_parceiro" on empresas for select using (get_perfil() = 'parceiro');

-- Entregadores
create policy "entregadores_admin" on entregadores for all using (get_perfil() in ('admin','financeiro'));
create policy "entregadores_parceiro" on entregadores for select
  using (get_perfil() = 'parceiro' and parceiro_id = get_parceiro_id());

-- Remessas: parceiro só vê as suas
create policy "remessas_admin" on remessas for all using (get_perfil() in ('admin','financeiro'));
create policy "remessas_parceiro" on remessas for select
  using (get_perfil() = 'parceiro' and parceiro_id = get_parceiro_id());

-- Entregas: parceiro vê as suas E pode atualizar só obs_parceiro
create policy "entregas_admin" on entregas for all using (get_perfil() in ('admin','financeiro'));
create policy "entregas_parceiro_select" on entregas for select
  using (get_perfil() = 'parceiro' and remessa_id in (
    select id from remessas where parceiro_id = get_parceiro_id()
  ));
create policy "entregas_parceiro_obs" on entregas for update
  using (get_perfil() = 'parceiro' and remessa_id in (
    select id from remessas where parceiro_id = get_parceiro_id()
  ))
  with check (true); -- validado na API: só permite mudar obs_parceiro

-- Fechamentos: só Vegas
create policy "fechamentos_admin" on fechamentos for all using (get_perfil() in ('admin','financeiro'));
create policy "fechamento_entregas_admin" on fechamento_entregas for all using (get_perfil() in ('admin','financeiro'));

-- Auditoria: só admin lê
create policy "auditoria_admin" on auditoria for select using (get_perfil() = 'admin');
create policy "auditoria_insert" on auditoria for insert with check (auth.uid() is not null);

-- ── ÍNDICES ──────────────────────────────────────────────────

create index idx_entregas_remessa   on entregas(remessa_id);
create index idx_entregas_empresa   on entregas(empresa_id);
create index idx_entregas_status    on entregas(status);
create index idx_entregas_entregador on entregas(entregador_id);
create index idx_remessas_parceiro  on remessas(parceiro_id);
create index idx_remessas_status    on remessas(status);
create index idx_fechamentos_remessa on fechamentos(remessa_id);
create index idx_auditoria_entidade on auditoria(entidade, entidade_id);

-- ── SEED INICIAL ─────────────────────────────────────────────

insert into parceiros (id, nome, email) values
  ('10000000-0000-0000-0000-000000000001', 'NEX7 Logística', 'contato@nex7.com.br');
