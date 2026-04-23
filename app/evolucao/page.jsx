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
  none: { color: '#4b5563', label: '— Sem crédito' },
};

const POR_PAGINA = 25;

export default function Evolucao() {
  const [loading, setLoading]   = useState(true);
  const [empresas, setEmpresas] = useState([]);
  const [libs, setLibs]         = useState([]);
  const [meses, setMeses]       = useState([]);
  const [aba, setAba]           = useState('evolucao');
  const [pagina, setPagina]     = useState(1);

  // Filtros
  const [busca, setBusca]             = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroGestor, setFiltroGestor]       = useState('todos');
  const [filtroVendedor, setFiltroVendedor]   = useState('todos');
  const [filtroStatus, setFiltroStatus]       = useState('todos');
  const [filtroTend, setFiltroTend]           = useState('todos');
  const [ordenar, setOrdenar]                 = useState('ultimo');

  useEffect(() => { carregar(); }, []);

  // Reset página ao mudar filtro
  useEffect(() => { setPagina(1); }, [busca, filtroCategoria, filtroGestor, filtroVendedor, filtroStatus, filtroTend, ordenar]);

  // Reset vendedor quando gestor muda
  useEffect(() => { setFiltroVendedor('todos'); }, [filtroGestor]);

  async function carregar() {
    setLoading(true);
    const [{ data: emps }, { data: libsData }] = await Promise.all([
      supabase
        .from('empresas')
        .select(`
          id, produto_id, nome, categoria, produto_contratado, cartoes_emitidos,
          potencial_movimentacao, peso_categoria,
          consultor_principal:consultor_principal_id (id, nome, setor, gestor),
          parceiro:parceiro_id (nome)
        `)
        .eq('ativo', true)
        .in('categoria', ['Beneficios', 'Benefícios', 'Bonus', 'Bônus']),
      supabase
        .from('liberacoes')
        .select('produto_id, competencia, total_liberado')
        .order('competencia'),
    ]);
    const mesesUnicos = [...new Set((libsData || []).map(l => l.competencia))].sort();
    setMeses(mesesUnicos);
    setEmpresas(emps || []);
    setLibs(libsData || []);
    setLoading(false);
  }

  const libMap = useMemo(() => {
    const m = {};
    for (const l of libs) {
      const key = `${l.produto_id}__${l.competencia}`;
      m[key] = (m[key] || 0) + l.total_liberado;
    }
    return m;
  }, [libs]);

  // Lista completa enriquecida
  const listaCompleta = useMemo(() => {
    return empresas.map(e => {
      const vals = meses.map(m => libMap[`${e.produto_id}__${m}`] || 0);
      const totalCreditado = vals.reduce((s, v) => s + v, 0);
      const tend = tendencia(vals);
      const pctPot = e.potencial_movimentacao > 0
        ? (totalCreditado / (e.potencial_movimentacao * (e.peso_categoria || 1) * meses.length)) * 100
        : null;
      return {
        ...e,
        vals,
        totalCreditado,
        tend,
        creditou: totalCreditado > 0,
        pctPot,
        ultimoValor: vals[vals.length - 1] || 0,
        gestor:   e.consultor_principal?.gestor || '—',
        vendedor: e.consultor_principal?.nome   || '—',
        diretoria:e.consultor_principal?.setor  || '—',
      };
    });
  }, [empresas, meses, libMap]);

  // Opções de filtro — gestores sempre completos, vendedores em cascata
  const opcoes = useMemo(() => {
    const categorias = [...new Set(listaCompleta.map(e => e.categoria).filter(Boolean))].sort();
    const gestores   = [...new Set(listaCompleta.map(e => e.gestor).filter(v => v !== '—'))].sort();

    // Vendedores filtrados pelo gestor selecionado
    const baseVend = filtroGestor === 'todos'
      ? listaCompleta
      : listaCompleta.filter(e => e.gestor === filtroGestor);
    const vendedores = [...new Set(baseVend.map(e => e.vendedor).filter(v => v !== '—'))].sort();

    return { categorias, gestores, vendedores };
  }, [listaCompleta, filtroGestor]);

  // Lista filtrada (sem paginação) — usada para KPIs
  const listaFiltrada = useMemo(() => {
    let arr = [...listaCompleta];
    if (busca.trim()) {
      const b = norm(busca);
      arr = arr.filter(e => norm(e.nome).includes(b) || String(e.produto_id).includes(b));
    }
    if (filtroCategoria !== 'todos') arr = arr.filter(e => e.categoria === filtroCategoria);
    if (filtroGestor    !== 'todos') arr = arr.filter(e => e.gestor    === filtroGestor);
    if (filtroVendedor  !== 'todos') arr = arr.filter(e => e.vendedor  === filtroVendedor);
    if (filtroStatus === 'creditou')    arr = arr.filter(e => e.creditou);
    if (filtroStatus === 'sem_credito') arr = arr.filter(e => !e.creditou);
    if (filtroTend !== 'todos') arr = arr.filter(e => e.tend === filtroTend);

    if (ordenar === 'ultimo')    arr.sort((a, b) => b.ultimoValor - a.ultimoValor);
    if (ordenar === 'total')     arr.sort((a, b) => b.totalCreditado - a.totalCreditado);
    if (ordenar === 'nome')      arr.sort((a, b) => a.nome.localeCompare(b.nome));
    if (ordenar === 'potencial') arr.sort((a, b) => (b.potencial_movimentacao || 0) - (a.potencial_movimentacao || 0));
    if (ordenar === 'sem')       arr.sort((a, b) => Number(a.creditou) - Number(b.creditou));
    return arr;
  }, [listaCompleta, busca, filtroCategoria, filtroGestor, filtroVendedor, filtroStatus, filtroTend, ordenar]);

  // KPIs reativos — calculados sobre listaFiltrada
  const kpis = useMemo(() => {
    const total       = listaFiltrada.length;
    const creditaram  = listaFiltrada.filter(e => e.creditou).length;
    const semCredito  = total - creditaram;
    const totalCred   = listaFiltrada.reduce((s, e) => s + e.totalCreditado, 0);
    const crescendo   = listaFiltrada.filter(e => e.tend === 'up').length;
    const pctAtivacao = total > 0 ? (creditaram / total) * 100 : 0;
    const porMes      = meses.map(m => ({
      mes: m,
      total: listaFiltrada.reduce((s, e) => s + (libMap[`${e.produto_id}__${m}`] || 0), 0),
      empresas: listaFiltrada.filter(e => (libMap[`${e.produto_id}__${m}`] || 0) > 0).length,
    }));
    return { total, creditaram, semCredito, totalCred, crescendo, pctAtivacao, porMes };
  }, [listaFiltrada, meses, libMap]);

  // Paginação
  const totalPaginas = Math.ceil(listaFiltrada.length / POR_PAGINA);
  const listaPagina  = listaFiltrada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  function limparFiltros() {
    setBusca(''); setFiltroCategoria('todos'); setFiltroGestor('todos');
    setFiltroVendedor('todos'); setFiltroStatus('todos'); setFiltroTend('todos'); setOrdenar('ultimo');
  }

  const temFiltro = busca || filtroCategoria !== 'todos' || filtroGestor !== 'todos' ||
    filtroVendedor !== 'todos' || filtroStatus !== 'todos' || filtroTend !== 'todos';

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={s.spin}></div>
        <div style={{ color: '#6b7280' }}>Carregando dados...</div>
      </div>
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
          <h1 style={s.title}>Evolução de Créditos</h1>
          <p style={s.sub}>Empresas Benefícios/Bônus — acompanhe quem creditou e quem ainda não creditou</p>
        </div>
        <a href="/importar-liberacoes" style={s.linkBtnGreen}>💳 Importar Liberações</a>
      </div>

      {/* KPIs — reativos aos filtros */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Total Empresas</span>
          <span style={s.kpiVal}>{kpis.total}</span>
          <span style={s.kpiSub}>Benefícios + Bônus</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(22,163,74,0.35)' }}>
          <span style={s.kpiLabel}>Creditaram</span>
          <span style={{ ...s.kpiVal, color: '#16a34a' }}>{kpis.creditaram}</span>
          <span style={s.kpiSub}>{fmtPct(kpis.pctAtivacao)} de ativação</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(220,38,38,0.35)' }}>
          <span style={s.kpiLabel}>Sem Crédito</span>
          <span style={{ ...s.kpiVal, color: '#dc2626' }}>{kpis.semCredito}</span>
          <span style={s.kpiSub}>ainda não creditaram</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.35)' }}>
          <span style={s.kpiLabel}>Total Creditado</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{fmt(kpis.totalCred)}</span>
          <span style={s.kpiSub}>{meses.length} meses</span>
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
          {/* Filtros linha 1 */}
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
          </div>

          {/* Filtros linha 2 — cascata */}
          <div style={s.filtroRow}>
            <select style={s.sel} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">Todos os gestores</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={s.sel} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="todos">
                {filtroGestor === 'todos' ? 'Todos os vendedores' : `Vendedores de ${filtroGestor}`}
              </option>
              {opcoes.vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={s.sel} value={ordenar} onChange={e => setOrdenar(e.target.value)}>
              <option value="ultimo">Ordenar: Último mês</option>
              <option value="total">Ordenar: Total creditado</option>
              <option value="potencial">Ordenar: Potencial</option>
              <option value="sem">Ordenar: Sem crédito primeiro</option>
              <option value="nome">Ordenar: Nome A-Z</option>
            </select>
            {temFiltro && (
              <button style={s.btnLimpar} onClick={limparFiltros}>✕ Limpar filtros</button>
            )}
          </div>

          {/* Contador + indicador de filtro ativo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>
              Exibindo <strong style={{ color: '#e8eaf0' }}>{listaPagina.length}</strong> de{' '}
              <strong style={{ color: '#e8eaf0' }}>{listaFiltrada.length}</strong> empresas
              {listaFiltrada.length !== listaCompleta.length && (
                <span style={{ marginLeft: 8, color: '#f0b429' }}>· filtro ativo</span>
              )}
            </div>
            {/* Paginação topo */}
            {totalPaginas > 1 && <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Empresa</th>
                  <th style={s.th}>Categoria</th>
                  <th style={s.th}>Vendedor</th>
                  <th style={s.th}>Gestor</th>
                  {meses.map(m => <th key={m} style={{ ...s.th, textAlign: 'right' }}>{fmtMes(m)}</th>)}
                  <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {listaPagina.map((e, i) => {
                  const ts = TEND[e.tend];
                  return (
                    <tr key={e.produto_id} style={{
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      opacity: !e.creditou ? 0.6 : 1,
                    }}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{e.nome}</div>
                        <div style={{ color: '#4b5563', fontSize: '0.7rem' }}>ID {e.produto_id}</div>
                      </td>
                      <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.categoria}</td>
                      <td style={{ ...s.td, fontSize: '0.78rem' }}>{e.vendedor}</td>
                      <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.gestor}</td>
                      {meses.map(m => {
                        const v = libMap[`${e.produto_id}__${m}`] || 0;
                        return (
                          <td key={m} style={{ ...s.td, textAlign: 'right' }}>
                            {v > 0
                              ? <span style={{ color: '#34d399', fontWeight: 500 }}>{fmt(v)}</span>
                              : <span style={{ color: '#374151' }}>—</span>
                            }
                          </td>
                        );
                      })}
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>
                        {e.totalCreditado > 0 ? fmt(e.totalCreditado) : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        {e.creditou
                          ? <span style={s.badgeGreen}>✅ Creditou</span>
                          : <span style={s.badgeRed}>❌ Sem crédito</span>
                        }
                      </td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <span style={{ color: ts.color, fontSize: '0.78rem', fontWeight: 600 }}>{ts.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação rodapé */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
            </div>
          )}
        </div>
      )}

      {/* ═══ ABA: RESUMO POR MÊS ═══ */}
      {aba === 'resumo' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🔢 Resumo por Mês {temFiltro && <span style={{ color: '#f0b429', fontSize: '0.78rem', fontWeight: 400, marginLeft: 8 }}>· filtro ativo</span>}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
            {kpis.porMes.map(m => (
              <div key={m.mes} style={s.mesCard}>
                <div style={s.mesBadge}>{fmtMes(m.mes)}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399', margin: '12px 0 4px' }}>{fmt(m.total)}</div>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{m.empresas} empresas creditando</div>
                <div style={{ color: '#4b5563', fontSize: '0.75rem', marginTop: 2 }}>
                  {kpis.total - m.empresas} sem crédito neste mês
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ background: '#34d399', height: '100%', width: `${kpis.total > 0 ? (m.empresas / kpis.total) * 100 : 0}%` }}></div>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 4 }}>
                    {kpis.total > 0 ? fmtPct((m.empresas / kpis.total) * 100) : '0%'} de ativação
                  </div>
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
          <div style={s.cardTitle}>🎯 Potencial vs Creditado {temFiltro && <span style={{ color: '#f0b429', fontSize: '0.78rem', fontWeight: 400, marginLeft: 8 }}>· filtro ativo</span>}</div>
          <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 6, marginBottom: 16 }}>
            Empresas com potencial cadastrado · {meses.length} meses de referência
          </div>

          {/* Filtros cascata também aqui */}
          <div style={{ ...s.filtroRow, marginBottom: 16 }}>
            <select style={s.sel} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">Todos os gestores</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={s.sel} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="todos">
                {filtroGestor === 'todos' ? 'Todos os vendedores' : `Vendedores de ${filtroGestor}`}
              </option>
              {opcoes.vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Contador + paginação */}
          {(() => {
            const listaCruz = listaFiltrada.filter(e => e.potencial_movimentacao > 0).sort((a, b) => (b.pctPot || 0) - (a.pctPot || 0));
            const totalPagCruz = Math.ceil(listaCruz.length / POR_PAGINA);
            const [pagCruz, setPagCruz] = useState(1);
            const paginaCruz = listaCruz.slice((pagCruz - 1) * POR_PAGINA, pagCruz * POR_PAGINA);
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>
                    <strong style={{ color: '#e8eaf0' }}>{listaCruz.length}</strong> empresas com potencial cadastrado
                  </div>
                  {totalPagCruz > 1 && <Paginacao pagina={pagCruz} total={totalPagCruz} onChange={setPagCruz} />}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {['Empresa','Cat.','Vendedor','Gestor','Potencial/mês','Esperado Total','Creditado Total','% Realizado','Barra','Status'].map(h =>
                          <th key={h} style={s.th}>{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginaCruz.map((e, i) => {
                        const pct = e.pctPot || 0;
                        const cor = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f0b429' : '#dc2626';
                        const statusLabel = pct >= 80 ? '✅ Atingindo' : pct >= 40 ? '⚡ Parcial' : e.totalCreditado === 0 ? '❌ Sem crédito' : '⚠️ Abaixo';
                        return (
                          <tr key={e.produto_id} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                            <td style={s.td}>
                              <div style={{ fontWeight: 600 }}>{e.nome}</div>
                              <div style={{ color: '#4b5563', fontSize: '0.7rem' }}>ID {e.produto_id}</div>
                            </td>
                            <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.categoria}</td>
                            <td style={{ ...s.td, fontSize: '0.78rem' }}>{e.vendedor}</td>
                            <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.gestor}</td>
                            <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                            <td style={{ ...s.td, color: '#f0b429' }}>{fmt((e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * meses.length)}</td>
                            <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(e.totalCreditado)}</td>
                            <td style={{ ...s.td, color: cor, fontWeight: 700 }}>{fmtPct(pct)}</td>
                            <td style={{ ...s.td, minWidth: 100 }}>
                              <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                <div style={{ background: cor, height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4 }}></div>
                              </div>
                            </td>
                            <td style={{ ...s.td, fontSize: '0.78rem' }}>{statusLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPagCruz > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                    <Paginacao pagina={pagCruz} total={totalPagCruz} onChange={setPagCruz} />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Componente de paginação
function Paginacao({ pagina, total, onChange }) {
  const pages = [];
  const start = Math.max(1, pagina - 2);
  const end   = Math.min(total, pagina + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button style={{ ...ps.btn, ...(pagina === 1 ? ps.disabled : {}) }}
        onClick={() => onChange(pagina - 1)} disabled={pagina === 1}>‹</button>
      {start > 1 && <><button style={ps.btn} onClick={() => onChange(1)}>1</button><span style={ps.dots}>…</span></>}
      {pages.map(p => (
        <button key={p} style={{ ...ps.btn, ...(p === pagina ? ps.ativo : {}) }} onClick={() => onChange(p)}>{p}</button>
      ))}
      {end < total && <><span style={ps.dots}>…</span><button style={ps.btn} onClick={() => onChange(total)}>{total}</button></>}
      <button style={{ ...ps.btn, ...(pagina === total ? ps.disabled : {}) }}
        onClick={() => onChange(pagina + 1)} disabled={pagina === total}>›</button>
      <span style={{ color: '#4b5563', fontSize: '0.75rem', marginLeft: 4 }}>de {total}</span>
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
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
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
  btnLimpar:   { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '9px 14px', color: '#f87171', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:          { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 },
  td:          { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  badgeGreen:  { background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  badgeRed:    { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  mesCard:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', flex: '1 1 180px', minWidth: 180 },
  mesBadge:    { display: 'inline-block', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', borderRadius: 8, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 700 },
  spin:        { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #34d399', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
};
