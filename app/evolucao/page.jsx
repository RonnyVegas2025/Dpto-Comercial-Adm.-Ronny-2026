'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes  = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};
const fmtPct  = (v) => `${Number(v || 0).toFixed(1)}%`;
const norm    = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Tendência: up / down / flat / new
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

const TEND_STYLE = {
  up:   { color: '#34d399', label: '↑ Crescendo' },
  down: { color: '#f87171', label: '↓ Caindo' },
  flat: { color: '#9ca3af', label: '→ Estável' },
  new:  { color: '#60a5fa', label: '✦ Nova' },
  none: { color: '#4b5563', label: '— Inativo' },
};

export default function Evolucao() {
  const [loading, setLoading]   = useState(true);
  const [rawData, setRawData]   = useState({ libs: [], empresas: [] });
  const [busca, setBusca]       = useState('');
  const [filtroTend, setFiltroTend] = useState('todos');
  const [filtroConsultor, setFiltroConsultor] = useState('todos');
  const [ordenar, setOrdenar]   = useState('ultimo');
  const [aba, setAba]           = useState('evolucao'); // evolucao | cruzamento | kpis

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: libs }, { data: empresas }] = await Promise.all([
      supabase.from('liberacoes').select('produto_id, empresa_nome, competencia, total_liberado').order('competencia'),
      supabase.from('empresas').select('produto_id, nome, potencial_movimentacao, peso_categoria, consultor_principal:consultor_principal_id(nome), parceiro:parceiro_id(nome)').eq('ativo', true),
    ]);
    setRawData({ libs: libs || [], empresas: empresas || [] });
    setLoading(false);
  }

  // Monta estrutura consolidada
  const { meses, empresasMap, consultores } = useMemo(() => {
    const { libs, empresas } = rawData;

    // Todos os meses únicos ordenados
    const mesesSet = [...new Set(libs.map(l => l.competencia))].sort();

    // Mapa produto_id -> dados da empresa cadastrada
    const empCadMap = Object.fromEntries(empresas.map(e => [e.produto_id, e]));

    // Consolida: produto_id -> { por mês }
    const byProduto = {};
    for (const l of libs) {
      if (!byProduto[l.produto_id]) {
        byProduto[l.produto_id] = {
          produto_id: l.produto_id,
          nome: l.empresa_nome,
          porMes: {},
        };
      }
      byProduto[l.produto_id].porMes[l.competencia] = (byProduto[l.produto_id].porMes[l.competencia] || 0) + l.total_liberado;
    }

    // Enriquece com dados cadastrais
    const empresasMap = {};
    for (const [pid, item] of Object.entries(byProduto)) {
      const cad = empCadMap[parseInt(pid)];
      const vals = mesesSet.map(m => item.porMes[m] || 0);
      const totalCreditado = vals.reduce((s, v) => s + v, 0);
      const mesAtivos = vals.filter(v => v > 0).length;
      const tend = tendencia(vals);
      empresasMap[pid] = {
        ...item,
        nome: cad?.nome || item.nome,
        potencial: cad?.potencial_movimentacao || 0,
        peso: cad?.peso_categoria || 1,
        resultadoEsperado: (cad?.potencial_movimentacao || 0) * (cad?.peso_categoria || 1),
        consultor: cad?.consultor_principal?.nome || '—',
        parceiro: cad?.parceiro?.nome || '—',
        cadastrada: !!cad,
        vals,
        totalCreditado,
        mesAtivos,
        tend,
        ultimoValor: vals[vals.length - 1] || 0,
        pctPotencial: cad?.potencial_movimentacao > 0
          ? (totalCreditado / (cad.potencial_movimentacao * mesesSet.length)) * 100
          : null,
      };
    }

    // Consultores únicos
    const consultoresSet = ['todos', ...new Set(empresas.map(e => e.consultor_principal?.nome).filter(Boolean))].sort((a, b) => a === 'todos' ? -1 : a.localeCompare(b));

    return { meses: mesesSet, empresasMap, consultores: consultoresSet };
  }, [rawData]);

  // Lista filtrada e ordenada
  const lista = useMemo(() => {
    let arr = Object.values(empresasMap);

    if (busca.trim()) {
      const b = norm(busca);
      arr = arr.filter(e => norm(e.nome).includes(b) || String(e.produto_id).includes(b));
    }
    if (filtroTend !== 'todos') arr = arr.filter(e => e.tend === filtroTend);
    if (filtroConsultor !== 'todos') arr = arr.filter(e => e.consultor === filtroConsultor);

    if (ordenar === 'ultimo')   arr.sort((a, b) => b.ultimoValor - a.ultimoValor);
    if (ordenar === 'total')    arr.sort((a, b) => b.totalCreditado - a.totalCreditado);
    if (ordenar === 'nome')     arr.sort((a, b) => a.nome.localeCompare(b.nome));
    if (ordenar === 'potencial')arr.sort((a, b) => b.potencial - a.potencial);

    return arr;
  }, [empresasMap, busca, filtroTend, filtroConsultor, ordenar]);

  // KPIs gerais
  const kpis = useMemo(() => {
    const todos = Object.values(empresasMap);
    const totalCreditado   = todos.reduce((s, e) => s + e.totalCreditado, 0);
    const totalPotencial   = todos.reduce((s, e) => s + e.potencial, 0);
    const semCredito       = todos.filter(e => e.totalCreditado === 0).length;
    const creditandoSempre = todos.filter(e => meses.length > 1 && e.mesAtivos === meses.length).length;
    const crescendo        = todos.filter(e => e.tend === 'up').length;
    const porMes           = meses.map(m => ({
      mes: m,
      total: todos.reduce((s, e) => s + (e.porMes?.[m] || 0), 0),
      empresas: todos.filter(e => (e.porMes?.[m] || 0) > 0).length,
    }));
    return { totalCreditado, totalPotencial, semCredito, creditandoSempre, crescendo, porMes, total: todos.length };
  }, [empresasMap, meses]);

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={s.spin}></div>
        <div style={{ color: '#6b7280' }}>Carregando dados de evolução...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (meses.length === 0) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>📭</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Nenhuma liberação importada ainda</div>
        <div style={{ color: '#6b7280', marginBottom: 24 }}>Importe a planilha de liberações para ver a evolução</div>
        <a href="/importar-liberacoes" style={{ ...s.btnPri, textDecoration: 'none' }}>💳 Importar Liberações →</a>
      </div>
    </div>
  );

  const abas = [
    { key: 'evolucao',    label: '📈 Evolução por Empresa' },
    { key: 'kpis',        label: '🔢 Resumo por Mês' },
    { key: 'cruzamento',  label: '🎯 Potencial vs Creditado' },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Evolução de Créditos</h1>
          <p style={s.sub}>Acompanhe o histórico de liberações por empresa mês a mês</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/importar-liberacoes" style={{ ...s.linkBtn, color: '#34d399', borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.07)' }}>💳 Importar Liberações</a>
          <a href="/previsao" style={s.linkBtn}>📊 Dashboard Previsão</a>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Empresas com Créditos</span>
          <span style={s.kpiVal}>{kpis.total}</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(52,211,153,0.3)' }}>
          <span style={s.kpiLabel}>Total Creditado ({meses.length} meses)</span>
          <span style={{ ...s.kpiVal, color: '#34d399' }}>{fmt(kpis.totalCreditado)}</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.3)' }}>
          <span style={s.kpiLabel}>Crescendo</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{kpis.crescendo} empresas</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(248,113,113,0.3)' }}>
          <span style={s.kpiLabel}>Sem Crédito Ainda</span>
          <span style={{ ...s.kpiVal, color: '#f87171' }}>{kpis.semCredito}</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Ativos todo período</span>
          <span style={s.kpiVal}>{kpis.creditandoSempre}</span>
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

      {/* ═══════════ ABA: EVOLUÇÃO POR EMPRESA ═══════════ */}
      {aba === 'evolucao' && (
        <div style={s.card}>
          {/* Filtros */}
          <div style={s.filtros}>
            <input
              style={s.busca}
              placeholder="🔍 Buscar empresa ou ID..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            <select style={s.select} value={filtroTend} onChange={e => setFiltroTend(e.target.value)}>
              <option value="todos">Todas as tendências</option>
              <option value="up">↑ Crescendo</option>
              <option value="down">↓ Caindo</option>
              <option value="flat">→ Estável</option>
              <option value="new">✦ Nova</option>
              <option value="none">— Inativo</option>
            </select>
            <select style={s.select} value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
              {consultores.map(c => <option key={c} value={c}>{c === 'todos' ? 'Todos os consultores' : c}</option>)}
            </select>
            <select style={s.select} value={ordenar} onChange={e => setOrdenar(e.target.value)}>
              <option value="ultimo">Ordenar: Último mês</option>
              <option value="total">Ordenar: Total creditado</option>
              <option value="potencial">Ordenar: Potencial</option>
              <option value="nome">Ordenar: Nome</option>
            </select>
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.78rem', marginBottom: 16 }}>
            Exibindo {lista.length} de {Object.keys(empresasMap).length} empresas
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Empresa</th>
                  <th style={s.th}>Consultor</th>
                  {meses.map(m => <th key={m} style={{ ...s.th, textAlign: 'right' }}>{fmtMes(m)}</th>)}
                  <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e, i) => {
                  const ts = TEND_STYLE[e.tend];
                  return (
                    <tr key={e.produto_id} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                      <td style={{ ...s.td }}>
                        <div style={{ fontWeight: 600 }}>{e.nome}</div>
                        <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>ID {e.produto_id}</div>
                      </td>
                      <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.consultor}</td>
                      {meses.map(m => {
                        const v = e.porMes?.[m] || 0;
                        return (
                          <td key={m} style={{ ...s.td, textAlign: 'right' }}>
                            {v > 0
                              ? <span style={{ color: '#34d399', fontWeight: 500 }}>{fmt(v)}</span>
                              : <span style={{ color: '#374151' }}>—</span>
                            }
                          </td>
                        );
                      })}
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#e8eaf0' }}>
                        {fmt(e.totalCreditado)}
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
        </div>
      )}

      {/* ═══════════ ABA: RESUMO POR MÊS ═══════════ */}
      {aba === 'kpis' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🔢 Resumo de Créditos por Mês</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
            {kpis.porMes.map((m) => (
              <div key={m.mes} style={s.mesCard}>
                <div style={s.mesBadge}>{fmtMes(m.mes)}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#34d399', margin: '12px 0 4px' }}>
                  {fmt(m.total)}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{m.empresas} empresas creditando</div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem', marginBottom: 4 }}>% do total geral</div>
                  <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ background: '#34d399', height: '100%', width: `${kpis.totalCreditado > 0 ? (m.total / kpis.totalCreditado) * 100 : 0}%`, borderRadius: 4 }}></div>
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: 4 }}>
                    {kpis.totalCreditado > 0 ? fmtPct((m.total / kpis.totalCreditado) * 100) : '0%'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Distribuição de tendências */}
          <div style={{ marginTop: 32 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Distribuição de Tendências</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {['up','down','flat','new','none'].map(t => {
                const count = Object.values(empresasMap).filter(e => e.tend === t).length;
                const ts = TEND_STYLE[t];
                return (
                  <div key={t} style={{ ...s.mesCard, flex: '0 0 auto', minWidth: 140, cursor: 'pointer', borderColor: count > 0 ? `${ts.color}33` : 'rgba(255,255,255,0.07)' }}
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

      {/* ═══════════ ABA: POTENCIAL vs CREDITADO ═══════════ */}
      {aba === 'cruzamento' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🎯 Potencial Cadastrado vs Total Creditado</div>
          <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 6, marginBottom: 20 }}>
            Somente empresas com potencial cadastrado. Percentual baseado em {meses.length} mês(es) × potencial mensal.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Empresa','Consultor','Potencial/mês','Result. Esperado','Creditado Total','% Realizado','Barra','Status'].map(h =>
                    <th key={h} style={s.th}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.values(empresasMap)
                  .filter(e => e.potencial > 0)
                  .sort((a, b) => (b.pctPotencial || 0) - (a.pctPotencial || 0))
                  .map((e, i) => {
                    const pct = e.pctPotencial || 0;
                    const cor = pct >= 80 ? '#34d399' : pct >= 40 ? '#f0b429' : '#f87171';
                    const status = pct >= 80 ? '✅ Atingindo' : pct >= 40 ? '⚡ Parcial' : e.totalCreditado === 0 ? '❌ Sem crédito' : '⚠️ Abaixo';
                    return (
                      <tr key={e.produto_id} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                        <td style={s.td}>
                          <div style={{ fontWeight: 600 }}>{e.nome}</div>
                          <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>ID {e.produto_id}</div>
                        </td>
                        <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.consultor}</td>
                        <td style={s.td}>{fmt(e.potencial)}</td>
                        <td style={{ ...s.td, color: '#f0b429' }}>{fmt(e.resultadoEsperado * meses.length)}</td>
                        <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(e.totalCreditado)}</td>
                        <td style={{ ...s.td, color: cor, fontWeight: 700 }}>{fmtPct(pct)}</td>
                        <td style={{ ...s.td, minWidth: 100 }}>
                          <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div style={{ background: cor, height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4 }}></div>
                          </div>
                        </td>
                        <td style={{ ...s.td, fontSize: '0.78rem' }}>{status}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:        { maxWidth: 1300, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  tag:         { color: '#34d399', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  title:       { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px' },
  sub:         { color: '#6b7280', fontSize: '0.9rem' },
  linkBtn:     { background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.2)', borderRadius: 10, padding: '10px 20px', color: '#f0b429', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  kpis:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 },
  kpi:         { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column' },
  kpiLabel:    { color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  kpiVal:      { fontSize: '1.4rem', fontWeight: 700 },
  tabs:        { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab:         { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 16px', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  tabAtiva:    { background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' },
  card:        { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardTitle:   { fontSize: '1rem', fontWeight: 700 },
  filtros:     { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  busca:       { flex: '1 1 200px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' },
  select:      { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:          { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 },
  td:          { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  mesCard:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', flex: '1 1 200px', minWidth: 200 },
  mesBadge:    { display: 'inline-block', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', borderRadius: 8, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 700 },
  btnPri:      { background: '#34d399', color: '#000', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  spin:        { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #34d399', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
};

