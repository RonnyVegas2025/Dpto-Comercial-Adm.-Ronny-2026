'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = String(d).split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};
const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS = {
  apurando:       { label: 'Apurando',       cor: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
  em_conferencia: { label: 'Em Conferência', cor: '#f0b429', bg: 'rgba(240,180,41,0.12)',  border: 'rgba(240,180,41,0.3)'  },
  conferido:      { label: 'Conferido',      cor: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)'  },
  aprovado:       { label: 'Aprovado ✓',     cor: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
  rejeitado:      { label: 'Rejeitado',      cor: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
};

const DIRETOR_POR_GESTOR = {
  'Fabiano':          'Rossi',
  'Vago':             'Rossi',
  'Wagner Fernandes': 'Rossi',
  'Ronny Peterson':   'Ronny',
};

function BadgeStatus({ status }) {
  const st = STATUS[status] || STATUS.apurando;
  return <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.cor, borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</span>;
}

// ── Modal de Questionamentos (timeline) ──────────────────────────────────────
function ModalQuestionamento({ empresa, nomeUser, perfilUser, onClose }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto]         = useState('');
  const [salvando, setSalvando]   = useState(false);

  useEffect(() => { carregarMensagens(); }, [empresa.id]);

  async function carregarMensagens() {
    const { data } = await supabase
      .from('fechamento_meta_questionamentos')
      .select('*')
      .eq('empresa_fechamento_id', empresa.id)
      .order('criado_em');
    setMensagens(data || []);
  }

  async function enviarMensagem() {
    if (!texto.trim()) return;
    setSalvando(true);
    await supabase.from('fechamento_meta_questionamentos').insert({
      empresa_fechamento_id: empresa.id,
      mensagem: texto.trim(),
      autor: nomeUser,
      perfil_autor: perfilUser,
    });
    // Marca empresa como tendo questionamento aberto
    await supabase.from('fechamento_meta_empresas').update({
      questionamento: texto.trim(),
      questionamento_por: nomeUser,
      questionamento_em: new Date().toISOString(),
      questionamento_resolvido: false,
    }).eq('id', empresa.id);
    setTexto('');
    await carregarMensagens();
    setSalvando(false);
  }

  async function resolverQuestionamento() {
    await supabase.from('fechamento_meta_empresas').update({ questionamento_resolvido: true }).eq('id', empresa.id);
    onClose(true); // true = resolvido
  }

  const isAdm = perfilUser === 'administrativo' || perfilUser === 'gestor_master';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#161a26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#f87171', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>⚠️ Questionamento</div>
            <div style={{ fontWeight: 700 }}>{empresa.empresa_nome}</div>
            <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>{empresa.produto} · {fmt(empresa.valor_meta)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdm && mensagens.length > 0 && !empresa.questionamento_resolvido && (
              <button onClick={resolverQuestionamento} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '6px 14px', color: '#34d399', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                ✓ Resolver
              </button>
            )}
            <button onClick={() => onClose(false)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
          </div>
        </div>

        {/* Timeline de mensagens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mensagens.length === 0 && (
            <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '0.82rem', padding: '20px 0' }}>Nenhuma mensagem ainda. Escreva abaixo para iniciar o questionamento.</div>
          )}
          {mensagens.map((msg, i) => {
            const isMe = msg.autor === nomeUser;
            const isAdmMsg = msg.perfil_autor === 'administrativo' || msg.perfil_autor === 'gestor_master';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', background: isAdmMsg ? 'rgba(96,165,250,0.1)' : 'rgba(240,180,41,0.1)', border: `1px solid ${isAdmMsg ? 'rgba(96,165,250,0.2)' : 'rgba(240,180,41,0.2)'}`, borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: isAdmMsg ? '#60a5fa' : '#f0b429' }}>{msg.autor}</span>
                    <span style={{ background: isAdmMsg ? 'rgba(96,165,250,0.15)' : 'rgba(240,180,41,0.15)', color: isAdmMsg ? '#60a5fa' : '#f0b429', borderRadius: 4, padding: '1px 6px', fontSize: '0.62rem', fontWeight: 600 }}>
                      {isAdmMsg ? 'ADM' : 'Conferência'}
                    </span>
                  </div>
                  <div style={{ color: '#e8eaf0', fontSize: '0.85rem', lineHeight: 1.5 }}>{msg.mensagem}</div>
                  <div style={{ color: '#4b5563', fontSize: '0.65rem', marginTop: 5 }}>{fmtDate(msg.criado_em)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Campo de envio */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMensagem()}
              placeholder="Digite sua mensagem..."
              style={{ flex: 1, background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={enviarMensagem} disabled={!texto.trim() || salvando}
              style={{ background: '#f87171', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', opacity: !texto.trim() || salvando ? 0.5 : 1 }}>
              {salvando ? '...' : '➤'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal de Detalhe do Fechamento ───────────────────────────────────────────
function ModalDetalhe({ fechamento, onClose, onAcaoFechamento, perfil, nomeUser }) {
  const [empresas, setEmpresas]         = useState([]);
  const [semMov, setSemMov]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState({});
  const [salvandoFech, setSalvandoFech] = useState(false);
  const [modalQuestao, setModalQuestao] = useState(null);
  const [obsFechamento, setObsFechamento] = useState('');
  const [filtro, setFiltro]             = useState('todos');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [aba, setAba]                   = useState('meta'); // meta | sem_mov
  const [busca, setBusca]               = useState('');

  useEffect(() => { carregarDados(); }, [fechamento.id]);

  async function carregarDados() {
    setLoading(true);
    const { data: emps } = await supabase
      .from('fechamento_meta_empresas')
      .select('*')
      .eq('fechamento_id', fechamento.id)
      .order('empresa_nome');
    setEmpresas(emps || []);

    // Busca empresas sem movimentação da equipe
    const { data: consults } = await supabase
      .from('consultores')
      .select('id')
      .eq('gestor', fechamento.gestor_nome)
      .eq('ativo', true);

    if (consults?.length) {
      const ids = consults.map(c => c.id);
      const { data: empsSemMov } = await supabase
        .from('empresas')
        .select('produto_id, nome, produto_contratado, potencial_movimentacao, consultor_principal:consultor_principal_id(nome)')
        .in('consultor_principal_id', ids)
        .eq('ativo', true);

      // Filtra as que não estão na meta
      const idsNaMeta = new Set((emps || []).map(e => e.produto_id));
      setSemMov((empsSemMov || []).filter(e => !idsNaMeta.has(e.produto_id)));
    }
    setLoading(false);
  }

  async function conferirEmpresa(emp, campo) {
    setSalvando(prev => ({ ...prev, [emp.id]: true }));
    const updates = {};
    if (campo === 'adm') {
      updates.conferido_adm = !emp.conferido_adm;
      updates.conferido_adm_por = !emp.conferido_adm ? nomeUser : null;
      updates.conferido_adm_em  = !emp.conferido_adm ? new Date().toISOString() : null;
    } else {
      updates.conferido_marina = !emp.conferido_marina;
      updates.conferido_marina_por = !emp.conferido_marina ? nomeUser : null;
      updates.conferido_marina_em  = !emp.conferido_marina ? new Date().toISOString() : null;
    }
    await supabase.from('fechamento_meta_empresas').update(updates).eq('id', emp.id);
    setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, ...updates } : e));
    setSalvando(prev => ({ ...prev, [emp.id]: false }));
  }

  async function conferirTudo(campo, marcar) {
    setSalvandoFech(true);
    const updates = {};
    if (campo === 'adm') {
      updates.conferido_adm = marcar;
      updates.conferido_adm_por = marcar ? nomeUser : null;
      updates.conferido_adm_em  = marcar ? new Date().toISOString() : null;
    } else {
      updates.conferido_marina = marcar;
      updates.conferido_marina_por = marcar ? nomeUser : null;
      updates.conferido_marina_em  = marcar ? new Date().toISOString() : null;
    }
    await supabase.from('fechamento_meta_empresas').update(updates).eq('fechamento_id', fechamento.id);
    await carregarDados();
    setSalvandoFech(false);
  }

  async function executarAcaoFechamento(acao) {
    setSalvandoFech(true);
    await onAcaoFechamento(fechamento, acao, obsFechamento);
    setSalvandoFech(false);
    onClose();
  }

  const podeMarcarADM = (perfil === 'administrativo' || perfil === 'gestor_master') &&
    (fechamento.status === 'em_conferencia' || fechamento.status === 'apurando');
  const podeConferir = podeMarcarADM;
  const podeMarcarConferencia = (perfil === 'administrativo' || perfil === 'supervisor_comercial' || perfil === 'gestor_master') &&
    (fechamento.status === 'em_conferencia' || fechamento.status === 'apurando');
  const podeAprovar  = (perfil === 'gestor_master' || perfil === 'supervisor_comercial') &&
    fechamento.status === 'conferido';

  const totalApurado    = empresas.reduce((s, e) => s + (e.valor_meta || 0), 0);
  const confADM         = empresas.filter(e => e.conferido_adm).length;
  const confMarina      = empresas.filter(e => e.conferido_marina).length;
  const comQuestao      = empresas.filter(e => e.questionamento && !e.questionamento_resolvido).length;
  const todasConferidas = confADM === empresas.length && confMarina === empresas.length;

  const vendedores = useMemo(() => ['todos', ...new Set(empresas.map(e => e.consultor_nome).filter(Boolean))].sort(), [empresas]);

  const empresasFiltradas = useMemo(() => {
    let arr = [...empresas];
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      arr = arr.filter(e => e.empresa_nome?.toLowerCase().includes(b) || String(e.produto_id || '').includes(b));
    }
    if (filtroVendedor !== 'todos') arr = arr.filter(e => e.consultor_nome === filtroVendedor);
    if (filtro === 'pendentes')       arr = arr.filter(e => !e.conferido_adm || !e.conferido_marina);
    if (filtro === 'conferidos')      arr = arr.filter(e => e.conferido_adm && e.conferido_marina);
    if (filtro === 'questionamentos') arr = arr.filter(e => e.questionamento && !e.questionamento_resolvido);
    return arr;
  }, [empresas, filtro, filtroVendedor, busca]);

  const diretor = DIRETOR_POR_GESTOR[fechamento.gestor_nome] || 'Diretor';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
      <div style={{ background: '#0f1218', width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: '#161a26', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>👔 {fechamento.gestor_nome}</span>
              <BadgeStatus status={fechamento.status} />
              <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>{fmtMes(fechamento.competencia)} · Diretor: <span style={{ color: '#a78bfa' }}>{diretor}</span></span>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 16px', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>✕ Fechar</button>
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Total Apurado</div>
              <div style={{ color: '#34d399', fontSize: '1.1rem', fontWeight: 700 }}>{fmt(totalApurado)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Na Meta</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{empresas.length}</div>
            </div>
            <div style={{ background: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.2)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Sem Movimentação</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#9ca3af' }}>{semMov.length}</div>
            </div>
            <div style={{ background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.2)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>✓ ADM</div>
              <div style={{ color: '#f0b429', fontSize: '1.1rem', fontWeight: 700 }}>{confADM}/{empresas.length}</div>
            </div>
            <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>✓ Conferência</div>
              <div style={{ color: '#60a5fa', fontSize: '1.1rem', fontWeight: 700 }}>{confMarina}/{empresas.length}</div>
            </div>
            {comQuestao > 0 && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 16px' }}>
                <div style={{ color: '#6b7280', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>⚠️ Questões</div>
                <div style={{ color: '#f87171', fontSize: '1.1rem', fontWeight: 700 }}>{comQuestao}</div>
              </div>
            )}
          </div>

          {/* Abas */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => setAba('meta')} style={{ background: aba === 'meta' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${aba === 'meta' ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 16px', color: aba === 'meta' ? '#34d399' : '#6b7280', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === 'meta' ? 700 : 400, fontFamily: 'inherit' }}>
              ✅ Na Meta ({empresas.length})
            </button>
            <button onClick={() => setAba('sem_mov')} style={{ background: aba === 'sem_mov' ? 'rgba(107,114,128,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${aba === 'sem_mov' ? 'rgba(107,114,128,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 16px', color: aba === 'sem_mov' ? '#9ca3af' : '#6b7280', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === 'sem_mov' ? 700 : 400, fontFamily: 'inherit' }}>
              ❌ Sem Movimentação ({semMov.length})
            </button>
          </div>

          {/* Controles da aba meta */}
          {aba === 'meta' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(perfil === 'gestor_master' || (perfil === 'administrativo' && nomeUser?.toLowerCase().includes('gislaine'))) && (
                  <>
                    <button onClick={() => conferirTudo('adm', true)} disabled={salvandoFech} style={{ background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.3)', borderRadius: 7, padding: '6px 12px', color: '#f0b429', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}>✓ Marcar todos ADM</button>
                    <button onClick={() => conferirTudo('adm', false)} disabled={salvandoFech} style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 7, padding: '6px 12px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}>○ Desmarcar ADM</button>
                  </>
                )}
                {podeMarcarConferencia && (
                  <>
                    <button onClick={() => conferirTudo('marina', true)} disabled={salvandoFech} style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 7, padding: '6px 12px', color: '#60a5fa', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}>✓ Marcar todos Conferência</button>
                    <button onClick={() => conferirTudo('marina', false)} disabled={salvandoFech} style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 7, padding: '6px 12px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}>○ Desmarcar Conferência</button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="🔍 Buscar empresa ou ID..."
                  style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 12px', color: '#e8eaf0', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', minWidth: 200 }} />
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                  style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', color: '#e8eaf0', fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                  <option value="todos">👤 Todos os vendedores</option>
                  {vendedores.filter(v => v !== 'todos').map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {['todos','pendentes','conferidos','questionamentos'].map((k) => (
                  <button key={k} onClick={() => setFiltro(k)}
                    style={{ background: filtro === k ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${filtro === k ? 'rgba(240,180,41,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, padding: '5px 10px', color: filtro === k ? '#f0b429' : '#6b7280', cursor: 'pointer', fontSize: '0.72rem', fontWeight: filtro === k ? 700 : 400, fontFamily: 'inherit' }}>
                    {k === 'todos' ? 'Todos' : k === 'pendentes' ? 'Pendentes' : k === 'conferidos' ? 'Conferidos' : '⚠️ Questões'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabela */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>Carregando...</div>
          ) : aba === 'meta' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: '#0f1218' }}>
                <tr>
                  {['ID','Empresa','%','Produto','Vendedor','Regra','Mês Meta','Valor Meta','✓ ADM','✓ Conferência','⚠️'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: ['✓ ADM','✓ Conferência','⚠️'].includes(h) ? 'center' : 'left', color: '#4b5563', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresasFiltradas.map((emp, i) => {
                  const temQuestao = emp.questionamento && !emp.questionamento_resolvido;
                  const rowBg = temQuestao ? 'rgba(248,113,113,0.04)' : emp.conferido_adm && emp.conferido_marina ? 'rgba(52,211,153,0.03)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                  return (
                    <tr key={emp.id} style={{ background: rowBg }}>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#6b7280', fontSize: '0.72rem' }}>{emp.produto_id || '—'}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.empresa_nome}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        {emp.pct_consultor && emp.pct_consultor < 100
                          ? <span style={{ background: 'rgba(240,180,41,0.12)', color: '#f0b429', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>{Number(emp.pct_consultor).toFixed(0)}%</span>
                          : <span style={{ color: '#4b5563', fontSize: '0.72rem' }}>100%</span>}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#a78bfa', whiteSpace: 'nowrap' }}>{emp.produto}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{emp.consultor_nome}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {emp.regra === 'beneficio' ? '1ª Rec.' : emp.regra === 'convenio' ? '3º Mês' : emp.regra === 'upsell' ? '📈' : 'Manual'}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#60a5fa', whiteSpace: 'nowrap' }}>{fmtMes(emp.competencia_meta)}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#34d399', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(emp.valor_meta)}</td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        <button onClick={() => (perfil === 'gestor_master' || (perfil === 'administrativo' && nomeUser?.toLowerCase().includes('gislaine'))) && conferirEmpresa(emp, 'adm')} disabled={salvando[emp.id] || !(perfil === 'gestor_master' || (perfil === 'administrativo' && nomeUser?.toLowerCase().includes('gislaine')))}
                          title={emp.conferido_adm ? `${emp.conferido_adm_por} · ${fmtDate(emp.conferido_adm_em)}` : 'Marcar ADM (Gislaine)'}
                          style={{ background: emp.conferido_adm ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${emp.conferido_adm ? 'rgba(240,180,41,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: emp.conferido_adm ? '#f0b429' : '#4b5563', cursor: podeMarcarADM ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                          {emp.conferido_adm ? '✓' : '○'}
                        </button>
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        <button onClick={() => (podeMarcarConferencia && emp.conferido_adm) && conferirEmpresa(emp, 'marina')} disabled={salvando[emp.id] || !podeMarcarConferencia || !emp.conferido_adm}
                          title={!emp.conferido_adm ? 'Aguardando confirmação ADM' : emp.conferido_marina ? `${emp.conferido_marina_por} · ${fmtDate(emp.conferido_marina_em)}` : 'Marcar Conferência'}
                          style={{ background: emp.conferido_marina ? 'rgba(96,165,250,0.15)' : !emp.conferido_adm ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${emp.conferido_marina ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: emp.conferido_marina ? '#60a5fa' : !emp.conferido_adm ? '#1f2937' : '#4b5563', cursor: (podeMarcarConferencia && emp.conferido_adm) ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                          {emp.conferido_marina ? '✓' : '○'}
                        </button>
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                        <button onClick={() => setModalQuestao(emp)}
                          style={{ background: temQuestao ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${temQuestao ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: temQuestao ? '#f87171' : '#4b5563', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                          {temQuestao ? '⚠️' : '💬'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(240,180,41,0.05)', borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                  <td colSpan={7} style={{ padding: '10px 12px', fontWeight: 700, color: '#f0b429', fontSize: '0.82rem' }}>TOTAL ({empresasFiltradas.length})</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#34d399', textAlign: 'right' }}>{fmt(empresasFiltradas.reduce((s,e)=>s+(e.valor_meta||0),0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          ) : (
            // Aba sem movimentação
            (() => {
              const vendedoresSemMov = ['todos', ...new Set(semMov.map(e => e.consultor_principal?.nome).filter(Boolean))].sort();
              const semMovFiltradas = semMov.filter(e => {
                const b = busca.trim().toLowerCase();
                const bateNome = !b || e.nome?.toLowerCase().includes(b) || String(e.produto_id || '').includes(busca.trim());
                const bateVend = filtroVendedor === 'todos' || e.consultor_principal?.nome === filtroVendedor;
                return bateNome && bateVend;
              });
              return (
            <>
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: '#0f1218', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar empresa ou ID..."
                style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 12px', color: '#e8eaf0', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', minWidth: 200, flex: 1 }} />
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', color: '#e8eaf0', fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                <option value="todos">👤 Todos os vendedores</option>
                {vendedoresSemMov.filter(v => v !== 'todos').map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: '#0f1218' }}>
                <tr>
                  {['ID','Empresa','Produto','Vendedor','Potencial/mês'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Potencial/mês' ? 'right' : 'left', color: '#4b5563', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semMovFiltradas.map((emp, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', opacity: 0.7 }}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#6b7280', fontSize: '0.72rem' }}>{emp.produto_id}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600 }}>{emp.nome}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#a78bfa' }}>{emp.produto_contratado}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem' }}>{emp.consultor_principal?.nome || '—'}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'right', color: '#9ca3af' }}>{emp.potencial_movimentacao > 0 ? fmt(emp.potencial_movimentacao) : '—'}</td>
                  </tr>
                ))}
                {semMovFiltradas.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#4b5563' }}>{busca.trim() ? 'Nenhuma empresa encontrada.' : 'Todas as empresas da equipe estão na meta 🎉'}</td></tr>
                )}
              </tbody>
            </table>
            </>
              );
            })()
          )}
        </div>

        {/* Footer */}
        {(podeConferir || podeAprovar) && (
          <div style={{ background: '#161a26', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '14px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={obsFechamento} onChange={e => setObsFechamento(e.target.value)} placeholder="Observação (opcional)..."
                style={{ flex: 1, minWidth: 200, background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' }} />
              {podeConferir && (
                <button onClick={() => executarAcaoFechamento('conferido')} disabled={salvandoFech || !todasConferidas}
                  title={!todasConferidas ? `Faltam ${empresas.length - Math.min(confADM, confMarina)} empresa(s)` : ''}
                  style={{ background: todasConferidas ? '#2563eb' : 'rgba(37,99,235,0.2)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: todasConferidas ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  📋 Enviar para {diretor} aprovar {!todasConferidas ? `(${empresas.length - Math.min(confADM, confMarina)} pendentes)` : ''}
                </button>
              )}
              {podeAprovar && (
                <>
                  <button onClick={() => executarAcaoFechamento('aprovado')} disabled={salvandoFech}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    ✅ Aprovar Fechamento
                  </button>
                  <button onClick={() => executarAcaoFechamento('rejeitado')} disabled={salvandoFech}
                    style={{ background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    ✕ Rejeitar
                  </button>
                </>
              )}
            </div>
            {podeConferir && !todasConferidas && (
              <div style={{ marginTop: 6, color: '#f0b429', fontSize: '0.7rem' }}>⚠️ Confira todas as empresas (ADM + Conferência) antes de enviar para aprovação.</div>
            )}
          </div>
        )}
      </div>

      {/* Modal de questionamento (timeline) */}
      {modalQuestao && (
        <ModalQuestionamento
          empresa={modalQuestao}
          nomeUser={nomeUser}
          perfilUser={perfil}
          onClose={(resolvido) => {
            setModalQuestao(null);
            if (resolvido) carregarDados();
            else carregarDados();
          }}
        />
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function RelatorioFechamento() {
  const [loading, setLoading]         = useState(true);
  const [xlsxLib, setXlsxLib]         = useState(null);
  const [fechamentos, setFechamentos] = useState([]);
  const [perfil, setPerfil]           = useState('');
  const [nomeUser, setNomeUser]       = useState('');
  const [gestorUser, setGestorUser]   = useState('');
  const [mesSel, setMesSel]           = useState('2026-07');
  const [mesesDisp, setMesesDisp]     = useState([]);
  const [modalFech, setModalFech]     = useState(null);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m.default || m)); }, []);
  useEffect(() => { carregar(); }, [mesSel]);

  async function carregar() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('user_profiles').select('perfil, nome, gestor_vinculado').eq('id', user.id).single();
        if (prof) { setPerfil(prof.perfil); setNomeUser(prof.nome); setGestorUser(prof.gestor_vinculado || ''); }
      }
      const { data: meses } = await supabase.from('fechamento_meta').select('competencia').order('competencia', { ascending: false });
      const unicos = [...new Set((meses || []).map(m => String(m.competencia).substring(0, 7)))];
      setMesesDisp(unicos);
      const { data: fechs } = await supabase.from('fechamento_meta').select('*').eq('competencia', mesSel + '-01').order('gestor_nome');
      setFechamentos(fechs || []);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  async function executarAcaoFechamento(fechamento, acao, obs) {
    const updates = { status: acao };
    if (acao === 'conferido') { updates.conferido_por = nomeUser; updates.conferido_em = new Date().toISOString(); updates.obs_conferencia = obs || null; }
    else if (acao === 'aprovado' || acao === 'rejeitado') { updates.aprovado_por = nomeUser; updates.aprovado_em = new Date().toISOString(); updates.obs_aprovacao = obs || null; }
    await supabase.from('fechamento_meta').update(updates).eq('id', fechamento.id);
    await carregar();
  }

  async function exportarExcel(fechamento) {
    if (!xlsxLib) return;
    const { data: emps } = await supabase.from('fechamento_meta_empresas').select('*').eq('fechamento_id', fechamento.id).order('empresa_nome');
    const headers = ['ID','Empresa','%','Produto','Vendedor','Regra','Mês Meta','Valor Meta','Conf. ADM','Por','Conf. Conferência','Por','Questionamento'];
    const rows = (emps || []).map(e => [
      e.produto_id, e.empresa_nome, e.pct_consultor,
      e.produto, e.consultor_nome,
      e.regra === 'beneficio' ? '1ª Recarga' : e.regra === 'convenio' ? '3º Mês' : e.regra === 'upsell' ? 'Upsell' : 'Manual',
      fmtMes(e.competencia_meta), e.valor_meta,
      e.conferido_adm ? 'Sim' : 'Não', e.conferido_adm_por || '',
      e.conferido_marina ? 'Sim' : 'Não', e.conferido_marina_por || '',
      e.questionamento || '',
    ]);
    const totalRow = ['','TOTAL','','','','','', (emps||[]).reduce((s,e)=>s+(e.valor_meta||0),0),'','','','',''];
    const ws = xlsxLib.utils.aoa_to_sheet([headers, ...rows, totalRow]);
    ws['!cols'] = [{wch:10},{wch:35},{wch:8},{wch:20},{wch:28},{wch:12},{wch:12},{wch:16},{wch:10},{wch:25},{wch:14},{wch:25},{wch:40}];
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'Fechamento');
    xlsxLib.writeFile(wb, `fechamento-${fechamento.gestor_nome.replace(/\s/g,'-')}-${mesSel}.xlsx`);
  }

  const fechamentosFiltrados = useMemo(() => {
    if (perfil === 'gestor_master') return fechamentos;
    if (perfil === 'administrativo') {
      // Gislaine vê tudo; Marina vê só equipes do Rossi
      if (nomeUser?.toLowerCase().includes('gislaine')) return fechamentos;
      return fechamentos.filter(f => DIRETOR_POR_GESTOR[f.gestor_nome] === 'Rossi');
    }
    if (perfil === 'supervisor_comercial') {
      return fechamentos.filter(f => DIRETOR_POR_GESTOR[f.gestor_nome] === 'Rossi');
    }
    return fechamentos.filter(f => f.gestor_nome === gestorUser || f.gestor_nome?.includes(gestorUser?.split(' ')[0]));
  }, [fechamentos, perfil, gestorUser, nomeUser]);

  const totalGeral   = fechamentosFiltrados.reduce((s, f) => s + (f.valor_total_meta || 0), 0);
  const totalAprov   = fechamentosFiltrados.filter(f => f.status === 'aprovado').length;
  const totalConfer  = fechamentosFiltrados.filter(f => f.status === 'conferido').length;
  const totalPending = fechamentosFiltrados.filter(f => ['apurando','em_conferencia'].includes(f.status)).length;

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><div style={s.spin}/><div style={{ color: '#6b7280' }}>Carregando...</div></div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#f0b429', fontWeight: 800, fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>♠ Vegas Card</div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 6px' }}>Fechamento de Meta</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Conferência e aprovação por equipe</p>
        </div>
        <select value={mesSel} onChange={e => setMesSel(e.target.value)}
          style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
          {mesesDisp.map(m => <option key={m} value={m}>{fmtMes(m + '-01')}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={s.kpi}><span style={s.kpiLabel}>Total Apurado</span><span style={{ ...s.kpiVal, color: '#34d399' }}>{fmt(totalGeral)}</span><span style={s.kpiSub}>{fechamentosFiltrados.length} equipes</span></div>
        <div style={{ ...s.kpi, borderColor: 'rgba(52,211,153,0.3)' }}><span style={s.kpiLabel}>✅ Aprovados</span><span style={{ ...s.kpiVal, color: '#34d399' }}>{totalAprov}</span><span style={s.kpiSub}>equipes aprovadas</span></div>
        <div style={{ ...s.kpi, borderColor: 'rgba(96,165,250,0.3)' }}><span style={s.kpiLabel}>📋 Conferidos</span><span style={{ ...s.kpiVal, color: '#60a5fa' }}>{totalConfer}</span><span style={s.kpiSub}>aguardando aprovação</span></div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.3)' }}><span style={s.kpiLabel}>⏳ Pendentes</span><span style={{ ...s.kpiVal, color: '#f0b429' }}>{totalPending}</span><span style={s.kpiSub}>em conferência</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {fechamentosFiltrados.map(fech => {
          const st      = STATUS[fech.status] || STATUS.apurando;
          const diretor = DIRETOR_POR_GESTOR[fech.gestor_nome] || '—';
          return (
            <div key={fech.id} style={{ background: '#161a26', border: `1px solid ${st.border}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 5 }}>👔 {fech.gestor_nome}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <BadgeStatus status={fech.status} />
                    <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>→ {diretor}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>{fmt(fech.valor_total_meta)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {['apurando','em_conferencia','conferido','aprovado'].map((st2, i) => {
                  const ativo = ['apurando','em_conferencia','conferido','aprovado'].indexOf(fech.status) >= i;
                  return <div key={st2} style={{ flex: 1, height: 3, background: ativo ? STATUS[st2].cor : '#1f2937', borderRadius: 2 }} />;
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {fech.apurado_por   && <div style={{ color: '#4b5563', fontSize: '0.7rem' }}>Apurado: <span style={{ color: '#9ca3af' }}>{fech.apurado_por}</span></div>}
                {fech.conferido_por && <div style={{ color: '#4b5563', fontSize: '0.7rem' }}>Conferido: <span style={{ color: '#60a5fa' }}>{fech.conferido_por}</span></div>}
                {fech.aprovado_por  && <div style={{ color: '#4b5563', fontSize: '0.7rem' }}>Aprovado: <span style={{ color: '#34d399' }}>{fech.aprovado_por}</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalFech(fech)} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit' }}>
                  🔍 Ver / Conferir
                </button>
                <button onClick={() => exportarExcel(fech)} disabled={!xlsxLib} style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '8px 12px', color: '#34d399', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', opacity: !xlsxLib ? 0.5 : 1 }}>
                  📥
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modalFech && (
        <ModalDetalhe
          fechamento={modalFech}
          onClose={() => { setModalFech(null); carregar(); }}
          onAcaoFechamento={executarAcaoFechamento}
          perfil={perfil}
          nomeUser={nomeUser}
        />
      )}
    </div>
  );
}

const s = {
  page:    { maxWidth: 1300, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh', boxSizing: 'border-box' },
  kpi:     { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel:{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  kpiVal:  { fontSize: '1.4rem', fontWeight: 700 },
  kpiSub:  { color: '#4b5563', fontSize: '0.72rem' },
  spin:    { width: 36, height: 36, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' },
};
