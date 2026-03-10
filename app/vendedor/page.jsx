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
  { key: 'resumo',       label: '📊 Resumo'      },
  { key: 'movimentacao', label: '💰 Movimentação' },
  { key: 'produtos',     label: '🎯 Produtos'     },
  { key: 'parceiros',    label: '🤝 Parceiros'    },
  { key: 'carteira',     label: '📋 Carteira'     },
  { key: 'ranking',      label: '🏆 Ranking'      },
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
  useEffect(() => { if (consultores.length > 0) carregarDados(); }, [consultorId, gestorFiltro, consultores]);

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
    setLoading(true);
    setDados(null);
    try {
      // Monta filtro de empresas conforme seleção
      let query = supabase
        .from('empresas')
        .select(`
          id, nome, cnpj, produto_contratado, categoria, cidade, estado,
          potencial_movimentacao, peso_categoria, cartoes_emitidos,
          data_cadastro, taxa_positiva, taxa_negativa,
          consultor_principal:consultor_principal_id (id, nome, gestor),
          consultor_agregado:consultor_agregado_id (id, nome),
          parceiro:parceiro_id (nome)
        `)
        .eq('ativo', true);

      if (consultorId) {
        // Vendedor individual
        query = query.or(`consultor_principal_id.eq.${consultorId},consultor_agregado_id.eq.${consultorId}`);
      } else if (gestorFiltro !== 'Geral') {
        // Consolidado por gestor — usa consultores já carregados no state
        const idsGestor = consultores
          .filter(c => c.gestor === gestorFiltro)
          .map(c => c.id);
        if (idsGestor.length === 0) {
          setLoading(false);
          setDados({ kpis: { totalEmpresas:0, totalPotencial:0, totalResultado:0, totalCartoes:0, meta:0, metaAcumulada:0, mesesImportados:0, pctMeta:0, totalMovReal:0, ticketMedio:0, receitaBruta:0, pctReceita:0, descontoTotal:0, pctDesconto:0, spreadLiquido:0, pctSpread:0 }, empresas:[], movRealPorEmpresa:[], evolucaoArray:[], produtosArray:[], parceirosArray:[], timeline:[], resultadoPorConsultor:{}, consultoresDaVisao:[], consultor: null });
          return;
        }
        query = query.in('consultor_principal_id', idsGestor);
      }
      // Geral = sem filtro adicional → traz todas

      const { data: empresas } = await query;

      // Movimentações das empresas do consultor
      const empresaIds = (empresas || []).map(e => e.id);
      let movimentacoes = [];
      if (empresaIds.length > 0) {
        const { data: movs } = await supabase
          .from('movimentacoes')
          .select('empresa_id, competencia, valor_movimentacao, receita_bruta, custo_taxa_negativa, spread_liquido')
          .in('empresa_id', empresaIds)
          .order('competencia', { ascending: false });
        movimentacoes = movs || [];
      }

      // Consultor atual ou equipe
      const consultor = consultorId ? consultores.find(c => c.id === consultorId) : null;
      const consultoresDaVisao = consultorId
        ? [consultor].filter(Boolean)
        : gestorFiltro === 'Geral'
          ? consultores
          : consultores.filter(c => c.gestor === gestorFiltro);

      // Ranking: busca resultado de TODOS os consultores da equipe
      const { data: todasEmpresas } = await supabase
        .from('empresas')
        .select('consultor_principal_id, potencial_movimentacao, peso_categoria')
        .eq('ativo', true);

      const resultadoPorConsultor = {};
      (todasEmpresas || []).forEach(e => {
        const cid = e.consultor_principal_id;
        if (!cid) return;
        if (!resultadoPorConsultor[cid]) resultadoPorConsultor[cid] = 0;
        resultadoPorConsultor[cid] += (e.potencial_movimentacao || 0) * (e.peso_categoria || 1);
      });

      // ── Processamento ───────────────────────────────────────────────────────

      // 1. Movimentação real acumulada por empresa (precisa vir primeiro)
      const movPorEmpresa = {};
      movimentacoes.forEach(m => {
        if (!movPorEmpresa[m.empresa_id]) movPorEmpresa[m.empresa_id] = { total: 0, receita: 0, custo: 0, ultima: null };
        movPorEmpresa[m.empresa_id].total   += m.valor_movimentacao  || 0;
        movPorEmpresa[m.empresa_id].receita += m.receita_bruta       || 0;
        movPorEmpresa[m.empresa_id].custo   += m.custo_taxa_negativa || 0;
        if (!movPorEmpresa[m.empresa_id].ultima || m.competencia > movPorEmpresa[m.empresa_id].ultima)
          movPorEmpresa[m.empresa_id].ultima = m.competencia;
      });
      const totalMovReal    = Object.values(movPorEmpresa).reduce((s, m) => s + m.total,   0);
      const totalReceitaMov = Object.values(movPorEmpresa).reduce((s, m) => s + m.receita, 0);
      const totalCustoMov   = Object.values(movPorEmpresa).reduce((s, m) => s + m.custo,   0);

      // 2. KPIs básicos
      const totalEmpresas    = (empresas || []).length;
      // Potencial e resultado × meses de cada empresa (base acumulada = mesma base da mov. real)
      const totalPotencial   = (empresas || []).reduce((s, e) => {
        const mesesE = movimentacoes.filter(m => m.empresa_id === e.id)
          .map(m => m.competencia?.substring(0,7)).filter((v,i,a) => v && a.indexOf(v)===i).length || 1;
        return s + (e.potencial_movimentacao || 0) * mesesE;
      }, 0);
      const totalResultado   = (empresas || []).reduce((s, e) => {
        const mesesE = movimentacoes.filter(m => m.empresa_id === e.id)
          .map(m => m.competencia?.substring(0,7)).filter((v,i,a) => v && a.indexOf(v)===i).length || 1;
        return s + (e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * mesesE;
      }, 0);
      const totalCartoes     = (empresas || []).reduce((s, e) => s + (e.cartoes_emitidos || 0), 0);
      const meta             = consultoresDaVisao.reduce((s, c) => s + (c?.meta_mensal || 0), 0);
      const ticketMedio      = totalEmpresas > 0 ? totalResultado / totalEmpresas : 0;

      // 3. Meta acumulada
      const mesesImportados  = new Set(movimentacoes.map(m => m.competencia?.substring(0,7)).filter(Boolean)).size;
      const metaAcumulada    = meta * (mesesImportados || 1);
      const pctMeta          = metaAcumulada > 0 ? (totalMovReal / metaAcumulada) * 100 : 0;

      // 4. Spread — usa valores salvos nas movimentações (receita_bruta e custo_taxa_negativa)
      //    Se movimentações não têm spread (importação antiga), fallback para taxa do cadastro
      const receitaBruta = totalReceitaMov > 0
        ? totalReceitaMov
        : (empresas || []).reduce((s, e) => {
            const mov = movPorEmpresa[e.id]?.total || 0;
            return s + (mov * ((e.taxa_positiva || 0) / 100));
          }, 0);
      const descontoTotal = totalCustoMov > 0
        ? totalCustoMov
        : (empresas || []).reduce((s, e) => {
            const mov = movPorEmpresa[e.id]?.total || 0;
            return s + (mov * ((e.taxa_negativa || 0) / 100));
          }, 0);
      const spreadLiquido = receitaBruta - descontoTotal;
      const pctReceita    = totalMovReal > 0 ? (receitaBruta  / totalMovReal) * 100 : 0;
      const pctDesconto   = totalMovReal > 0 ? (descontoTotal / totalMovReal) * 100 : 0;
      const pctSpread     = totalMovReal > 0 ? (spreadLiquido / totalMovReal) * 100 : 0;

      // Evolução mensal (agrupa movimentações por competência)
      const evolucao = {};
      movimentacoes.forEach(m => {
        const mes = m.competencia?.substring(0, 7);
        if (!mes) return;
        if (!evolucao[mes]) evolucao[mes] = { movReal: 0 };
        evolucao[mes].movReal += m.valor_movimentacao || 0;
      });
      const evolucaoArray = Object.entries(evolucao)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, v]) => ({ mes, ...v }));

      // Por produto — também acumulado
      const porProduto = {};
      (empresas || []).forEach(e => {
        const p = e.produto_contratado || 'Outros';
        const mesesE = movimentacoes.filter(m => m.empresa_id === e.id)
          .map(m => m.competencia?.substring(0,7)).filter((v,i,a) => v && a.indexOf(v)===i).length || 1;
        if (!porProduto[p]) porProduto[p] = { contratos: 0, potencial: 0, resultado: 0 };
        porProduto[p].contratos++;
        porProduto[p].potencial  += (e.potencial_movimentacao || 0) * mesesE;
        porProduto[p].resultado  += (e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * mesesE;
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

      // Por parceiro — potencial e resultado acumulados (× meses importados)
      // para ficarem na mesma base da movimentação real acumulada
      const porParceiro = {};
      (empresas || []).forEach(e => {
        const parc = e.parceiro?.nome || 'Sem Parceiro';
        const mov  = movPorEmpresa[e.id] || { total: 0, ultima: null, receita: 0, custo: 0 };
        // Meses com movimentação real para essa empresa especificamente
        const mesesEmpresa = movimentacoes.filter(m => m.empresa_id === e.id)
          .map(m => m.competencia?.substring(0,7))
          .filter((v, i, a) => v && a.indexOf(v) === i).length || 1;
        if (!porParceiro[parc]) porParceiro[parc] = { contratos: 0, potencial: 0, resultado: 0, movReal: 0, receita: 0, custo: 0, totalMeses: 0 };
        porParceiro[parc].contratos++;
        porParceiro[parc].potencial   += (e.potencial_movimentacao || 0) * mesesEmpresa;
        porParceiro[parc].resultado   += (e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * mesesEmpresa;
        porParceiro[parc].movReal     += mov.total;
        porParceiro[parc].receita     += mov.receita || 0;
        porParceiro[parc].custo       += mov.custo   || 0;
        porParceiro[parc].totalMeses  += mesesEmpresa; // soma meses de todas as empresas do parceiro
      });
      const parceirosArray = Object.entries(porParceiro)
        .map(([nome, v]) => ({
          nome, ...v,
          spread:          v.receita - v.custo,
          // Média mensal = mov real total ÷ meses médios das empresas do parceiro
          mesesMedios:     v.contratos > 0 ? v.totalMeses / v.contratos : 1,
          mediaMovMensal:  v.totalMeses > 0 ? v.movReal / (v.totalMeses / v.contratos) : 0,
          potencialMensal: v.contratos > 0 ? v.potencial / (v.totalMeses / v.contratos) : 0,
        }))
        .sort((a, b) => b.movReal - a.movReal);

      setDados({
        consultor,
        consultoresDaVisao,
        kpis: { totalEmpresas, totalPotencial, totalResultado, totalCartoes, meta, metaAcumulada, mesesImportados, pctMeta, totalMovReal, ticketMedio, receitaBruta, pctReceita, descontoTotal, pctDesconto, spreadLiquido, pctSpread },
        empresas: empresas || [],
        movRealPorEmpresa,
        evolucaoArray,
        produtosArray,
        timeline: timeline.slice(0, 30),
        resultadoPorConsultor,
        parceirosArray,
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
                onClick={() => { setGestorFiltro(g); setConsultorId(''); }}>
                {g === 'Geral' ? '🌐 Geral' : `👔 ${g.split(' ')[0]}`}
              </button>
            ))}
          </div>
        </div>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>VENDEDOR</label>
          <select style={s.select} value={consultorId}
            onChange={e => setConsultorId(e.target.value)}>
            <option value="">— Ver equipe consolidada —</option>
            {consultoresFiltrados.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Estado vazio */}


      {/* Loading */}
      {loading && (
        <div style={s.vazio}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' }}></div>
          <div style={{ color: '#6b7280' }}>Carregando dados...</div>
        </div>
      )}

      {/* Conteúdo */}
      {dados && !loading && (() => {
        const { kpis, empresas, movRealPorEmpresa, evolucaoArray, produtosArray, timeline, consultor, resultadoPorConsultor, consultoresDaVisao, parceirosArray } = dados;
        const maxEvolucao = Math.max(...evolucaoArray.map(e => e.movReal), 1);
        const maxProduto  = Math.max(...produtosArray.map(p => p.resultado), 1);

        return (
          <>
            {/* Nome do consultor / equipe */}
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(240,180,41,0.15)', border: '2px solid rgba(240,180,41,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 700, color: '#f0b429' }}>
                {consultorId ? consultor?.nome?.[0] : gestorFiltro === 'Geral' ? '🌐' : '👔'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>
                  {consultorId ? consultor?.nome : gestorFiltro === 'Geral' ? 'Visão Geral — Todas as Equipes' : `Equipe ${gestorFiltro}`}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                  {consultorId
                    ? `${consultor?.setor || '—'} · ${consultor?.gestor || '—'}`
                    : `${consultoresDaVisao.length} consultores · ${dados?.empresas?.length || 0} empresas`}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={s.kpis}>
              {[
                { label: 'Empresas', val: kpis.totalEmpresas, cor: '#e8eaf0' },
                { label: 'Potencial Bruto', val: fmt(kpis.totalPotencial), cor: '#e8eaf0' },
                { label: 'Resultado Esperado', val: fmt(kpis.totalResultado), cor: '#f0b429' },
                { label: 'Movimentação Real', val: fmt(kpis.totalMovReal), cor: '#34d399' },
                { label: `Meta Acumulada (${kpis.mesesImportados} ${kpis.mesesImportados === 1 ? 'mês' : 'meses'})`, val: fmt(kpis.metaAcumulada), cor: '#e8eaf0' },
                { label: '% da Meta', val: fmtPct(kpis.pctMeta), cor: corMeta(kpis.pctMeta) },
                { label: 'Cartões Emitidos', val: kpis.totalCartoes, cor: '#e8eaf0' },
                { label: 'Ticket Médio', val: fmt(kpis.ticketMedio), cor: '#60a5fa' },
                { label: 'Receita Bruta (tx+)', val: `${Number(kpis.pctReceita||0).toFixed(2)}%`, cor: '#34d399', extra: fmt(kpis.receitaBruta) },
                { label: 'Custo / Desconto (tx-)', val: `${Number(kpis.pctDesconto||0).toFixed(2)}%`, cor: '#f87171', extra: fmt(kpis.descontoTotal) },
                { label: 'Spread Líquido', val: `${Number(kpis.pctSpread||0).toFixed(2)}%`, cor: kpis.pctSpread >= 0 ? '#60a5fa' : '#f87171', extra: fmt(kpis.spreadLiquido) },
              ].map(({ label, val, cor, extra }) => (
                <div key={label} style={s.kpi}>
                  <span style={s.kpiLabel}>{label}</span>
                  <span style={{ ...s.kpiVal, color: cor }}>{val}</span>
                  {extra && <span style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: 4 }}>{extra}</span>}
                </div>
              ))}
            </div>

            {/* Barra de meta */}
            <div style={{ ...s.card, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Progresso da Meta</span>
                <span style={{ color: corMeta(kpis.pctMeta), fontWeight: 700 }}>{fmtPct(kpis.pctMeta)} · {kpis.mesesImportados} {kpis.mesesImportados === 1 ? 'mês' : 'meses'} importados</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 8, height: 12, overflow: 'hidden' }}>
                <div style={{ background: corMeta(kpis.pctMeta), height: '100%', width: `${Math.min(kpis.pctMeta, 100)}%`, borderRadius: 8, transition: 'width 0.8s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.75rem', color: '#6b7280' }}>
                <span>R$ 0</span>
                <span>{fmt(kpis.metaAcumulada)}</span>
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

            {/* ── PARCEIROS ───────────────────────────────────────────── */}
            {aba === 'parceiros' && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={s.cardTitle}>🤝 Fechamentos por Parceiro Comercial</div>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{parceirosArray.length} parceiros</span>
                </div>

                {/* Cards resumo por parceiro */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
                  {parceirosArray.filter(p => p.nome !== 'Sem Parceiro').map((p, i) => {
                    const cores = ['#f0b429','#34d399','#60a5fa','#a78bfa','#fb923c','#f472b6'];
                    const cor = cores[i % cores.length];
                    const pctMov = p.potencial > 0 ? (p.movReal / p.potencial) * 100 : 0;
                    const meses  = Math.round(p.mesesMedios);
                    const resultadoMensal = meses > 0 ? p.resultado / meses : p.resultado;
                    const corAder = pctMov >= 100 ? '#34d399' : pctMov >= 70 ? '#f0b429' : '#f87171';
                    return (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${cor}28`, borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>

                        {/* Cabeçalho: nome + badge contratos */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e8eaf0', flex: 1, paddingRight: 8, lineHeight: 1.3 }}>{p.nome}</div>
                          <span style={{ background: `${cor}18`, color: cor, borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {p.contratos} empresa{p.contratos > 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Destaque principal: Média Mensal Real */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ color: '#4b5563', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Média Mensal Real</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#60a5fa' }}>{fmt(p.mediaMovMensal)}</div>
                          <div style={{ color: '#4b5563', fontSize: '0.68rem', marginTop: 2 }}>base {meses} {meses === 1 ? 'mês' : 'meses'} · acum. {fmt(p.movReal)}</div>
                        </div>

                        {/* Divisor */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 10 }}></div>

                        {/* Comparativo mensal: esperado vs real */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <div>
                            <div style={{ color: '#4b5563', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Esperado/mês</div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: cor }}>{fmt(resultadoMensal)}</div>
                          </div>
                          <div>
                            <div style={{ color: '#4b5563', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Potencial/mês</div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#9ca3af' }}>{fmt(p.potencialMensal)}</div>
                          </div>
                        </div>

                        {/* Barra de aderência */}
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ background: corAder, height: '100%', width: `${Math.min(pctMov, 100)}%`, borderRadius: 4, transition: 'width 0.6s' }}></div>
                        </div>
                        <div style={{ color: corAder, fontSize: '0.68rem', fontWeight: 600, textAlign: 'right' }}>
                          {fmtPct(pctMov)} da meta acumulada
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* Tabela detalhada */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#9ca3af' }}>DETALHAMENTO COMPLETO</div>
                    <div style={{ fontSize: '0.72rem', color: '#4b5563', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '4px 10px' }}>
                      📌 Potencial e Resultado acumulados (× meses importados) — mesma base da Mov. Real
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {['Parceiro', 'Contratos', 'Potencial Mensal', 'Resultado Acum.', 'Mov. Real Acum.', 'Média Mensal', '% Aderência', 'Spread Líquido'].map(h =>
                            <th key={h} style={s.th}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {parceirosArray.map((p, i) => {
                          const ader   = p.potencial > 0 ? (p.movReal / p.potencial) * 100 : 0;
                          const ticket = p.contratos > 0 ? p.resultado / p.contratos : 0;
                          const corAder   = ader >= 90 ? '#34d399' : ader >= 50 ? '#f0b429' : ader > 0 ? '#f87171' : '#4b5563';
                          const corSpread = p.spread > 0 ? '#60a5fa' : p.spread < 0 ? '#f87171' : '#4b5563';
                          return (
                            <tr key={i} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                              <td style={{ ...s.td, fontWeight: 600, color: p.nome === 'Sem Parceiro' ? '#4b5563' : '#e8eaf0' }}>
                                {p.nome}
                                <div style={{ color: '#4b5563', fontSize: '0.68rem', fontWeight: 400, marginTop: 2 }}>
                                  {Math.round(p.mesesMedios)} {Math.round(p.mesesMedios) === 1 ? 'mês' : 'meses'} importados
                                </div>
                              </td>
                              <td style={{ ...s.td, textAlign: 'center' }}>{p.contratos}</td>
                              <td style={{ ...s.td, color: '#f0b429' }}>{fmt(p.potencialMensal)}</td>
                              <td style={{ ...s.td, color: '#9ca3af' }}>{fmt(p.resultado)}</td>
                              <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(p.movReal)}</td>
                              <td style={{ ...s.td, color: '#60a5fa', fontWeight: 700 }}>{fmt(p.mediaMovMensal)}</td>
                              <td style={s.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, width: 60, overflow: 'hidden' }}>
                                    <div style={{ background: corAder, height: '100%', width: `${Math.min(ader, 100)}%`, borderRadius: 4 }}></div>
                                  </div>
                                  <span style={{ color: corAder, fontWeight: 600, fontSize: '0.8rem' }}>{fmtPct(ader)}</span>
                                </div>
                              </td>
                              <td style={{ ...s.td, color: corSpread, fontWeight: 600 }}>
                                {p.spread !== 0 ? fmt(p.spread) : <span style={{ color: '#4b5563' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {parceirosArray.length === 0 && <div style={s.semDados}>Nenhum parceiro registrado</div>}
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
                      .sort((a, b) => (resultadoPorConsultor[b.id] || 0) - (resultadoPorConsultor[a.id] || 0))
                      .map((c, i) => {
                        const isAtual = c.id === consultorId;
                        return (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: 10, background: isAtual ? 'rgba(240,180,41,0.08)' : 'rgba(255,255,255,0.03)', border: isAtual ? '1px solid rgba(240,180,41,0.3)' : '1px solid transparent' }}>
                            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: i === 0 ? '#f0b429' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c2f' : '#4b5563', minWidth: 28, textAlign: 'center' }}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                            </span>
                            <span style={{ flex: 1, fontWeight: isAtual ? 700 : 500, color: isAtual ? '#f0b429' : '#e8eaf0' }}>{c.nome}</span>
                            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{c.gestor || '—'}</span>
                            <span style={{ color: '#f0b429', fontSize: '0.85rem', fontWeight: 600 }}>{fmt(resultadoPorConsultor[c.id] || 0)}</span>
                            <span style={{ color: '#4b5563', fontSize: '0.75rem' }}>resultado</span>
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
