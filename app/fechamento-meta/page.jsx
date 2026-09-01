'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Check, CheckCheck, Circle, MessageSquare, AlertTriangle, X, Lock,
  Filter, FileSpreadsheet, Search, TrendingUp, Send, Briefcase,
  CircleSlash, User, ArrowRight, RefreshCw, Loader2,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const OUTFIT = "'Outfit', sans-serif";
const INTER  = "'Inter', sans-serif";

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
  apurando:       { label: 'Apurando',       cor: 'var(--vg-warning-fg)', bg: 'var(--vg-warning-bg)', border: 'var(--vg-warning-fg)' },
  em_conferencia: { label: 'Em Conferência', cor: 'var(--vg-info-fg)',    bg: 'var(--vg-info-bg)',    border: 'var(--vg-info-fg)'    },
  conferido:      { label: 'Conferido',      cor: 'var(--vg-brand-700)',  bg: 'var(--vg-brand-50)',   border: 'var(--vg-brand-500)'  },
  aprovado:       { label: 'Aprovado ✓',     cor: 'var(--vg-success-fg)', bg: 'var(--vg-success-bg)', border: 'var(--vg-success-fg)' },
  rejeitado:      { label: 'Rejeitado',      cor: 'var(--vg-danger-fg)',  bg: 'var(--vg-danger-bg)',  border: 'var(--vg-danger-fg)'  },
};

const DIRETOR_POR_GESTOR = {
  'Fabiano':          'Rossi',
  'Vago':             'Rossi',
  'Wagner Fernandes': 'Rossi',
  'Ronny Peterson':   'Ronny',
};

function BadgeStatus({ status }) {
  const st = STATUS[status] || STATUS.apurando;
  return <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.cor, borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: INTER }}>{st.label}</span>;
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,31,59,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: INTER }}>
      <div style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border)', borderRadius: 16, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', maxHeight: '80vh', boxShadow: '0 20px 50px rgba(28,31,59,0.18)' }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--vg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'var(--vg-danger-fg)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageSquare size={14} strokeWidth={1.75} />Questionamento</div>
            <div style={{ fontWeight: 700, color: 'var(--vg-ink)' }}>{empresa.empresa_nome}</div>
            <div style={{ color: 'var(--vg-muted)', fontSize: '0.78rem' }}>{empresa.produto} · {fmt(empresa.valor_meta)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdm && mensagens.length > 0 && !empresa.questionamento_resolvido && (
              <button onClick={resolverQuestionamento} style={{ background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 8, padding: '6px 14px', color: 'var(--vg-success-fg)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Check size={16} strokeWidth={1.75} />Resolver
              </button>
            )}
            <button onClick={() => onClose(false)} style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '6px 10px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center' }}><X size={16} strokeWidth={1.75} /></button>
          </div>
        </div>

        {/* Timeline de mensagens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mensagens.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--vg-muted)', fontSize: '0.82rem', padding: '20px 0' }}>Nenhuma mensagem ainda. Escreva abaixo para iniciar o questionamento.</div>
          )}
          {mensagens.map((msg, i) => {
            const isMe = msg.autor === nomeUser;
            const isAdmMsg = msg.perfil_autor === 'administrativo' || msg.perfil_autor === 'gestor_master';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', background: isAdmMsg ? 'var(--vg-info-bg)' : 'var(--vg-brand-50)', border: `1px solid ${isAdmMsg ? 'var(--vg-info-fg)' : 'var(--vg-brand-500)'}`, borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: isAdmMsg ? 'var(--vg-info-fg)' : 'var(--vg-brand-700)' }}>{msg.autor}</span>
                    <span style={{ background: isAdmMsg ? 'var(--vg-info-bg)' : 'var(--vg-brand-50)', color: isAdmMsg ? 'var(--vg-info-fg)' : 'var(--vg-brand-700)', borderRadius: 4, padding: '1px 6px', fontSize: '0.62rem', fontWeight: 600 }}>
                      {isAdmMsg ? 'ADM' : 'Conferência'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--vg-ink)', fontSize: '0.85rem', lineHeight: 1.5 }}>{msg.mensagem}</div>
                  <div style={{ color: 'var(--vg-muted)', fontSize: '0.65rem', marginTop: 5 }}>{fmtDate(msg.criado_em)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Campo de envio */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--vg-border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMensagem()}
              placeholder="Digite sua mensagem..."
              style={{ flex: 1, background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-ink)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={enviarMensagem} disabled={!texto.trim() || salvando}
              style={{ background: 'var(--vg-brand-500)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', opacity: !texto.trim() || salvando ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}>
              <Send size={16} strokeWidth={1.75} />
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
    if (campo === 'marina' && marcar) {
      // Só marca Conferência nas empresas que já têm ADM marcado
      await supabase.from('fechamento_meta_empresas').update(updates)
        .eq('fechamento_id', fechamento.id)
        .eq('conferido_adm', true);
    } else {
      await supabase.from('fechamento_meta_empresas').update(updates).eq('fechamento_id', fechamento.id);
    }
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

  const tdBorder = '1px solid var(--vg-border)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,31,59,0.4)', zIndex: 200, display: 'flex', alignItems: 'stretch', justifyContent: 'center', fontFamily: INTER }}>
      <div style={{ background: 'var(--vg-bg)', width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: 'var(--vg-surface)', borderBottom: '1px solid var(--vg-border)', padding: '16px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: 'var(--vg-muted)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>Vegas Card / Fechamento de Meta</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: OUTFIT, fontSize: 24, fontWeight: 700, color: 'var(--vg-ink)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Briefcase size={20} strokeWidth={1.75} color="var(--vg-brand-500)" />{fechamento.gestor_nome}</h1>
                <BadgeStatus status={fechamento.status} />
              </div>
              <div style={{ color: 'var(--vg-ink-secondary)', fontSize: '0.85rem', marginTop: 6 }}>{fmtMes(fechamento.competencia)} · Diretor: <span style={{ color: 'var(--vg-brand-700)', fontWeight: 600 }}>{diretor}</span></div>
            </div>
            <button onClick={onClose} style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '7px 14px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}><X size={16} strokeWidth={1.75} />Fechar</button>
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Total Apurado</div>
              <div className="vg-num" style={{ color: 'var(--vg-success-fg)', fontSize: '1.1rem', fontWeight: 700, fontFamily: OUTFIT }}>{fmt(totalApurado)}</div>
            </div>
            <div style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Na Meta</div>
              <div className="vg-num" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--vg-ink)', fontFamily: OUTFIT }}>{empresas.length}</div>
            </div>
            <div style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Sem Movimentação</div>
              <div className="vg-num" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--vg-ink-secondary)', fontFamily: OUTFIT }}>{semMov.length}</div>
            </div>
            <div style={{ background: 'var(--vg-brand-50)', border: '1px solid var(--vg-brand-500)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={12} strokeWidth={1.75} />ADM</div>
              <div className="vg-num" style={{ color: 'var(--vg-brand-700)', fontSize: '1.1rem', fontWeight: 700, fontFamily: OUTFIT }}>{confADM}/{empresas.length}</div>
            </div>
            <div style={{ background: 'var(--vg-info-bg)', border: '1px solid var(--vg-info-fg)', borderRadius: 10, padding: '10px 16px' }}>
              <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCheck size={12} strokeWidth={1.75} />Conferência</div>
              <div className="vg-num" style={{ color: 'var(--vg-info-fg)', fontSize: '1.1rem', fontWeight: 700, fontFamily: OUTFIT }}>{confMarina}/{empresas.length}</div>
            </div>
            {comQuestao > 0 && (
              <div style={{ background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 10, padding: '10px 16px' }}>
                <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} strokeWidth={1.75} />Questões</div>
                <div className="vg-num" style={{ color: 'var(--vg-danger-fg)', fontSize: '1.1rem', fontWeight: 700, fontFamily: OUTFIT }}>{comQuestao}</div>
              </div>
            )}
          </div>

          {/* Abas */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => setAba('meta')} style={{ background: aba === 'meta' ? 'var(--vg-brand-50)' : 'var(--vg-surface)', border: `1px solid ${aba === 'meta' ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`, borderRadius: 8, padding: '6px 16px', color: aba === 'meta' ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === 'meta' ? 700 : 500, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Check size={16} strokeWidth={1.75} />Na Meta ({empresas.length})
            </button>
            <button onClick={() => setAba('sem_mov')} style={{ background: aba === 'sem_mov' ? 'var(--vg-surface-muted)' : 'var(--vg-surface)', border: `1px solid ${aba === 'sem_mov' ? 'var(--vg-muted)' : 'var(--vg-border)'}`, borderRadius: 8, padding: '6px 16px', color: aba === 'sem_mov' ? 'var(--vg-ink-secondary)' : 'var(--vg-muted)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: aba === 'sem_mov' ? 700 : 500, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CircleSlash size={16} strokeWidth={1.75} />Sem Movimentação ({semMov.length})
            </button>
          </div>

          {/* Controles da aba meta */}
          {aba === 'meta' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(perfil === 'gestor_master' || (perfil === 'administrativo' && nomeUser?.toLowerCase().includes('gislaine'))) && (
                  <>
                    <button onClick={() => conferirTudo('adm', true)} disabled={salvandoFech} style={{ background: 'var(--vg-brand-50)', border: '1px solid var(--vg-brand-500)', borderRadius: 7, padding: '6px 12px', color: 'var(--vg-brand-700)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} strokeWidth={1.75} />Marcar todos ADM</button>
                    <button onClick={() => conferirTudo('adm', false)} disabled={salvandoFech} style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 7, padding: '6px 12px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Circle size={14} strokeWidth={1.75} />Desmarcar ADM</button>
                  </>
                )}
                {podeMarcarConferencia && (
                  <>
                    <button onClick={() => conferirTudo('marina', true)} disabled={salvandoFech} style={{ background: 'var(--vg-info-bg)', border: '1px solid var(--vg-info-fg)', borderRadius: 7, padding: '6px 12px', color: 'var(--vg-info-fg)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCheck size={14} strokeWidth={1.75} />Marcar todos Conferência</button>
                    <button onClick={() => conferirTudo('marina', false)} disabled={salvandoFech} style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 7, padding: '6px 12px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Circle size={14} strokeWidth={1.75} />Desmarcar Conferência</button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <Search size={14} strokeWidth={1.75} color="var(--vg-muted)" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
                  <input value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar empresa ou ID..."
                    style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 7, padding: '5px 12px 5px 30px', color: 'var(--vg-ink)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', minWidth: 200 }} />
                </div>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                  style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 7, padding: '5px 10px', color: 'var(--vg-ink)', fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                  <option value="todos">Todos os vendedores</option>
                  {vendedores.filter(v => v !== 'todos').map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {['todos','pendentes','conferidos','questionamentos'].map((k) => (
                  <button key={k} onClick={() => setFiltro(k)}
                    style={{ background: filtro === k ? 'var(--vg-brand-50)' : 'var(--vg-surface)', border: `1px solid ${filtro === k ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`, borderRadius: 7, padding: '5px 10px', color: filtro === k ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: filtro === k ? 700 : 500, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {k === 'questionamentos' && <AlertTriangle size={13} strokeWidth={1.75} />}
                    {k === 'todos' ? 'Todos' : k === 'pendentes' ? 'Pendentes' : k === 'conferidos' ? 'Conferidos' : 'Questões'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabela */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--vg-muted)' }}>Carregando...</div>
          ) : aba === 'meta' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--vg-surface-muted)' }}>
                <tr>
                  {['ID','Empresa','%','Produto','Vendedor','Regra','Mês Meta','Valor Meta','ADM','Conferência','Questão'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: ['ADM','Conferência','Questão'].includes(h) ? 'center' : h === 'Valor Meta' ? 'right' : 'left', color: 'var(--vg-ink-secondary)', fontWeight: 600, borderBottom: '1px solid var(--vg-border)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresasFiltradas.map((emp, i) => {
                  const temQuestao = emp.questionamento && !emp.questionamento_resolvido;
                  const rowBg = temQuestao ? 'var(--vg-danger-bg)' : emp.conferido_adm && emp.conferido_marina ? 'var(--vg-success-bg)' : 'transparent';
                  return (
                    <tr key={emp.id} style={{ background: rowBg }}
                      onMouseEnter={e => { if (rowBg === 'transparent') e.currentTarget.style.background = 'var(--vg-surface-muted)'; }}
                      onMouseLeave={e => { if (rowBg === 'transparent') e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-muted)', fontSize: '0.72rem' }}>{emp.produto_id || '—'}</td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, fontWeight: 600, color: 'var(--vg-ink)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.empresa_nome}</td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, textAlign: 'center' }}>
                        {emp.pct_consultor && emp.pct_consultor < 100
                          ? <span style={{ background: 'var(--vg-brand-50)', color: 'var(--vg-brand-700)', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 700 }}>{Number(emp.pct_consultor).toFixed(0)}%</span>
                          : <span style={{ color: 'var(--vg-muted)', fontSize: '0.72rem' }}>100%</span>}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-brand-700)', whiteSpace: 'nowrap' }}>{emp.produto}</td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-ink)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{emp.consultor_nome}</td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-ink-secondary)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {emp.regra === 'beneficio' ? '1ª Rec.' : emp.regra === 'convenio' ? '3º Mês' : emp.regra === 'upsell' ? <TrendingUp size={14} strokeWidth={1.75} style={{ verticalAlign: 'middle' }} /> : 'Manual'}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-info-fg)', whiteSpace: 'nowrap' }}>{fmtMes(emp.competencia_meta)}</td>
                      <td className="vg-num" style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-success-fg)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(emp.valor_meta)}</td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, textAlign: 'center' }}>
                        <button onClick={() => (perfil === 'gestor_master' || (perfil === 'administrativo' && nomeUser?.toLowerCase().includes('gislaine'))) && conferirEmpresa(emp, 'adm')} disabled={salvando[emp.id] || !(perfil === 'gestor_master' || (perfil === 'administrativo' && nomeUser?.toLowerCase().includes('gislaine')))}
                          title={emp.conferido_adm ? `${emp.conferido_adm_por} · ${fmtDate(emp.conferido_adm_em)}` : 'Marcar ADM (Gislaine)'}
                          style={{ background: emp.conferido_adm ? 'var(--vg-success-bg)' : 'var(--vg-surface)', border: `1px solid ${emp.conferido_adm ? 'var(--vg-success-fg)' : 'var(--vg-border-field)'}`, borderRadius: 6, padding: '4px 9px', color: emp.conferido_adm ? 'var(--vg-success-fg)' : 'var(--vg-ink-secondary)', cursor: podeMarcarADM ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', opacity: podeMarcarADM ? 1 : 0.5, display: 'inline-flex', alignItems: 'center' }}>
                          {emp.conferido_adm ? <Check size={16} strokeWidth={1.75} /> : <Circle size={16} strokeWidth={1.75} />}
                        </button>
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, textAlign: 'center' }}>
                        <button onClick={() => (podeMarcarConferencia && emp.conferido_adm) && conferirEmpresa(emp, 'marina')} disabled={salvando[emp.id] || !podeMarcarConferencia || !emp.conferido_adm}
                          title={!emp.conferido_adm ? 'Aguardando confirmação ADM' : emp.conferido_marina ? `${emp.conferido_marina_por} · ${fmtDate(emp.conferido_marina_em)}` : 'Marcar Conferência'}
                          style={{ background: emp.conferido_marina ? 'var(--vg-success-bg)' : 'var(--vg-surface)', border: `1px solid ${emp.conferido_marina ? 'var(--vg-success-fg)' : 'var(--vg-border-field)'}`, borderRadius: 6, padding: '4px 9px', color: emp.conferido_marina ? 'var(--vg-success-fg)' : 'var(--vg-ink-secondary)', cursor: (podeMarcarConferencia && emp.conferido_adm) ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', opacity: (podeMarcarConferencia && emp.conferido_adm) ? 1 : 0.5, display: 'inline-flex', alignItems: 'center' }}>
                          {emp.conferido_marina ? <CheckCheck size={16} strokeWidth={1.75} /> : <Circle size={16} strokeWidth={1.75} />}
                        </button>
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: tdBorder, textAlign: 'center' }}>
                        <button onClick={() => setModalQuestao(emp)}
                          title={temQuestao ? 'Questionamento aberto' : 'Abrir questionamento'}
                          style={{ background: temQuestao ? 'var(--vg-danger-bg)' : 'var(--vg-surface)', border: `1px solid ${temQuestao ? 'var(--vg-danger-fg)' : 'var(--vg-border-field)'}`, borderRadius: 6, padding: '4px 9px', color: temQuestao ? 'var(--vg-danger-fg)' : 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center' }}>
                          {temQuestao ? <AlertTriangle size={16} strokeWidth={1.75} /> : <MessageSquare size={16} strokeWidth={1.75} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--vg-surface-muted)', borderTop: '2px solid var(--vg-border)' }}>
                  <td colSpan={7} style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--vg-brand-700)', fontSize: '0.82rem' }}>TOTAL ({empresasFiltradas.length})</td>
                  <td className="vg-num" style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--vg-success-fg)', textAlign: 'right' }}>{fmt(empresasFiltradas.reduce((s,e)=>s+(e.valor_meta||0),0))}</td>
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
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: 'var(--vg-surface-muted)', borderBottom: '1px solid var(--vg-border)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flex: 1, minWidth: 200 }}>
                <Search size={14} strokeWidth={1.75} color="var(--vg-muted)" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa ou ID..."
                  style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 7, padding: '5px 12px 5px 30px', color: 'var(--vg-ink)', fontSize: '0.78rem', fontFamily: 'inherit', outline: 'none', width: '100%' }} />
              </div>
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 7, padding: '5px 10px', color: 'var(--vg-ink)', fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                <option value="todos">Todos os vendedores</option>
                {vendedoresSemMov.filter(v => v !== 'todos').map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--vg-surface-muted)' }}>
                <tr>
                  {['ID','Empresa','Produto','Vendedor','Potencial/mês'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Potencial/mês' ? 'right' : 'left', color: 'var(--vg-ink-secondary)', fontWeight: 600, borderBottom: '1px solid var(--vg-border)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semMovFiltradas.map((emp, i) => (
                  <tr key={i} style={{ opacity: 0.75 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--vg-surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-muted)', fontSize: '0.72rem' }}>{emp.produto_id}</td>
                    <td style={{ padding: '9px 12px', borderBottom: tdBorder, fontWeight: 600, color: 'var(--vg-ink)' }}>{emp.nome}</td>
                    <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-brand-700)' }}>{emp.produto_contratado}</td>
                    <td style={{ padding: '9px 12px', borderBottom: tdBorder, color: 'var(--vg-ink)', fontSize: '0.78rem' }}>{emp.consultor_principal?.nome || '—'}</td>
                    <td className="vg-num" style={{ padding: '9px 12px', borderBottom: tdBorder, textAlign: 'right', color: 'var(--vg-ink-secondary)' }}>{emp.potencial_movimentacao > 0 ? fmt(emp.potencial_movimentacao) : '—'}</td>
                  </tr>
                ))}
                {semMovFiltradas.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--vg-muted)' }}>{busca.trim() ? 'Nenhuma empresa encontrada.' : 'Todas as empresas da equipe estão na meta.'}</td></tr>
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
          <div style={{ background: 'var(--vg-surface)', borderTop: '1px solid var(--vg-border)', padding: '14px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={obsFechamento} onChange={e => setObsFechamento(e.target.value)} placeholder="Observação (opcional)..."
                style={{ flex: 1, minWidth: 200, background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-ink)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' }} />
              {podeConferir && (
                <button onClick={() => executarAcaoFechamento('conferido')} disabled={salvandoFech || !todasConferidas}
                  title={!todasConferidas ? `Faltam ${empresas.length - Math.min(confADM, confMarina)} empresa(s)` : ''}
                  style={{ background: todasConferidas ? 'var(--vg-brand-500)' : 'var(--vg-brand-50)', color: todasConferidas ? '#fff' : 'var(--vg-brand-700)', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: todasConferidas ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ArrowRight size={16} strokeWidth={1.75} />Enviar para {diretor} aprovar {!todasConferidas ? `(${empresas.length - Math.min(confADM, confMarina)} pendentes)` : ''}
                </button>
              )}
              {podeAprovar && (
                <>
                  <button onClick={() => executarAcaoFechamento('aprovado')} disabled={salvandoFech}
                    style={{ background: 'var(--vg-success-fg)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={16} strokeWidth={1.75} />Aprovar Fechamento
                  </button>
                  <button onClick={() => executarAcaoFechamento('rejeitado')} disabled={salvandoFech}
                    style={{ background: 'var(--vg-danger-bg)', color: 'var(--vg-danger-fg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <X size={16} strokeWidth={1.75} />Rejeitar
                  </button>
                </>
              )}
            </div>
            {podeConferir && !todasConferidas && (
              <div style={{ marginTop: 6, color: 'var(--vg-warning-fg)', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={13} strokeWidth={1.75} />Confira todas as empresas (ADM + Conferência) antes de enviar para aprovação.</div>
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
  // Geração/atualização do fechamento (apenas gestor_master).
  const [showGerar, setShowGerar]     = useState(false);
  const [preview, setPreview]         = useState(null);   // resumo do que será criado
  const [carregandoPrev, setCarregandoPrev] = useState(false);
  const [gerando, setGerando]         = useState(false);
  const [erroGerar, setErroGerar]     = useState('');

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m.default || m)); }, []);
  useEffect(() => { carregar(); }, [mesSel]);

  // Primeiro dia do mês seguinte a mesSel (para filtrar competencia_meta por intervalo).
  function proximoMesPrimeiroDia(ym) {
    const [y, m] = ym.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  }

  // Lê valor_meta_empresa da competência e monta o preview do fechamento (agrupado por gestor).
  async function abrirGerar() {
    setErroGerar(''); setPreview(null); setShowGerar(true); setCarregandoPrev(true);
    try {
      const ini = mesSel + '-01';
      const fim = proximoMesPrimeiroDia(mesSel);

      const { data: metas } = await supabase.from('valor_meta_empresa')
        .select('empresa_id, consultor_id, competencia_meta, valor_meta, regra, pct_consultor')
        .gte('competencia_meta', ini).lt('competencia_meta', fim);
      const metasList = metas || [];

      const empIds = [...new Set(metasList.map(m => m.empresa_id).filter(Boolean))];
      const empMap = {};
      for (let i = 0; i < empIds.length; i += 300) {
        const { data: emps } = await supabase.from('empresas')
          .select('id, nome, produto_id, produto_contratado, consultor_principal_id')
          .in('id', empIds.slice(i, i + 300));
        for (const e of (emps || [])) empMap[e.id] = e;
      }

      const { data: cons } = await supabase.from('consultores').select('id, nome, gestor');
      const consMap = {}; for (const c of (cons || [])) consMap[c.id] = c;

      // Uma linha de fechamento_meta_empresas por linha de valor_meta_empresa.
      // Gestor = consultor da meta OU (upsell/consultor_id NULL) consultor principal da empresa.
      const grupos = {}; // gestor_nome -> { gestor_nome, rows:[], valorTotal }
      for (const mv of metasList) {
        const emp = empMap[mv.empresa_id];
        const donoId = mv.consultor_id || emp?.consultor_principal_id;
        const dono = consMap[donoId];
        const gestor = dono?.gestor || '(sem gestor)';
        const g = grupos[gestor] || (grupos[gestor] = { gestor_nome: gestor, rows: [], valorTotal: 0 });
        g.rows.push({
          produto_id: emp?.produto_id ?? null,
          empresa_nome: emp?.nome ?? '—',
          produto: emp?.produto_contratado ?? null,
          consultor_nome: dono?.nome ?? '—',
          regra: mv.regra ?? null,
          competencia_meta: mv.competencia_meta,
          valor_meta: mv.valor_meta || 0,
          pct_consultor: mv.pct_consultor ?? null,
          conferido_adm: false,
          conferido_marina: false,
        });
        g.valorTotal += mv.valor_meta || 0;
      }
      const gruposArr = Object.values(grupos).sort((a, b) => a.gestor_nome.localeCompare(b.gestor_nome));

      // Fechamento existente da competência (para comparação e bloqueio).
      const { data: fechExist } = await supabase.from('fechamento_meta')
        .select('id, gestor_nome, status, valor_total_meta').eq('competencia', ini);
      const existentes = fechExist || [];
      const aprovado = existentes.find(f => f.status === 'aprovado');

      let existe = null;
      if (existentes.length) {
        const ids = existentes.map(f => f.id);
        let itens = 0, valorAtual = 0, conferidos = 0;
        for (let i = 0; i < ids.length; i += 300) {
          const { data: rows } = await supabase.from('fechamento_meta_empresas')
            .select('valor_meta, conferido_adm, conferido_marina').in('fechamento_id', ids.slice(i, i + 300));
          for (const r of (rows || [])) {
            itens++; valorAtual += r.valor_meta || 0;
            if (r.conferido_adm || r.conferido_marina) conferidos++;
          }
        }
        existe = { fechamentos: existentes.length, itens, valorAtual, conferidos };
      }

      setPreview({
        nGestores: gruposArr.length,
        nEmpresas: gruposArr.reduce((s, g) => s + g.rows.length, 0),
        valorTotal: gruposArr.reduce((s, g) => s + g.valorTotal, 0),
        grupos: gruposArr,
        existe,
        aprovadoGestor: aprovado ? aprovado.gestor_nome : null,
      });
    } catch (err) {
      console.error(err); setErroGerar('Falha ao ler os dados da competência. Tente novamente.');
    }
    setCarregandoPrev(false);
  }

  // Replica o SQL manual: apaga o fechamento da competência e recria a partir de valor_meta_empresa.
  async function confirmarGerar() {
    if (!preview || preview.aprovadoGestor) return;
    setGerando(true); setErroGerar('');
    try {
      const ini = mesSel + '-01';
      // 1/2. Apaga fechamento_meta_empresas e fechamento_meta da competência.
      const { data: fechExist } = await supabase.from('fechamento_meta').select('id').eq('competencia', ini);
      const ids = (fechExist || []).map(f => f.id);
      for (let i = 0; i < ids.length; i += 300) {
        await supabase.from('fechamento_meta_empresas').delete().in('fechamento_id', ids.slice(i, i + 300));
      }
      await supabase.from('fechamento_meta').delete().eq('competencia', ini);

      // 3/4. Um fechamento_meta por gestor (status em_conferencia) + suas empresas (lotes de 50).
      const agora = new Date().toISOString();
      for (const g of preview.grupos) {
        const { data: novo, error } = await supabase.from('fechamento_meta').insert({
          competencia: ini,
          gestor_nome: g.gestor_nome,
          status: 'em_conferencia',
          apurado_por: nomeUser,
          apurado_em: agora,
          valor_total_meta: g.valorTotal,
        }).select('id').single();
        if (error || !novo) throw error || new Error('Falha ao inserir fechamento');
        const linhas = g.rows.map(r => ({ ...r, fechamento_id: novo.id }));
        for (let i = 0; i < linhas.length; i += 50) {
          const { error: e2 } = await supabase.from('fechamento_meta_empresas').insert(linhas.slice(i, i + 50));
          if (e2) throw e2;
        }
      }

      setShowGerar(false); setPreview(null);
      await carregar();
    } catch (err) {
      console.error(err); setErroGerar('Falha ao gerar o fechamento. Verifique e tente novamente.');
    }
    setGerando(false);
  }

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
      <div style={{ textAlign: 'center' }}><div style={s.spin}/><div style={{ color: 'var(--vg-muted)' }}>Carregando...</div></div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: 'var(--vg-muted)', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Vegas Card / Fechamento de Meta</div>
          <h1 style={{ fontFamily: OUTFIT, fontSize: 24, fontWeight: 700, color: 'var(--vg-ink)', margin: '0 0 6px' }}>Fechamento de Meta</h1>
          <p style={{ color: 'var(--vg-ink-secondary)', fontSize: '0.9rem', margin: 0 }}>Conferência e aprovação por equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {perfil === 'gestor_master' && (
            <button onClick={abrirGerar} disabled={showGerar}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--vg-brand-500)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: '0.85rem', fontWeight: 600, fontFamily: INTER, cursor: 'pointer', opacity: showGerar ? 0.6 : 1 }}>
              <RefreshCw size={16} strokeWidth={1.75} /> Gerar fechamento
            </button>
          )}
          <select value={mesSel} onChange={e => setMesSel(e.target.value)}
            style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 10, padding: '9px 14px', color: 'var(--vg-ink)', fontSize: '0.85rem', fontFamily: INTER, cursor: 'pointer', outline: 'none' }}>
            {mesesDisp.map(m => <option key={m} value={m}>{fmtMes(m + '-01')}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={s.kpi}><span style={s.kpiLabel}>Total Apurado</span><span className="vg-num" style={{ ...s.kpiVal, color: 'var(--vg-success-fg)' }}>{fmt(totalGeral)}</span><span style={s.kpiSub}>{fechamentosFiltrados.length} equipes</span></div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-success-fg)' }}><span style={s.kpiLabel}>Aprovados</span><span className="vg-num" style={{ ...s.kpiVal, color: 'var(--vg-success-fg)' }}>{totalAprov}</span><span style={s.kpiSub}>equipes aprovadas</span></div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-info-fg)' }}><span style={s.kpiLabel}>Conferidos</span><span className="vg-num" style={{ ...s.kpiVal, color: 'var(--vg-info-fg)' }}>{totalConfer}</span><span style={s.kpiSub}>aguardando aprovação</span></div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-warning-fg)' }}><span style={s.kpiLabel}>Pendentes</span><span className="vg-num" style={{ ...s.kpiVal, color: 'var(--vg-warning-fg)' }}>{totalPending}</span><span style={s.kpiSub}>em conferência</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {fechamentosFiltrados.map(fech => {
          const st      = STATUS[fech.status] || STATUS.apurando;
          const diretor = DIRETOR_POR_GESTOR[fech.gestor_nome] || '—';
          return (
            <div key={fech.id} style={{ background: 'var(--vg-surface)', border: `1px solid ${st.border}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--vg-ink)', marginBottom: 5, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: OUTFIT }}><Briefcase size={16} strokeWidth={1.75} color="var(--vg-brand-500)" />{fech.gestor_nome}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <BadgeStatus status={fech.status} />
                    <span style={{ color: 'var(--vg-muted)', fontSize: '0.7rem' }}>→ {diretor}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="vg-num" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--vg-success-fg)', fontFamily: OUTFIT }}>{fmt(fech.valor_total_meta)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {['apurando','em_conferencia','conferido','aprovado'].map((st2, i) => {
                  const ativo = ['apurando','em_conferencia','conferido','aprovado'].indexOf(fech.status) >= i;
                  return <div key={st2} style={{ flex: 1, height: 3, background: ativo ? STATUS[st2].cor : 'var(--vg-border)', borderRadius: 2 }} />;
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {fech.apurado_por   && <div style={{ color: 'var(--vg-muted)', fontSize: '0.7rem' }}>Apurado: <span style={{ color: 'var(--vg-ink-secondary)' }}>{fech.apurado_por}</span></div>}
                {fech.conferido_por && <div style={{ color: 'var(--vg-muted)', fontSize: '0.7rem' }}>Conferido: <span style={{ color: 'var(--vg-info-fg)' }}>{fech.conferido_por}</span></div>}
                {fech.aprovado_por  && <div style={{ color: 'var(--vg-muted)', fontSize: '0.7rem' }}>Aprovado: <span style={{ color: 'var(--vg-success-fg)' }}>{fech.aprovado_por}</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalFech(fech)} style={{ flex: 1, background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-ink)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Search size={16} strokeWidth={1.75} />Ver / Conferir
                </button>
                <button onClick={() => exportarExcel(fech)} disabled={!xlsxLib} title="Exportar Excel" style={{ background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-success-fg)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', opacity: !xlsxLib ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}>
                  <FileSpreadsheet size={16} strokeWidth={1.75} />
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

      {/* Diálogo — Gerar/atualizar fechamento (gestor_master) */}
      {showGerar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,31,59,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: INTER }}>
          <div style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border)', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 20px 50px rgba(28,31,59,0.18)', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            {/* Header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--vg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: OUTFIT, fontSize: 18, fontWeight: 700, color: 'var(--vg-ink)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={18} strokeWidth={1.75} color="var(--vg-brand-500)" /> Gerar fechamento — {fmtMes(mesSel + '-01')}
              </div>
              <button onClick={() => { if (!gerando) { setShowGerar(false); setPreview(null); setErroGerar(''); } }} disabled={gerando}
                style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '6px 10px', color: 'var(--vg-ink-secondary)', cursor: gerando ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center' }}><X size={16} strokeWidth={1.75} /></button>
            </div>

            {/* Corpo */}
            <div style={{ padding: '18px 20px', overflowY: 'auto' }}>
              {carregandoPrev ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--vg-muted)', padding: '16px 0', justifyContent: 'center' }}>
                  <Loader2 size={18} strokeWidth={1.75} style={{ animation: 'spin 0.8s linear infinite' }} /> Lendo metas da competência…
                </div>
              ) : erroGerar ? (
                <div style={{ background: 'var(--vg-danger-bg)', color: 'var(--vg-danger-fg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 10, padding: '12px 14px', fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />{erroGerar}
                </div>
              ) : preview && preview.aprovadoGestor ? (
                <div style={{ background: 'var(--vg-danger-bg)', color: 'var(--vg-danger-fg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 10, padding: '14px 16px', fontSize: '0.85rem', lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Lock size={18} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Não é possível regerar: o fechamento de <strong>{preview.aprovadoGestor}</strong> já foi aprovado. Regerar apagaria a conferência e alteraria um número já validado.</span>
                </div>
              ) : preview ? (
                <>
                  <div style={{ ...CAPTIONDLG, marginBottom: 10 }}>Será criado a partir de <strong>valor_meta_empresa</strong> para {fmtMes(mesSel + '-01')}:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <DlgKpi label="Gestores"  valor={preview.nGestores} />
                    <DlgKpi label="Empresas"  valor={preview.nEmpresas} />
                    <DlgKpi label="Valor total" valor={fmt(preview.valorTotal)} moeda />
                  </div>

                  {preview.existe ? (
                    <div style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                      <div style={{ ...CAPTIONDLG, fontWeight: 600, color: 'var(--vg-ink-secondary)', marginBottom: 6 }}>Já existe fechamento para o mês (será substituído):</div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--vg-ink)' }}>
                        <span>Hoje: <strong className="vg-num">{preview.existe.itens}</strong> itens · <strong className="vg-num">{fmt(preview.existe.valorAtual)}</strong></span>
                        <span>Novo: <strong className="vg-num">{preview.nEmpresas}</strong> itens · <strong className="vg-num">{fmt(preview.valorTotal)}</strong></span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...CAPTIONDLG, marginBottom: 12 }}>Ainda não há fechamento para este mês — será criado do zero.</div>
                  )}

                  {preview.existe && preview.existe.conferidos > 0 && (
                    <div style={{ background: 'var(--vg-warning-bg)', color: 'var(--vg-warning-fg)', border: '1px solid var(--vg-warning-fg)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <AlertTriangle size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span><strong>{preview.existe.conferidos}</strong> empresa{preview.existe.conferidos > 1 ? 's' : ''} já conferida{preview.existe.conferidos > 1 ? 's' : ''} — a conferência será reiniciada.</span>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Ações */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--vg-border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { if (!gerando) { setShowGerar(false); setPreview(null); setErroGerar(''); } }} disabled={gerando}
                style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-border-field)', borderRadius: 8, padding: '9px 18px', color: 'var(--vg-ink-secondary)', cursor: gerando ? 'default' : 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={confirmarGerar} disabled={gerando || carregandoPrev || !preview || !!preview?.aprovadoGestor || !!erroGerar}
                style={{ background: 'var(--vg-brand-500)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: (gerando || carregandoPrev || !preview || preview?.aprovadoGestor || erroGerar) ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', opacity: (gerando || carregandoPrev || !preview || preview?.aprovadoGestor || erroGerar) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {gerando ? <><Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 0.8s linear infinite' }} /> Gerando…</> : <><Check size={16} strokeWidth={1.75} /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// KPI compacto do diálogo de geração.
const CAPTIONDLG = { fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--vg-muted)' };
function DlgKpi({ label, valor, moeda }) {
  return (
    <div style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div className="vg-num" style={{ fontFamily: OUTFIT, fontSize: moeda ? 15 : 20, fontWeight: 700, color: 'var(--vg-ink)', whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  );
}

const s = {
  page:    { maxWidth: 1300, margin: '0 auto', padding: '32px 24px', fontFamily: INTER, color: 'var(--vg-ink)', background: 'var(--vg-bg)', minHeight: '100vh', boxSizing: 'border-box' },
  kpi:     { background: 'var(--vg-surface)', border: '1px solid var(--vg-border)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel:{ color: 'var(--vg-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  kpiVal:  { fontSize: '1.4rem', fontWeight: 700, fontFamily: OUTFIT },
  kpiSub:  { color: 'var(--vg-muted)', fontSize: '0.72rem' },
  spin:    { width: 36, height: 36, border: '3px solid var(--vg-border)', borderTop: '3px solid var(--vg-brand-500)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' },
};
