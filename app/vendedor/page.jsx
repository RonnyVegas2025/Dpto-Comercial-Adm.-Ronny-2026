'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };
const norm   = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

const ABAS = [
  { key:'resumo',     label:'📊 Resumo'     },
  { key:'categorias', label:'📂 Categorias' },
  { key:'equipes',    label:'👥 Equipes'    },
  { key:'carteira',   label:'📋 Carteira'   },
  { key:'produtos',   label:'🎯 Produtos'   },
  { key:'ranking',    label:'🏆 Ranking'    },
];

async function fetchAll(query) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await query.range(from, from+999);
    if (error || !data || !data.length) break;
    all = [...all, ...data];
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

function calcularValorMeta(empresa, libsTodasMap, ajusteMap, pct, validaDesdeMes) {
  const catLower  = (empresa.categoria || '').toLowerCase();
  const prodNorm  = (empresa.produto_contratado || '').toLowerCase().trim();
  const isConv    = catLower.includes('conv') || catLower.includes('mobil');
  const isBenef   = !isConv;

  const libsOrdenadas = (libsTodasMap[empresa.produto_id] || [])
    .filter(l => {
      const _v = validaDesdeMes ? String(validaDesdeMes).substring(0,7) : '2026-01';
      const _limite = _v > '2026-01' ? _v : '2026-01';
      return l.val > 0 && l.comp >= _limite;
    })
    .sort((a, b) => a.comp.localeCompare(b.comp));

  if (libsOrdenadas.length === 0) return null;

  const isVB  = prodNorm === 'vegas benefícios' || prodNorm === 'vegas beneficios';
  const peso  = isVB ? (empresa.peso_categoria ?? 1) : 1;

  let mesAlvo = null, mesSeq = 0, valorBruto = 0;

  if (isBenef) {
    mesAlvo    = libsOrdenadas[0].comp;
    mesSeq     = 1;
    valorBruto = libsOrdenadas[0].val;
  } else if (isConv) {
    if (libsOrdenadas.length < 3) return null;
    mesAlvo    = libsOrdenadas[2].comp;
    mesSeq     = 3;
    valorBruto = libsOrdenadas[2].val;
  }

  if (!mesAlvo) return null;

  const compKey  = `${empresa.id}__${mesAlvo}`;
  const ajuste   = ajusteMap[compKey];
  const valorConsiderado = ajuste !== undefined ? ajuste : valorBruto;
  const valorMeta = Math.round(valorConsiderado * peso * (pct / 100) * 100) / 100;

  return {
    empresa_id:        empresa.id,
    produto_id:        empresa.produto_id,
    competencia_meta:  mesAlvo,
    valor_bruto:       valorBruto,
    valor_considerado: valorConsiderado,
    valor_meta:        valorMeta,
    pct_consultor:     pct,
    regra:             isBenef ? 'beneficio' : 'convenio',
    mes_sequencia:     mesSeq,
  };
}

export default function DashboardVendedor() {
  const [consultores,    setConsultores]    = useState([]);
  const [consultorId,    setConsultorId]    = useState('');
  const [gestorFiltro,   setGestorFiltro]   = useState('Geral');
  const [gestores,       setGestores]       = useState(['Geral']);
  const [perfilUsuario,  setPerfilUsuario]  = useState(null);
  const [dados,          setDados]          = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [aba,            setAba]            = useState('resumo');
  const [meses,          setMeses]          = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState('');
  // ✅ NOVO: seleção múltipla de meses
  const [mesesSelecionados, setMesesSelecionados] = useState(new Set());
  // ✅ NOVO: filtro por equipe no topo
  const [filtroEquipeTopo, setFiltroEquipeTopo] = useState('');
  const [filtroMetaMesLocal, setFiltroMetaMesLocal] = useState('');
  const [filtroMetaProduto,  setFiltroMetaProduto]  = useState('');
  const [filtroMetaCadastro, setFiltroMetaCadastro] = useState('');
  const [metaPagina,         setMetaPagina]         = useState(1);
  const [metaPorPag,         setMetaPorPag]         = useState(15);
  const [carteiraPagina,     setCarteiraPagina]     = useState(1);
  const [carteiraPorPag,     setCarteiraPorPag]     = useState(12);
  const [filtroCategoria,    setFiltroCategoria]    = useState('');
  // ✅ NOVO: filtro por equipe na carteira (separado do filtro de categoria)
  const [filtroEquipe,       setFiltroEquipe]       = useState('');
  const [colsVisiveis,       setColsVisiveis]       = useState(new Set(['empresa','produto','esperado','media','meta','status']));
  const [mesesVisiveis,      setMesesVisiveis]      = useState(null);
  const [busca,          setBusca]          = useState('');
  const [filtroProduto,  setFiltroProduto]  = useState('');
  const [filtroStatus,   setFiltroStatus]   = useState('');

  useEffect(() => { carregarBase(); }, []);
  useEffect(() => { if (consultores.length) carregarDados(); }, [consultorId, gestorFiltro, mesSelecionado, mesesSelecionados, filtroEquipeTopo, consultores]);

 async function carregarBase() {
    let consultorIdsPermitidos = null;
    let prof = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [{ data: profData }, { data: vis }] = await Promise.all([
          supabase.from('user_profiles').select('perfil,nome').eq('id', user.id).single(),
          supabase.from('user_visibilidade').select('tipo,consultor_ids,equipes').eq('user_id', user.id).maybeSingle(),
        ]);
        prof = profData;
        setPerfilUsuario(profData);
        const perfisRestritos = ['gestor_comercial','supervisor_comercial','vendedor'];
        if (prof && perfisRestritos.includes(prof.perfil)) {
          if (vis?.tipo === 'especificos' && vis.consultor_ids?.length > 0) {
            consultorIdsPermitidos = vis.consultor_ids;
          } else if (vis?.tipo === 'equipes' && vis.equipes?.length > 0) {
            consultorIdsPermitidos = 'por_equipe:' + vis.equipes.join(',');
          }
        }
      }
    } catch(_) {}

    const [{ data: cons }, { data: libs }] = await Promise.all([
      supabase.from('consultores').select('id,nome,meta_mensal,setor,gestor,equipe,meta_inicio').eq('ativo',true).order('nome'),
      supabase.from('liberacoes').select('competencia').order('competencia',{ascending:false}),
    ]);

    let consComValidade = (cons||[]).map(c => ({
      ...c,
      meta_inicio: c.meta_inicio || null,
      gestor: c.gestor || null,
    }));

    if (consultorIdsPermitidos && typeof consultorIdsPermitidos === 'object') {
      const idSet = new Set(consultorIdsPermitidos);
      consComValidade = consComValidade.filter(c => idSet.has(c.id));
    } else if (typeof consultorIdsPermitidos === 'string' && consultorIdsPermitidos.startsWith('por_equipe:')) {
      const equipes = consultorIdsPermitidos.replace('por_equipe:','').split(',');
      consComValidade = consComValidade.filter(c => equipes.includes(c.equipe) && c.gestor === prof?.nome);
    }

    setConsultores(consComValidade);
    const gs = ['Geral', ...new Set(consComValidade.map(c=>c.gestor).filter(Boolean))];
    setGestores(gs);
    const ms = [...new Set((libs||[]).map(l=>l.competencia?.substring(0,7)).filter(Boolean))].sort();
    setMeses(ms);
  }

  async function carregarDados() {
    setLoading(true); setDados(null);
    try {
      let empQuery = supabase.from('empresas').select(`
        id, produto_id, nome, cnpj, categoria, produto_contratado,
        potencial_movimentacao, peso_categoria, cartoes_emitidos, data_cadastro,
        taxa_positiva, taxa_negativa, pct_principal, pct_agregado_1, pct_agregado_2,
        consultor_principal:consultor_principal_id (id, nome, gestor, equipe, meta_mensal),
        consultor_agregado:consultor_agregado_id (id, nome),
        consultor_agregado_2:consultor_agregado_2_id (id, nome),
        parceiro:parceiro_id (nome)
      `).eq('ativo',true)
        .not('produto_contratado','ilike','%desconto condicional%')
        .not('categoria','eq','Taxa Negativa')
        .in('categoria',['Beneficios','Benefícios','Bonus','Bônus','Convênio','Convenio','Mobilidade']);

      if (consultorId) {
        empQuery = empQuery.or(`consultor_principal_id.eq.${consultorId},consultor_agregado_id.eq.${consultorId},consultor_agregado_2_id.eq.${consultorId}`);
      } else {
        const ids = gestorFiltro !== 'Geral'
          ? consultores.filter(c=>c.gestor===gestorFiltro).map(c=>c.id)
          : consultores.map(c=>c.id);
        if (!ids.length) { setLoading(false); setDados(buildEmpty()); return; }
        empQuery = empQuery.in('consultor_principal_id', ids);
      }

      const empresas = await fetchAll(empQuery);
      const prodIds  = empresas.map(e => e.produto_id);
      const empIds   = empresas.map(e => e.id);

      // Suporte a múltiplos meses selecionados
      const mesesAtivos = mesesSelecionados.size > 0 ? [...mesesSelecionados].sort() : (mesSelecionado ? [mesSelecionado] : []);
      // mesInicio e mesFim: pega menor e maior mês da seleção (ordenação lexicográfica funciona para YYYY-MM)
      const mesInicio = mesesAtivos.length > 0 ? mesesAtivos[0] + '-01' : '2000-01-01';
      const mesFim    = mesesAtivos.length > 0 ? mesesAtivos[mesesAtivos.length-1] + '-28' : '2099-12-31';
      // Para filtro de equipe no topo
      const equipeTopoFiltro = filtroEquipeTopo;

      const [libsFiltradas, ajustes, libsTodas, vmetasRows] = await Promise.all([
        prodIds.length ? fetchAll(
          supabase.from('liberacoes').select('produto_id,competencia,total_liberado')
            .in('produto_id', prodIds).gte('competencia', mesInicio).lte('competencia', mesFim)
        ) : Promise.resolve([]),
        empIds.length ? fetchAll(
          supabase.from('ajustes_movimentacao').select('empresa_id,competencia,valor_considerado')
            .in('empresa_id', empIds)
        ) : Promise.resolve([]),
        prodIds.length ? fetchAll(
          supabase.from('liberacoes').select('produto_id,competencia,total_liberado')
            .in('produto_id', prodIds).order('competencia')
        ) : Promise.resolve([]),
        empIds.length ? supabase.from('valor_meta_empresa')
          .select('empresa_id,consultor_id,competencia_meta,valor_meta,valor_considerado,valor_bruto,regra,pct_consultor')
          .in('empresa_id', empIds)
          .then(r => r.data||[]) : Promise.resolve([]),
      ]);

      const libMap = {};
      for (const l of libsFiltradas) {
        const k = `${l.produto_id}__${l.competencia?.substring(0,10)}`;
        libMap[k] = (libMap[k] || 0) + l.total_liberado;
      }

      const ajusteMap = {};
      for (const a of ajustes) {
        ajusteMap[`${a.empresa_id}__${a.competencia?.substring(0,10)}`] = a.valor_considerado;
      }

      const libsTodasMap = {};
      for (const l of libsTodas) {
        const pid = l.produto_id;
        if (!libsTodasMap[pid]) libsTodasMap[pid] = [];
        libsTodasMap[pid].push({ comp: l.competencia?.substring(0,10), val: l.total_liberado || 0 });
      }

      // mesesDisp: se há meses selecionados, filtra somente eles
      const todosMesesDisp = [...new Set(libsFiltradas.map(l=>l.competencia?.substring(0,7)).filter(Boolean))].sort();
      const mesesDisp = mesesAtivos.length > 0
        ? todosMesesDisp.filter(m => mesesAtivos.includes(m))
        : todosMesesDisp;

      const consultor = consultorId ? consultores.find(c=>c.id===consultorId) : null;
      const consultoresDaVisao = consultorId ? [consultor].filter(Boolean)
        : (() => {
            let base = gestorFiltro === 'Geral' ? consultores : consultores.filter(c=>c.gestor===gestorFiltro);
            if (equipeTopoFiltro) base = base.filter(c => c.equipe === equipeTopoFiltro);
            return base;
          })();

      const listaProcessada = [];

      for (const e of empresas) {
        const pctP  = e.pct_principal  ?? 100;
        const pctA1 = e.pct_agregado_1 ?? 0;
        const pctA2 = e.pct_agregado_2 ?? 0;

        const consultoresEmpresa = [
          e.consultor_principal  ? { cons: e.consultor_principal,  pct: pctP  } : null,
          e.consultor_agregado   && pctA1 > 0 ? { cons: e.consultor_agregado,   pct: pctA1 } : null,
          e.consultor_agregado_2 && pctA2 > 0 ? { cons: e.consultor_agregado_2, pct: pctA2 } : null,
        ].filter(Boolean);

        for (const { cons, pct } of consultoresEmpresa) {
          if (consultorId && cons.id !== consultorId) continue;
          if (gestorFiltro !== 'Geral' && !consultorId) {
            const consCompleto = consultores.find(c=>c.id===cons.id);
            if (!consCompleto || consCompleto.gestor !== gestorFiltro) continue;
          }
          // Filtro por equipe no topo
          if (equipeTopoFiltro) {
            const consCompleto2 = consultores.find(c=>c.id===cons.id);
            if (!consCompleto2 || consCompleto2.equipe !== equipeTopoFiltro) continue;
          }

          const fator = pct / 100;
          const movPorMes = {};
          let totalMov = 0;
          for (const m of mesesDisp) {
            const comp   = m + '-01';
            const aj     = ajusteMap[`${e.id}__${comp}`];
            const bruto  = libMap[`${e.produto_id}__${comp}`] || 0;
            const val    = aj !== undefined ? aj : bruto;
            const valFat = Math.round(val * fator * 100) / 100;
            movPorMes[m] = valFat;
            totalMov    += valFat;
          }

          const mesesAtivos = Object.values(movPorMes).filter(v=>v>0).length;
          const mediaMovMes = mesesAtivos > 0 ? totalMov / mesesAtivos : 0;
          const esperadoMes = (e.potencial_movimentacao||0) * (e.peso_categoria||1) * fator;
          const aderencia   = esperadoMes > 0 ? (mediaMovMes / esperadoMes) * 100 : 0;

          let situacao = 'sem movimentação';
          if (totalMov > 0 && aderencia < 50)   situacao = 'abaixo do esperado';
          if (aderencia >= 50 && aderencia < 90) situacao = 'dentro do esperado';
          if (aderencia >= 90)                   situacao = 'acima do esperado';

          const consCompleto = consultores.find(c=>c.id===cons.id);
          const validadeConsultor = consCompleto?.meta_inicio || null;

          const entradaBanco = (vmetasRows||[]).find(v =>
            v.empresa_id === e.id &&
            v.regra !== 'upsell' &&
            (v.consultor_id === cons.id || v.consultor_id === null)
          );
          const entradaUpsell = (vmetasRows||[]).find(v =>
            v.empresa_id === e.id && v.regra === 'upsell'
          );

          let metaCalc;
          if (entradaBanco) {
            const pctBanco = entradaBanco.pct_consultor || pct;
            metaCalc = {
              valor_meta:        (entradaBanco.valor_meta || 0) + (entradaUpsell?.valor_meta || 0),
              competencia_meta:  entradaBanco.competencia_meta,
              regra:             entradaBanco.regra,
              valor_bruto:       entradaBanco.valor_bruto || 0,
              valor_considerado: entradaBanco.valor_considerado || 0,
              pct_consultor:     pctBanco,
            };
          } else {
            metaCalc = calcularValorMeta(e, libsTodasMap, ajusteMap, pct, validadeConsultor);
          }

          // ✅ Guarda equipe do consultor para filtro na carteira
          const equipeConsultor = consCompleto?.equipe || cons?.equipe || '—';

          listaProcessada.push({
            ...e,
            _key:        `${e.id}__${cons.id}`,
            _cons:       cons,
            _pct:        pct,
            _equipe:     equipeConsultor,
            vendedor:    cons.nome,
            gestor:      cons.gestor || '—',
            movPorMes,
            totalMov,
            mediaMovMes,
            mesesAtivos,
            esperadoMes,
            aderencia,
            situacao,
            valorMeta:       metaCalc?.valor_meta        || 0,
            metaComp:        metaCalc?.competencia_meta   || null,
            metaRegra:       metaCalc?.regra              || null,
            metaSeq:         metaCalc?.mes_sequencia      || null,
            metaBruto:       metaCalc?.valor_bruto        || 0,
            metaConsiderado: metaCalc?.valor_considerado  || 0,
          });
        }
      }

      const totalMovReal   = listaProcessada.reduce((s,e) => s + e.totalMov, 0);
      const totalEsperado  = listaProcessada.reduce((s,e) => s + e.esperadoMes * (mesesDisp.length || 1), 0);
      const totalValorMeta = listaProcessada.reduce((s,e) => {
        if (mesSelecionado) {
          const metaMes = e.metaComp?.substring(0,7);
          if (metaMes !== mesSelecionado) return s;
        }
        return s + (e.valorMeta || 0);
      }, 0);

      const meta = consultoresDaVisao.reduce((total, cons) => {
        const metaMes = cons.meta_mensal || 0;
        if (!metaMes) return total;
        const validadeIndividual = (cons.meta_inicio || '').substring(0,7) || '2026-01';
        const validaMes = validadeIndividual > '2026-01' ? validadeIndividual : '2026-01';
        if (mesSelecionado) {
          return total + (mesSelecionado >= validaMes ? metaMes : 0);
        } else {
          const qtd = mesesDisp.filter(m => m >= validaMes).length;
          return total + metaMes * qtd;
        }
      }, 0);

      const metaTotal  = meta;
      const comMov     = listaProcessada.filter(e => e.totalMov > 0).length;
      const semMov     = listaProcessada.filter(e => e.totalMov === 0).length;
      const crescendo  = listaProcessada.filter(e => {
        const vals = mesesDisp.map(m => e.movPorMes[m] || 0);
        if (vals.length < 2) return false;
        const ultimo = vals[vals.length - 1];
        const penult = [...vals].reverse().slice(1).find(v => v > 0) || 0;
        return ultimo > penult * 1.05;
      }).length;

      const porProduto = {};
      listaProcessada.forEach(e => {
        const p = e.produto_contratado || 'Outros';
        if (!porProduto[p]) porProduto[p] = { contratos:0, esperado:0, movReal:0 };
        porProduto[p].contratos++;
        porProduto[p].esperado += e.esperadoMes;
        porProduto[p].movReal  += e.mediaMovMes;
      });

      const rankingMap = {};
      listaProcessada.forEach(e => {
        const cid = e._cons.id;
        if (!rankingMap[cid]) rankingMap[cid] = { id:cid, nome:e.vendedor, gestor:e.gestor, movReal:0, esperado:0, empresas:0, valorMeta:0, fechadoBruto:0, naMeta:0 };
        rankingMap[cid].movReal      += e.mediaMovMes;
        rankingMap[cid].esperado     += e.esperadoMes;
        rankingMap[cid].empresas     += 1;
        rankingMap[cid].valorMeta    += e.valorMeta || 0;
        rankingMap[cid].fechadoBruto += e.potencial_movimentacao || 0;
        if ((e.valorMeta||0) > 0) rankingMap[cid].naMeta += 1;
      });
      const ranking = Object.values(rankingMap).sort((a,b) => b.movReal - a.movReal);

      const empresasNaMeta = listaProcessada
        .map(e => {
          const todasEntradas = (vmetasRows||[]).filter(v => v.empresa_id === e.id);
          const entradasFiltradas = mesSelecionado
            ? todasEntradas.filter(v => v.competencia_meta?.substring(0,7) === mesSelecionado)
            : todasEntradas;
          if (entradasFiltradas.length === 0) {
            const metaComp = e.metaComp?.substring(0,7);
            if (!e.valorMeta || (mesSelecionado && metaComp !== mesSelecionado)) return null;
            return { ...e, _metaEntradas: [{ competencia_meta: e.metaComp, valor_meta: e.valorMeta, regra: e.metaRegra }] };
          }
          return { ...e, _metaEntradas: entradasFiltradas };
        })
        .filter(Boolean)
        .sort((a,b) => {
          const va = a._metaEntradas.reduce((s,v)=>s+(v.valor_meta||0),0);
          const vb = b._metaEntradas.reduce((s,v)=>s+(v.valor_meta||0),0);
          return vb - va;
        });

      const metaPorMes = {};
      for (const m of mesesDisp) {
        metaPorMes[m] = listaProcessada.reduce((s,e) => {
          const metaMes = e.metaComp?.substring(0,7);
          if (metaMes === m) return s + (e.valorMeta||0);
          return s;
        }, 0);
      }

      setDados({
        consultor, consultoresDaVisao, mesesDisp, empresasNaMeta, vmetasRows, metaPorMes,
        lista: listaProcessada,
        kpis: { totalMovReal, totalEsperado, meta, metaTotal, totalValorMeta, comMov, semMov, crescendo, empresas: listaProcessada.length },
        porProduto: Object.entries(porProduto).map(([nome,v]) => ({nome,...v})).sort((a,b) => b.movReal - a.movReal),
        ranking,
      });
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
    setLoading(false);
  }

  function buildEmpty() {
    return { consultor:null, consultoresDaVisao:[], mesesDisp:[], lista:[], kpis:{}, porProduto:[], ranking:[] };
  }

  const consultsFiltrados = gestorFiltro === 'Geral' ? consultores : consultores.filter(c=>c.gestor===gestorFiltro);

  const listaFiltrada = useMemo(() => {
    if (!dados) return [];
    let arr = [...dados.lista];
    if (busca.trim()) { const b=norm(busca); arr=arr.filter(e=>norm(e.nome).includes(b)||String(e.produto_id).includes(b)); }
    if (filtroProduto)  arr = arr.filter(e => e.produto_contratado === filtroProduto);
    if (filtroStatus)   arr = arr.filter(e => e.situacao === filtroStatus);
    // ✅ NOVO: filtro por equipe
    if (filtroEquipe)   arr = arr.filter(e => e._equipe === filtroEquipe);
    return arr.sort((a,b) => b.mediaMovMes - a.mediaMovMes);
  }, [dados, busca, filtroProduto, filtroStatus, filtroEquipe]);

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} select option{background:#fff;color:#1a1d2e;}`}</style>

      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Dashboard do Vendedor</h1>
          <p style={s.sub}>Resultado individual — movimentação real vs esperada</p>
        </div>
      </div>

      <div style={s.filtrosCard}>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>GESTOR</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {gestores.map(g => (
              <button key={g} style={{...s.gestorBtn,...(gestorFiltro===g?s.gestorBtnAtivo:{})}}
                onClick={() => { setGestorFiltro(g); setConsultorId(''); setFiltroEquipeTopo(''); }}>
                {g==='Geral' ? '🌐 Geral' : `👔 ${g.split(' ')[0]}`}
              </button>
            ))}
          </div>
        </div>
        {/* ✅ NOVO: Filtro por Equipe */}
        {(() => {
          const equipes = [...new Set(consultsFiltrados.map(c=>c.equipe).filter(Boolean))].sort();
          if (equipes.length < 2) return null;
          return (
            <div style={s.filtroGrupo}>
              <label style={s.filtroLabel}>EQUIPE</label>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button style={{...s.gestorBtn,...(filtroEquipeTopo===''?s.gestorBtnAtivo:{})}}
                  onClick={() => { setFiltroEquipeTopo(''); setConsultorId(''); }}>
                  🌐 Todas
                </button>
                {equipes.map(eq => (
                  <button key={eq} style={{...s.gestorBtn,...(filtroEquipeTopo===eq?s.gestorBtnAtivo:{})}}
                    onClick={() => { setFiltroEquipeTopo(eq); setConsultorId(''); }}>
                    👥 {eq}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>VENDEDOR</label>
          <select style={s.select} value={consultorId} onChange={e => setConsultorId(e.target.value)}>
            <option value="">— Ver equipe consolidada —</option>
            {consultsFiltrados.filter(c => !filtroEquipeTopo || c.equipe === filtroEquipeTopo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>MÊS {mesesSelecionados.size > 0 && <span style={{color:'#f0b429',marginLeft:4}}>({mesesSelecionados.size} sel.)</span>}</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {/* Todos = limpa seleção múltipla E seleção única */}
            <button style={{...s.gestorBtn,...(mesSelecionado===''&&mesesSelecionados.size===0?s.gestorBtnAtivo:{})}}
              onClick={() => { setMesSelecionado(''); setMesesSelecionados(new Set()); }}>
              🌐 Todos
            </button>
            {meses.map(m => {
              const selMulti  = mesesSelecionados.has(m);
              const selUnico  = mesSelecionado === m && mesesSelecionados.size === 0;
              const ativo     = selMulti || selUnico;
              return (
                <button key={m}
                  style={{...s.gestorBtn,...(ativo?s.gestorBtnAtivo:{})}}
                  onClick={() => {
                    // Ctrl/Cmd click ou toggle: adiciona/remove da seleção múltipla
                    setMesSelecionado(''); // limpa seleção única
                    setMesesSelecionados(prev => {
                      const next = new Set(prev);
                      if (next.has(m)) {
                        next.delete(m);
                      } else {
                        next.add(m);
                      }
                      return next;
                    });
                  }}>
                  📅 {fmtMes(m+'-01')}
                </button>
              );
            })}
          </div>
          {mesesSelecionados.size > 0 && (
            <div style={{fontSize:'0.68rem',color:'#b45309',marginTop:4}}>
              💡 Clique nos meses para selecionar/deselecionar múltiplos
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={s.vazio}>
          <div style={{width:40,height:40,border:'3px solid #e4e7ef',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite'}}></div>
          <div style={{color:'#8b92b0'}}>Carregando dados...</div>
        </div>
      )}

      {dados && !loading && (() => {
        const { kpis, lista, mesesDisp, porProduto, ranking, consultor, consultoresDaVisao, empresasNaMeta, vmetasRows, metaPorMes } = dados;
        const apurado    = kpis.totalValorMeta || 0;
        const pctApurado = kpis.metaTotal > 0 ? (apurado / kpis.metaTotal) * 100 : 0;
        const corPct = (p) => p >= 80 ? '#34d399' : p >= 60 ? '#f0b429' : '#f87171';
        const corApurado = corPct(pctApurado);
        const badgeApurado = pctApurado >= 80 ? '✅ Meta atingida' : pctApurado >= 60 ? '⚡ Quase lá' : '⚠️ Abaixo da meta';

        // ✅ Equipes disponíveis para filtro na carteira
        const equipesDisponiveis = [...new Set(lista.map(e=>e._equipe||'—').filter(v=>v!=='—'))].sort();

        return (
          <>
            <div style={{marginBottom:20,display:'flex',alignItems:'center',gap:16}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(240,180,41,0.15)',border:'2px solid rgba(240,180,41,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',fontWeight:700,color:'#f0b429'}}>
                {consultorId ? consultor?.nome?.[0] : gestorFiltro==='Geral' ? '🌐' : '👔'}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:'1.2rem'}}>
                  {consultorId ? consultor?.nome : gestorFiltro==='Geral' ? 'Visão Geral — Todas as Equipes' : `Equipe ${gestorFiltro}`}
                </div>
                <div style={{color:'#8b92b0',fontSize:'0.8rem'}}>
                  {consultorId
                    ? `${consultor?.equipe||consultor?.setor||'—'} · ${consultor?.gestor||'—'}`
                    : `${consultoresDaVisao.length} consultores · ${lista.length} empresas`}
                </div>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginBottom:16}}>
              <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Contratos Novos</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'#1a1d2e'}}>{kpis.empresas}</div>
                <div style={{color:'#34d399',fontSize:'0.68rem',marginTop:4}}>{kpis.comMov} movimentando</div>
                <div style={{color:'#f87171',fontSize:'0.68rem'}}>{kpis.empresas - kpis.comMov} sem movimentação</div>
              </div>
              <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Total Valor Esperado</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'#a78bfa'}}>{fmt(lista.reduce((s,e)=>s+e.esperadoMes,0))}</div>
                <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>potencial × peso/mês</div>
              </div>
              <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>{mesSelecionado ? 'Movimentação do mês' : 'Última Movimentação'}</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'#f0b429'}}>
                  {(() => {
                    if (mesSelecionado) return fmt(kpis.totalMovReal);
                    const ultimoMes2026 = [...mesesDisp].filter(m=>m>='2026-01').pop();
                    if (!ultimoMes2026) return fmt(kpis.totalMovReal);
                    return fmt(lista.reduce((s,e)=>s+(e.movPorMes[ultimoMes2026]||0),0));
                  })()}
                </div>
                {!mesSelecionado && (() => {
                  const ultimoMes2026 = [...mesesDisp].filter(m=>m>='2026-01').pop();
                  return <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>{ultimoMes2026 ? fmtMes(ultimoMes2026+'-01') : ''} · total: {fmt(kpis.totalMovReal)}</div>;
                })()}
                {mesSelecionado && <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>{fmtMes(mesSelecionado+'-01')}</div>}
              </div>
              <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Valor Apurado Meta</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'#34d399'}}>{fmt(apurado)}</div>
                <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>1ª rec. × peso / 3º mês convênio</div>
              </div>
              <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Meta Total Vendedor</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'#1a1d2e'}}>{kpis.metaTotal>0?fmt(kpis.metaTotal):'—'}</div>
                <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>{fmt(kpis.meta||0)}/mês</div>
              </div>
              <div style={{background:'#ffffff',border:`1px solid ${kpis.metaTotal>0?corApurado+'44':'#e4e7ef'}`,borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>% Meta Atingida</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:kpis.metaTotal>0?corApurado:'#8b92b0'}}>{kpis.metaTotal>0?fmtPct(pctApurado):'—'}</div>
                <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>apurado / meta</div>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 20px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                {(() => {
                  const esperMes = lista.reduce((s,e)=>s+e.esperadoMes,0);
                  const ultimoMes2026b = [...mesesDisp].filter(m=>m>='2026-01').pop();
                  const mediaMes = mesSelecionado ? kpis.totalMovReal : (ultimoMes2026b ? lista.reduce((s,e)=>s+(e.movPorMes[ultimoMes2026b]||0),0) : kpis.totalMovReal);
                  const pctMov = esperMes > 0 ? (mediaMes / esperMes) * 100 : 0;
                  const corMov = corPct(pctMov);
                  return (
                    <>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                        <span style={{fontWeight:600,fontSize:'0.82rem',color:'#4a5068'}}>📊 {mesSelecionado?'Mov. Real vs Esperada':'Última Mov. vs Esperada'}</span>
                        <span style={{fontSize:'0.72rem',color:corMov,fontWeight:700}}>{fmtPct(pctMov)}</span>
                      </div>
                      <div style={{background:'#f0f2f8',borderRadius:8,height:12,overflow:'hidden',marginBottom:6}}>
                        <div style={{height:'100%',borderRadius:8,transition:'width 0.8s',width:`${Math.min(pctMov,100)}%`,background:`linear-gradient(90deg,${corMov},${corMov}aa)`}}></div>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.68rem',color:'#8b92b0'}}>
                        <span style={{color:corMov,fontWeight:600}}>{fmt(mediaMes)}</span>
                        <span>esperado: {fmt(esperMes)}/mês</span>
                      </div>
                      {!mesSelecionado && <div style={{color:'#8b92b0',fontSize:'0.65rem',marginTop:4}}>total acumulado: {fmt(kpis.totalMovReal)} em {mesesDisp.length} meses</div>}
                    </>
                  );
                })()}
              </div>
              {kpis.metaTotal > 0 ? (
                <div style={{background:'#ffffff',border:`1px solid ${corApurado}33`,borderRadius:12,padding:'16px 20px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <span style={{fontWeight:600,fontSize:'0.82rem',color:'#4a5068'}}>🎯 Apurado na Meta vs Meta</span>
                    <span style={{background:`${corApurado}15`,color:corApurado,border:`1px solid ${corApurado}30`,borderRadius:6,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700}}>{badgeApurado}</span>
                  </div>
                  <div style={{background:'#f0f2f8',borderRadius:8,height:12,overflow:'hidden',marginBottom:6}}>
                    <div style={{height:'100%',borderRadius:8,transition:'width 0.8s',width:`${Math.min(pctApurado,100)}%`,background:`linear-gradient(90deg,${corApurado},${corApurado}cc)`}}></div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.68rem',color:'#8b92b0'}}>
                    <span style={{color:corApurado,fontWeight:700}}>{fmt(apurado)} apurado · {fmtPct(pctApurado)}</span>
                    <span>meta: {fmt(kpis.metaTotal)}/mês</span>
                  </div>
                  <div style={{marginTop:6,fontSize:'0.65rem',color:'#8b92b0'}}>Vegas Benefícios: 1ª recarga × peso · Convênio/Mobilidade: 3º mês</div>
                </div>
              ) : (
                <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'center',color:'#8b92b0',fontSize:'0.82rem',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                  🎯 Meta não cadastrada para este vendedor
                </div>
              )}
            </div>

            <div style={s.tabs}>
              {ABAS.map(a => (
                <button key={a.key} style={{...s.tab,...(aba===a.key?s.tabAtiva:{})}} onClick={() => setAba(a.key)}>{a.label}</button>
              ))}
            </div>

            {aba === 'resumo' && (
              <div style={s.card}>
                <div style={s.cardTitle}>📊 Movimentação por Mês</div>
                {mesesDisp.length === 0 ? (
                  <div style={s.semDados}>Nenhuma liberação importada ainda.</div>
                ) : (
                  <div style={{display:'flex',gap:14,marginTop:20,flexWrap:'wrap'}}>
                    {mesesDisp.map(m => {
                      const totalMes    = lista.reduce((s,e) => s+(e.movPorMes[m]||0), 0);
                      const listaAteMes = lista.filter(e => !e.data_cadastro || e.data_cadastro.substring(0,7) <= m);
                      const esperMes    = listaAteMes.reduce((s,e) => s+e.esperadoMes, 0);
                      const pctMes      = esperMes > 0 ? (totalMes / esperMes) * 100 : 0;
                      const corMes      = corPct(pctMes);
                      const empresasMes = lista.filter(e => (e.movPorMes[m]||0) > 0).length;
                      const novosMes    = lista.filter(e => e.data_cadastro?.substring(0,7) === m).length;
                      const metaMes     = mesSelecionado === m ? (kpis.totalValorMeta || 0) : (metaPorMes?.[m] || 0);
                      return (
                        <div key={m} style={{background:'#f9fafb',border:'1px solid #e4e7ef',borderRadius:14,padding:'18px 22px',flex:'1 1 190px',minWidth:190}}>
                          <div style={{display:'inline-block',background:'rgba(240,180,41,0.12)',border:'1px solid rgba(240,180,41,0.3)',color:'#b45309',borderRadius:8,padding:'4px 12px',fontSize:'0.82rem',fontWeight:700,marginBottom:10}}>{fmtMes(m+'-01')}</div>
                          {metaMes > 0 ? (
                            <>
                              <div style={{fontSize:'0.65rem',color:'#16a34a',textTransform:'uppercase',letterSpacing:1,marginBottom:2,fontWeight:700}}>🎯 Meta Considerada</div>
                              <div style={{fontSize:'1.4rem',fontWeight:800,color:'#16a34a',marginBottom:2}}>{fmt(metaMes)}</div>
                            </>
                          ) : (
                            <>
                              <div style={{fontSize:'1.4rem',fontWeight:700,color:'#f0b429',marginBottom:2}}>{fmt(totalMes)}</div>
                              <div style={{color:'#8b92b0',fontSize:'0.72rem',marginBottom:4}}>{empresasMes} movimentando</div>
                            </>
                          )}
                          {metaMes > 0 ? (() => {
                            const metaDoMes = kpis.meta > 0 ? kpis.meta / (mesesDisp.filter(m2=>m2>='2026-01').length||1) : 0;
                            const pctMeta = metaDoMes > 0 ? (metaMes / metaDoMes) * 100 : 0;
                            const corMeta = corPct(pctMeta);
                            return (
                              <>
                                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',marginBottom:3}}>
                                  <span style={{color:'#6b7280'}}>meta apurada vs meta/mês</span>
                                  <span style={{color:corMeta,fontWeight:700}}>{fmtPct(pctMeta)}</span>
                                </div>
                                <div style={{background:'#e4e7ef',borderRadius:4,height:5,overflow:'hidden',marginBottom:4}}>
                                  <div style={{height:'100%',width:`${Math.min(pctMeta,100)}%`,background:corMeta,borderRadius:4}}></div>
                                </div>
                              </>
                            );
                          })() : (
                            <>
                              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',marginBottom:3}}>
                                <span style={{color:'#8b92b0'}}>vs esperado</span>
                                <span style={{color:corMes,fontWeight:700}}>{fmtPct(pctMes)}</span>
                              </div>
                              <div style={{background:'#e4e7ef',borderRadius:4,height:5,overflow:'hidden',marginBottom:4}}>
                                <div style={{height:'100%',width:`${Math.min(pctMes,100)}%`,background:corMes,borderRadius:4}}></div>
                              </div>
                            </>
                          )}
                          <div style={{borderTop:'1px solid #e4e7ef',paddingTop:7,display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
                            {metaMes > 0 && <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem'}}><span style={{color:'#6b7280'}}>📈 Movimentado</span><span style={{color:'#f0b429',fontWeight:600}}>{fmt(totalMes)} · {empresasMes} emp.</span></div>}
                            {novosMes > 0 && <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem'}}><span style={{color:'#6b7280'}}>📋 Contratos novos</span><span style={{color:'#60a5fa',fontWeight:700}}>{novosMes}</span></div>}
                            {novosMes > 0 && (() => {
                              const fechadoNovo = lista.filter(e=>e.data_cadastro?.substring(0,7)===m).reduce((s,e)=>s+e.esperadoMes,0);
                              if (fechadoNovo <= 0) return null;
                              return <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',background:'rgba(96,165,250,0.06)',borderRadius:5,padding:'3px 6px',margin:'0 -6px'}}><span style={{color:'#2563eb',fontWeight:600}}>💰 Fechado Novo</span><span style={{color:'#2563eb',fontWeight:700}}>{fmt(fechadoNovo)}</span></div>;
                            })()}
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem'}}><span style={{color:'#6b7280'}}>📊 Esperado</span><span style={{color:'#8b92b0'}}>{fmt(esperMes)}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {aba === 'resumo' && empresasNaMeta && empresasNaMeta.length > 0 && (
              <div style={{...s.card,marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                    <div style={s.cardTitle}>🎯 Empresas na Meta</div>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>Por pág:</span>
                      {[15,50,100].map(n=>(
                        <button key={n} onClick={()=>{setMetaPorPag(n);setMetaPagina(1);}}
                          style={{background:metaPorPag===n?'#f0b429':'#f5f6fa',color:metaPorPag===n?'#000':'#4a5068',border:'1px solid #e4e7ef',borderRadius:5,padding:'2px 8px',fontSize:'0.72rem',cursor:'pointer',fontFamily:'inherit',fontWeight:metaPorPag===n?700:400}}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                    <select value={filtroMetaMesLocal||''} onChange={ev=>{setFiltroMetaMesLocal(ev.target.value);setMetaPagina(1);}} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'5px 10px',fontSize:'0.78rem',color:'#4a5068',fontFamily:'inherit',cursor:'pointer'}}>
                      <option value="">Todos os meses</option>
                      {[...new Set((vmetasRows||[]).filter(v=>empresasNaMeta.some(e=>e.id===v.empresa_id)).map(v=>v.competencia_meta?.substring(0,7)).filter(Boolean))].sort().map(m=>(<option key={m} value={m}>{fmtMes(m+'-01')}</option>))}
                    </select>
                    <select value={filtroMetaProduto||''} onChange={ev=>{setFiltroMetaProduto(ev.target.value);setMetaPagina(1);}} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'5px 10px',fontSize:'0.78rem',color:'#4a5068',fontFamily:'inherit',cursor:'pointer'}}>
                      <option value="">Todos os produtos</option>
                      {[...new Set(empresasNaMeta.map(e=>e.produto_contratado).filter(Boolean))].sort().map(p=>(<option key={p} value={p}>{p}</option>))}
                    </select>
                    <select value={filtroMetaCadastro||''} onChange={ev=>{setFiltroMetaCadastro(ev.target.value);setMetaPagina(1);}} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'5px 10px',fontSize:'0.78rem',color:'#4a5068',fontFamily:'inherit',cursor:'pointer'}}>
                      <option value="">Todos os cadastros</option>
                      {[...new Set(empresasNaMeta.map(e=>e.data_cadastro?.substring(0,7)).filter(Boolean))].sort().reverse().map(m=>(<option key={m} value={m}>{fmtMes(m+'-01')}</option>))}
                    </select>
                    <span style={{color:'#34d399',fontWeight:700,fontSize:'0.82rem'}}>
                      {empresasNaMeta.filter(e => !filtroMetaMesLocal || e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal)).length} empresas · {fmt(empresasNaMeta.filter(e => !filtroMetaMesLocal || e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal)).flatMap(e => filtroMetaMesLocal ? e._metaEntradas.filter(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal) : e._metaEntradas).reduce((s,v)=>s+(v.valor_meta||0),0))} apurado
                    </span>
                  </div>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid #e4e7ef'}}>
                        {['Empresa','Data Cad.','Produto','Mês Meta','Regra','Valor Esperado/mês','Meta Considerada'].map(h=>(
                          <th key={h} style={{padding:'8px 12px',textAlign:h==='Valor Esperado/mês'||h==='Meta Considerada'?'right':'left',color:'#8b92b0',fontWeight:600,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(()=>{
                        const baseEmpresas = filtroMetaCadastro
                          ? lista.filter(e=>e.data_cadastro?.substring(0,7)===filtroMetaCadastro).filter(e=>!filtroMetaProduto||e.produto_contratado===filtroMetaProduto).map(e=>({...e,_metaEntradas:(vmetasRows||[]).filter(v=>v.empresa_id===e.id)}))
                          : empresasNaMeta.filter(e=>{
                              if(filtroMetaMesLocal&&!e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal)) return false;
                              if(filtroMetaProduto&&e.produto_contratado!==filtroMetaProduto) return false;
                              return true;
                            });
                        const totalPgsM = Math.ceil(baseEmpresas.length / metaPorPag);
                        const pgAtualM  = Math.min(metaPagina, totalPgsM || 1);
                        const baseSlice = baseEmpresas.slice((pgAtualM-1)*metaPorPag, pgAtualM*metaPorPag);
                        return baseSlice.flatMap((e,i) => {
                          const entradas = filtroMetaMesLocal ? e._metaEntradas.filter(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal) : e._metaEntradas;
                          if (entradas.length === 0) {
                            return [(<tr key={`${i}-noMeta`} style={{borderBottom:'1px solid #f0f2f8',background:i%2===0?'rgba(0,0,0,0.01)':'white',opacity:0.7}}>
                              <td style={{padding:'10px 12px',fontWeight:600}}><span style={{color:'#1a1d2e',fontWeight:600}}>{e.nome}</span><div style={{color:'#8b92b0',fontSize:'0.65rem'}}>ID {e.produto_id}</div></td>
                              <td style={{padding:'10px 12px',color:'#60a5fa',fontSize:'0.75rem'}}>{e.data_cadastro?fmtMes(e.data_cadastro.substring(0,7)+'-01'):'—'}</td>
                              <td style={{padding:'10px 12px',color:'#6b7280'}}>{e.produto_contratado||'—'}</td>
                              <td style={{padding:'10px 12px'}}><span style={{color:'#9ca3af',fontSize:'0.72rem'}}>sem meta</span></td>
                              <td style={{padding:'10px 12px',color:'#9ca3af',fontSize:'0.72rem'}}>—</td>
                              <td style={{padding:'10px 12px',textAlign:'right',color:'#4a5068'}}>{fmt(e.esperadoMes||0)}</td>
                              <td style={{padding:'10px 12px',textAlign:'right',color:'#9ca3af'}}>—</td>
                            </tr>)];
                          }
                          return entradas.map((entrada,j) => (
                            <tr key={`${i}-${j}`} style={{borderBottom:'1px solid #f0f2f8',background:i%2===0?'rgba(0,0,0,0.01)':'white'}}>
                              <td style={{padding:'10px 12px',fontWeight:600}}><span style={{fontWeight:600,color:'#1a1d2e'}}>{e.nome}</span><div style={{color:'#8b92b0',fontSize:'0.65rem'}}>ID {e.produto_id}</div></td>
                              <td style={{padding:'10px 12px',color:'#60a5fa',fontSize:'0.75rem',whiteSpace:'nowrap'}}>{e.data_cadastro?fmtMes(e.data_cadastro.substring(0,7)+'-01'):'—'}</td>
                              <td style={{padding:'10px 12px',color:'#6b7280'}}>{e.produto_contratado||'—'}</td>
                              <td style={{padding:'10px 12px'}}><span style={{background:entrada.regra==='upsell'?'rgba(251,191,36,0.1)':'rgba(52,211,153,0.1)',color:entrada.regra==='upsell'?'#d97706':'#16a34a',borderRadius:5,padding:'2px 8px',fontWeight:700,fontSize:'0.72rem'}}>{fmtMes((entrada.competencia_meta||'').substring(0,7)+'-01')}</span></td>
                              <td style={{padding:'10px 12px',color:'#6b7280',whiteSpace:'nowrap'}}>{entrada.regra==='upsell'?'📈 Upsell':entrada.regra==='beneficio'?'1ª recarga':entrada.regra==='convenio'?'3º mês':'Manual'}</td>
                              <td style={{padding:'10px 12px',textAlign:'right',color:'#4a5068'}}>{fmt(e.esperadoMes||0)}</td>
                              <td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:entrada.regra==='upsell'?'#d97706':'#34d399'}}>{fmt(entrada.valor_meta)}</td>
                            </tr>
                          ));
                        });
                      })()}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid #e4e7ef',background:'#f8f9fa'}}>
                        <td colSpan={5} style={{padding:'10px 12px',fontWeight:700,color:'#4a5068',fontSize:'0.8rem'}}>
                          {(()=>{
                            const base = filtroMetaCadastro ? lista.filter(e=>e.data_cadastro?.substring(0,7)===filtroMetaCadastro&&(!filtroMetaProduto||e.produto_contratado===filtroMetaProduto)) : empresasNaMeta.filter(e=>{if(filtroMetaMesLocal&&!e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal))return false;if(filtroMetaProduto&&e.produto_contratado!==filtroMetaProduto)return false;return true;});
                            const totalPgsM2=Math.ceil(base.length/metaPorPag);const pgAtualM2=Math.min(metaPagina,totalPgsM2||1);
                            return `TOTAL (${base.length} empresas) · pág. ${pgAtualM2}/${totalPgsM2||1}`;
                          })()}
                        </td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:'#4a5068',textAlign:'right',fontSize:'0.8rem'}}>
                          {(()=>{const base=filtroMetaCadastro?lista.filter(e=>e.data_cadastro?.substring(0,7)===filtroMetaCadastro&&(!filtroMetaProduto||e.produto_contratado===filtroMetaProduto)):empresasNaMeta.filter(e=>{if(filtroMetaMesLocal&&!e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal))return false;if(filtroMetaProduto&&e.produto_contratado!==filtroMetaProduto)return false;return true;});return fmt(base.reduce((s,e)=>s+(e.esperadoMes||0),0));})()}
                        </td>
                        <td style={{padding:'10px 12px',fontWeight:800,color:'#34d399',textAlign:'right'}}>
                          {(()=>{
                            const base=filtroMetaCadastro?lista.filter(e=>e.data_cadastro?.substring(0,7)===filtroMetaCadastro&&(!filtroMetaProduto||e.produto_contratado===filtroMetaProduto)):empresasNaMeta.filter(e=>{if(filtroMetaMesLocal&&!e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal))return false;if(filtroMetaProduto&&e.produto_contratado!==filtroMetaProduto)return false;return true;});
                            const total=base.reduce((s,e)=>{const entradasBanco=(vmetasRows||[]).filter(v=>v.empresa_id===e.id);const filtradas=filtroMetaMesLocal?entradasBanco.filter(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal):entradasBanco;if(filtradas.length>0)return s+filtradas.reduce((sv,v)=>sv+(v.valor_meta||0),0);const metaComp=e.metaComp?.substring(0,7);if(filtroMetaMesLocal&&metaComp!==filtroMetaMesLocal)return s;return s+(e.valorMeta||0);},0);
                            return fmt(total);
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {(()=>{
                  const base=filtroMetaCadastro?lista.filter(e=>e.data_cadastro?.substring(0,7)===filtroMetaCadastro&&(!filtroMetaProduto||e.produto_contratado===filtroMetaProduto)):empresasNaMeta.filter(e=>{if(filtroMetaMesLocal&&!e._metaEntradas.some(v=>v.competencia_meta?.substring(0,7)===filtroMetaMesLocal))return false;if(filtroMetaProduto&&e.produto_contratado!==filtroMetaProduto)return false;return true;});
                  const totalPgsM3=Math.ceil(base.length/metaPorPag);if(totalPgsM3<=1)return null;const pgAtualM3=Math.min(metaPagina,totalPgsM3);
                  return (
                    <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:6,marginTop:14,flexWrap:'wrap'}}>
                      <button onClick={()=>setMetaPagina(p=>Math.max(1,p-1))} disabled={pgAtualM3===1} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:6,padding:'4px 12px',cursor:pgAtualM3===1?'default':'pointer',color:pgAtualM3===1?'#ccc':'#4a5068',fontFamily:'inherit'}}>←</button>
                      {Array.from({length:Math.min(totalPgsM3,7)},(_,i)=>{const pg=totalPgsM3<=7?i+1:pgAtualM3<=4?i+1:pgAtualM3>=totalPgsM3-3?totalPgsM3-6+i:pgAtualM3-3+i;return(<button key={pg} onClick={()=>setMetaPagina(pg)} style={{background:pgAtualM3===pg?'#f0b429':'#f5f6fa',color:pgAtualM3===pg?'#000':'#4a5068',border:'1px solid #e4e7ef',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit',fontWeight:pgAtualM3===pg?700:400,fontSize:'0.82rem'}}>{pg}</button>);})}
                      <button onClick={()=>setMetaPagina(p=>Math.min(totalPgsM3,p+1))} disabled={pgAtualM3===totalPgsM3} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:6,padding:'4px 12px',cursor:pgAtualM3===totalPgsM3?'default':'pointer',color:pgAtualM3===totalPgsM3?'#ccc':'#4a5068',fontFamily:'inherit'}}>→</button>
                      <span style={{color:'#8b92b0',fontSize:'0.72rem',marginLeft:4}}>Pág. {pgAtualM3} de {totalPgsM3} · {base.length} empresas</span>
                    </div>
                  );
                })()}
              </div>
            )}

            {aba === 'categorias' && (() => {
              try {
                if (!lista || lista.length === 0) return <div style={{...s.card,textAlign:'center',padding:48,color:'#8b92b0'}}>Nenhuma empresa carregada.</div>;
                const qtdMeses2026 = (mesesDisp||[]).filter(m=>m>='2026-01').length || 1;
                const catMap = {};
                for (const e of lista) {
                  const cat = String(e.categoria||'Outros').trim()||'Outros';
                  if (!catMap[cat]) catMap[cat] = { nome:cat, empresas:0, movTotal:0, esperadoMes:0, esperadoAcum:0, naMeta:0, valorMeta:0, semMov:0 };
                  catMap[cat].empresas++;
                  const movE = (mesesDisp||[]).reduce((s,m)=>s+((e.movPorMes||{})[m]||0),0);
                  catMap[cat].movTotal    += movE;
                  catMap[cat].esperadoMes += (e.esperadoMes||0);
                  catMap[cat].esperadoAcum += (e.esperadoMes||0) * (mesesDisp||[]).length;
                  if ((e.valorMeta||0) > 0) { catMap[cat].naMeta++; catMap[cat].valorMeta += (e.valorMeta||0); }
                  if (movE === 0) catMap[cat].semMov++;
                }
                const cats = Object.values(catMap).sort((a,b)=>b.movTotal-a.movTotal);
                if (cats.length === 0) return <div style={{...s.card,textAlign:'center',padding:48,color:'#8b92b0'}}>Sem categorias.</div>;
                const PALETA = ['#f0b429','#34d399','#60a5fa','#a78bfa','#fb923c','#f472b6','#4ade80','#38bdf8'];
                const COR_CATEGORIA = {};
                [...cats].sort((a,b)=>b.esperadoMes-a.esperadoMes).forEach((cat,i)=>{ COR_CATEGORIA[cat.nome]=PALETA[i%PALETA.length]; });
                function pizzaPath(inicio,fim,r=80,ri=40){
                  if(fim-inicio>=359.9) return `M ${100+r} 100 A ${r} ${r} 0 1 1 ${100+r-0.001} 100 Z`;
                  const xy=(d,rv)=>({x:100+rv*Math.cos(d*Math.PI/180),y:100+rv*Math.sin(d*Math.PI/180)});
                  const s1=xy(inicio,r),e1=xy(fim,r),s2=xy(fim,ri),e2=xy(inicio,ri),lg=fim-inicio>180?1:0;
                  return `M ${s1.x} ${s1.y} A ${r} ${r} 0 ${lg} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${ri} ${ri} 0 ${lg} 0 ${e2.x} ${e2.y} Z`;
                }
                return (
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
                      <div style={{...s.card,padding:'14px 18px'}}><div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Categorias Ativas</div><div style={{fontSize:'1.4rem',fontWeight:700}}>{cats.length}</div></div>
                      <div style={{...s.card,padding:'14px 18px'}}><div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Esperado Mensal</div><div style={{fontSize:'1.3rem',fontWeight:700,color:'#a78bfa'}}>{fmt(cats.reduce((s,c)=>s+c.esperadoMes,0))}</div></div>
                    </div>
                    <div style={s.card}>
                      <div style={{fontWeight:700,fontSize:'0.9rem',color:'#4a5068',marginBottom:14}}>📋 Detalhamento por Categoria</div>
                      <div style={{overflowX:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                          <thead><tr style={{borderBottom:'2px solid #e4e7ef'}}>{['Categoria','Empresas','Sem Mov.','Movimentação Total Anual','Média/mês','Esperado/mês','% Realizado'].map(h=>(<th key={h} style={{padding:'8px 12px',color:'#8b92b0',fontWeight:600,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap'}}>{h}</th>))}</tr></thead>
                          <tbody>
                            {cats.map((cat,i)=>{
                              const pctReal=cat.esperadoAcum>0?(cat.movTotal/cat.esperadoAcum)*100:0;const cor=corPct(pctReal);
                              return(<tr key={cat.nome} style={{borderBottom:'1px solid #f0f2f8',background:i%2===0?'rgba(0,0,0,0.01)':'white'}}>
                                <td style={{padding:'10px 12px',fontWeight:600}}>{cat.nome}</td>
                                <td style={{padding:'10px 12px',textAlign:'center'}}>{cat.empresas}</td>
                                <td style={{padding:'10px 12px',textAlign:'center',color:cat.semMov>0?'#f87171':'#8b92b0'}}>{cat.semMov}</td>
                                <td style={{padding:'10px 12px',fontWeight:700,color:'#f0b429'}}>{fmt(cat.movTotal)}</td>
                                <td style={{padding:'10px 12px',color:'#60a5fa',fontWeight:600}}>{fmt(Math.round(cat.movTotal/qtdMeses2026))}</td>
                                <td style={{padding:'10px 12px',color:'#a78bfa'}}>{fmt(cat.esperadoMes)}</td>
                                <td style={{padding:'10px 12px'}}><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{background:'#f0f2f8',borderRadius:3,height:6,width:50,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(pctReal,100)}%`,background:cor}}/></div><span style={{color:cor,fontWeight:700,fontSize:'0.75rem'}}>{fmtPct(pctReal)}</span></div></td>
                              </tr>);
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{borderTop:'2px solid #e4e7ef',background:'#f0f2f8'}}>
                              <td style={{padding:'10px 12px',fontWeight:700,color:'#4a5068',fontSize:'0.78rem'}}>TOTAL</td>
                              <td style={{padding:'10px 12px',textAlign:'center',fontWeight:700,color:'#4a5068'}}>{cats.reduce((s,c)=>s+c.empresas,0)}</td>
                              <td style={{padding:'10px 12px',textAlign:'center',fontWeight:700,color:'#f87171'}}>{cats.reduce((s,c)=>s+c.semMov,0)}</td>
                              <td style={{padding:'10px 12px',fontWeight:800,color:'#f0b429'}}>{fmt(cats.reduce((s,c)=>s+c.movTotal,0))}</td>
                              <td style={{padding:'10px 12px',fontWeight:700,color:'#60a5fa'}}>{fmt(Math.round(cats.reduce((s,c)=>s+c.movTotal,0)/qtdMeses2026))}</td>
                              <td style={{padding:'10px 12px',fontWeight:700,color:'#a78bfa'}}>{fmt(cats.reduce((s,c)=>s+c.esperadoMes,0))}</td>
                              <td style={{padding:'10px 12px'}}>
                                {(()=>{const totMov=cats.reduce((s,c)=>s+c.movTotal,0);const totEsp=cats.reduce((s,c)=>s+c.esperadoAcum,0);const pctT=totEsp>0?(totMov/totEsp)*100:0;const corT=corPct(pctT);return <span style={{color:corT,fontWeight:700,fontSize:'0.78rem'}}>{fmtPct(pctT)}</span>;})()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                      {(()=>{
                        const totalEsp=cats.reduce((s,c)=>s+c.esperadoMes,0);if(totalEsp===0)return null;
                        let angulo=-90;
                        const fatias=[...cats].sort((a,b)=>b.esperadoMes-a.esperadoMes).map((cat,i)=>{const pct=cat.esperadoMes/totalEsp;const graus=pct*360;const inicio=angulo;angulo+=graus;return{...cat,pct,graus,inicio,cor:COR_CATEGORIA[cat.nome]||PALETA[i%PALETA.length]};});
                        return(<div style={{...s.card,padding:'20px 24px'}}><div style={{fontWeight:700,fontSize:'0.88rem',color:'#4a5068',marginBottom:16}}>📊 Distribuição — Esperado/mês</div><div style={{display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}><svg viewBox="0 0 200 200" style={{width:160,height:160,flexShrink:0}}>{fatias.map((f,i)=>(<path key={i} d={pizzaPath(f.inicio,f.inicio+f.graus)} fill={f.cor} stroke="white" strokeWidth="1.5"/>))}<circle cx="100" cy="100" r="36" fill="white"/><text x="100" y="96" textAnchor="middle" style={{fontSize:'8px',fill:'#8b92b0',fontFamily:'DM Sans,sans-serif'}}>Total</text><text x="100" y="110" textAnchor="middle" style={{fontSize:'7.5px',fill:'#1a1d2e',fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>{Number(totalEsp/1000).toFixed(0)}k</text></svg><div style={{display:'flex',flexDirection:'column',gap:8,flex:1}}>{fatias.map((f,i)=>(<div key={i} style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:'50%',background:f.cor,flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:'0.75rem',fontWeight:600,color:'#1a1d2e'}}>{f.nome}</div><div style={{fontSize:'0.68rem',color:'#8b92b0'}}>{fmt(f.esperadoMes)}</div></div><div style={{fontSize:'0.82rem',fontWeight:700,color:f.cor}}>{(f.pct*100).toFixed(1)}%</div></div>))}<div style={{borderTop:'1px solid #e4e7ef',paddingTop:6,display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'0.72rem',fontWeight:600,color:'#4a5068'}}>Total esperado/mês</span><span style={{fontSize:'0.82rem',fontWeight:800,color:'#a78bfa'}}>{fmt(totalEsp)}</span></div></div></div></div>);
                      })()}
                      {(()=>{
                        const totalMeta=cats.reduce((s,c)=>s+c.valorMeta,0);if(totalMeta===0)return null;
                        let angulo=-90;
                        const fatias=[...cats].filter(c=>c.valorMeta>0).sort((a,b)=>b.valorMeta-a.valorMeta).map((cat,i)=>{const pct=cat.valorMeta/totalMeta;const graus=pct*360;const inicio=angulo;angulo+=graus;return{...cat,pct,graus,inicio,cor:COR_CATEGORIA[cat.nome]||PALETA[i%PALETA.length]};});
                        if(fatias.length===0)return null;
                        return(<div style={{...s.card,padding:'20px 24px'}}><div style={{fontWeight:700,fontSize:'0.88rem',color:'#4a5068',marginBottom:16}}>🎯 Distribuição — Meta Apurada</div><div style={{display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}><svg viewBox="0 0 200 200" style={{width:160,height:160,flexShrink:0}}>{fatias.map((f,i)=>(<path key={i} d={pizzaPath(f.inicio,f.inicio+f.graus)} fill={f.cor} stroke="white" strokeWidth="1.5"/>))}<circle cx="100" cy="100" r="36" fill="white"/><text x="100" y="96" textAnchor="middle" style={{fontSize:'8px',fill:'#8b92b0',fontFamily:'DM Sans,sans-serif'}}>Apurado</text><text x="100" y="110" textAnchor="middle" style={{fontSize:'7.5px',fill:'#16a34a',fontWeight:700,fontFamily:'DM Sans,sans-serif'}}>{Number(totalMeta/1000).toFixed(0)}k</text></svg><div style={{display:'flex',flexDirection:'column',gap:8,flex:1}}>{fatias.map((f,i)=>(<div key={i} style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:'50%',background:f.cor,flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:'0.75rem',fontWeight:600,color:'#1a1d2e'}}>{f.nome}</div><div style={{fontSize:'0.68rem',color:'#8b92b0'}}>{fmt(f.valorMeta)} · {f.naMeta} emp.</div></div><div style={{fontSize:'0.82rem',fontWeight:700,color:f.cor}}>{(f.pct*100).toFixed(1)}%</div></div>))}<div style={{borderTop:'1px solid #e4e7ef',paddingTop:6,display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'0.72rem',fontWeight:600,color:'#4a5068'}}>Total apurado</span><span style={{fontSize:'0.82rem',fontWeight:800,color:'#16a34a'}}>{fmt(totalMeta)}</span></div></div></div></div>);
                      })()}
                    </div>
                  </div>
                );
              } catch(err) {
                return <div style={{...s.card,padding:32,color:'#f87171'}}>Erro: {String(err?.message||err)}</div>;
              }
            })()}

            {aba === 'equipes' && (() => {
              const equipeMap = {};
              for (const e of lista) {
                const equipe = e._cons?.equipe || e.gestor || 'Sem equipe';
                const gestor = e.gestor || '—';
                if (!equipeMap[equipe]) equipeMap[equipe] = { nome:equipe, gestor, vendedores:{}, empresas:0, movTotal:0, esperado:0, naMeta:0, valorMeta:0, semMov:0, fechadoBruto:0 };
                const eq = equipeMap[equipe];
                eq.empresas++;
                const movE = mesesDisp.reduce((s,m)=>s+(e.movPorMes?.[m]||0),0);
                eq.movTotal += movE; eq.esperado += (e.esperadoMes||0); eq.fechadoBruto += (e.potencial_movimentacao||0);
                if (movE===0) eq.semMov++;
                const temMeta = (e.valorMeta || 0) > 0;
                if (temMeta) { eq.naMeta++; eq.valorMeta += (e.valorMeta || 0); }
                const vNome = e.vendedor||'—';
                if (!eq.vendedores[vNome]) eq.vendedores[vNome] = { nome:vNome, empresas:0, movTotal:0, esperado:0, naMeta:0, valorMeta:0, semMov:0, fechadoBruto:0 };
                const vd = eq.vendedores[vNome];
                vd.empresas++; vd.movTotal+=movE; vd.esperado+=(e.esperadoMes||0); vd.fechadoBruto+=(e.potencial_movimentacao||0);
                if(movE===0) vd.semMov++;
                if(temMeta){vd.naMeta++;vd.valorMeta+=(e.valorMeta||0);}
              }
              const equipes = Object.values(equipeMap).sort((a,b)=>b.movTotal-a.movTotal);
              const qtdM = mesesDisp.filter(m=>m>='2026-01').length||1;
              return (
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {equipes.map(eq => {
                    const vendedores = Object.values(eq.vendedores).sort((a,b)=>b.movTotal-a.movTotal);
                    const pctMov = eq.esperado*mesesDisp.length>0?(eq.movTotal/(eq.esperado*mesesDisp.length))*100:0;
                    const cor = corPct(pctMov);
                    return (
                      <div key={eq.nome} style={{...s.card,padding:0,overflow:'hidden'}}>
                        <div style={{background:'linear-gradient(135deg,#1a1d2e,#252840)',padding:'16px 22px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:'1rem',color:'white'}}>👥 {eq.nome}</div>
                            <div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.72rem',marginTop:2}}>Gestor: {eq.gestor} · {eq.empresas} empresas</div>
                          </div>
                          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                            {[['Novas Emp.','#60a5fa',eq.empresas],['Fechado Bruto','#a78bfa',fmt(eq.fechadoBruto||0)],['Esperado/mês','#e8eaf0',fmt(eq.esperado)],['Mov. Acum.','#f0b429',fmt(eq.movTotal)],['Meta Apurada','#34d399',eq.valorMeta>0?fmt(eq.valorMeta):'—']].map(([lbl,cor,val])=>(
                              <div key={lbl} style={{textAlign:'right'}}><div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>{lbl}</div><div style={{color:cor,fontWeight:700,fontSize:'1rem'}}>{val}</div></div>
                            ))}
                          </div>
                        </div>
                        <div style={{padding:'8px 22px',background:'#f9fafb',borderBottom:'1px solid #e4e7ef',display:'flex',alignItems:'center',gap:12}}>
                          <div style={{flex:1,background:'#e4e7ef',borderRadius:4,height:8,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(pctMov,100)}%`,background:cor,borderRadius:4}}/></div>
                          <span style={{color:cor,fontWeight:700,fontSize:'0.78rem',minWidth:40}}>{fmtPct(pctMov)}</span>
                        </div>
                        <div style={{padding:'12px 22px'}}>
                          <div style={{color:'#8b92b0',fontSize:'0.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Ranking de Vendedores</div>
                          <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            {vendedores.map((vd,idx) => {
                              const pctVd=vd.esperado*mesesDisp.length>0?(vd.movTotal/(vd.esperado*mesesDisp.length))*100:0;
                              const corVd=corPct(pctVd);
                              const medalha=idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':`${idx+1}º`;
                              const consData=consultores.find(cc=>cc.nome===vd.nome);
                              const metaConsultor=consData?.meta_mensal||0;
                              // ✅ CORREÇÃO: % da meta vs meta ACUMULADA (meta_mensal × meses válidos)
                              const validaMesVd=(consData?.meta_inicio?String(consData.meta_inicio).substring(0,7):'2026-01');
                              const validaVd=validaMesVd>'2026-01'?validaMesVd:'2026-01';
                              const metaAcumVd=metaConsultor*(mesesDisp.filter(m=>m>=validaVd).length||1);
                              const pctMeta=metaAcumVd>0?(vd.valorMeta/metaAcumVd)*100:0;
                              const corMeta=corPct(pctMeta);
                              return (
                                <div key={vd.nome} style={{borderRadius:10,overflow:'hidden',border:`1px solid ${idx===0?'rgba(240,180,41,0.2)':'#e4e7ef'}`,background:idx===0?'rgba(255,248,230,0.6)':'#fafafa',marginBottom:4}}>
                                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',flexWrap:'wrap'}}>
                                    <span style={{fontSize:'1rem',minWidth:28,textAlign:'center'}}>{medalha}</span>
                                    <div style={{flex:1,minWidth:120}}>
                                      <div style={{fontWeight:700,fontSize:'0.85rem',color:'#1a1d2e'}}>{vd.nome}</div>
                                      <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:1}}>{vd.empresas} emp. · {vd.semMov} sem mov. · {vd.naMeta} na meta</div>
                                    </div>
                                    {[['Mov. Acum.','#f0b429',fmt(vd.movTotal),`média: ${fmt(Math.round(vd.movTotal/qtdM))}/mês`],['Fechado Bruto','#60a5fa',fmt(vd.fechadoBruto||0),`${vd.empresas} contratos`],['Esperado/mês','#a78bfa',fmt(vd.esperado),`${fmtPct(pctVd)} realizado`],['Meta Apurada','#34d399',vd.valorMeta>0?fmt(vd.valorMeta):'—',metaAcumVd>0?`${fmtPct(pctMeta)} da meta`:'']].map(([lbl,cor,val,sub])=>(
                                      <div key={lbl} style={{textAlign:'right',minWidth:90}}>
                                        <div style={{color:'#6b7280',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>{lbl}</div>
                                        <div style={{color:lbl==='Meta Apurada'?'#34d399':cor,fontWeight:700,fontSize:'0.88rem'}}>{val}</div>
                                        {sub&&<div style={{color:lbl==='Esperado/mês'?corVd:lbl==='Meta Apurada'?corMeta:'#8b92b0',fontSize:'0.62rem',fontWeight:600}}>{sub}</div>}
                                      </div>
                                    ))}
                                  </div>
                                  {metaConsultor > 0 && <div style={{height:3,background:'#f0f2f8'}}><div style={{height:'100%',width:`${Math.min(pctMeta,100)}%`,background:corMeta,transition:'width 0.6s'}}/></div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {aba === 'carteira' && (() => {
              const categoriasCart = [...new Set(lista.map(e=>e.categoria).filter(Boolean))].sort();
              const listaCart = listaFiltrada.filter(e => !filtroCategoria || e.categoria === filtroCategoria);
              const totalPags = Math.ceil(listaCart.length / carteiraPorPag);
              const pagAtual  = Math.min(carteiraPagina, totalPags || 1);
              const listaPage = listaCart.slice((pagAtual-1)*carteiraPorPag, pagAtual*carteiraPorPag);
              const mesesMostar = mesesVisiveis || new Set(mesesDisp);
              const mesesFiltrados = mesesDisp.filter(m => mesesMostar.has(m));
              const colV = (k) => colsVisiveis.has(k);
              const toggleCol = (k) => setColsVisiveis(prev => { const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n; });
              const toggleMes = (m) => setMesesVisiveis(prev => { const base=prev||new Set(mesesDisp);const n=new Set(base);n.has(m)?n.delete(m):n.add(m);return n; });
              return (
                <div style={s.card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,flexWrap:'wrap',gap:8}}>
                    <div style={s.cardTitle}>📋 Carteira — {listaCart.length} empresas</div>
                    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                      <span style={{color:'#8b92b0',fontSize:'0.72rem'}}>Por página:</span>
                      {[12,50,100].map(n=>(<button key={n} onClick={()=>{setCarteiraPorPag(n);setCarteiraPagina(1);}} style={{background:carteiraPorPag===n?'#f0b429':'#f5f6fa',color:carteiraPorPag===n?'#000':'#4a5068',border:'1px solid #e4e7ef',borderRadius:6,padding:'3px 10px',fontSize:'0.75rem',cursor:'pointer',fontFamily:'inherit',fontWeight:carteiraPorPag===n?700:400}}>{n}</button>))}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
                    <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e=>setBusca(e.target.value)} />
                    <select style={s.sel} value={filtroCategoria} onChange={e=>{setFiltroCategoria(e.target.value);setCarteiraPagina(1);}}><option value="">Todas as categorias</option>{categoriasCart.map(c=><option key={c} value={c}>{c}</option>)}</select>
                    <select style={s.sel} value={filtroProduto} onChange={e=>setFiltroProduto(e.target.value)}><option value="">Todos os produtos</option>{[...new Set(lista.map(e=>e.produto_contratado).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}</select>
                    <select style={s.sel} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}><option value="">Todos os status</option><option value="acima do esperado">✅ Acima</option><option value="abaixo do esperado">⚠️ Abaixo</option><option value="sem movimentação">❌ Sem mov.</option></select>
                    {/* ✅ NOVO: Filtro por equipe */}
                    <select style={{...s.sel,borderColor:filtroEquipe?'rgba(96,165,250,0.5)':'#e4e7ef',color:filtroEquipe?'#2563eb':'#1a1d2e'}} value={filtroEquipe} onChange={e=>{setFiltroEquipe(e.target.value);setCarteiraPagina(1);}}>
                      <option value="">Todas as equipes</option>
                      {equipesDisponiveis.map(eq=><option key={eq} value={eq}>{eq}</option>)}
                    </select>
                  </div>
                  <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center',background:'#f9fafb',borderRadius:8,padding:'8px 12px',border:'1px solid #e4e7ef'}}>
                    <span style={{color:'#8b92b0',fontSize:'0.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginRight:4}}>Colunas:</span>
                    {[['empresa','Empresa'],['produto','Produto'],['esperado','Esperado'],['media','Média'],['meta','Meta'],['status','Status']].map(([k,l])=>(<button key={k} onClick={()=>toggleCol(k)} style={{background:colV(k)?'rgba(240,180,41,0.12)':'#f0f2f8',color:colV(k)?'#b45309':'#6b7280',border:`1px solid ${colV(k)?'rgba(240,180,41,0.3)':'#e4e7ef'}`,borderRadius:5,padding:'2px 8px',fontSize:'0.68rem',cursor:'pointer',fontFamily:'inherit',fontWeight:colV(k)?700:400}}>{l}</button>))}
                    <span style={{color:'#8b92b0',fontSize:'0.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginLeft:8,marginRight:4}}>Meses:</span>
                    {mesesDisp.map(m=>{const vis=!mesesVisiveis||mesesVisiveis.has(m);return(<button key={m} onClick={()=>toggleMes(m)} style={{background:vis?'rgba(96,165,250,0.1)':'#f0f2f8',color:vis?'#2563eb':'#6b7280',border:`1px solid ${vis?'rgba(96,165,250,0.3)':'#e4e7ef'}`,borderRadius:5,padding:'2px 8px',fontSize:'0.68rem',cursor:'pointer',fontFamily:'inherit',fontWeight:vis?700:400}}>{fmtMes(m+'-01')}</button>);})}
                    {mesesVisiveis && <button onClick={()=>setMesesVisiveis(null)} style={{background:'rgba(220,38,38,0.06)',color:'#dc2626',border:'1px solid rgba(220,38,38,0.15)',borderRadius:5,padding:'2px 8px',fontSize:'0.68rem',cursor:'pointer',fontFamily:'inherit'}}>Mostrar todos</button>}
                  </div>
                  <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #f0f2f8'}}>
                    <table style={s.table}>
                      <thead>
                        <tr style={{background:'#f9fafb'}}>
                          {colV('empresa')&&<th style={s.th}>Empresa</th>}
                          {colV('produto')&&<th style={s.th}>Produto</th>}
                          <th style={s.th}>Vendedor</th>
                          {colV('esperado')&&<th style={s.th}>Esperado/mês</th>}
                          {mesesFiltrados.map(m=><th key={m} style={{...s.th,textAlign:'right'}}>{fmtMes(m+'-01')}</th>)}
                          {colV('media')&&<th style={{...s.th,textAlign:'right'}}>Média</th>}
                          {colV('meta')&&<th style={{...s.th,textAlign:'right'}}>Meta</th>}
                          {colV('status')&&<th style={s.th}>Status</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {listaPage.map((e,i) => {
                          const corSit=e.situacao==='acima do esperado'?'#34d399':e.situacao==='dentro do esperado'?'#f0b429':e.situacao==='abaixo do esperado'?'#f87171':'#9ca3af';
                          return (
                            <tr key={e._key} style={{background:i%2===0?'#ffffff':'#fafafa',borderBottom:'1px solid #f0f2f8'}}>
                              {colV('empresa')&&<td style={s.td}><span>{e.nome}</span><div style={{color:'#8b92b0',fontSize:'0.65rem'}}>ID {e.produto_id}</div></td>}
                              {colV('produto')&&<td style={s.td}><span style={{fontSize:'0.78rem'}}>{e.produto_contratado||'—'}</span></td>}
                              <td style={s.td}><span style={{fontSize:'0.78rem'}}>{e.vendedor}</span></td>
                              {colV('esperado')&&<td style={{...s.td,color:'#a78bfa',fontWeight:600}}>{fmt(e.esperadoMes)}</td>}
                              {mesesFiltrados.map(m=>{const v=e.movPorMes[m]||0;const pctV=e.esperadoMes>0?(v/e.esperadoMes)*100:0;const c2=pctV>=90?'#34d399':pctV>=50?'#f0b429':v>0?'#f87171':'#9ca3af';return<td key={m} style={{...s.td,textAlign:'right',color:c2,fontWeight:v>0?600:400}}>{v>0?fmt(v):'—'}</td>;})}
                              {colV('media')&&<td style={{...s.td,textAlign:'right',color:'#f0b429',fontWeight:700}}>{e.mediaMovMes>0?fmt(e.mediaMovMes):'—'}</td>}
                              {colV('meta')&&<td style={{...s.td,textAlign:'right'}}>{e.valorMeta>0?(<div><div style={{color:'#34d399',fontWeight:700,fontSize:'0.82rem'}}>{fmt(e.valorMeta)}</div><div style={{color:'#8b92b0',fontSize:'0.65rem'}}>{e.metaRegra==='beneficio'?'1ª rec. × peso':e.metaRegra==='convenio'?'3º mês':'—'} · {fmtMes(e.metaComp)}</div></div>):<span style={{color:'#d1d5e8',fontSize:'0.75rem'}}>—</span>}</td>}
                              {colV('status')&&<td style={s.td}><span style={{background:`${corSit}18`,color:corSit,borderRadius:5,padding:'2px 8px',fontSize:'0.68rem',fontWeight:600,whiteSpace:'nowrap'}}>{e.situacao}</span></td>}
                            </tr>
                          );
                        })}
                        {listaPage.length===0&&<tr><td colSpan={20} style={{...s.td,textAlign:'center',color:'#8b92b0',padding:32}}>Nenhuma empresa encontrada</td></tr>}
                      </tbody>
                      {listaCart.length > 0 && (
                        <tfoot>
                          <tr style={{borderTop:'2px solid #1a1d2e',background:'#1a1d2e'}}>
                            {colV('empresa')&&<td style={{...s.td,fontWeight:700,color:'#ffffff',fontSize:'0.8rem',whiteSpace:'nowrap'}}>TOTAL ({listaCart.length} empresas)</td>}
                            {colV('produto')&&<td style={{...s.td,background:'#1a1d2e'}}/>}
                            <td style={{...s.td,background:'#1a1d2e'}}/>
                            {colV('esperado')&&<td style={{...s.td,fontWeight:700,color:'#c4b5fd',textAlign:'right'}}>{fmt(listaCart.reduce((s,e)=>s+(e.esperadoMes||0),0))}</td>}
                            {mesesFiltrados.map(m=>(<td key={m} style={{...s.td,textAlign:'right',fontWeight:700,color:'#fde68a'}}>{(()=>{const t=listaCart.reduce((s,e)=>s+(e.movPorMes?.[m]||0),0);return t>0?fmt(t):<span style={{color:'#4b5563'}}>—</span>;})()}</td>))}
                            {colV('media')&&<td style={{...s.td,textAlign:'right',fontWeight:700,color:'#fde68a'}}>{fmt(listaCart.reduce((s,e)=>s+(e.mediaMovMes||0),0))}</td>}
                            {colV('meta')&&<td style={{...s.td,textAlign:'right',fontWeight:800,color:'#6ee7b7'}}>{(()=>{const t=listaCart.reduce((s,e)=>s+(e.valorMeta||0),0);return t>0?fmt(t):<span style={{color:'#4b5563'}}>—</span>;})()}</td>}
                            {colV('status')&&<td style={{...s.td,background:'#1a1d2e'}}/>}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  {totalPags > 1 && (
                    <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:6,marginTop:16,flexWrap:'wrap'}}>
                      <button onClick={()=>setCarteiraPagina(p=>Math.max(1,p-1))} disabled={pagAtual===1} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:6,padding:'4px 12px',cursor:pagAtual===1?'default':'pointer',color:pagAtual===1?'#ccc':'#4a5068',fontFamily:'inherit'}}>←</button>
                      {Array.from({length:Math.min(totalPags,7)},(_,i)=>{const pg=totalPags<=7?i+1:pagAtual<=4?i+1:pagAtual>=totalPags-3?totalPags-6+i:pagAtual-3+i;return(<button key={pg} onClick={()=>setCarteiraPagina(pg)} style={{background:pagAtual===pg?'#f0b429':'#f5f6fa',color:pagAtual===pg?'#000':'#4a5068',border:'1px solid #e4e7ef',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit',fontWeight:pagAtual===pg?700:400,fontSize:'0.82rem'}}>{pg}</button>);})}
                      <button onClick={()=>setCarteiraPagina(p=>Math.min(totalPags,p+1))} disabled={pagAtual===totalPags} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:6,padding:'4px 12px',cursor:pagAtual===totalPags?'default':'pointer',color:pagAtual===totalPags?'#ccc':'#4a5068',fontFamily:'inherit'}}>→</button>
                      <span style={{color:'#8b92b0',fontSize:'0.72rem',marginLeft:4}}>Página {pagAtual} de {totalPags} · {listaCart.length} empresas</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {aba === 'produtos' && (
              <div style={s.card}>
                <div style={s.cardTitle}>🎯 Resultado por Produto</div>
                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:12}}>
                  {porProduto.map((p) => {
                    const pctAdere=p.esperado>0?(p.movReal/p.esperado)*100:0;
                    const cor=pctAdere>=90?'#34d399':pctAdere>=50?'#f0b429':'#f87171';
                    return (
                      <div key={p.nome} style={{background:'#f9fafb',borderRadius:12,padding:'16px 20px',border:'1px solid #e4e7ef'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                          <span style={{fontWeight:700}}>{p.nome}</span>
                          <span style={{color:'#8b92b0',fontSize:'0.78rem'}}>{p.contratos} empresa{p.contratos>1?'s':''}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12}}>
                          {[{label:'Mov. Esperada/mês',val:fmt(p.esperado),cor:'#a78bfa'},{label:'Mov. Real Média',val:p.movReal>0?fmt(p.movReal):'—',cor:'#f0b429'},{label:'% Aderência',val:fmtPct(pctAdere),cor}].map(k=>(<div key={k.label}><div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',marginBottom:4}}>{k.label}</div><div style={{fontWeight:700,color:k.cor}}>{k.val}</div></div>))}
                        </div>
                        <div style={{background:'#e4e7ef',borderRadius:4,height:6,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(pctAdere,100)}%`,background:cor,borderRadius:4}}></div></div>
                      </div>
                    );
                  })}
                  {porProduto.length===0&&<div style={s.semDados}>Nenhum produto encontrado</div>}
                </div>
              </div>
            )}

            {aba === 'ranking' && (
              <div style={s.card}>
                <div style={s.cardTitle}>🏆 Ranking — Vol. Meta Apurada por Vendedor</div>
                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:8}}>
                  {[...ranking].sort((a,b)=>b.valorMeta-a.valorMeta).map((c,i) => {
                    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`;
                    const corM=i===0?'#f0b429':i===1?'#9ca3af':i===2?'#cd7c2f':'#4b5563';
                    const isAtu=c.id===consultorId;
                    const maxMeta=Math.max(...ranking.map(x=>x.valorMeta),1);
                    const consData=consultores.find(cc=>cc.id===c.id);
                    const metaMensal=consData?.meta_mensal||0;
                    const validaMes=(consData?.meta_inicio?String(consData.meta_inicio).substring(0,7):'2026-01');
                    const mesesValidos=mesesDisp.filter(m=>m>='2026-01'&&m>=validaMes);
                    const metaAcum=metaMensal*(mesesValidos.length||1);
                    const pctMeta=metaAcum>0?(c.valorMeta/metaAcum)*100:0;
                    const corMeta=corPct(pctMeta);
                    const pctAdere=c.esperado>0?(c.movReal/c.esperado)*100:0;
                    const corAdere=corPct(pctAdere);
                    return (
                      <div key={c.id} style={{borderRadius:10,overflow:'hidden',border:`1px solid ${isAtu?'#f0b429':'#e4e7ef'}`,background:isAtu?'rgba(255,248,230,0.6)':'#fafafa'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,fontSize:'1rem',minWidth:28,textAlign:'center',color:corM}}>{medal}</span>
                          <div style={{flex:1,minWidth:120}}>
                            <div style={{fontWeight:700,fontSize:'0.88rem',color:isAtu?'#b45309':'#1a1d2e'}}>{c.nome}</div>
                            <div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:1}}>{c.empresas} emp. · {c.naMeta||0} na meta · gestor: {c.gestor}</div>
                          </div>
                          <div style={{display:'flex',gap:10,padding:'6px 12px',background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:8}}>
                            {metaMensal>0?(<>
                              <div style={{textAlign:'right',minWidth:80}}><div style={{color:'#6b7280',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Meta Mensal</div><div style={{color:'#1a1d2e',fontWeight:700,fontSize:'0.85rem'}}>{fmt(metaMensal)}</div><div style={{color:'#8b92b0',fontSize:'0.62rem'}}>/mês</div></div>
                              <div style={{textAlign:'right',minWidth:80}}><div style={{color:'#6b7280',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Meta Acum.</div><div style={{color:'#1a1d2e',fontWeight:700,fontSize:'0.85rem'}}>{fmt(metaAcum)}</div><div style={{color:'#8b92b0',fontSize:'0.62rem'}}>{mesesValidos.length} meses</div></div>
                            </>):<div style={{color:'#8b92b0',fontSize:'0.72rem',padding:'4px 8px'}}>Meta não cadastrada</div>}
                          </div>
                          <div style={{width:1,height:36,background:'#e4e7ef',flexShrink:0}}/>
                          <div style={{textAlign:'right',minWidth:85}}><div style={{color:'#6b7280',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Fechado Bruto</div><div style={{color:'#60a5fa',fontWeight:700,fontSize:'0.85rem'}}>{fmt(c.fechadoBruto||0)}</div><div style={{color:'#8b92b0',fontSize:'0.62rem'}}>{c.empresas} contratos</div></div>
                          <div style={{textAlign:'right',minWidth:85}}><div style={{color:'#6b7280',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Esperado/mês</div><div style={{color:'#a78bfa',fontWeight:700,fontSize:'0.85rem'}}>{fmt(c.esperado)}</div><div style={{color:corAdere,fontSize:'0.62rem',fontWeight:600}}>{fmtPct(pctAdere)} realiz.</div></div>
                          <div style={{textAlign:'right',minWidth:85}}><div style={{color:'#6b7280',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Meta Apurada</div><div style={{color:'#34d399',fontWeight:700,fontSize:'0.85rem'}}>{fmt(c.valorMeta)}</div>{metaAcum>0&&<div style={{color:corMeta,fontSize:'0.62rem',fontWeight:600}}>{fmtPct(pctMeta)} da meta</div>}</div>
                          {isAtu&&<span style={{background:'rgba(240,180,41,0.2)',color:'#f0b429',borderRadius:6,padding:'2px 8px',fontSize:'0.68rem',fontWeight:700}}>você</span>}
                        </div>
                        <div style={{height:3,background:'#f0f2f8'}}><div style={{height:'100%',width:`${Math.min(metaAcum>0?pctMeta:(c.valorMeta/maxMeta)*100,100)}%`,background:isAtu?'#f0b429':metaAcum>0?corMeta:i<3?'#34d399':'#d1d5e8',transition:'width 0.6s'}}/></div>
                      </div>
                    );
                  })}
                  {ranking.length===0&&<div style={s.semDados}>Nenhum dado disponível</div>}
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
  page:         {maxWidth:1300,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#1a1d2e',background:'#f5f6fa',minHeight:'100vh'},
  header:       {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24},
  tag:          {color:'#b45309',fontWeight:700,fontSize:'0.75rem',letterSpacing:2,marginBottom:8,textTransform:'uppercase'},
  title:        {fontSize:'1.6rem',fontWeight:700,margin:'0 0 6px',color:'#1a1d2e'},
  sub:          {color:'#8b92b0',fontSize:'0.875rem'},
  filtrosCard:  {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',gap:24,flexWrap:'wrap',alignItems:'flex-end',boxShadow:'0 1px 3px rgba(0,0,0,0.06)'},
  filtroGrupo:  {display:'flex',flexDirection:'column',gap:6},
  filtroLabel:  {color:'#8b92b0',fontSize:'0.65rem',letterSpacing:2,textTransform:'uppercase',fontWeight:600},
  gestorBtn:    {background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'7px 14px',color:'#4a5068',cursor:'pointer',fontSize:'0.82rem',fontWeight:500,fontFamily:'inherit'},
  gestorBtnAtivo:{background:'#fff8e6',border:'1px solid #f0b429',color:'#b45309',fontWeight:700},
  select:       {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 14px',color:'#1a1d2e',fontSize:'0.875rem',fontFamily:'inherit',cursor:'pointer',minWidth:220},
  busca:        {flex:'1 1 200px',background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 12px',color:'#1a1d2e',fontSize:'0.85rem',fontFamily:'inherit',outline:'none'},
  sel:          {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 12px',color:'#1a1d2e',fontSize:'0.85rem',fontFamily:'inherit',cursor:'pointer',outline:'none'},
  vazio:        {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'64px 32px',textAlign:'center'},
  tabs:         {display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'},
  tab:          {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:8,padding:'7px 16px',color:'#4a5068',cursor:'pointer',fontSize:'0.85rem',fontWeight:500,fontFamily:'inherit'},
  tabAtiva:     {background:'#fff8e6',border:'1px solid #f0b429',color:'#b45309',fontWeight:600},
  card:         {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'24px',marginBottom:16,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'},
  cardTitle:    {fontSize:'0.95rem',fontWeight:700,color:'#1a1d2e'},
  table:        {width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'},
  th:           {padding:'8px 12px',textAlign:'left',color:'#8b92b0',fontWeight:600,borderBottom:'1px solid #e4e7ef',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.67rem',letterSpacing:0.5,background:'#f9fafb'},
  td:           {padding:'10px 12px',whiteSpace:'nowrap',color:'#1a1d2e'},
  semDados:     {color:'#8b92b0',fontSize:'0.85rem',textAlign:'center',padding:'32px 0'},
};
