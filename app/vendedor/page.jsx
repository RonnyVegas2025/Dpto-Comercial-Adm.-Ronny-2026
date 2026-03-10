'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[parseInt(m) - 1]}/${y}`;
};

const ABAS = [
  { key: 'resumo',       label: '📊 Resumo'         },
  { key: 'fechamentos',  label: '✅ Fechamentos'     },
  { key: 'movimentacao', label: '💰 Movimentação'    },
  { key: 'produtos',     label: '🎯 Produtos'        },
  { key: 'carteira',     label: '📋 Carteira'        },
  { key: 'ranking',      label: '🏆 Ranking'         },
];

export default function DashboardVendedor() {
  const [consultores, setConsultores] = useState([]);
  const [gestores, setGestores]       = useState([]);
  const [gestorFiltro, setGestorFiltro] = useState('Geral');
  const [consultorId, setConsultorId] = useState('');
  const [dados, setDados]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [aba, setAba]                 = useState('resumo');

  useEffect(() => { carregarConsultores(); }, []);
  useEffect(() => { if (consultorId) carregarDados(); }, [consultorId]);

  async function carregarConsultores() {
    const { data } = await supabase
      .from('consultores')
      .select('id, nome, meta_mensal, setor, gestor')
      .eq('ativo', true)
      .order('nome');
    setConsultores(data || []);
    const gs = ['Geral', ...new Set((data || []).map(c => c.gestor).filter(Boolean))];
    setGestores(gs);
  }

  async function carregarDados() {
    if (!consultorId) return;
    setLoading(true);
    try {
      // Empresas do consultor
      const { data: empresas } = await supabase
        .from('empresas')
        .select(`
          id, nome, cnpj, produto_contratado, categoria, cidade, estado,
          potencial_movimentacao, peso_categoria, cartoes_emitidos,
          data_cadastro, taxa_positiva, taxa_negativa,
          consultor_principal:consultor_principal_id (id, nome),
          consultor_agregado:consultor_agregado_id (id, nome),
          parceiro:parceiro_id (nome)
        `)
        .or(`consultor_principal_id.eq.${consultorId},consultor_agregado_id.eq.${consultorId}`)
        .eq('ativo', true);

      // Movimentações das empresas do consultor
      const empresaIds = (empresas || []).map(e => e.id);
      let movimentacoes = [];
      if (empresaIds.length > 0) {
        const { data: movs } = await supabase
          .from('movimentacoes')
          .select('empresa_id, competencia, valor_movimentacao, receita_taxa_positiva')
          .in('empresa_id', empresaIds)
          .order('competencia', { ascending: false });
        movimentacoes = movs || [];
      }

      // Consultor atual
      const consultor = consultores.find(c => c.id === consultorId);

      // ── Processamento ───────────────────────────────────────────────────────
      const totalEmpresas    = (empresas || []).length;
      const totalPotencial   = (empresas || []).reduce((s, e) => s + (e.potencial_movimentacao || 0), 0);
      const totalResultado   = (empresas || []).reduce((s, e) => s + ((e.potencial_movimentacao || 0) * (e.peso_categoria || 1)), 0);
      const totalCartoes     = (empresas || []).reduce((s, e) => s + (e.cartoes_emitidos || 0), 0);
      const meta             = consultor?.meta_mensal || 0;
      const pctMeta          = meta > 0 ? (totalResultado / meta) * 100 : 0;
      const ticketMedio      = totalEmpresas > 0 ? totalResultado / totalEmpresas : 0;

      // Movimentação real acumulada por empresa
      const movPorEmpresa = {};
      movimentacoes.forEach(m => {
        if (!movPorEmpresa[m.empresa_id]) movPorEmpresa[m.empresa_id] = { total: 0, ultima: null };
        movPorEmpresa[m.empresa_id].total += m.valor_movimentacao || 0;
        if (!movPorEmpresa[m.empresa_id].ultima || m.competencia > movPorEmpresa[m.empresa_id].ultima)
          movPorEmpresa[m.empresa_id].ultima = m.competencia;
      });

      const totalMovReal = Object.values(movPorEmpresa).reduce((s, m) => s + m.total, 0);

      // Evolução mensal (agrupa movimentações por competência)
      const evolucao = {};
      movimentacoes.forEach(m => {
        const mes = m.competencia?.substring(0, 7);
        if (!mes) return;
        if (!evolucao[mes]) evolucao[mes] = { movReal: 0, taxa: 0 };
        evolucao[mes].movReal += m.valor_movimentacao || 0;
        evolucao[mes].taxa    += m.receita_taxa_positiva || 0;
      });
      const evolucaoArray = Object.entries(evolucao)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, v]) => ({ mes, ...v }));

      // Por produto
      const porProduto = {};
      (empresas || []).forEach(e => {
        const p = e.produto_contratado || 'Outros';
        if (!porProduto[p]) porProduto[p] = { contratos: 0, potencial: 0, resultado: 0 };
        porProduto[p].contratos++;
        porProduto[p].potencial  += e.potencial_movimentacao || 0;
        porProduto[p].resultado  += (e.potencial_movimentacao || 0) * (e.peso_categoria || 1);
      });
      const produtosArray = Object.entries(porProduto)
        .map(([nome, v]) => ({ nome, ...v }))
        .sort((a, b) => b.resultado - a.resultado);

      // Timeline (cadastros + movimentações)
      const timeline = [];
      (empresas || []).forEach(e => {
        if (e.data_cadastro) timeline.push({ data: e.data_cadastro, tipo: 'cadastro', desc: `${e.nome} cadastrada`, empresa: e.nome });
      });
      movimentacoes.slice(0, 20).forEach(m => {
        const emp = (empresas || []).find(e => e.id === m.empresa_id);
        if (emp) timeline.push({ data: m.competencia, tipo: 'movimentacao', desc: `Movimentação ${fmtMes(m.competencia)} — ${emp.nome}`, empresa: emp.nome });
      });
      timeline.sort((a, b) => b.data?.localeCompare(a.data));

      // Movimentação real por empresa
      const movRealPorEmpresa = (empresas || []).map(e => {
        const mov  = movPorEmpresa[e.id] || { total: 0, ultima: null };
        const prev = (e.potencial_movimentacao || 0);
        const ader = prev > 0 ? (mov.total / prev) * 100 : 0;
        let situacao = 'sem movimentação';
        if (mov.total > 0 && ader < 50)  situacao = 'abaixo do esperado';
        if (ader >= 50 && ader < 90)     situacao = 'dentro do esperado';
        if (ader >= 90)                  situacao = 'acima do esperado';
        return { ...e, movReal: mov.total, ultimaMov: mov.ultima, aderencia: ader, situacao };
      }).sort((a, b) => b.movReal - a.movReal);

      setDados({
        consultor,
        kpis: { totalEmpresas, totalPotencial, totalResultado, totalCartoes, meta, pctMeta, ticketMedio, totalMovReal },
        empresas: empresas || [],
        movRealPorEmpresa,
        evolucaoArray,
        produtosArray,
        timeline: timeline.slice(0, 30),
      });
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const consultoresFiltrados = gestorFiltro === 'Geral'
    ? consultores
    : consultores.filter(c => c.gestor === gestorFiltro);

  const corMeta = (pct) => pct >= 100 ? '#34d399' : pct >= 70 ? '#f0b429' : '#f87171';

  return (
    <div style={s.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .aba-btn:hover { background: rgba(240,180,41,0.08) !important; color: #f0b429 !important; }
        .row-hover:hover { background: rgba(255,255,255,0.04) !important; }
        .bar-produto { transition: width 0.6s ease; }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Dashboard do Vendedor</h1>
          <p style={s.sub}>Visão individual de performance e carteira</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={s.filtrosCard}>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>GESTOR</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {gestores.map(g => (
              <button key={g}
                style={{ ...s.gestorBtn, ...(gestorFiltro === g ? s.gestorBtnAtivo : {}) }}
                onClick={() => { setGestorFiltro(g); setConsultorId(''); setDados(null); }}>
                {g === 'Geral' ? '🌐 Geral' : `👔 ${g.split(' ')[0]}`}
              </button>
            ))}
          </div>
        </div>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>VENDEDOR</label>
          <select style={s.select} value={consultorId}
            onChange={e => setConsultorId(e.target.value)}>
            <option value="">— Selecione um vendedor —</option>
            {consultoresFiltrados.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Estado vazio */}
      {!consultorId && !loading && (
        <div style={s.vazio}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>👤</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Selecione um vendedor</div>
          <div style={{ color: '#4b5563', fontSize: '0.85rem' }}>Escolha o gestor e o vendedor acima para ver o dashboard completo</div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={s.vazio}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' }}></div>
          <div style={{ color: '#6b7280' }}>Carregando dados...</div>
        </div>
      )}

      {/* Conteúdo */}
      {dados && !loading && (() => {
        const { kpis, empresas, movRealPorEmpresa, evolucaoArray, produtosArray, timeline, consultor } = dados;
        const maxEvolucao = Math.max(...evolucaoArray.map(e => e.movReal), 1);
        const maxProduto  = Math.max(...produtosArray.map(p => p.resultado), 1);

        return (
          <>
            {/* Nome do consultor */}
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,180,41,0.15)', border: '2px solid rgba(240,180,41,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 700, color: '#f0b429' }}>
                {consultor?.nome?.[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{consultor?.nome}</div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{consultor?.setor || '—'} · {consultor?.gestor || '—'}</div>
              </div>
            </div>

            {/* KPIs */}
            <div style={s.kpis}>
              {[
                { label: 'Empresas', val: kpis.totalEmpresas, cor: '#e8eaf0' },
                { label: 'Potencial Bruto', val: fmt(kpis.totalPotencial), cor: '#e8eaf0' },
                { label: 'Resultado Esperado', val: fmt(kpis.totalResultado), cor: '#f0b429' },
                { label: 'Movimentação Real', val: fmt(kpis.totalMovReal), cor: '#34d399' },
                { label: 'Meta Mensal', val: fmt(kpis.meta), cor: '#e8eaf0' },
                { label: '% da Meta', val: fmtPct(kpis.pctMeta), cor: corMeta(kpis.pctMeta) },
                { label: 'Cartões Emitidos', val: kpis.totalCartoes, cor: '#e8eaf0' },
                { label: 'Ticket Médio', val: fmt(kpis.ticketMedio), cor: '#60a5fa' },
              ].map(({ label, val, cor }) => (
                <div key={label} style={s.kpi}>
                  <span style={s.kpiLabel}>{label}</span>
                  <span style={{ ...s.kpiVal, color: cor }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Barra de meta */}
            <div style={{ ...s.card, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Progresso da Meta</span>
                <span style={{ color: corMeta(kpis.pctMeta), fontWeight: 700 }}>{fmtPct(kpis.pctMeta)}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 8, height: 12, overflow: 'hidden' }}>
                <div style={{ background: corMeta(kpis.pctMeta), height: '100%', width: `${Math.min(kpis.pctMeta, 100)}%`, borderRadius: 8, transition: 'width 0.8s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.75rem', color: '#6b7280' }}>
                <span>R$ 0</span>
                <span>{fmt(kpis.meta)}</span>
              </div>
            </div>

            {/* Abas */}
            <div style={s.tabs}>
              {ABAS.map(a => (
                <button key={a.key} className="aba-btn"
                  style={{ ...s.tab, ...(aba === a.key ? s.tabAtiva : {}) }}
                  onClick={() => setAba(a.key)}>
                  {a.label}
                </button>
              ))}
            </div>

            {/* ── RESUMO ──────────────────────────────────────────────── */}
            {aba === 'resumo' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* Evolução mensal */}
                <div style={{ ...s.card, gridColumn: '1 / -1' }}>
                  <div style={s.cardTitle}>📈 Evolução Mensal — Movimentação Real</div>
                  {evolucaoArray.length === 0
                    ? <div style={s.semDados}>Nenhuma movimentação registrada</div>
                    : (
                      <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, overflowX: 'auto', paddingBottom: 8 }}>
                        {evolucaoArray.map((e, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 52 }}>
                            <span style={{ color: '#f0b429', fontSize: '0.65rem', fontWeight: 600 }}>{fmt(e.movReal).replace('R$', '').trim()}</span>
                            <div style={{ background: 'rgba(240,180,41,0.2)', border: '1px solid rgba(240,180,41,0.3)', borderRadius: '4px 4px 0 0', width: 36, height: `${Math.max((e.movReal / maxEvolucao) * 100, 4)}px`, transition: 'height 0.6s' }}></div>
                            <span style={{ color: '#6b7280', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{fmtMes(e.mes + '-01')}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>

                {/* Por produto resumo */}
                <div style={s.card}>
                  <div style={s.cardTitle}>🎯 Distribuição por Produto</div>
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {produtosArray.slice(0, 5).map((p, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{p.nome}</span>
                          <span style={{ fontSize: '0.75rem', color: '#f0b429' }}>{p.contratos} contrato{p.contratos > 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div className="bar-produto" style={{ background: '#f0b429', height: '100%', width: `${(p.resultado / maxProduto) * 100}%`, borderRadius: 4 }}></div>
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 2 }}>{fmt(p.resultado)}</div>
                      </div>
                    ))}
                    {produtosArray.length === 0 && <div style={s.semDados}>Sem dados</div>}
                  </div>
                </div>

                {/* Timeline */}
                <div style={s.card}>
                  <div style={s.cardTitle}>🕐 Timeline Comercial</div>
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 300, overflowY: 'auto' }}>
                    {timeline.slice(0, 10).map((t, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.tipo === 'cadastro' ? '#60a5fa' : '#34d399', flexShrink: 0, marginTop: 4 }}></div>
                          {i < timeline.slice(0, 10).length - 1 && <div style={{ width: 1, flex: 1, background: 'rgba(255,255,255,0.06)', marginTop: 4 }}></div>}
                        </div>
                        <div style={{ flex: 1, paddingBottom: 4 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>{t.desc}</div>
                          <div style={{ color: '#4b5563', fontSize: '0.72rem', marginTop: 2 }}>{t.data}</div>
                        </div>
                      </div>
                    ))}
                    {timeline.length === 0 && <div style={s.semDados}>Sem eventos registrados</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── FECHAMENTOS ─────────────────────────────────────────── */}
            {aba === 'fechamentos' && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={s.cardTitle}>✅ Empresas Fechadas — Carteira Completa</div>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{empresas.length} registros</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {['Empresa', 'CNPJ', 'Produto', 'Categoria', 'Cidade/UF', 'Cartões', 'Potencial', 'Resultado', 'Parceiro', 'Consultor Agregado'].map(h =>
                          <th key={h} style={s.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {empresas.map((e, i) => (
                        <tr key={i} className="row-hover" style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                          <td style={{ ...s.td, fontWeight: 600 }}>{e.nome}</td>
                          <td style={{ ...s.td, color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.cnpj || '—'}</td>
                          <td style={s.td}>{e.produto_contratado || '—'}</td>
                          <td style={{ ...s.td, color: '#9ca3af' }}>{e.categoria || '—'}</td>
                          <td style={s.td}>{e.cidade || '—'} / {e.estado || '—'}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>{e.cartoes_emitidos || 0}</td>
                          <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                          <td style={{ ...s.td, color: '#f0b429', fontWeight: 600 }}>{fmt((e.potencial_movimentacao || 0) * (e.peso_categoria || 1))}</td>
                          <td style={{ ...s.td, color: '#9ca3af' }}>{e.parceiro?.nome || '—'}</td>
                          <td style={{ ...s.td, color: '#9ca3af' }}>{e.consultor_agregado?.nome || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── MOVIMENTAÇÃO REAL ───────────────────────────────────── */}
            {aba === 'movimentacao' && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={s.cardTitle}>💰 Movimentação Real por Empresa</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem' }}>
                    {[
                      { cor: '#4b5563', label: 'sem movimentação' },
                      { cor: '#f87171', label: 'abaixo' },
                      { cor: '#f0b429', label: 'dentro' },
                      { cor: '#34d399', label: 'acima' },
                    ].map(({ cor, label }) => (
                      <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, display: 'inline-block' }}></span>
                        <span style={{ color: '#6b7280' }}>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {['Empresa', 'Produto', 'Potencial Previsto', 'Mov. Real Acum.', '% Aderência', 'Última Mov.', 'Situação'].map(h =>
                          <th key={h} style={s.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {movRealPorEmpresa.map((e, i) => {
                        const corSit = e.situacao === 'acima do esperado' ? '#34d399'
                          : e.situacao === 'dentro do esperado' ? '#f0b429'
                          : e.situacao === 'abaixo do esperado' ? '#f87171' : '#4b5563';
                        return (
                          <tr key={i} className="row-hover" style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                            <td style={{ ...s.td, fontWeight: 600 }}>{e.nome}</td>
                            <td style={s.td}>{e.produto_contratado || '—'}</td>
                            <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                            <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(e.movReal)}</td>
                            <td style={s.td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, width: 60, overflow: 'hidden' }}>
                                  <div style={{ background: corSit, height: '100%', width: `${Math.min(e.aderencia, 100)}%`, borderRadius: 4 }}></div>
                                </div>
                                <span style={{ color: corSit, fontWeight: 600, fontSize: '0.8rem' }}>{fmtPct(e.aderencia)}</span>
                              </div>
                            </td>
                            <td style={{ ...s.td, color: '#6b7280' }}>{e.ultimaMov ? fmtMes(e.ultimaMov) : '—'}</td>
                            <td style={s.td}>
                              <span style={{ background: `${corSit}18`, color: corSit, borderRadius: 6, padding: '2px 8px', fontSize: '0.73rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {e.situacao}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── PRODUTOS ────────────────────────────────────────────── */}
            {aba === 'produtos' && (
              <div style={s.card}>
                <div style={s.cardTitle}>🎯 Distribuição Completa por Produto</div>
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {produtosArray.map((p, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.nome}</span>
                        <span style={{ color: '#f0b429', fontWeight: 700 }}>{p.contratos} contrato{p.contratos > 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 10 }}>
                        <div>
                          <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Potencial Bruto</div>
                          <div style={{ fontWeight: 600 }}>{fmt(p.potencial)}</div>
                        </div>
                        <div>
                          <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>Resultado Esperado</div>
                          <div style={{ fontWeight: 600, color: '#f0b429' }}>{fmt(p.resultado)}</div>
                        </div>
                        <div>
                          <div style={{ color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 4 }}>% do Total</div>
                          <div style={{ fontWeight: 600, color: '#60a5fa' }}>{fmtPct((p.resultado / (kpis.totalResultado || 1)) * 100)}</div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div className="bar-produto" style={{ background: '#f0b429', height: '100%', width: `${(p.resultado / maxProduto) * 100}%`, borderRadius: 4 }}></div>
                      </div>
                    </div>
                  ))}
                  {produtosArray.length === 0 && <div style={s.semDados}>Sem produtos registrados</div>}
                </div>
              </div>
            )}

            {/* ── CARTEIRA ────────────────────────────────────────────── */}
            {aba === 'carteira' && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={s.cardTitle}>📋 Carteira Completa do Vendedor</div>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{empresas.length} empresas</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {['Empresa', 'Produto', 'Categoria', 'Cidade/UF', 'Potencial', 'Resultado', 'Cartões', 'Data Cadastro', 'Parceiro'].map(h =>
                          <th key={h} style={s.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {empresas.map((e, i) => (
                        <tr key={i} className="row-hover" style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                          <td style={{ ...s.td, fontWeight: 600 }}>{e.nome}</td>
                          <td style={s.td}>{e.produto_contratado || '—'}</td>
                          <td style={{ ...s.td, color: '#9ca3af' }}>{e.categoria || '—'}</td>
                          <td style={s.td}>{e.cidade || '—'} / {e.estado || '—'}</td>
                          <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                          <td style={{ ...s.td, color: '#f0b429', fontWeight: 600 }}>{fmt((e.potencial_movimentacao || 0) * (e.peso_categoria || 1))}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>{e.cartoes_emitidos || 0}</td>
                          <td style={{ ...s.td, color: '#6b7280' }}>{e.data_cadastro || '—'}</td>
                          <td style={{ ...s.td, color: '#9ca3af' }}>{e.parceiro?.nome || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── RANKING ─────────────────────────────────────────────── */}
            {aba === 'ranking' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ ...s.card, gridColumn: '1 / -1' }}>
                  <div style={s.cardTitle}>🏆 Ranking Geral da Equipe</div>
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {consultores
                      .filter(c => gestorFiltro === 'Geral' || c.gestor === gestorFiltro)
                      .map(c => ({ ...c }))
                      .sort((a, b) => (b.meta_mensal || 0) - (a.meta_mensal || 0))
                      .map((c, i) => {
                        const isAtual = c.id === consultorId;
                        return (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: 10, background: isAtual ? 'rgba(240,180,41,0.08)' : 'rgba(255,255,255,0.03)', border: isAtual ? '1px solid rgba(240,180,41,0.3)' : '1px solid transparent' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: i === 0 ? '#f0b429' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c2f' : '#4b5563', minWidth: 28, textAlign: 'center' }}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                            </span>
                            <span style={{ flex: 1, fontWeight: isAtual ? 700 : 500, color: isAtual ? '#f0b429' : '#e8eaf0' }}>{c.nome}</span>
                            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{c.gestor || '—'}</span>
                            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{fmt(c.meta_mensal)} meta</span>
                            {isAtual && <span style={{ background: 'rgba(240,180,41,0.2)', color: '#f0b429', borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>você</span>}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

const s = {
  page:        { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  tag:         { color: '#f0b429', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  title:       { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px', fontFamily: "'Syne', sans-serif" },
  sub:         { color: '#6b7280', fontSize: '0.9rem' },
  filtrosCard: { background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' },
  filtroGrupo: { display: 'flex', flexDirection: 'column', gap: 8 },
  filtroLabel: { color: '#4b5563', fontSize: '0.68rem', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600 },
  gestorBtn:   { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '7px 16px', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  gestorBtnAtivo: { background: 'rgba(240,180,41,0.12)', border: '1px solid rgba(240,180,41,0.35)', color: '#f0b429', fontWeight: 700 },
  select:      { background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 16px', color: '#e8eaf0', fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer', minWidth: 260 },
  vazio:       { background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '64px 32px', textAlign: 'center' },
  kpis:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 },
  kpi:         { background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column' },
  kpiLabel:    { color: '#4b5563', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  kpiVal:      { fontSize: '1.2rem', fontWeight: 700 },
  tabs:        { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tab:         { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 16px', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  tabAtiva:    { background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.3)', color: '#f0b429' },
  card:        { background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '24px', marginBottom: 0 },
  cardTitle:   { fontSize: '1rem', fontWeight: 700 },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:          { padding: '8px 12px', textAlign: 'left', color: '#4b5563', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: 0.5 },
  td:          { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  semDados:    { color: '#4b5563', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' },
};

