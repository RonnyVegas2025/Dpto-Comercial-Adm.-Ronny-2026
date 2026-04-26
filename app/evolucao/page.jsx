'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const norm   = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function tendencia(vals) {
  const ativos = vals.filter(v => v > 0);
  if (ativos.length === 0) return 'none';
  if (ativos.length === 1) return 'new';
  const ultimo = vals[vals.length - 1];
  const penult = vals.slice(0, -1).reverse().find(v => v > 0) || 0;
  if (ultimo > penult * 1.05) return 'up';
  if (ultimo < penult * 0.95) return 'down';
  return 'flat';
}

const TEND = {
  up:   { color: '#16a34a', label: '↑ Crescendo' },
  down: { color: '#dc2626', label: '↓ Caindo' },
  flat: { color: '#6b7280', label: '→ Estável' },
  new:  { color: '#2563eb', label: '✦ Nova' },
  none: { color: '#4b5563', label: '— Sem movimentação' },
};

const POR_PAGINA = 12;

function Paginacao({ pagina, total, onChange }) {
  if (total <= 1) return null;
  const start = Math.max(1, pagina - 2);
  const end   = Math.min(total, pagina + 2);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button style={{ ...ps.btn, ...(pagina === 1 ? ps.disabled : {}) }} onClick={() => onChange(pagina - 1)} disabled={pagina === 1}>‹</button>
      {start > 1 && <><button style={ps.btn} onClick={() => onChange(1)}>1</button><span style={ps.dots}>…</span></>}
      {pages.map(p => <button key={p} style={{ ...ps.btn, ...(p === pagina ? ps.ativo : {}) }} onClick={() => onChange(p)}>{p}</button>)}
      {end < total && <><span style={ps.dots}>…</span><button style={ps.btn} onClick={() => onChange(total)}>{total}</button></>}
      <button style={{ ...ps.btn, ...(pagina === total ? ps.disabled : {}) }} onClick={() => onChange(pagina + 1)} disabled={pagina === total}>›</button>
      <span style={{ color: '#4b5563', fontSize: '0.75rem', marginLeft: 4 }}>de {total}</span>
    </div>
  );
}

// Banner de filtros ativos — aparece em todas as abas
function BannerFiltros({ filtros, onLimpar }) {
  const tags = [];
  if (filtros.diretor   !== 'todos') tags.push({ label: `Diretor: ${filtros.diretor}`,       cor: '#a78bfa' });
  if (filtros.gestor    !== 'todos') tags.push({ label: `Gestor: ${filtros.gestor}`,          cor: '#60a5fa' });
  if (filtros.produto   !== 'todos') tags.push({ label: `Produto: ${filtros.produto}`,        cor: '#a78bfa' });
  if (filtros.depto     !== 'todos') tags.push({ label: `Equipe: ${filtros.depto}`,            cor: '#f97316' });
  if (filtros.vendedor  !== 'todos') tags.push({ label: `Vendedor: ${filtros.vendedor}`,      cor: '#34d399' });
  if (filtros.categoria !== 'todos') tags.push({ label: `Cat.: ${filtros.categoria}`,         cor: '#f0b429' });
  if (filtros.status    !== 'todos') tags.push({ label: filtros.status === 'creditou' ? '✅ Movimentaram' : '❌ Sem movimentação', cor: filtros.status === 'creditou' ? '#16a34a' : '#dc2626' });
  if (filtros.tend      !== 'todos') tags.push({ label: `Tend.: ${TEND[filtros.tend]?.label}`, cor: TEND[filtros.tend]?.color });
  if (filtros.busca.trim())          tags.push({ label: `Busca: "${filtros.busca}"`,           cor: '#e8eaf0' });
  if (tags.length === 0) return null;

  return (
    <div style={bb.wrap}>
      <span style={bb.icone}>🔍</span>
      <span style={bb.label}>Analisando:</span>
      <div style={bb.tags}>
        {tags.map((t, i) => (
          <span key={i} style={{ ...bb.tag, borderColor: t.cor + '55', color: t.cor, background: t.cor + '15' }}>
            {t.label}
          </span>
        ))}
      </div>
      <button style={bb.limpar} onClick={onLimpar}>✕ Limpar</button>
    </div>
  );
}

const bb = {
  wrap:   { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap' },
  icone:  { fontSize: '0.9rem' },
  label:  { color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' },
  tags:   { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
  tag:    { border: '1px solid', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' },
  limpar: { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '4px 12px', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
};

function TabelaEvolucao({ lista, meses, libMap }) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [lista.length]);
  const totalPaginas = Math.ceil(lista.length / POR_PAGINA);
  const listaPagina  = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totaisMes    = meses.map(m => lista.reduce((s, e) => s + (libMap[`${e.produto_id}__${m}`] || 0), 0));
  const totalGeral   = lista.reduce((s, e) => s + e.totalCreditado, 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>
          Exibindo <strong style={{ color: '#e8eaf0' }}>{listaPagina.length}</strong> de <strong style={{ color: '#e8eaf0' }}>{lista.length}</strong> empresas
        </div>
        <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Empresa</th>
              <th style={s.th}>Categoria</th>
              <th style={s.th}>Produto</th>
              <th style={s.th}>Vendedor</th>
              <th style={s.th}>Gestor</th>
              {meses.map(m => <th key={m} style={{ ...s.th, textAlign: 'right' }}>{fmtMes(m)}</th>)}
              <th style={{ ...s.th, textAlign: 'right' }}>Movimentado</th>
              <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
              <th style={{ ...s.th, textAlign: 'center' }}>Tendência</th>
            </tr>
          </thead>
          <tbody>
            {listaPagina.map((e, i) => {
              const ts = TEND[e.tend];
              return (
                <tr key={e.produto_id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', opacity: !e.creditou ? 0.6 : 1 }}>
                  <td style={s.td}><div style={{ fontWeight: 600 }}>{e.nome}</div><div style={{ color: '#4b5563', fontSize: '0.7rem' }}>ID {e.produto_id}</div></td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.categoria}</td>
                  <td style={{ ...s.td, color: '#a78bfa', fontSize: '0.78rem' }}>{e.produto}</td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>{e.vendedor}</td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.gestor}</td>
                  {meses.map(m => {
                    const v = libMap[`${e.produto_id}__${m}`] || 0;
                    return <td key={m} style={{ ...s.td, textAlign: 'right' }}>{v > 0 ? <span style={{ color: '#34d399', fontWeight: 500 }}>{fmt(v)}</span> : <span style={{ color: '#374151' }}>—</span>}</td>;
                  })}
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{e.totalCreditado > 0 ? fmt(e.totalCreditado) : <span style={{ color: '#374151' }}>—</span>}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{e.creditou ? <span style={s.badgeGreen}>✅ Movimentou</span> : <span style={s.badgeRed}>❌ Sem movimentação</span>}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={{ color: ts.color, fontSize: '0.78rem', fontWeight: 600 }}>{ts.label}</span></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)', background: 'rgba(240,180,41,0.05)' }}>
              <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: '#f0b429', fontSize: '0.82rem', paddingTop: 14 }}>TOTAL ({lista.length} empresas)</td>
              {totaisMes.map((t, i) => <td key={i} style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#f0b429', paddingTop: 14 }}>{t > 0 ? fmt(t) : <span style={{ color: '#374151' }}>—</span>}</td>)}
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#f0b429', paddingTop: 14 }}>{fmt(totalGeral)}</td>
              <td colSpan={2} style={{ ...s.td, paddingTop: 14 }} />
            </tr>
          </tfoot>
        </table>
      </div>
      {totalPaginas > 1 && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}><Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} /></div>}
    </>
  );
}

function TabelaCruzamento({ lista, meses }) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [lista.length]);
  const listaSorted  = [...lista].filter(e => e.potencial_movimentacao > 0).sort((a, b) => (b.pctPot || 0) - (a.pctPot || 0));
  const totalPaginas = Math.ceil(listaSorted.length / POR_PAGINA);
  const listaPagina  = listaSorted.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totPot       = listaSorted.reduce((s, e) => s + (e.potencial_movimentacao || 0), 0);
  const totEsp       = listaSorted.reduce((s, e) => s + ((e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * meses.length), 0);
  const totCred      = listaSorted.reduce((s, e) => s + e.totalCreditado, 0);
  const pctGeral     = totEsp > 0 ? (totCred / totEsp) * 100 : 0;
  const corGeral     = pctGeral >= 80 ? '#16a34a' : pctGeral >= 40 ? '#f0b429' : '#dc2626';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}><strong style={{ color: '#e8eaf0' }}>{listaSorted.length}</strong> empresas com potencial cadastrado</div>
        <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>{['Empresa','Cat.','Vendedor','Gestor','Diretor','Potencial/mês','Esperado Total','Movimentado Total','% Realizado','Barra','Status'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {listaPagina.map((e, i) => {
              const pct = e.pctPot || 0;
              const cor = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f0b429' : '#dc2626';
              const stLabel = pct >= 80 ? '✅ Atingindo' : pct >= 40 ? '⚡ Parcial' : e.totalCreditado === 0 ? '❌ Sem crédito' : '⚠️ Abaixo';
              return (
                <tr key={e.produto_id} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                  <td style={s.td}><div style={{ fontWeight: 600 }}>{e.nome}</div><div style={{ color: '#4b5563', fontSize: '0.7rem' }}>ID {e.produto_id}</div></td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.categoria}</td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>{e.vendedor}</td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.gestor}</td>
                  <td style={{ ...s.td, color: '#a78bfa', fontSize: '0.78rem' }}>{e.diretor}</td>
                  <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                  <td style={{ ...s.td, color: '#f0b429' }}>{fmt((e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * meses.length)}</td>
                  <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(e.totalCreditado)}</td>
                  <td style={{ ...s.td, color: cor, fontWeight: 700 }}>{fmtPct(pct)}</td>
                  <td style={{ ...s.td, minWidth: 100 }}>
                    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ background: cor, height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4 }} />
                    </div>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>{stLabel}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)', background: 'rgba(240,180,41,0.05)' }}>
              <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: '#f0b429', fontSize: '0.82rem', paddingTop: 14 }}>TOTAL ({listaSorted.length} empresas)</td>
              <td style={{ ...s.td, fontWeight: 700, color: '#f0b429', paddingTop: 14 }}>{fmt(totPot)}</td>
              <td style={{ ...s.td, color: '#f0b429', fontWeight: 700, paddingTop: 14 }}>{fmt(totEsp)}</td>
              <td style={{ ...s.td, color: '#34d399', fontWeight: 700, paddingTop: 14 }}>{fmt(totCred)}</td>
              <td style={{ ...s.td, fontWeight: 700, color: corGeral, paddingTop: 14 }}>{fmtPct(pctGeral)}</td>
              <td colSpan={2} style={{ ...s.td, paddingTop: 14 }} />
            </tr>
          </tfoot>
        </table>
      </div>
      {totalPaginas > 1 && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}><Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} /></div>}
    </>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Evolucao() {
  const [loading, setLoading]   = useState(true);
  const [empresas, setEmpresas] = useState([]);
  const [libs, setLibs]         = useState([]);
  const [meses, setMeses]       = useState([]);
  const [aba, setAba]           = useState('evolucao');

  const [busca, setBusca]                     = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroDiretor, setFiltroDiretor]     = useState('todos');
  const [filtroGestor, setFiltroGestor]       = useState('todos');
  const [filtroDepto, setFiltroDepto]         = useState('todos');
  const [filtroVendedor, setFiltroVendedor]   = useState('todos');
  const [filtroProduto, setFiltroProduto]     = useState('todos');
  const [filtroStatus, setFiltroStatus]       = useState('todos');
  const [filtroTend, setFiltroTend]           = useState('todos');
  const [ordenar, setOrdenar]                 = useState('ultimo');

  useEffect(() => { carregar(); }, []);
  // Cascata: ao mudar diretor → reset gestor e vendedor; ao mudar gestor → reset vendedor
  useEffect(() => { setFiltroGestor('todos'); setFiltroVendedor('todos'); }, [filtroDiretor]);
  useEffect(() => { setFiltroVendedor('todos'); }, [filtroGestor]);

  async function carregar() {
    setLoading(true);
    const [{ data: emps }, { data: libsData }] = await Promise.all([
      supabase
        .from('empresas')
        .select(`id, produto_id, nome, categoria, produto_contratado, potencial_movimentacao, peso_categoria,
          consultor_principal:consultor_principal_id (id, nome, setor, equipe, gestor, tipo)`)
        .eq('ativo', true)
        .in('categoria', ['Beneficios', 'Benefícios', 'Bonus', 'Bônus', 'Convênio', 'Convenio', 'Mobilidade'])
        .not('produto_contratado', 'ilike', '%desconto condicional%')
        .not('categoria', 'eq', 'Taxa Negativa'),
      supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia'),
    ]);
    setMeses([...new Set((libsData || []).map(l => l.competencia))].sort());
    setEmpresas(emps || []);
    setLibs(libsData || []);
    setLoading(false);
  }

  const libMap = useMemo(() => {
    const m = {};
    for (const l of libs) { const k = `${l.produto_id}__${l.competencia}`; m[k] = (m[k] || 0) + l.total_liberado; }
    return m;
  }, [libs]);

  const listaCompleta = useMemo(() => empresas
    .filter(e => !e.produto_contratado?.toLowerCase().includes('desconto condicional') && e.categoria !== 'Taxa Negativa')
    .map(e => {
    const vals = meses.map(m => libMap[`${e.produto_id}__${m}`] || 0);
    const totalCreditado = vals.reduce((s, v) => s + v, 0);
    const tend = tendencia(vals);
    return {
      ...e,
      vals, totalCreditado, tend,
      creditou:     totalCreditado > 0,
      pctPot:       e.potencial_movimentacao > 0 ? (totalCreditado / (e.potencial_movimentacao * (e.peso_categoria || 1) * meses.length)) * 100 : null,
      ultimoValor:  vals[vals.length - 1] || 0,
      // depto vem do campo equipe do consultor (Parcerias, Venda Nova, etc)
      depto:        e.consultor_principal?.equipe || e.consultor_principal?.setor || '—',
      gestor:       e.consultor_principal?.gestor || '—',
      diretor:      e.consultor_principal?.gestor || '—', // será ajustado abaixo
      vendedor:     e.consultor_principal?.nome   || '—',
      produto:      e.produto_contratado || '—',
    };
  }), [empresas, meses, libMap]);

  // Opções de filtro em cascata
  const opcoes = useMemo(() => {
    const categorias = [...new Set(listaCompleta.map(e => e.categoria).filter(Boolean))].sort();
    const diretores  = [...new Set(listaCompleta.map(e => e.diretor).filter(v => v !== '—'))].sort();
    const deptos     = [...new Set(listaCompleta.map(e => e.depto).filter(v => v !== '—'))].sort();
    const produtos   = [...new Set(listaCompleta.map(e => e.produto).filter(v => v !== '—'))].sort();

    // Gestores filtrados pelo diretor selecionado
    const baseGest   = filtroDiretor === 'todos' ? listaCompleta : listaCompleta.filter(e => e.diretor === filtroDiretor);
    const gestores   = [...new Set(baseGest.map(e => e.gestor).filter(v => v !== '—'))].sort();

    // Vendedores filtrados pelo gestor selecionado
    const baseVend   = filtroGestor === 'todos' ? baseGest : baseGest.filter(e => e.gestor === filtroGestor);
    const vendedores = [...new Set(baseVend.map(e => e.vendedor).filter(v => v !== '—'))].sort();

    return { categorias, diretores, deptos, gestores, vendedores, produtos };
  }, [listaCompleta, filtroDiretor, filtroGestor]);

  const listaFiltrada = useMemo(() => {
    let arr = [...listaCompleta];
    if (busca.trim())            { const b = norm(busca); arr = arr.filter(e => norm(e.nome).includes(b) || String(e.produto_id).includes(b)); }
    if (filtroCategoria !== 'todos') arr = arr.filter(e => e.categoria === filtroCategoria);
    if (filtroDiretor   !== 'todos') arr = arr.filter(e => e.diretor   === filtroDiretor);
    if (filtroGestor    !== 'todos') arr = arr.filter(e => e.gestor    === filtroGestor);
    if (filtroDepto     !== 'todos') arr = arr.filter(e => e.depto     === filtroDepto);
    if (filtroVendedor  !== 'todos') arr = arr.filter(e => e.vendedor  === filtroVendedor);
    if (filtroProduto   !== 'todos') arr = arr.filter(e => e.produto   === filtroProduto);
    if (filtroStatus === 'creditou')    arr = arr.filter(e =>  e.creditou);
    if (filtroStatus === 'sem_credito') arr = arr.filter(e => !e.creditou);
    if (filtroTend !== 'todos') arr = arr.filter(e => e.tend === filtroTend);
    if (ordenar === 'ultimo')    arr.sort((a, b) => b.ultimoValor - a.ultimoValor);
    if (ordenar === 'total')     arr.sort((a, b) => b.totalCreditado - a.totalCreditado);
    if (ordenar === 'nome')      arr.sort((a, b) => a.nome.localeCompare(b.nome));
    if (ordenar === 'potencial') arr.sort((a, b) => (b.potencial_movimentacao || 0) - (a.potencial_movimentacao || 0));
    if (ordenar === 'sem')       arr.sort((a, b) => Number(a.creditou) - Number(b.creditou));
    return arr;
  }, [listaCompleta, busca, filtroCategoria, filtroDiretor, filtroGestor, filtroDepto, filtroVendedor, filtroProduto, filtroStatus, filtroTend, ordenar]);

  const kpis = useMemo(() => {
    const total       = listaFiltrada.length;
    const creditaram  = listaFiltrada.filter(e => e.creditou).length;
    const semCredito  = total - creditaram;
    const totalCred   = listaFiltrada.reduce((s, e) => s + e.totalCreditado, 0);
    const crescendo   = listaFiltrada.filter(e => e.tend === 'up').length;
    const pctAtivacao = total > 0 ? (creditaram / total) * 100 : 0;
    const porMes      = meses.map(m => ({
      mes: m,
      total:    listaFiltrada.reduce((s, e) => s + (libMap[`${e.produto_id}__${m}`] || 0), 0),
      empresas: listaFiltrada.filter(e => (libMap[`${e.produto_id}__${m}`] || 0) > 0).length,
    }));
    return { total, creditaram, semCredito, totalCred, crescendo, pctAtivacao, porMes };
  }, [listaFiltrada, meses, libMap]);

  function limparFiltros() {
    setBusca(''); setFiltroCategoria('todos'); setFiltroDiretor('todos');
    setFiltroGestor('todos'); setFiltroDepto('todos'); setFiltroVendedor('todos');
    setFiltroProduto('todos'); setFiltroStatus('todos'); setFiltroTend('todos'); setOrdenar('ultimo');
  }

  const filtrosAtivos = { diretor: filtroDiretor, gestor: filtroGestor, depto: filtroDepto, vendedor: filtroVendedor, categoria: filtroCategoria, produto: filtroProduto, status: filtroStatus, tend: filtroTend, busca };
  const temFiltro = filtroDiretor !== 'todos' || filtroGestor !== 'todos' || filtroDepto !== 'todos' ||
    filtroVendedor !== 'todos' || filtroCategoria !== 'todos' || filtroProduto !== 'todos' ||
    filtroStatus !== 'todos' || filtroTend !== 'todos' || busca.trim();

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><div style={s.spin}></div><div style={{ color: '#6b7280' }}>Carregando...</div></div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const abas = [
    { key: 'evolucao',   label: '📈 Evolução por Empresa' },
    { key: 'resumo',     label: '🔢 Resumo por Mês' },
    { key: 'cruzamento', label: '🎯 Potencial vs Creditado' },
  ];

  return (
    <div style={s.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #1e2435 !important; color: #e8eaf0 !important; }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Evolução de Novas Empresas</h1>
          <p style={s.sub}>Todas as categorias — acompanhe quem movimentou e quem ainda não movimentou</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/importar-movimentacao" style={s.linkBtnGreen}>📊 Importar Movimentação</a>
          <a href="/importar-liberacoes" style={{ ...s.linkBtnGreen, color: '#60a5fa', borderColor: 'rgba(96,165,250,0.2)', background: 'rgba(96,165,250,0.08)' }}>💳 Importar Liberações</a>
        </div>
      </div>

      {/* Banner de filtros ativos — visível em TODAS as abas */}
      {temFiltro && <BannerFiltros filtros={filtrosAtivos} onLimpar={limparFiltros} />}

      {/* KPIs reativos */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Total Empresas</span>
          <span style={s.kpiVal}>{kpis.total}</span>
          <span style={s.kpiSub}>Todas as categorias</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(22,163,74,0.35)' }}>
          <span style={s.kpiLabel}>Movimentaram</span>
          <span style={{ ...s.kpiVal, color: '#16a34a' }}>{kpis.creditaram}</span>
          <span style={s.kpiSub}>{fmtPct(kpis.pctAtivacao)} de ativação</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(220,38,38,0.35)' }}>
          <span style={s.kpiLabel}>Sem Movimentação</span>
          <span style={{ ...s.kpiVal, color: '#dc2626' }}>{kpis.semCredito}</span>
          <span style={s.kpiSub}>ainda não movimentaram</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.35)' }}>
          <span style={s.kpiLabel}>Total Movimentado</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{fmt(kpis.totalCred)}</span>
          <span style={s.kpiSub}>{meses.length} meses · todas as categorias</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Crescendo</span>
          <span style={s.kpiVal}>{kpis.crescendo}</span>
          <span style={s.kpiSub}>empresas em alta</span>
        </div>
      </div>

      {/* Abas */}
      <div style={s.tabs}>
        {abas.map(a => (
          <button key={a.key} style={{ ...s.tab, ...(aba === a.key ? s.tabAtiva : {}) }} onClick={() => setAba(a.key)}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ═══ ABA: EVOLUÇÃO ═══ */}
      {aba === 'evolucao' && (
        <div style={s.card}>
          {/* Linha 1: busca + status + tendência + categoria */}
          <div style={s.filtroRow}>
            <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e => setBusca(e.target.value)} />
            <select style={s.sel} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todas as empresas</option>
              <option value="creditou">✅ Creditaram</option>
              <option value="sem_credito">❌ Sem crédito</option>
            </select>
            <select style={s.sel} value={filtroTend} onChange={e => setFiltroTend(e.target.value)}>
              <option value="todos">Todas as tendências</option>
              <option value="up">↑ Crescendo</option>
              <option value="down">↓ Caindo</option>
              <option value="flat">→ Estável</option>
              <option value="new">✦ Nova</option>
              <option value="none">— Sem crédito</option>
            </select>
            <select style={s.sel} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="todos">Todas as categorias</option>
              {opcoes.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroProduto !== 'todos' ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)', color: filtroProduto !== 'todos' ? '#a78bfa' : '#e8eaf0' }}
              value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
              <option value="todos">Todos os produtos</option>
              {opcoes.produtos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* Linha 2: hierarquia em cascata + depto + ordenar */}
          <div style={s.filtroRow}>
            <select style={{ ...s.sel, borderColor: 'rgba(167,139,250,0.4)', color: filtroDiretor !== 'todos' ? '#a78bfa' : '#e8eaf0' }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
              <option value="todos">Todos os diretores</option>
              {opcoes.diretores.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroGestor !== 'todos' ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.12)', color: filtroGestor !== 'todos' ? '#60a5fa' : '#e8eaf0' }} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">{filtroDiretor === 'todos' ? 'Todos os gestores' : `Gestores de ${filtroDiretor}`}</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroDepto !== 'todos' ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.12)', color: filtroDepto !== 'todos' ? '#f97316' : '#e8eaf0' }} value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
              <option value="todos">Todas as equipes</option>
              {opcoes.deptos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroVendedor !== 'todos' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.12)', color: filtroVendedor !== 'todos' ? '#34d399' : '#e8eaf0' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="todos">{filtroGestor === 'todos' ? 'Todos os vendedores' : `Vendedores de ${filtroGestor}`}</option>
              {opcoes.vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={s.sel} value={ordenar} onChange={e => setOrdenar(e.target.value)}>
              <option value="ultimo">Ordenar: Último mês</option>
              <option value="total">Ordenar: Total movimentado</option>
              <option value="potencial">Ordenar: Potencial</option>
              <option value="sem">Ordenar: Sem crédito primeiro</option>
              <option value="nome">Ordenar: Nome A-Z</option>
            </select>
          </div>
          <TabelaEvolucao lista={listaFiltrada} meses={meses} libMap={libMap} />
        </div>
      )}

      {/* ═══ ABA: RESUMO POR MÊS ═══ */}
      {aba === 'resumo' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🔢 Resumo por Mês</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
            {kpis.porMes.map(m => (
              <div key={m.mes} style={s.mesCard}>
                <div style={s.mesBadge}>{fmtMes(m.mes)}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399', margin: '12px 0 4px' }}>{fmt(m.total)}</div>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{m.empresas} empresas creditando</div>
                <div style={{ color: '#4b5563', fontSize: '0.75rem', marginTop: 2 }}>{kpis.total - m.empresas} sem crédito neste mês</div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ background: '#34d399', height: '100%', width: `${kpis.total > 0 ? (m.empresas / kpis.total) * 100 : 0}%` }} />
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 4 }}>{kpis.total > 0 ? fmtPct((m.empresas / kpis.total) * 100) : '0%'} de ativação</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, color: '#e8eaf0' }}>Distribuição de Tendências</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {['up','down','flat','new','none'].map(t => {
                const count = listaFiltrada.filter(e => e.tend === t).length;
                const ts = TEND[t];
                return (
                  <div key={t} style={{ ...s.mesCard, flex: '0 0 auto', minWidth: 140, cursor: 'pointer' }}
                    onClick={() => { setFiltroTend(t); setAba('evolucao'); }}>
                    <div style={{ color: ts.color, fontWeight: 700, fontSize: '1.6rem' }}>{count}</div>
                    <div style={{ color: ts.color, fontSize: '0.85rem', marginTop: 6 }}>{ts.label}</div>
                    <div style={{ color: '#4b5563', fontSize: '0.72rem', marginTop: 4 }}>clique para filtrar</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ABA: POTENCIAL VS CREDITADO ═══ */}
      {aba === 'cruzamento' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🎯 Potencial vs Creditado</div>
          <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 6, marginBottom: 16 }}>
            Empresas com potencial cadastrado · {meses.length} meses de referência
          </div>
          {/* Filtros de hierarquia também aqui */}
          <div style={{ ...s.filtroRow, marginBottom: 16 }}>
            <select style={{ ...s.sel, borderColor: filtroDiretor !== 'todos' ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.12)', color: filtroDiretor !== 'todos' ? '#a78bfa' : '#e8eaf0' }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
              <option value="todos">Todos os diretores</option>
              {opcoes.diretores.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroGestor !== 'todos' ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.12)', color: filtroGestor !== 'todos' ? '#60a5fa' : '#e8eaf0' }} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">{filtroDiretor === 'todos' ? 'Todos os gestores' : `Gestores de ${filtroDiretor}`}</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroDepto !== 'todos' ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.12)', color: filtroDepto !== 'todos' ? '#f97316' : '#e8eaf0' }} value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
              <option value="todos">Todas as equipes</option>
              {opcoes.deptos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroVendedor !== 'todos' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.12)', color: filtroVendedor !== 'todos' ? '#34d399' : '#e8eaf0' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="todos">{filtroGestor === 'todos' ? 'Todos os vendedores' : `Vendedores de ${filtroGestor}`}</option>
              {opcoes.vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <TabelaCruzamento lista={listaFiltrada} meses={meses} />
        </div>
      )}
    </div>
  );
}

const ps = {
  btn:     { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 32 },
  ativo:   { background: 'rgba(240,180,41,0.2)', borderColor: 'rgba(240,180,41,0.5)', color: '#f0b429', fontWeight: 700 },
  disabled:{ opacity: 0.3, cursor: 'default' },
  dots:    { color: '#4b5563', fontSize: '0.82rem', padding: '0 2px' },
};

const s = {
  page:        { maxWidth: 1400, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 16 },
  tag:         { color: '#34d399', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  title:       { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px' },
  sub:         { color: '#6b7280', fontSize: '0.9rem' },
  linkBtnGreen:{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '10px 20px', color: '#34d399', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  kpis:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 },
  kpi:         { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel:    { color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  kpiVal:      { fontSize: '1.4rem', fontWeight: 700 },
  kpiSub:      { color: '#4b5563', fontSize: '0.72rem' },
  tabs:        { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab:         { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 16px', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  tabAtiva:    { background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' },
  card:        { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardTitle:   { fontSize: '1rem', fontWeight: 700 },
  filtroRow:   { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  busca:       { flex: '1 1 220px', background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' },
  sel:         { background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:          { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 },
  td:          { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  badgeGreen:  { background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  badgeRed:    { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  mesCard:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', flex: '1 1 180px', minWidth: 180 },
  mesBadge:    { display: 'inline-block', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', borderRadius: 8, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 700 },
  spin:        { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #34d399', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
};
