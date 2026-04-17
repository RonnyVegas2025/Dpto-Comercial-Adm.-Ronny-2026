// VERSAO 5 - 2026-03-12 - pctMeta = volumeMeta/metaObjetivo (194k/255k=76%)
'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';

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

function getMesReferencia(data_cadastro) {
  if (!data_cadastro) return '';
  const [ano, mes] = data_cadastro.substring(0, 7).split('-');
  const anoAtual = new Date().getFullYear();
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  if (parseInt(ano) < anoAtual) return `Carteira ${ano}`;
  return `${meses[parseInt(mes)-1]}/${String(ano).slice(2)}`;
}

const ABAS = [
  { key: 'resumo',       label: '📊 Resumo'      },
  { key: 'equipes',      label: '🏷️ Equipes'      },
  { key: 'contratos',    label: '🌡️ Contratos'   },
  { key: 'movimentacao', label: '📋 Carteira'     },
  { key: 'produtos',     label: '🎯 Produtos'     },
  { key: 'parceiros',    label: '🤝 Parceiros'    },
  { key: 'ranking',      label: '🏆 Ranking'      },
];

const COR_EQUIPE_DASH = {
  'Credenciamento':    '#2563eb',
  'Pós Vendas':        '#16a34a',
  'Prospecção':        '#7c3aed',
  'Key Account':       '#ea580c',
  'Suporte Comercial': '#0891b2',
  'Inside':            '#db2777',
  'Venda Nova':        '#059669',
  'Parcerias':         '#d97706',
  'Outros':            '#6b7280',
  'Sem Equipe':        '#9ca3af',
};
const CORES_FALLBACK = ['#2563eb','#16a34a','#7c3aed','#ea580c','#0891b2','#db2777','#d97706'];

export default function DashboardVendedor() {
  const [consultores, setConsultores] = useState([]);
  const [gestores, setGestores]       = useState([]);
  const { gestorFixo } = useAuth();
  const [gestorFiltro, setGestorFiltro] = useState(() => gestorFixo || 'Geral');
  const [consultorId, setConsultorId] = useState('');
  const [dados, setDados]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [aba, setAba]                 = useState('resumo');
  const [mesesDisponiveis, setMesesDisponiveis] = useState([]);
  const [mesSelecionado,   setMesSelecionado]   = useState('');
  const [filtroBusca,      setFiltroBusca]      = useState('');
  const [filtroProduto,    setFiltroProduto]    = useState('');
  const [filtroSituacao,   setFiltroSituacao]   = useState('');
  const [filtroMesRef,     setFiltroMesRef]     = useState('');
  const [expandidoContrato, setExpandidoContrato] = useState(null);

  useEffect(() => { carregarConsultores(); }, []);
  useEffect(() => { if (consultores.length > 0) carregarDados(); }, [consultorId, gestorFiltro, consultores, mesSelecionado]);

  // Sincroniza filtroMesRef da carteira com o mês selecionado no topo
  useEffect(() => {
    if (!mesSelecionado) {
      setFiltroMesRef('');
      return;
    }
    // Converte '2026-03' → 'Mar/26' para bater com getMesReferencia
    const [ano, mes] = mesSelecionado.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const label = `${meses[parseInt(mes)-1]}/${String(ano).slice(2)}`;
    setFiltroMesRef(label);
  }, [mesSelecionado]);

  async function carregarConsultores() {
    const [{ data }, { data: movMeses }] = await Promise.all([
      supabase.from('consultores').select('id, nome, meta_mensal, setor, gestor, equipe').eq('ativo', true).order('nome'),
      supabase.from('movimentacoes').select('competencia').order('competencia', { ascending: false }),
    ]);
    setConsultores(data || []);
    const gs = ['Geral', ...new Set((data || []).map(c => c.gestor).filter(Boolean))];
    setGestores(gs);
    const meses = [...new Set((movMeses||[]).map(m => m.competencia?.substring(0,7)).filter(Boolean))];
    setMesesDisponiveis(meses);
    // Inicia em '' = Todos os meses
  }

  async function carregarDados() {
    setLoading(true);
    setDados(null);
    try {
      // Monta filtro de empresas conforme seleção
      let query = supabase
        .from('empresas')
        .select(`
          id, produto_id, nome, cnpj, produto_contratado, categoria, cidade, estado,
          potencial_movimentacao, peso_categoria, cartoes_emitidos,
          data_cadastro, taxa_positiva, taxa_negativa,
          consultor_principal_id,
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
        const mesInicio = mesSelecionado ? mesSelecionado + '-01' : '2000-01-01';
        const mesFim    = mesSelecionado ? mesSelecionado + '-28' : '2099-12-31';
        const { data: movs } = await supabase
          .from('movimentacoes')
          .select('empresa_id, competencia, valor_movimentacao, receita_bruta, custo_taxa_negativa, spread_liquido')
          .in('empresa_id', empresaIds)
          .gte('competencia', mesInicio)
          .lte('competencia', mesFim)
          .order('competencia', { ascending: false });
        movimentacoes = movs || [];
      }

      // Metas por consultor (metas_vendedor)
      const consultorIds = consultorId
        ? [consultorId]
        : consultores.filter(c => gestorFiltro === 'Geral' || c.gestor === gestorFiltro).map(c => c.id);
      let metasPorMes = {};
      let metaAcumPorConsultor = {}; // vol. meta acumulado por consultor (todos os meses)
      if (consultorIds.length > 0) {
        const mesMetaInicio = mesSelecionado ? mesSelecionado + '-01' : '2000-01-01';
        const mesMetaFim    = mesSelecionado ? mesSelecionado + '-28' : '2099-12-31';
        const { data: metas } = await supabase
          .from('metas_vendedor')
          .select('consultor_id, competencia, valor_beneficio, valor_convenio, valor_total')
          .in('consultor_id', consultorIds)
          .gte('competencia', mesMetaInicio)
          .lte('competencia', mesMetaFim);
        (metas || []).forEach(m => {
          const mes = m.competencia?.substring(0, 7);
          if (!mes) return;
          if (!metasPorMes[mes]) metasPorMes[mes] = 0;
          metasPorMes[mes] += (m.valor_total || m.valor_beneficio || 0);
          // Acumula por consultor
          if (!metaAcumPorConsultor[m.consultor_id]) metaAcumPorConsultor[m.consultor_id] = 0;
          metaAcumPorConsultor[m.consultor_id] += (m.valor_total || m.valor_beneficio || 0);
        });
      }

      // Consultor atual ou equipe
      const consultor = consultorId ? consultores.find(c => c.id === consultorId) : null;
      const consultoresDaVisao = consultorId
        ? [consultor].filter(Boolean)
        : gestorFiltro === 'Geral'
          ? consultores
          : consultores.filter(c => c.gestor === gestorFiltro);

      // Ranking: movimentação real do último mês importado por consultor
      // 1. Descobre qual é o último mês com movimentação no banco
      const { data: ultimaMov } = await supabase
        .from('movimentacoes')
        .select('competencia')
        .order('competencia', { ascending: false })
        .limit(1);
      const ultimoMes = ultimaMov?.[0]?.competencia?.substring(0, 7);

      // 2. Busca todas as empresas com seus consultores
      const { data: todasEmpresas } = await supabase
        .from('empresas')
        .select('id, consultor_principal_id')
        .eq('ativo', true);

      // 3. Busca movimentações apenas do último mês
      const { data: movsUltimoMes } = ultimoMes ? await supabase
        .from('movimentacoes')
        .select('empresa_id, valor_movimentacao')
        .gte('competencia', ultimoMes + '-01')
        .lte('competencia', ultimoMes + '-28') : { data: [] };

      // 4. Monta mapa empresa → consultor
      const empresaConsultorMap = {};
      (todasEmpresas || []).forEach(e => {
        if (e.consultor_principal_id) empresaConsultorMap[e.id] = e.consultor_principal_id;
      });

      // 5. Agrupa movimentação do último mês por consultor
      const resultadoPorConsultor = {};
      (movsUltimoMes || []).forEach(m => {
        const cid = empresaConsultorMap[m.empresa_id];
        if (!cid) return;
        if (!resultadoPorConsultor[cid]) resultadoPorConsultor[cid] = 0;
        resultadoPorConsultor[cid] += m.valor_movimentacao || 0;
      });

      // ── Processamento ───────────────────────────────────────────────────────

      // 1. Movimentação real acumulada por empresa (precisa vir primeiro)
      const movPorEmpresa = {};
      movimentacoes.forEach(m => {
        if (!movPorEmpresa[m.empresa_id]) movPorEmpresa[m.empresa_id] = { total: 0, receita: 0, custo: 0, ultima: null, meses: new Set() };
        movPorEmpresa[m.empresa_id].total   += m.valor_movimentacao  || 0;
        movPorEmpresa[m.empresa_id].receita += m.receita_bruta       || 0;
        movPorEmpresa[m.empresa_id].custo   += m.custo_taxa_negativa || 0;
        movPorEmpresa[m.empresa_id].meses.add(m.competencia?.substring(0,7));
        if (!movPorEmpresa[m.empresa_id].ultima || m.competencia > movPorEmpresa[m.empresa_id].ultima)
          movPorEmpresa[m.empresa_id].ultima = m.competencia;
      });
      const totalMovReal    = Object.values(movPorEmpresa).reduce((s, m) => s + m.total,   0);
      // Média mensal real = para cada empresa, total ÷ nMeses dela, somado
      const totalMovRealMedia = Object.values(movPorEmpresa).reduce((s, m) => {
        const nMeses = m.meses.size || 1;
        return s + (m.total / nMeses);
      }, 0);
      const totalReceitaMov = Object.values(movPorEmpresa).reduce((s, m) => s + m.receita, 0);
      const totalCustoMov   = Object.values(movPorEmpresa).reduce((s, m) => s + m.custo,   0);

      // 2. KPIs básicos
      // Apenas empresas que têm movimentação importada no período
      const empresasComMov   = (empresas || []).filter(e => movPorEmpresa[e.id]);
      const totalEmpresas    = empresasComMov.length;
      // Potencial e resultado — só empresas com movimentação, valor mensal (sem multiplicar por meses)
      const totalPotencial   = empresasComMov.reduce((s, e) => s + (e.potencial_movimentacao || 0), 0);
      const totalResultado   = empresasComMov.reduce((s, e) => s + (e.potencial_movimentacao || 0) * (e.peso_categoria || 1), 0);
      const totalCartoes     = empresasComMov.reduce((s, e) => s + (e.cartoes_emitidos || 0), 0);
      const meta             = consultoresDaVisao.reduce((s, c) => s + (c?.meta_mensal || 0), 0);
      const ticketMedio      = totalEmpresas > 0 ? totalMovRealMedia / totalEmpresas : 0;

      // 3. Metas
      const mesesImportados  = new Set(movimentacoes.map(m => m.competencia?.substring(0,7)).filter(Boolean)).size;
      const metaObjetivo     = meta * (mesesImportados || 1);          // meta_mensal dos consultores = objetivo (R$ 255.000)
      const volumeMeta       = Object.values(metasPorMes).reduce((s, v) => s + v, 0);
      const volMetaFinal     = volumeMeta; // zero se não houver meta importada — sem fallback
      const pctMeta          = metaObjetivo > 0 ? (volMetaFinal / metaObjetivo) * 100 : 0;
      const metaAcumulada    = metaObjetivo; // mantém compatibilidade com outros usos
      const pctMovVsMeta     = metaObjetivo > 0 ? (totalMovRealMedia / metaObjetivo) * 100 : 0;

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
        if (!evolucao[mes]) evolucao[mes] = { movReal: 0, meta: 0, resultadoEsperado: 0 };
        evolucao[mes].movReal += m.valor_movimentacao || 0;
      });
      // Adiciona meta de cada mês
      Object.entries(metasPorMes).forEach(([mes, val]) => {
        if (!evolucao[mes]) evolucao[mes] = { movReal: 0, meta: 0, resultadoEsperado: 0 };
        evolucao[mes].meta = val;
      });
      // Resultado esperado mensal = potencial × peso das empresas cadastradas ATÉ aquele mês
      // (acumulativo: jan inclui tudo até jan, fev inclui tudo até fev, etc.)
      const mesesNoGrafico = Object.keys(evolucao).sort();
      mesesNoGrafico.forEach(mes => {
        const mesLimite = mes + '-31'; // tudo cadastrado até o fim desse mês
        if (!evolucao[mes]) evolucao[mes] = { movReal: 0, meta: 0, resultadoEsperado: 0 };
        evolucao[mes].resultadoEsperado = (empresas || [])
          .filter(e => {
            // Inclui empresa se: não tem data_cadastro (legado) OU foi cadastrada até este mês
            if (!e.data_cadastro) return true;
            return e.data_cadastro <= mesLimite;
          })
          .reduce((s, e) => s + (e.potencial_movimentacao || 0) * (e.peso_categoria || 1), 0);
      });
      const evolucaoArray = Object.entries(evolucao)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, v]) => ({ mes, ...v }));

      // Por produto — apenas empresas com movimentação, usando média mensal por empresa
      const porProduto = {};
      empresasComMov.forEach(e => {
        const p = e.produto_contratado || 'Outros';
        const mov = movPorEmpresa[e.id] || { total: 0, meses: new Set() };
        const nMeses = mov.meses.size || 1;
        const mediaEmpresa = mov.total / nMeses; // média mensal desta empresa
        if (!porProduto[p]) porProduto[p] = { contratos: 0, potencial: 0, resultado: 0, movReal: 0 };
        porProduto[p].contratos++;
        porProduto[p].potencial  += (e.potencial_movimentacao || 0);
        porProduto[p].resultado  += (e.potencial_movimentacao || 0) * (e.peso_categoria || 1);
        porProduto[p].movReal    += mediaEmpresa; // soma das médias mensais = movimentação mensal do produto
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
        const mov    = movPorEmpresa[e.id] || { total: 0, ultima: null, meses: new Set() };
        const prev   = e.potencial_movimentacao || 0;
        const nMeses = mov.meses.size || 1;
        const mediaMovMensal = mov.total / nMeses; // média mensal real
        const ader   = prev > 0 ? (mediaMovMensal / prev) * 100 : 0;
        let situacao = 'sem movimentação';
        if (mov.total > 0 && ader < 50)  situacao = 'abaixo do esperado';
        if (ader >= 50 && ader < 90)     situacao = 'dentro do esperado';
        if (ader >= 90)                  situacao = 'acima do esperado';
        return { ...e, movReal: mov.total, mediaMovMensal, nMeses, ultimaMov: mov.ultima, aderencia: ader, situacao };
      }).sort((a, b) => b.movReal - a.movReal);

      // Por parceiro — usando média mensal por empresa
      const porParceiro = {};
      empresasComMov.forEach(e => {
        const parc = e.parceiro?.nome || 'Sem Parceiro';
        const mov  = movPorEmpresa[e.id] || { total: 0, meses: new Set(), receita: 0, custo: 0 };
        const nMeses = mov.meses.size || 1;
        const mediaEmpresa = mov.total / nMeses;
        if (!porParceiro[parc]) porParceiro[parc] = { contratos: 0, potencial: 0, resultado: 0, movReal: 0, receita: 0, custo: 0 };
        porParceiro[parc].contratos++;
        porParceiro[parc].potencial  += (e.potencial_movimentacao || 0);
        porParceiro[parc].resultado  += (e.potencial_movimentacao || 0) * (e.peso_categoria || 1);
        porParceiro[parc].movReal    += mediaEmpresa; // soma das médias = total mensal do parceiro
        porParceiro[parc].receita    += mov.receita || 0;
        porParceiro[parc].custo      += mov.custo   || 0;
      });
      const parceirosArray = Object.entries(porParceiro)
        .map(([nome, v]) => ({
          nome, ...v,
          spread:          v.receita - v.custo,
          mediaMovMensal:  v.movReal, // já é média (soma das médias das empresas)
          mesesMedios:     1,
          potencialMensal: v.potencial,
        }))
        .sort((a, b) => b.movReal - a.movReal);

      // ── Contratos por mês (data_cadastro) ─────────────────────────────────
      // Agrupa todas as empresas por "Mês Referência" (getMesReferencia)
      const contratosMap = {};
      (empresas || []).forEach(e => {
        const mesRef = getMesReferencia(e.data_cadastro) || 'Sem data';
        const ano    = e.data_cadastro?.substring(0, 4) || '0';
        const sort   = e.data_cadastro?.substring(0, 7) || '0000-00';
        if (!contratosMap[mesRef]) contratosMap[mesRef] = {
          mesRef, sort, ano,
          contratos: 0, potencial: 0, resultado: 0,
          empresas: [],
        };
        contratosMap[mesRef].contratos++;
        contratosMap[mesRef].potencial  += e.potencial_movimentacao || 0;
        contratosMap[mesRef].resultado  += (e.potencial_movimentacao||0) * (e.peso_categoria||1);
        contratosMap[mesRef].empresas.push(e);
      });
      // Ordena: anos antigos primeiro (Carteira 2025), depois meses do ano atual
      const contratosArray = Object.values(contratosMap).sort((a, b) => {
        // "Carteira XXXX" vai antes dos meses
        const aIsCarteira = a.mesRef.startsWith('Carteira');
        const bIsCarteira = b.mesRef.startsWith('Carteira');
        if (aIsCarteira && bIsCarteira) return a.ano.localeCompare(b.ano);
        if (aIsCarteira) return -1;
        if (bIsCarteira) return 1;
        return a.sort.localeCompare(b.sort);
      });

      setDados({
        consultor,
        consultoresDaVisao,
        metasPorMes,
        metaAcumPorConsultor,
        ultimoMes,
        kpis: { totalEmpresas, totalPotencial, totalResultado, totalCartoes, meta, metaAcumulada, metaObjetivo, volumeMeta: volMetaFinal, mesesImportados, pctMeta, pctMovVsMeta, totalMovReal, totalMovRealMedia, ticketMedio, receitaBruta, pctReceita, descontoTotal, pctDesconto, spreadLiquido, pctSpread },
        empresas: empresas || [],
        movRealPorEmpresa,
        evolucaoArray,
        produtosArray,
        timeline: timeline.slice(0, 30),
        resultadoPorConsultor,
        parceirosArray,
        contratosArray,
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
        .row-hover:hover { background: rgba(240,180,41,0.04) !important; }
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
        {/* Botões de gestor — só visíveis para quem pode trocar */}
        {!gestorFixo && (
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
        )}
        {gestorFixo && (
          <div style={s.filtroGrupo}>
            <label style={s.filtroLabel}>GESTOR</label>
            <div style={{ background:'#fff8e6', border:'1px solid #f0b429', borderRadius:8,
              padding:'7px 14px', color:'#b45309', fontSize:'0.82rem', fontWeight:600 }}>
              👔 {gestorFixo.split(' ')[0]}
            </div>
          </div>
        )}
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
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>MÊS DE REFERÊNCIA</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {mesesDisponiveis.length === 0 && (
              <span style={{ color:'#8b92b0', fontSize:'0.8rem', padding:'6px 0' }}>Nenhum mês importado</span>
            )}
            <button
              style={{ ...s.gestorBtn, ...(mesSelecionado === '' ? s.gestorBtnAtivo : {}) }}
              onClick={() => setMesSelecionado('')}>
              🌐 Todos
            </button>
            {mesesDisponiveis.map(m => (
              <button key={m}
                style={{ ...s.gestorBtn, ...(mesSelecionado === m ? s.gestorBtnAtivo : {}) }}
                onClick={() => setMesSelecionado(m)}>
                📅 {fmtMes(m + '-01')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Estado vazio */}


      {/* Loading */}
      {loading && (
        <div style={s.vazio}>
          <div style={{ width: 40, height: 40, border: '3px solid #e4e7ef', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' }}></div>
          <div style={{ color: '#8b92b0' }}>Carregando dados...</div>
        </div>
      )}

      {/* Conteúdo */}
      {dados && !loading && (() => {
        const { kpis, empresas, movRealPorEmpresa, evolucaoArray, produtosArray, timeline, consultor, resultadoPorConsultor, consultoresDaVisao, parceirosArray, ultimoMes, metaAcumPorConsultor, metasPorMes, contratosArray } = dados;
        const maxEvolucao = Math.max(...evolucaoArray.map(e => Math.max(e.movReal, e.meta || 0, e.resultadoEsperado || 0)), 1);
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
                <div style={{ color: '#8b92b0', fontSize: '0.8rem' }}>
                  {consultorId
                    ? `${consultor?.setor || '—'} · ${consultor?.gestor || '—'}`
                    : `${consultoresDaVisao.length} consultores · ${dados?.empresas?.length || 0} empresas`}
                </div>
              </div>
            </div>

            {/* ── PAINEL DE MÉTRICAS ──────────────────────────────── */}
            {(() => {
              const pct    = kpis.pctMeta;
              const cor    = corMeta(pct);
              const badge  = pct >= 100
                ? { label: '✅ Meta atingida',   bg: 'rgba(52,211,153,0.15)',   cor: '#34d399' }
                : pct >= 70
                ? { label: '⚡ Quase lá',         bg: 'rgba(240,180,41,0.15)',  cor: '#f0b429' }
                : { label: '⚠️ Abaixo da meta',  bg: 'rgba(248,113,113,0.12)', cor: '#f87171' };

              return (
                <div style={{ marginBottom: 20 }}>

                  {/* ── LINHA 1: 4 destaque grandes ───────────────────── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>

                    {/* Movimentação Real — DESTAQUE PRINCIPAL */}
                    <div style={{ background: '#fff8e6', border: '1px solid #f0b429', borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: '1.8rem', opacity: 0.08 }}>💰</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Mov. Real (Média Mensal)</div>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f0b429', lineHeight: 1 }}>{fmt(kpis.totalMovRealMedia)}</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.7rem', marginTop: 6 }}>
                        {kpis.totalEmpresas} empresas · acum. {fmt(kpis.totalMovReal)} / {kpis.mesesImportados} {kpis.mesesImportados===1?'mês':'meses'}
                      </div>
                    </div>

                    {/* Vol. Meta Realizado */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #16a34a', borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: '1.8rem', opacity: 0.08 }}>🏆</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Vol. Meta Realizado</div>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#34d399', lineHeight: 1 }}>{fmt(kpis.volumeMeta)}</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.7rem', marginTop: 6 }}>de {fmt(kpis.metaObjetivo)} objetivo</div>
                    </div>

                    {/* % da Meta — com badge */}
                    <div style={{ background: `linear-gradient(135deg, ${cor}18, ${cor}05)`, border: `1px solid ${cor}44`, borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: '1.8rem', opacity: 0.08 }}>📈</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>% da Meta</div>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: cor, lineHeight: 1 }}>{fmtPct(pct)}</div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', marginTop: 8,
                        background: badge.bg, border: `1px solid ${badge.cor}44`,
                        borderRadius: 6, padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700, color: badge.cor }}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Empresas */}
                    <div style={{ background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 12, right: 16, fontSize: '1.8rem', opacity: 0.08 }}>🏢</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Empresas Ativas</div>
                      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#1a1d2e', lineHeight: 1 }}>{kpis.totalEmpresas}</div>
                      <div style={{ color: '#8b92b0', fontSize: '0.7rem', marginTop: 6 }}>{kpis.totalCartoes} cartões emitidos</div>
                    </div>
                  </div>

                  {/* ── LINHA 2: Barra de progresso ────────────────────── */}
                  <div style={{ background: '#ffffff', border: `1px solid ${cor}33`, borderRadius: 14, padding: '16px 22px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#4a5068' }}>Progresso da Meta</span>
                      <span style={{ fontSize: '0.75rem', color: '#8b92b0' }}>
                        {fmt(kpis.volumeMeta)} <span style={{ color: '#8b92b0' }}>/ {fmt(kpis.metaObjetivo)}</span>
                      </span>
                    </div>
                    <div style={{ background: '#f0f2f8', borderRadius: 8, height: 12, overflow: 'hidden', position: 'relative' }}>
                      {/* Faixa movimentação real (mais escura, atrás) */}
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
                        width: `${Math.min(kpis.pctMovVsMeta||0, 100)}%`,
                        background: 'rgba(240,180,41,0.25)', borderRadius: 8 }}></div>
                      {/* Faixa vol. meta (na frente) */}
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
                        width: `${Math.min(pct, 100)}%`,
                        background: cor, borderRadius: 8, transition: 'width 0.8s ease' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: '0.68rem', color: '#8b92b0' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ width:8, height:8, borderRadius:2, background: cor, display:'inline-block' }}></span>
                        Vol. Meta {fmtPct(pct)}
                      </span>
                      <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ width:8, height:8, borderRadius:2, background:'rgba(240,180,41,0.4)', display:'inline-block' }}></span>
                        Mov. Real {fmtPct(kpis.pctMovVsMeta||0)}
                      </span>
                    </div>
                  </div>

                  {/* ── LINHA 3: Secundários ────────────────────────────── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                    {[
                      { label: 'Potencial Bruto',    val: fmt(kpis.totalPotencial),    cor: '#1a1d2e' },
                      { label: 'Resultado Esperado', val: fmt(kpis.totalResultado),    cor: '#a78bfa', sub: 'potencial × peso' },
                      { label: 'Meta Objetivo',      val: fmt(kpis.metaObjetivo),      cor: '#1a1d2e' },
                      { label: 'Ticket Médio',       val: fmt(kpis.ticketMedio),       cor: '#60a5fa' },
                    ].map(({ label, val, cor: c, sub }) => (
                      <div key={label} style={{ background: '#ffffff', border: '1px solid #f0f2f8', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ color: '#8b92b0', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: c }}>{val}</div>
                        {sub && <div style={{ color: '#8b92b0', fontSize: '0.62rem', marginTop: 4 }}>{sub}</div>}
                      </div>
                    ))}
                  </div>

                  {/* ── LINHA 4: Spread ─────────────────────────────────── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                      { label: 'Receita Bruta (tx+)', pct: `${Number(kpis.pctReceita||0).toFixed(2)}%`,  val: fmt(kpis.receitaBruta),   cor: '#34d399' },
                      { label: 'Custo / Desc. (tx-)', pct: `${Number(kpis.pctDesconto||0).toFixed(2)}%`, val: fmt(kpis.descontoTotal),  cor: '#f87171' },
                      { label: 'Spread Líquido',       pct: `${Number(kpis.pctSpread||0).toFixed(2)}%`,  val: fmt(kpis.spreadLiquido),  cor: kpis.pctSpread >= 0 ? '#60a5fa' : '#f87171' },
                    ].map(({ label, pct: p, val, cor: c }) => (
                      <div key={label} style={{ background: '#ffffff', border: '1px solid #f0f2f8', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ color: '#8b92b0', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: c }}>{p}</div>
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#8b92b0' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })()}

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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={s.cardTitle}>📈 Evolução Mensal</div>
                    <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', flexWrap: 'wrap' }}>
                      {[
                        { cor: '#a78bfa', label: 'Resultado Esperado (Peso)' },
                        { cor: '#f0b429', label: 'Movimentação Real' },
                        { cor: '#34d399', label: 'Meta' },
                      ].map(({ cor, label }) => (
                        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: cor, display: 'inline-block' }}></span>
                          <span style={{ color: '#4a5068' }}>{label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  {evolucaoArray.length === 0
                    ? <div style={s.semDados}>Nenhuma movimentação registrada</div>
                    : (
                      <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', gap: 20, minHeight: 180, overflowX: 'auto', paddingBottom: 8 }}>
                        {evolucaoArray.map((e, i) => {
                          const hEsp  = Math.max((( e.resultadoEsperado||0) / maxEvolucao) * 140, e.resultadoEsperado > 0 ? 4 : 0);
                          const hMov  = Math.max(((e.movReal||0)           / maxEvolucao) * 140, e.movReal > 0           ? 4 : 0);
                          const hMeta = Math.max(((e.meta||0)              / maxEvolucao) * 140, e.meta > 0              ? 4 : 0);
                          return (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 100 }}>
                              {/* Valores acima */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, fontSize: '0.58rem', fontWeight: 600, marginBottom: 4 }}>
                                {e.resultadoEsperado > 0 && <span style={{ color: '#a78bfa' }}>{fmt(e.resultadoEsperado).replace('R$','').trim()}</span>}
                                <span style={{ color: '#f0b429' }}>{fmt(e.movReal).replace('R$','').trim()}</span>
                                {e.meta > 0 && <span style={{ color: '#34d399' }}>{fmt(e.meta).replace('R$','').trim()}</span>}
                              </div>
                              {/* 3 barras lado a lado */}
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                                <div title="Resultado Esperado" style={{ background: 'rgba(167,139,250,0.25)', border: '1px solid rgba(167,139,250,0.5)', borderRadius: '4px 4px 0 0', width: 24, height: `${hEsp}px`, transition: 'height 0.6s' }}></div>
                                <div title="Movimentação Real" style={{ background: 'rgba(240,180,41,0.3)',  border: '1px solid rgba(240,180,41,0.5)',  borderRadius: '4px 4px 0 0', width: 24, height: `${hMov}px`,  transition: 'height 0.6s' }}></div>
                                {e.meta > 0 && <div title="Meta" style={{ background: 'rgba(52,211,153,0.2)', border: '1px solid rgba(52,211,153,0.5)', borderRadius: '4px 4px 0 0', width: 24, height: `${hMeta}px`, transition: 'height 0.6s' }}></div>}
                              </div>
                              <span style={{ color: '#8b92b0', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{fmtMes(e.mes + '-01')}</span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  }
                </div>

              </div>
            )}

            {/* ── EQUIPES ─────────────────────────────────────────────── */}
            {aba === 'equipes' && (() => {
              // Agrupa consultores e empresas por equipe
              const equipesMap = {};
              consultoresDaVisao.forEach(c => {
                const eq = c.equipe || 'Sem Equipe';
                if (!equipesMap[eq]) equipesMap[eq] = {
                  nome: eq, consultores: [], potencial: 0, movReal: 0,
                  meta: 0, resultado: 0, empresas: 0, cartoes: 0,
                };
                equipesMap[eq].consultores.push(c);
                // Meta mensal: se tem meta importada divide pelos meses para ter valor mensal
                // senão usa meta_mensal cadastrada
                const metaAcum = metaAcumPorConsultor[c.id] || 0;
                const metaMensal = metaAcum > 0
                  ? metaAcum / (mesesImportados || 1)
                  : (c.meta_mensal || 0);
                equipesMap[eq].meta += metaMensal;
              });

              // Adiciona dados das empresas por equipe
              movRealPorEmpresa.forEach(e => {
                const consultor = consultoresDaVisao.find(c => c.id === e.consultor_principal_id);
                const eq = consultor?.equipe || 'Sem Equipe';
                if (equipesMap[eq]) {
                  equipesMap[eq].potencial  += e.potencial_movimentacao || 0;
                  equipesMap[eq].movReal    += e.mediaMovMensal || 0;
                  equipesMap[eq].resultado  += (e.potencial_movimentacao||0) * (e.peso_categoria||1);
                  equipesMap[eq].empresas   += 1;
                  equipesMap[eq].cartoes    += e.cartoes_emitidos || 0;
                }
              });

              const equipesArr = Object.values(equipesMap)
                .filter(e => e.consultores.length > 0)
                .sort((a, b) => b.movReal - a.movReal);

              const maxMov = Math.max(...equipesArr.map(e => e.movReal), 1);

              return (
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                  {/* Cards comparativos */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:14 }}>
                    {equipesArr.map((eq, i) => {
                      const cor = COR_EQUIPE_DASH[eq.nome] || CORES_FALLBACK[i % CORES_FALLBACK.length];
                      const pctMeta = eq.meta > 0 ? (eq.movReal / eq.meta) * 100 : 0;
                      const pctBarra = (eq.movReal / maxMov) * 100;
                      const corMeta = pctMeta >= 100 ? '#16a34a' : pctMeta >= 70 ? '#f0b429' : '#dc2626';
                      return (
                        <div key={eq.nome} style={{ background:'#ffffff', border:`1px solid ${cor}30`,
                          borderRadius:12, padding:'18px 20px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)',
                          borderLeft:`4px solid ${cor}` }}>

                          {/* Header */}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e' }}>{eq.nome}</div>
                              <div style={{ color:'#8b92b0', fontSize:'0.72rem', marginTop:2 }}>
                                {eq.consultores.length} vendedor{eq.consultores.length!==1?'es':''} · {eq.empresas} empresa{eq.empresas!==1?'s':''}
                              </div>
                            </div>
                            <span style={{ background:`${cor}15`, color:cor, border:`1px solid ${cor}30`,
                              borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', fontWeight:700 }}>
                              #{i+1}
                            </span>
                          </div>

                          {/* KPIs */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                            {[
                              { label:'Mov. Real/mês',   val:fmt(eq.movReal),  cor:'#f0b429' },
                              { label:'Potencial',        val:fmt(eq.potencial), cor:'#4a5068' },
                              { label:'Meta/mês',         val:eq.meta > 0 ? fmt(eq.meta) : '—', cor:'#4a5068' },
                              { label:'% da Meta',        val:eq.meta > 0 ? `${pctMeta.toFixed(1)}%` : '—', cor:corMeta },
                            ].map(k => (
                              <div key={k.label}>
                                <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>{k.label}</div>
                                <div style={{ fontWeight:700, fontSize:'0.85rem', color:k.cor }}>{k.val}</div>
                              </div>
                            ))}
                          </div>
                          {/* Meta acumulada do período */}
                          {eq.meta > 0 && mesesImportados > 1 && (
                            <div style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:8,
                              padding:'7px 12px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                              <span style={{ color:'#8b92b0', fontSize:'0.68rem' }}>
                                Meta acumulada ({mesesImportados} meses)
                              </span>
                              <span style={{ fontWeight:700, fontSize:'0.78rem', color:'#4a5068' }}>
                                {fmt(eq.meta * mesesImportados)}
                              </span>
                            </div>
                          )}

                          {/* Barra de progresso vs maior */}
                          <div>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.65rem', color:'#8b92b0', marginBottom:4 }}>
                              <span>Mov. vs maior equipe</span>
                              <span>{pctBarra.toFixed(0)}%</span>
                            </div>
                            <div style={{ background:'#f0f2f8', borderRadius:4, height:6, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pctBarra}%`, background:cor, borderRadius:4, transition:'width 0.6s' }}></div>
                            </div>
                          </div>

                          {/* Vendedores da equipe */}
                          <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid #f0f2f8' }}>
                            <div style={{ fontSize:'0.68rem', color:'#8b92b0', fontWeight:600, textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>
                              Vendedores
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                              {eq.consultores.map(c => {
                                const empC = movRealPorEmpresa.filter(e => e.consultor_principal_id === c.id);
                                const movC = empC.reduce((s,e) => s + (e.mediaMovMensal||0), 0);
                                const pctC = eq.movReal > 0 ? (movC / eq.movReal) * 100 : 0;
                                return (
                                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontSize:'0.75rem', fontWeight:500, color:'#1a1d2e',
                                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                        {c.nome.split(' ')[0]}
                                      </div>
                                      <div style={{ background:'#f0f2f8', borderRadius:3, height:4, marginTop:2, overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:`${pctC}%`, background:`${cor}80`, borderRadius:3 }}></div>
                                      </div>
                                    </div>
                                    <span style={{ fontSize:'0.7rem', color:'#4a5068', fontWeight:600, whiteSpace:'nowrap' }}>
                                      {fmt(movC).replace('R$','').trim()}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tabela comparativa */}
                  <div style={s.card}>
                    <div style={{ ...s.cardTitle, marginBottom:16 }}>📊 Comparativo de Equipes</div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            {['#','Equipe','Vendedores','Empresas','Potencial','Mov. Real/mês','Meta/mês','Meta Acum.','% Meta','Resultado Esp.'].map(h =>
                              <th key={h} style={s.th}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {equipesArr.map((eq, i) => {
                            const cor = COR_EQUIPE_DASH[eq.nome] || CORES_FALLBACK[i % CORES_FALLBACK.length];
                            const pctMeta = eq.meta > 0 ? (eq.movReal / eq.meta) * 100 : 0;
                            const corMeta = pctMeta >= 100 ? '#16a34a' : pctMeta >= 70 ? '#f0b429' : '#dc2626';
                            return (
                              <tr key={eq.nome} style={i%2===0?{background:'#f9fafb'}:{}}>
                                <td style={{ ...s.td, textAlign:'center' }}>
                                  <span style={{ background:`${cor}15`, color:cor, borderRadius:5,
                                    padding:'1px 8px', fontSize:'0.7rem', fontWeight:700 }}>#{i+1}</span>
                                </td>
                                <td style={{ ...s.td, fontWeight:700, color:'#1a1d2e' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <div style={{ width:10, height:10, borderRadius:'50%', background:cor, flexShrink:0 }}></div>
                                    {eq.nome}
                                  </div>
                                </td>
                                <td style={{ ...s.td, textAlign:'center' }}>{eq.consultores.length}</td>
                                <td style={{ ...s.td, textAlign:'center' }}>{eq.empresas}</td>
                                <td style={s.td}>{fmt(eq.potencial)}</td>
                                <td style={{ ...s.td, color:'#f0b429', fontWeight:700 }}>{fmt(eq.movReal)}</td>
                                <td style={s.td}>{eq.meta > 0 ? fmt(eq.meta) : '—'}</td>
                                <td style={{ ...s.td, color:'#4a5068', fontWeight:600 }}>
                                  {eq.meta > 0 ? fmt(eq.meta * mesesImportados) : '—'}
                                </td>
                                <td style={{ ...s.td, fontWeight:700 }}>
                                  {eq.meta > 0 ? (
                                    <span style={{ color:corMeta }}>{pctMeta.toFixed(1)}%</span>
                                  ) : '—'}
                                </td>
                                <td style={{ ...s.td, color:'#a78bfa', fontWeight:600 }}>{fmt(eq.resultado)}</td>
                              </tr>
                            );
                          })}
                          {/* Linha de total */}
                          <tr style={{ background:'#fff8e6', fontWeight:700 }}>
                            <td style={{ ...s.td, textAlign:'center', color:'#b45309' }}>∑</td>
                            <td style={{ ...s.td, fontWeight:700, color:'#b45309' }}>TOTAL</td>
                            <td style={{ ...s.td, textAlign:'center' }}>{consultoresDaVisao.length}</td>
                            <td style={{ ...s.td, textAlign:'center' }}>{equipesArr.reduce((s,e)=>s+e.empresas,0)}</td>
                            <td style={s.td}>{fmt(equipesArr.reduce((s,e)=>s+e.potencial,0))}</td>
                            <td style={{ ...s.td, color:'#f0b429', fontWeight:800 }}>{fmt(equipesArr.reduce((s,e)=>s+e.movReal,0))}</td>
                            <td style={s.td}>{fmt(equipesArr.reduce((s,e)=>s+e.meta,0))}</td>
                            <td style={{ ...s.td, fontWeight:700 }}>{fmt(equipesArr.reduce((s,e)=>s+e.meta,0) * mesesImportados)}</td>
                            <td style={s.td}>
                              {(() => {
                                const totMov = equipesArr.reduce((s,e)=>s+e.movReal,0);
                                const totMeta = equipesArr.reduce((s,e)=>s+e.meta,0);
                                const pct = totMeta > 0 ? (totMov/totMeta)*100 : 0;
                                const cor = pct>=100?'#16a34a':pct>=70?'#f0b429':'#dc2626';
                                return totMeta > 0 ? <span style={{color:cor,fontWeight:800}}>{pct.toFixed(1)}%</span> : '—';
                              })()}
                            </td>
                            <td style={{ ...s.td, color:'#a78bfa', fontWeight:800 }}>{fmt(equipesArr.reduce((s,e)=>s+e.resultado,0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── CONTRATOS ───────────────────────────────────────────── */}
            {aba === 'contratos' && (() => {
              const metaMensal = kpis.meta || 0;
              // Mês atual para destacar
              const hoje = new Date();
              const anoAtual = hoje.getFullYear();
              const mesAtual = hoje.getMonth(); // 0-indexed
              const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
              const mesAtualLabel = `${meses[mesAtual]}/${String(anoAtual).slice(2)}`;
              // Detalhamento expandido — usa estado do componente
              const aberto = (gi) => expandidoContrato === gi;
              const toggleExpandido = (gi) => setExpandidoContrato(expandidoContrato === gi ? null : gi);
              const totalContratos = contratosArray.reduce((s,c) => s + c.contratos, 0);
              const totalPotencial = contratosArray.reduce((s,c) => s + c.potencial, 0);

              return (
                <div>
                  {/* KPIs topo */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px,1fr))', gap:14, marginBottom:20 }}>
                    {[
                      { label:'Total de Contratos', val: totalContratos, cor:'#f0b429', icone:'📋' },
                      { label:'Potencial Total',    val: fmt(totalPotencial), cor:'#34d399', icone:'💰' },
                      { label:'Meta Mensal',        val: fmt(metaMensal), cor:'#a78bfa', icone:'🎯' },
                      { label:'Mês Atual',          val: mesAtualLabel, cor:'#60a5fa', icone:'📅' },
                    ].map(k => (
                      <div key={k.label} style={{ background:'#ffffff', border:`1px solid ${k.cor}44`, borderRadius:14, padding:'16px 20px' }}>
                        <div style={{ fontSize:'1.3rem', marginBottom:6 }}>{k.icone}</div>
                        <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>{k.label}</div>
                        <div style={{ fontSize:'1.25rem', fontWeight:800, color:k.cor }}>{k.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Cards por período */}
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {contratosArray.map((grupo, gi) => {
                      const isMesAtual  = grupo.mesRef === mesAtualLabel;
                      const isCarteira  = grupo.mesRef.startsWith('Carteira');
                      const pctMeta     = metaMensal > 0 ? (grupo.resultado / metaMensal) * 100 : 0;
                      const corAlerta   = pctMeta >= 100 ? '#34d399' : pctMeta >= 50 ? '#f0b429' : pctMeta > 0 ? '#f87171' : '#4b5563';
                      const emoji       = pctMeta >= 100 ? '🔥' : pctMeta >= 50 ? '⚡' : pctMeta > 0 ? '⚠️' : '❄️';
                      const aberto2     = aberto(gi);

                      return (
                        <div key={gi} style={{
                          background: isMesAtual ? '#fff8e6' : '#ffffff',
                          border: `1px solid ${isMesAtual ? '#f0b429' : '#e4e7ef'}`,
                          borderRadius:12, overflow:'hidden',
                          boxShadow:'0 1px 3px rgba(0,0,0,0.05)',
                        }}>
                          {/* Header do card */}
                          <div
                            onClick={() => toggleExpandido(gi)}
                            style={{ padding:'16px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}
                          >
                            {/* Período */}
                            <div style={{ minWidth:120 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontSize:'1.1rem' }}>{emoji}</span>
                                <span style={{ fontWeight:700, fontSize:'0.95rem', color: isMesAtual ? '#b45309' : '#1a1d2e' }}>
                                  {grupo.mesRef}
                                </span>
                                {isMesAtual && (
                                  <span style={{ background:'rgba(240,180,41,0.2)', color:'#f0b429', borderRadius:5, padding:'1px 7px', fontSize:'0.65rem', fontWeight:700 }}>
                                    MÊS ATUAL
                                  </span>
                                )}
                              </div>
                              <div style={{ color:'#8b92b0', fontSize:'0.72rem', marginTop:3 }}>
                                {grupo.contratos} contrato{grupo.contratos!==1?'s':''}
                              </div>
                            </div>

                            {/* Potencial */}
                            <div style={{ flex:1, minWidth:140 }}>
                              <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1, marginBottom:2 }}>Potencial Mensal</div>
                              <div style={{ fontWeight:700, color:'#34d399' }}>{fmt(grupo.potencial)}</div>
                            </div>

                            {/* Resultado esperado */}
                            <div style={{ flex:1, minWidth:140 }}>
                              <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1, marginBottom:2 }}>Resultado Esperado</div>
                              <div style={{ fontWeight:700, color:'#a78bfa' }}>{fmt(grupo.resultado)}</div>
                            </div>

                            {/* Termômetro vs meta (só se não for Carteira XXXX) */}
                            {!isCarteira && metaMensal > 0 && (
                              <div style={{ flex:1, minWidth:160 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                  <span style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1 }}>vs Meta Mensal</span>
                                  <span style={{ color:corAlerta, fontWeight:700, fontSize:'0.8rem' }}>{fmtPct(pctMeta)}</span>
                                </div>
                                {/* Barra termômetro */}
                                <div style={{ background:'#eaecf2', borderRadius:6, height:10, overflow:'hidden', position:'relative' }}>
                                  <div style={{
                                    height:'100%', borderRadius:6, transition:'width 0.8s',
                                    width:`${Math.min(pctMeta, 100)}%`,
                                    background: pctMeta >= 100
                                      ? 'linear-gradient(90deg, #34d399, #059669)'
                                      : pctMeta >= 50
                                      ? 'linear-gradient(90deg, #f0b429, #d97706)'
                                      : 'linear-gradient(90deg, #f87171, #dc2626)',
                                  }}></div>
                                  {/* Marcador 50% */}
                                  <div style={{ position:'absolute', left:'50%', top:0, width:1, height:'100%', background:'rgba(255,255,255,0.2)' }}></div>
                                </div>
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, fontSize:'0.6rem', color:'#8b92b0' }}>
                                  <span>0</span><span>50%</span><span>{fmt(metaMensal)}</span>
                                </div>
                              </div>
                            )}

                            {/* Chevron */}
                            <div style={{ color:'#8b92b0', fontSize:'0.8rem', marginLeft:'auto' }}>
                              {aberto2 ? '▲' : '▼'}
                            </div>
                          </div>

                          {/* Tabela expandida */}
                          {aberto2 && (
                            <div style={{ borderTop:'1px solid #e4e7ef', overflowX:'auto', overflowY:'auto', maxHeight:320 }}>
                              <table style={{ ...s.table, fontSize:'0.77rem' }}>
                                <thead>
                                  <tr>
                                    {['ID','Empresa','Produto','Categoria','Cidade/UF','Potencial','Resultado','Dt. Cadastro','Parceiro'].map(h =>
                                      <th key={h} style={{ ...s.th, background:'#f9fafb' }}>{h}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {grupo.empresas.sort((a,b) => (b.potencial_movimentacao||0)-(a.potencial_movimentacao||0)).map((e,i) => (
                                    <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.015)'}:{}}>
                                      <td style={{ ...s.td, color:'#8b92b0', fontSize:'0.7rem' }}>{e.produto_id||'—'}</td>
                                      <td style={{ ...s.td, fontWeight:600 }}>{e.nome}</td>
                                      <td style={s.td}>{e.produto_contratado||'—'}</td>
                                      <td style={{ ...s.td, color:'#4a5068' }}>{e.categoria||'—'}</td>
                                      <td style={s.td}>{e.cidade||'—'}/{e.estado||'—'}</td>
                                      <td style={{ ...s.td, color:'#34d399' }}>{fmt(e.potencial_movimentacao)}</td>
                                      <td style={{ ...s.td, color:'#a78bfa', fontWeight:600 }}>{fmt((e.potencial_movimentacao||0)*(e.peso_categoria||1))}</td>
                                      <td style={{ ...s.td, color:'#8b92b0' }}>{e.data_cadastro?.substring(0,10)||'—'}</td>
                                      <td style={{ ...s.td, color:'#4a5068' }}>{e.parceiro?.nome||'—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {contratosArray.length === 0 && (
                      <div style={s.semDados}>Nenhum contrato encontrado</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── CARTEIRA ────────────────────────────────────────────── */}
            {aba === 'movimentacao' && (() => {
              // Lista de produtos únicos para o filtro
              const produtosUnicos = [...new Set(movRealPorEmpresa.map(e => e.produto_contratado).filter(Boolean))].sort();
              // Aplica filtros
              const lista = movRealPorEmpresa.filter(e => {
                if (filtroBusca) {
                  const q = filtroBusca.toLowerCase();
                  if (!e.nome?.toLowerCase().includes(q) && !String(e.produto_id||'').includes(q)) return false;
                }
                if (filtroProduto && e.produto_contratado !== filtroProduto) return false;
                if (filtroMesRef  && getMesReferencia(e.data_cadastro) !== filtroMesRef) return false;
                if (filtroSituacao) {
                  if (filtroSituacao === 'sem' && e.situacao !== 'sem movimentação') return false;
                  if (filtroSituacao === 'abaixo' && e.situacao !== 'abaixo do esperado') return false;
                  if (filtroSituacao === 'dentro' && e.situacao !== 'dentro do esperado') return false;
                  if (filtroSituacao === 'acima' && e.situacao !== 'acima do esperado') return false;
                }
                return true;
              });
              return (
                <div style={s.card}>
                  {/* Header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
                    <div style={s.cardTitle}>📋 Carteira de Empresas</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                      {[
                        { cor:'#4b5563', label:'sem mov.', val:'sem' },
                        { cor:'#f87171', label:'abaixo',   val:'abaixo' },
                        { cor:'#f0b429', label:'dentro',   val:'dentro' },
                        { cor:'#34d399', label:'acima',    val:'acima' },
                      ].map(({ cor, label, val }) => (
                        <span key={val} onClick={() => setFiltroSituacao(filtroSituacao===val?'':val)}
                          style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', opacity: filtroSituacao && filtroSituacao!==val ? 0.35 : 1 }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:cor, display:'inline-block' }}></span>
                          <span style={{ color:'#8b92b0', fontSize:'0.73rem' }}>{label}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Filtros */}
                  <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                    <input
                      placeholder="🔍 Buscar por nome ou ID..."
                      value={filtroBusca}
                      onChange={e => setFiltroBusca(e.target.value)}
                      style={{ flex:2, minWidth:180, background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:8, padding:'7px 12px', color:'#1a1d2e', fontSize:'0.82rem', fontFamily:'inherit', outline:'none' }}
                    />
                    <select
                      value={filtroProduto}
                      onChange={e => setFiltroProduto(e.target.value)}
                      style={{ flex:1, minWidth:140, background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:8, padding:'7px 10px', color: filtroProduto ? '#1a1d2e' : '#8b92b0', fontSize:'0.82rem', fontFamily:'inherit', outline:'none' }}
                    >
                      <option value=''>Todos os produtos</option>
                      {produtosUnicos.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select
                      value={filtroMesRef}
                      onChange={e => setFiltroMesRef(e.target.value)}
                      style={{ flex:1, minWidth:150,
                        background: mesSelecionado ? '#fff8e6' : '#ffffff',
                        border: `1px solid ${filtroMesRef ? '#f0b429' : '#e4e7ef'}`,
                        borderRadius:8, padding:'7px 10px',
                        color: filtroMesRef ? '#b45309' : '#8b92b0',
                        fontSize:'0.82rem', fontFamily:'inherit', outline:'none',
                        fontWeight: filtroMesRef ? 600 : 400 }}
                    >
                      <option value=''>Mês Ref. — Todos</option>
                      {[...new Set(movRealPorEmpresa.map(e => getMesReferencia(e.data_cadastro)).filter(Boolean))]
                        .sort((a, b) => {
                          const aC = a.startsWith('Carteira'); const bC = b.startsWith('Carteira');
                          if (aC && bC) return a.localeCompare(b);
                          if (aC) return -1; if (bC) return 1;
                          return a.localeCompare(b);
                        })
                        .map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {mesSelecionado && filtroMesRef && (
                      <span style={{ background:'#fff8e6', border:'1px solid #f0b429', borderRadius:6,
                        padding:'4px 10px', fontSize:'0.72rem', color:'#b45309', fontWeight:600,
                        alignSelf:'center', whiteSpace:'nowrap' }}>
                        🔗 Sincronizado com o mês
                      </span>
                    )}
                    {(filtroBusca || filtroProduto || filtroSituacao || filtroMesRef) && (
                      <button onClick={() => { setFiltroBusca(''); setFiltroProduto(''); setFiltroSituacao(''); setFiltroMesRef(''); }}
                        style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'7px 14px', color:'#dc2626', fontSize:'0.8rem', cursor:'pointer', fontFamily:'inherit' }}>
                        ✕ Limpar
                      </button>
                    )}
                    <span style={{ color:'#8b92b0', fontSize:'0.75rem', alignSelf:'center', marginLeft:'auto' }}>
                      {lista.length} de {movRealPorEmpresa.length} empresas
                    </span>
                  </div>

                  {/* Tabela com scroll interno fixo */}
                  <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:480, borderRadius:8, border:'1px solid #f0f2f8' }}>
                    <table style={{ ...s.table, fontSize:'0.78rem' }}>
                      <thead>
                        <tr style={{ position:'sticky', top:0, zIndex:2, background:'#f9fafb' }}>
                          {['ID','Empresa','Produto','Dt. Cadastro','Mês Ref.','Potencial','Acum. Real','Média/Mês','% Aderência','Situação','Parceiro'].map(h =>
                            <th key={h} style={{ ...s.th, background:'#f9fafb', position:'sticky', top:0 }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((e, i) => {
                          const corSit = e.situacao === 'acima do esperado' ? '#34d399'
                            : e.situacao === 'dentro do esperado' ? '#f0b429'
                            : e.situacao === 'abaixo do esperado' ? '#f87171' : '#4b5563';
                          return (
                            <tr key={i} className="row-hover" style={i%2===0?{background:'rgba(255,255,255,0.015)'}:{}}>
                              <td style={{ ...s.td, color:'#8b92b0', fontSize:'0.72rem' }}>{e.produto_id ?? '—'}</td>
                              <td style={{ ...s.td, fontWeight:600, minWidth:160 }}>{e.nome}</td>
                              <td style={{ ...s.td, whiteSpace:'nowrap' }}>{e.produto_contratado||'—'}</td>
                              <td style={{ ...s.td, color:'#8b92b0', whiteSpace:'nowrap' }}>{e.data_cadastro ? e.data_cadastro.substring(0,10) : '—'}</td>
                              <td style={{ ...s.td, color:'#60a5fa', fontWeight:600, whiteSpace:'nowrap' }}>{getMesReferencia(e.data_cadastro) || '—'}</td>
                              <td style={{ ...s.td, whiteSpace:'nowrap' }}>{fmt(e.potencial_movimentacao)}</td>
                              <td style={{ ...s.td, color:'#4a5068', whiteSpace:'nowrap' }}>{e.movReal > 0 ? fmt(e.movReal) : '—'}</td>
                              <td style={{ ...s.td, color:'#34d399', fontWeight:600, whiteSpace:'nowrap' }}>{e.mediaMovMensal > 0 ? fmt(e.mediaMovMensal) : '—'}</td>
                              <td style={{ ...s.td, whiteSpace:'nowrap' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <div style={{ background:'#f0f2f8', borderRadius:3, height:5, width:50, overflow:'hidden' }}>
                                    <div style={{ background:corSit, height:'100%', width:`${Math.min(e.aderencia,100)}%`, borderRadius:3 }}></div>
                                  </div>
                                  <span style={{ color:corSit, fontWeight:600, fontSize:'0.75rem' }}>{fmtPct(e.aderencia)}</span>
                                </div>
                              </td>
                              <td style={{ ...s.td, whiteSpace:'nowrap' }}>
                                <span style={{ background:`${corSit}18`, color:corSit, borderRadius:5, padding:'2px 7px', fontSize:'0.68rem', fontWeight:600 }}>
                                  {e.situacao}
                                </span>
                              </td>
                              <td style={{ ...s.td, color:'#4a5068', whiteSpace:'nowrap' }}>{e.parceiro?.nome||'—'}</td>
                            </tr>
                          );
                        })}
                        {lista.length === 0 && (
                          <tr><td colSpan={12} style={{ ...s.td, textAlign:'center', color:'#8b92b0', padding:32 }}>Nenhuma empresa encontrada</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}


            {/* ── PRODUTOS ────────────────────────────────────────────── */}
            {aba === 'produtos' && (
              <div style={s.card}>
                {/* Header + legenda */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                  <div style={s.cardTitle}>🎯 Distribuição Completa por Produto</div>
                  <div style={{ display:'flex', gap:14, fontSize:'0.72rem' }}>
                    {[
                      { cor:'#a78bfa', label:'Resultado Esperado' },
                      { cor:'#f0b429', label:'Movimentado Real' },
                    ].map(({ cor, label }) => (
                      <span key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ width:10, height:10, borderRadius:2, background:cor, display:'inline-block' }}></span>
                        <span style={{ color:'#4a5068' }}>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {produtosArray.map((p, i) => {
                    const maxBar   = Math.max(...produtosArray.map(x => x.resultado), 1);
                    const pctEsp   = (p.resultado / maxBar) * 100;
                    // movReal pode ser > resultado → calcular proporção dentro da barra de resultado
                    const movCap   = Math.min(p.movReal || 0, p.resultado);   // movReal limitado ao esperado
                    const pctMov   = p.resultado > 0 ? (movCap / p.resultado) * 100 : 0; // % dentro da barra amarela
                    const pctTotal = (p.resultado / (kpis.totalResultado || 1)) * 100;
                    return (
                      <div key={i} style={{ background:'#f9fafb', borderRadius:12, padding:'16px 20px' }}>
                        {/* Linha topo */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                          <span style={{ fontWeight:700, fontSize:'0.95rem' }}>{p.nome}</span>
                          <span style={{ color:'#f0b429', fontWeight:700, fontSize:'0.82rem' }}>{p.contratos} empresa{p.contratos > 1 ? 's' : ''}</span>
                        </div>
                        {/* 4 KPIs */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:12 }}>
                          <div>
                            <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', marginBottom:3 }}>Potencial Bruto</div>
                            <div style={{ fontWeight:600, fontSize:'0.85rem' }}>{fmt(p.potencial)}</div>
                          </div>
                          <div>
                            <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', marginBottom:3 }}>Resultado Esperado</div>
                            <div style={{ fontWeight:700, fontSize:'0.85rem', color:'#a78bfa' }}>{fmt(p.resultado)}</div>
                          </div>
                          <div>
                            <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', marginBottom:3 }}>Movimentado Real</div>
                            <div style={{ fontWeight:700, fontSize:'0.85rem', color: p.movReal > 0 ? '#f0b429' : '#4b5563' }}>
                              {p.movReal > 0 ? fmt(p.movReal) : '—'}
                            </div>
                          </div>
                          <div>
                            <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', marginBottom:3 }}>% do Total</div>
                            <div style={{ fontWeight:600, fontSize:'0.85rem', color:'#60a5fa' }}>{fmtPct(pctTotal)}</div>
                          </div>
                        </div>
                        {/* Barra segmentada: fundo = resultado esperado (roxo), sobreposição = movimentado (amarelo) */}
                        <div style={{ position:'relative', height:10, borderRadius:6, overflow:'hidden',
                          background:'#f0f2f8' }}>
                          {/* Segmento roxo — resultado esperado */}
                          <div style={{
                            position:'absolute', left:0, top:0, height:'100%',
                            width:`${pctEsp}%`,
                            background:'rgba(167,139,250,0.35)',
                            borderRadius:6,
                            transition:'width 0.6s'
                          }}></div>
                          {/* Segmento amarelo — movimentado real (dentro da faixa roxa) */}
                          {p.movReal > 0 && (
                            <div style={{
                              position:'absolute', left:0, top:0, height:'100%',
                              width:`${(pctEsp * pctMov) / 100}%`,
                              background:'#f0b429',
                              borderRadius:6,
                              transition:'width 0.6s'
                            }}></div>
                          )}
                        </div>
                        {/* Rodapé da barra */}
                        {p.movReal > 0 && (
                          <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:'0.65rem', color:'#8b92b0' }}>
                            <span style={{ color:'#f0b429' }}>
                              Movimentado: {fmtPct(p.resultado > 0 ? (p.movReal/p.resultado)*100 : 0)} do esperado
                            </span>
                            <span>{fmt(p.movReal)} / {fmt(p.resultado)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {produtosArray.length === 0 && <div style={s.semDados}>Sem produtos registrados</div>}
                </div>
              </div>
            )}

            {/* ── PARCEIROS ───────────────────────────────────────────── */}
            {aba === 'parceiros' && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={s.cardTitle}>🤝 Fechamentos por Parceiro Comercial</div>
                  <span style={{ color: '#8b92b0', fontSize: '0.8rem' }}>{parceirosArray.length} parceiros</span>
                </div>

                {/* Tabela detalhada */}
                <div style={{ fontSize: '0.72rem', color: '#8b92b0', background: '#f9fafb', border:'1px solid #e4e7ef', borderRadius: 8, padding: '6px 12px', marginBottom:16, display:'inline-block' }}>
                  📌 Potencial e Resultado acumulados (× meses importados) — mesma base da Mov. Real
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
                            <tr key={i} style={i % 2 === 0 ? { background: '#f9fafb' } : {}}>
                              <td style={{ ...s.td, fontWeight: 600, color: p.nome === 'Sem Parceiro' ? '#8b92b0' : '#1a1d2e' }}>
                                {p.nome}
                                <div style={{ color: '#8b92b0', fontSize: '0.68rem', fontWeight: 400, marginTop: 2 }}>
                                  {Math.round(p.mesesMedios)} {Math.round(p.mesesMedios) === 1 ? 'mês' : 'meses'} importados
                                </div>
                              </td>
                              <td style={{ ...s.td, textAlign: 'center' }}>{p.contratos}</td>
                              <td style={{ ...s.td, color: '#f0b429' }}>{fmt(p.potencialMensal)}</td>
                              <td style={{ ...s.td, color: '#4a5068' }}>{fmt(p.resultado)}</td>
                              <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(p.movReal)}</td>
                              <td style={{ ...s.td, color: '#60a5fa', fontWeight: 700 }}>{fmt(p.mediaMovMensal)}</td>
                              <td style={s.td}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ background: '#eaecf2', borderRadius: 4, height: 6, width: 60, overflow: 'hidden' }}>
                                    <div style={{ background: corAder, height: '100%', width: `${Math.min(ader, 100)}%`, borderRadius: 4 }}></div>
                                  </div>
                                  <span style={{ color: corAder, fontWeight: 600, fontSize: '0.8rem' }}>{fmtPct(ader)}</span>
                                </div>
                              </td>
                              <td style={{ ...s.td, color: corSpread, fontWeight: 600 }}>
                                {p.spread !== 0 ? fmt(p.spread) : <span style={{ color: '#8b92b0' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                {parceirosArray.length === 0 && <div style={s.semDados}>Nenhum parceiro registrado</div>}
              </div>
            )}

            {/* ── RANKING ─────────────────────────────────────────────── */}
            {aba === 'ranking' && (() => {
              const rankingList = consultores
                .filter(c => gestorFiltro === 'Geral' || c.gestor === gestorFiltro)
                .map(c => ({
                  ...c,
                  movMes:      resultadoPorConsultor[c.id]   || 0, // mov do último mês
                  volMetaAcum: metaAcumPorConsultor[c.id]    || 0, // meta acumulada
                }))
                .sort((a, b) => b.volMetaAcum - a.volMetaAcum);
              const maxVal  = Math.max(...rankingList.map(c => c.volMetaAcum), 1);
              const mesesLabel = Object.keys(metasPorMes || {}).sort().map(m => fmtMes(m+'-01')).join(' + ') || '—';
              return (
                <div style={s.card}>
                  {/* Header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:8 }}>
                    <div style={s.cardTitle}>🏆 Ranking — Vol. Meta Realizado</div>
                    <div style={{ background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', borderRadius:8, padding:'4px 12px', fontSize:'0.75rem', color:'#34d399', fontWeight:700 }}>
                      Acumulado: {mesesLabel}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {rankingList.map((c, i) => {
                      const isAtual  = c.id === consultorId;
                      const pctBarra = (c.volMetaAcum / maxVal) * 100;
                      const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}º`;
                      const corMedal = i === 0 ? '#f0b429' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c2f' : '#4b5563';
                      return (
                        <div key={c.id} style={{
                          borderRadius:10, overflow:'hidden',
                          background: isAtual ? '#fff8e6' : '#f9fafb',
                          border: isAtual ? '1px solid #f0b429' : '1px solid #e4e7ef',
                        }}>
                          <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px' }}>
                            <span style={{ fontWeight:700, fontSize:'1rem', color: corMedal, minWidth:32, textAlign:'center' }}>{medal}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontWeight: isAtual ? 700 : 600, fontSize:'0.88rem', color: isAtual ? '#b45309' : '#1a1d2e' }}>{c.nome}</div>
                              {c.movMes > 0 && (
                                <div style={{ fontSize:'0.72rem', color:'#8b92b0', marginTop:2 }}>
                                  Últ. mov: {fmt(c.movMes)} · {fmtMes((ultimoMes||'') + '-01')}
                                </div>
                              )}
                            </div>
                            <span style={{ color:'#8b92b0', fontSize:'0.75rem' }}>{c.gestor || '—'}</span>
                            <span style={{ color: c.volMetaAcum > 0 ? '#34d399' : '#4b5563', fontWeight:700, fontSize:'0.9rem', minWidth:120, textAlign:'right' }}>
                              {c.volMetaAcum > 0 ? fmt(c.volMetaAcum) : '—'}
                            </span>
                            {isAtual && (
                              <span style={{ background:'rgba(240,180,41,0.2)', color:'#f0b429', borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', fontWeight:700 }}>você</span>
                            )}
                          </div>
                          {c.volMetaAcum > 0 && (
                            <div style={{ height:3, background:'#f5f6fa' }}>
                              <div style={{ height:'100%', width:`${pctBarra}%`, background: isAtual ? '#f0b429' : i < 3 ? '#34d399' : '#d1d5e8', transition:'width 0.6s' }}></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {rankingList.every(c => c.volMetaAcum === 0) && (
                      <div style={s.semDados}>Nenhuma meta importada ainda</div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        );
      })()}
    </div>
  );
}

const s = {
  page:        { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#1a1d2e', background: '#f5f6fa', minHeight: '100vh' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  tag:         { color: '#b45309', fontWeight: 700, fontSize: '0.75rem', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  title:       { fontSize: '1.6rem', fontWeight: 700, margin: '0 0 6px', fontFamily: "'Syne', sans-serif", color: '#1a1d2e' },
  sub:         { color: '#8b92b0', fontSize: '0.875rem' },
  filtrosCard: { background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  filtroGrupo: { display: 'flex', flexDirection: 'column', gap: 6 },
  filtroLabel: { color: '#8b92b0', fontSize: '0.65rem', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600 },
  gestorBtn:   { background: '#f5f6fa', border: '1px solid #e4e7ef', borderRadius: 8, padding: '7px 14px', color: '#4a5068', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, fontFamily: 'inherit' },
  gestorBtnAtivo: { background: '#fff8e6', border: '1px solid #f0b429', color: '#b45309', fontWeight: 700 },
  select:      { background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 8, padding: '8px 14px', color: '#1a1d2e', fontSize: '0.875rem', fontFamily: 'inherit', cursor: 'pointer', minWidth: 240 },
  vazio:       { background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 12, padding: '64px 32px', textAlign: 'center' },
  kpis:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 },
  kpi:         { background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  kpiLabel:    { color: '#8b92b0', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  kpiVal:      { fontSize: '1.2rem', fontWeight: 700, color: '#1a1d2e' },
  tabs:        { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tab:         { background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 8, padding: '7px 16px', color: '#4a5068', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  tabAtiva:    { background: '#fff8e6', border: '1px solid #f0b429', color: '#b45309', fontWeight: 600 },
  card:        { background: '#ffffff', border: '1px solid #e4e7ef', borderRadius: 12, padding: '24px', marginBottom: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardTitle:   { fontSize: '0.95rem', fontWeight: 700, color: '#1a1d2e' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:          { padding: '8px 12px', textAlign: 'left', color: '#8b92b0', fontWeight: 600, borderBottom: '1px solid #e4e7ef', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.67rem', letterSpacing: 0.5, background: '#f9fafb' },
  td:          { padding: '10px 12px', borderBottom: '1px solid #f0f2f8', whiteSpace: 'nowrap', color: '#1a1d2e' },
  semDados:    { color: '#8b92b0', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' },
};
