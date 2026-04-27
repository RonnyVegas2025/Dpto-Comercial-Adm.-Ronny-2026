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
  { key:'resumo',      label:'📊 Resumo'     },
  { key:'carteira',    label:'📋 Carteira'   },
  { key:'produtos',    label:'🎯 Produtos'   },
  { key:'ranking',     label:'🏆 Ranking'    },
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

export default function DashboardVendedor() {
  const [consultores,    setConsultores]    = useState([]);
  const [consultorId,    setConsultorId]    = useState('');
  const [gestorFiltro,   setGestorFiltro]   = useState('Geral');
  const [gestores,       setGestores]       = useState(['Geral']);
  const [dados,          setDados]          = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [aba,            setAba]            = useState('resumo');
  const [meses,          setMeses]          = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState('');
  const [busca,          setBusca]          = useState('');
  const [filtroProduto,  setFiltroProduto]  = useState('');
  const [filtroStatus,   setFiltroStatus]   = useState('');

  useEffect(() => { carregarBase(); }, []);
  useEffect(() => { if (consultores.length) carregarDados(); }, [consultorId, gestorFiltro, mesSelecionado, consultores]);

  async function carregarBase() {
    const [{ data: cons }, { data: libs }] = await Promise.all([
      supabase.from('consultores').select('id,nome,meta_mensal,setor,gestor,equipe').eq('ativo',true).order('nome'),
      supabase.from('liberacoes').select('competencia').order('competencia',{ascending:false}),
    ]);
    setConsultores(cons||[]);
    const gs = ['Geral',...new Set((cons||[]).map(c=>c.gestor).filter(Boolean))];
    setGestores(gs);
    const ms = [...new Set((libs||[]).map(l=>l.competencia?.substring(0,7)).filter(Boolean))].sort();
    setMeses(ms);
  }

  async function carregarDados() {
    setLoading(true); setDados(null);
    try {
      // Busca empresas com todos os campos necessários
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
        .not('categoria','eq','Taxa Negativa');

      if (consultorId) {
        empQuery = empQuery.or(`consultor_principal_id.eq.${consultorId},consultor_agregado_id.eq.${consultorId},consultor_agregado_2_id.eq.${consultorId}`);
      } else if (gestorFiltro !== 'Geral') {
        const ids = consultores.filter(c=>c.gestor===gestorFiltro).map(c=>c.id);
        if (!ids.length) { setLoading(false); setDados(buildEmpty()); return; }
        empQuery = empQuery.in('consultor_principal_id', ids);
      }

      const empresas = await fetchAll(empQuery);

      // Busca liberações e ajustes
      const empIds   = empresas.map(e=>e.id);
      const prodIds  = empresas.map(e=>e.produto_id);
      const mesInicio = mesSelecionado ? mesSelecionado+'-01' : '2000-01-01';
      const mesFim    = mesSelecionado ? mesSelecionado+'-28' : '2099-12-31';

      const [libs, ajustes] = await Promise.all([
        prodIds.length ? fetchAll(
          supabase.from('liberacoes').select('produto_id,competencia,total_liberado')
            .in('produto_id',prodIds).gte('competencia',mesInicio).lte('competencia',mesFim)
        ) : Promise.resolve([]),
        empIds.length ? fetchAll(
          supabase.from('ajustes_movimentacao').select('empresa_id,competencia,valor_considerado')
            .in('empresa_id',empIds)
        ) : Promise.resolve([]),
      ]);

      // Mapas de lookup
      const libMap   = {}; // produto_id__comp → valor
      for (const l of libs) {
        const k = `${l.produto_id}__${l.competencia?.substring(0,10)}`;
        libMap[k] = (libMap[k]||0) + l.total_liberado;
      }
      const ajusteMap = {}; // empresa_id__comp → valor_considerado
      for (const a of ajustes) {
        ajusteMap[`${a.empresa_id}__${a.competencia?.substring(0,10)}`] = a.valor_considerado;
      }

      // Meses disponíveis
      const mesesDisp = [...new Set(libs.map(l=>l.competencia?.substring(0,7)).filter(Boolean))].sort();

      // Consultor selecionado
      const consultor = consultorId ? consultores.find(c=>c.id===consultorId) : null;
      const consultoresDaVisao = consultorId ? [consultor].filter(Boolean)
        : gestorFiltro==='Geral' ? consultores
        : consultores.filter(c=>c.gestor===gestorFiltro);

      // ─── Processa cada empresa com divisão de resultado ───────────────
      const listaProcessada = [];

      for (const e of empresas) {
        const pctP  = e.pct_principal  ?? 100;
        const pctA1 = e.pct_agregado_1 ?? 0;
        const pctA2 = e.pct_agregado_2 ?? 0;

        // Define qual consultor estamos calculando para esta empresa
        const consultoresEmpresa = [
          e.consultor_principal ? { cons: e.consultor_principal, pct: pctP  } : null,
          e.consultor_agregado  && pctA1>0 ? { cons: e.consultor_agregado,   pct: pctA1 } : null,
          e.consultor_agregado_2 && pctA2>0 ? { cons: e.consultor_agregado_2, pct: pctA2 } : null,
        ].filter(Boolean);

        for (const { cons, pct } of consultoresEmpresa) {
          // Se filtro por consultor específico, pula outros
          if (consultorId && cons.id !== consultorId) continue;
          // Se filtro por gestor, só mostra do gestor
          if (gestorFiltro !== 'Geral' && !consultorId) {
            const consCompleto = consultores.find(c=>c.id===cons.id);
            if (!consCompleto || consCompleto.gestor !== gestorFiltro) continue;
          }

          const fator = pct / 100;
          const movPorMes = {};
          let totalMov = 0;

          for (const m of mesesDisp) {
            const comp = m+'-01';
            const aj   = ajusteMap[`${e.id}__${comp}`];
            const bruto = libMap[`${e.produto_id}__${comp}`] || 0;
            const val   = aj !== undefined ? aj : bruto;
            const valFat = Math.round(val * fator * 100) / 100;
            movPorMes[m] = valFat;
            totalMov += valFat;
          }

          const mesesAtivos  = Object.values(movPorMes).filter(v=>v>0).length;
          const mediaMovMes  = mesesAtivos > 0 ? totalMov / mesesAtivos : 0;
          const esperadoMes  = (e.potencial_movimentacao||0) * (e.peso_categoria||1) * fator;
          const aderencia    = esperadoMes > 0 ? (mediaMovMes / esperadoMes) * 100 : 0;

          let situacao = 'sem movimentação';
          if (totalMov > 0 && aderencia < 50)  situacao = 'abaixo do esperado';
          if (aderencia >= 50 && aderencia < 90) situacao = 'dentro do esperado';
          if (aderencia >= 90) situacao = 'acima do esperado';

          listaProcessada.push({
            ...e,
            _key:        `${e.id}__${cons.id}`,
            _cons:       cons,
            _pct:        pct,
            vendedor:    cons.nome,
            gestor:      cons.gestor || '—',
            movPorMes,
            totalMov,
            mediaMovMes,
            mesesAtivos,
            esperadoMes,
            aderencia,
            situacao,
          });
        }
      }

      // ─── KPIs ─────────────────────────────────────────────────────────
      const totalMovReal    = listaProcessada.reduce((s,e)=>s+e.totalMov, 0);
      const totalEsperado   = listaProcessada.reduce((s,e)=>s+e.esperadoMes*(mesesDisp.length||1), 0);
      const totalPotencial  = listaProcessada.reduce((s,e)=>s+(e.potencial_movimentacao||0)*(e._pct/100), 0);
      const meta            = consultoresDaVisao.reduce((s,c)=>s+(c.meta_mensal||0), 0);
      const metaTotal       = meta * (mesesDisp.length||1);
      const pctMeta         = metaTotal > 0 ? (totalMovReal/metaTotal)*100 : 0;
      const comMov          = listaProcessada.filter(e=>e.totalMov>0).length;
      const semMov          = listaProcessada.filter(e=>e.totalMov===0).length;
      const crescendo       = listaProcessada.filter(e=>{
        const vals = mesesDisp.map(m=>e.movPorMes[m]||0);
        if (vals.length < 2) return false;
        const ultimo = vals[vals.length-1];
        const penult = [...vals].reverse().slice(1).find(v=>v>0)||0;
        return ultimo > penult*1.05;
      }).length;

      // Por produto
      const porProduto = {};
      listaProcessada.forEach(e => {
        const p = e.produto_contratado||'Outros';
        if (!porProduto[p]) porProduto[p] = { contratos:0, esperado:0, movReal:0 };
        porProduto[p].contratos++;
        porProduto[p].esperado  += e.esperadoMes;
        porProduto[p].movReal   += e.mediaMovMes;
      });

      // Ranking por consultor
      const rankingMap = {};
      listaProcessada.forEach(e => {
        const cid = e._cons.id;
        if (!rankingMap[cid]) rankingMap[cid] = { id:cid, nome:e.vendedor, gestor:e.gestor, movReal:0, esperado:0, empresas:0 };
        rankingMap[cid].movReal  += e.mediaMovMes;
        rankingMap[cid].esperado += e.esperadoMes;
        rankingMap[cid].empresas++;
      });
      const ranking = Object.values(rankingMap).sort((a,b)=>b.movReal-a.movReal);

      setDados({
        consultor, consultoresDaVisao, mesesDisp,
        lista: listaProcessada,
        kpis: { totalMovReal, totalEsperado, totalPotencial, meta, metaTotal, pctMeta, comMov, semMov, crescendo, empresas: listaProcessada.length },
        porProduto: Object.entries(porProduto).map(([nome,v])=>({nome,...v})).sort((a,b)=>b.movReal-a.movReal),
        ranking,
      });
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  function buildEmpty() {
    return { consultor:null, consultoresDaVisao:[], mesesDisp:[], lista:[], kpis:{}, porProduto:[], ranking:[] };
  }

  const consultsFiltrados = gestorFiltro==='Geral' ? consultores : consultores.filter(c=>c.gestor===gestorFiltro);
  const corMeta = (p) => p>=100?'#34d399':p>=70?'#f0b429':'#f87171';

  // Lista filtrada para carteira
  const listaFiltrada = useMemo(() => {
    if (!dados) return [];
    let arr = [...dados.lista];
    if (busca.trim()) { const b=norm(busca); arr=arr.filter(e=>norm(e.nome).includes(b)||String(e.produto_id).includes(b)); }
    if (filtroProduto) arr = arr.filter(e=>e.produto_contratado===filtroProduto);
    if (filtroStatus)  arr = arr.filter(e=>e.situacao===filtroStatus);
    return arr.sort((a,b)=>b.mediaMovMes-a.mediaMovMes);
  }, [dados, busca, filtroProduto, filtroStatus]);

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} select option{background:#fff;color:#1a1d2e;}`}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Dashboard do Vendedor</h1>
          <p style={s.sub}>Resultado individual — movimentação real vs esperada</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={s.filtrosCard}>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>GESTOR</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {gestores.map(g=>(
              <button key={g} style={{...s.gestorBtn,...(gestorFiltro===g?s.gestorBtnAtivo:{})}}
                onClick={()=>{setGestorFiltro(g);setConsultorId('');}}>
                {g==='Geral'?'🌐 Geral':`👔 ${g.split(' ')[0]}`}
              </button>
            ))}
          </div>
        </div>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>VENDEDOR</label>
          <select style={s.select} value={consultorId} onChange={e=>setConsultorId(e.target.value)}>
            <option value="">— Ver equipe consolidada —</option>
            {consultsFiltrados.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>MÊS</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button style={{...s.gestorBtn,...(mesSelecionado===''?s.gestorBtnAtivo:{})}} onClick={()=>setMesSelecionado('')}>🌐 Todos</button>
            {meses.map(m=>(
              <button key={m} style={{...s.gestorBtn,...(mesSelecionado===m?s.gestorBtnAtivo:{})}} onClick={()=>setMesSelecionado(m)}>
                📅 {fmtMes(m+'-01')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div style={s.vazio}>
          <div style={{width:40,height:40,border:'3px solid #e4e7ef',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite'}}></div>
          <div style={{color:'#8b92b0'}}>Carregando dados...</div>
        </div>
      )}

      {dados && !loading && (() => {
        const { kpis, lista, mesesDisp, porProduto, ranking, consultor, consultoresDaVisao } = dados;
        const pct = kpis.pctMeta||0;
        const cor = corMeta(pct);

        return (
          <>
            {/* Nome do vendedor */}
            <div style={{marginBottom:20,display:'flex',alignItems:'center',gap:16}}>
              <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(240,180,41,0.15)',border:'2px solid rgba(240,180,41,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',fontWeight:700,color:'#f0b429'}}>
                {consultorId?consultor?.nome?.[0]:gestorFiltro==='Geral'?'🌐':'👔'}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:'1.2rem'}}>
                  {consultorId?consultor?.nome:gestorFiltro==='Geral'?'Visão Geral — Todas as Equipes':`Equipe ${gestorFiltro}`}
                </div>
                <div style={{color:'#8b92b0',fontSize:'0.8rem'}}>
                  {consultorId
                    ? `${consultor?.equipe||consultor?.setor||'—'} · ${consultor?.gestor||'—'}`
                    : `${consultoresDaVisao.length} consultores · ${lista.length} empresas`}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:16}}>
              {[
                { label:'Empresas',           val: kpis.empresas,                cor:'#1a1d2e',  sub:`${kpis.comMov} movimentando` },
                { label:'Mov. Real Acumulada', val: fmt(kpis.totalMovReal),       cor:'#f0b429',  sub:`${mesesDisp.length||0} meses` },
                { label:'Mov. Esperada',       val: fmt(kpis.totalEsperado),      cor:'#a78bfa',  sub:'potencial × peso' },
                { label:'Meta Total',          val: kpis.metaTotal>0?fmt(kpis.metaTotal):'—', cor:'#1a1d2e', sub:`R$${fmt(kpis.meta||0)}/mês` },
                { label:'% Realizado',         val: fmtPct(kpis.totalEsperado>0?(kpis.totalMovReal/kpis.totalEsperado)*100:0), cor:'#34d399', sub:'mov / esperado' },
                { label:'Crescendo',           val: kpis.crescendo,               cor:'#34d399',  sub:'empresas em alta' },
              ].map(k=>(
                <div key={k.label} style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                  <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>{k.label}</div>
                  <div style={{fontSize:'1.2rem',fontWeight:700,color:k.cor}}>{k.val}</div>
                  {k.sub&&<div style={{color:'#8b92b0',fontSize:'0.68rem',marginTop:4}}>{k.sub}</div>}
                </div>
              ))}
            </div>

            {/* Barra de progresso vs esperado */}
            <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 20px',marginBottom:16,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontWeight:600,fontSize:'0.82rem',color:'#4a5068'}}>Movimentação Real vs Esperada</span>
                <span style={{fontSize:'0.75rem',color:'#8b92b0'}}>{fmt(kpis.totalMovReal)} / {fmt(kpis.totalEsperado)}</span>
              </div>
              <div style={{background:'#f0f2f8',borderRadius:8,height:10,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:8,transition:'width 0.8s',
                  width:`${Math.min(kpis.totalEsperado>0?(kpis.totalMovReal/kpis.totalEsperado)*100:0,100)}%`,
                  background:'linear-gradient(90deg,#34d399,#059669)'}}></div>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:'0.68rem',color:'#8b92b0'}}>
                <span>0%</span>
                <span style={{color:'#34d399',fontWeight:600}}>{fmtPct(kpis.totalEsperado>0?(kpis.totalMovReal/kpis.totalEsperado)*100:0)} realizado</span>
                <span>{fmt(kpis.totalEsperado)}</span>
              </div>
            </div>

            {/* Abas */}
            <div style={s.tabs}>
              {ABAS.map(a=>(
                <button key={a.key} style={{...s.tab,...(aba===a.key?s.tabAtiva:{})}} onClick={()=>setAba(a.key)}>{a.label}</button>
              ))}
            </div>

            {/* ── RESUMO ── */}
            {aba==='resumo' && (
              <div style={s.card}>
                <div style={s.cardTitle}>📊 Movimentação por Mês</div>
                {mesesDisp.length===0 ? (
                  <div style={s.semDados}>Nenhuma liberação importada ainda. Importe via Liberações.</div>
                ) : (
                  <div style={{display:'flex',gap:14,marginTop:20,flexWrap:'wrap'}}>
                    {mesesDisp.map(m=>{
                      const totalMes  = lista.reduce((s,e)=>s+(e.movPorMes[m]||0),0);
                      const esperMes  = lista.reduce((s,e)=>s+e.esperadoMes,0);
                      const pctMes    = esperMes>0?(totalMes/esperMes)*100:0;
                      const corMes    = pctMes>=90?'#34d399':pctMes>=50?'#f0b429':'#f87171';
                      const empresasMes = lista.filter(e=>(e.movPorMes[m]||0)>0).length;
                      return (
                        <div key={m} style={{background:'#f9fafb',border:'1px solid #e4e7ef',borderRadius:14,padding:'18px 22px',flex:'1 1 180px',minWidth:180}}>
                          <div style={{display:'inline-block',background:'rgba(240,180,41,0.12)',border:'1px solid rgba(240,180,41,0.3)',color:'#b45309',borderRadius:8,padding:'4px 12px',fontSize:'0.82rem',fontWeight:700,marginBottom:10}}>{fmtMes(m+'-01')}</div>
                          <div style={{fontSize:'1.4rem',fontWeight:700,color:'#f0b429',marginBottom:4}}>{fmt(totalMes)}</div>
                          <div style={{color:'#8b92b0',fontSize:'0.75rem',marginBottom:10}}>{empresasMes} empresas movimentando</div>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',marginBottom:4}}>
                            <span style={{color:'#8b92b0'}}>vs esperado</span>
                            <span style={{color:corMes,fontWeight:700}}>{fmtPct(pctMes)}</span>
                          </div>
                          <div style={{background:'#e4e7ef',borderRadius:4,height:6,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${Math.min(pctMes,100)}%`,background:corMes,borderRadius:4}}></div>
                          </div>
                          <div style={{marginTop:8,fontSize:'0.68rem',color:'#8b92b0'}}>esperado: {fmt(esperMes)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── CARTEIRA ── */}
            {aba==='carteira' && (
              <div style={s.card}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
                  <div style={s.cardTitle}>📋 Carteira de Empresas</div>
                  <span style={{color:'#8b92b0',fontSize:'0.75rem'}}>{listaFiltrada.length} de {lista.length} empresas</span>
                </div>

                {/* Filtros */}
                <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
                  <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e=>setBusca(e.target.value)} />
                  <select style={s.sel} value={filtroProduto} onChange={e=>setFiltroProduto(e.target.value)}>
                    <option value="">Todos os produtos</option>
                    {[...new Set(lista.map(e=>e.produto_contratado).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  <select style={s.sel} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
                    <option value="">Todos os status</option>
                    <option value="acima do esperado">✅ Acima do esperado</option>
                    <option value="dentro do esperado">⚡ Dentro do esperado</option>
                    <option value="abaixo do esperado">⚠️ Abaixo do esperado</option>
                    <option value="sem movimentação">❌ Sem movimentação</option>
                  </select>
                </div>

                <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #f0f2f8'}}>
                  <table style={s.table}>
                    <thead>
                      <tr style={{background:'#f9fafb'}}>
                        {['Empresa','Produto','Vendedor','Esperado/mês',...(mesesDisp.map(m=>fmtMes(m+'-01'))),'Média Real','% Adere','Status'].map(h=>
                          <th key={h} style={s.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {listaFiltrada.map((e,i)=>{
                        const corSit = e.situacao==='acima do esperado'?'#34d399':e.situacao==='dentro do esperado'?'#f0b429':e.situacao==='abaixo do esperado'?'#f87171':'#9ca3af';
                        return (
                          <tr key={e._key} style={{background:i%2===0?'#ffffff':'#fafafa',borderBottom:'1px solid #f0f2f8'}}>
                            <td style={s.td}>
                              <a href={`/gestao/${e.id}`} style={{fontWeight:600,color:'#1a1d2e',textDecoration:'none'}}
                                onMouseEnter={ev=>ev.currentTarget.style.color='#f0b429'}
                                onMouseLeave={ev=>ev.currentTarget.style.color='#1a1d2e'}>
                                {e.nome}
                              </a>
                              <div style={{color:'#8b92b0',fontSize:'0.68rem'}}>ID {e.produto_id}</div>
                            </td>
                            <td style={s.td}>{e.produto_contratado||'—'}</td>
                            <td style={s.td}>
                              <div style={{fontSize:'0.78rem'}}>{e.vendedor}</div>
                              {e._pct<100&&<span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:4,padding:'1px 6px',fontSize:'0.65rem',fontWeight:700}}>{e._pct}%</span>}
                            </td>
                            <td style={{...s.td,color:'#a78bfa',fontWeight:600}}>{fmt(e.esperadoMes)}</td>
                            {mesesDisp.map(m=>{
                              const v = e.movPorMes[m]||0;
                              const pctV = e.esperadoMes>0?(v/e.esperadoMes)*100:0;
                              const c = pctV>=90?'#34d399':pctV>=50?'#f0b429':v>0?'#f87171':'#9ca3af';
                              return <td key={m} style={{...s.td,textAlign:'right',color:c,fontWeight:v>0?600:400}}>
                                {v>0?fmt(v):'—'}
                              </td>;
                            })}
                            <td style={{...s.td,textAlign:'right',color:'#f0b429',fontWeight:700}}>{e.mediaMovMes>0?fmt(e.mediaMovMes):'—'}</td>
                            <td style={s.td}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <div style={{background:'#f0f2f8',borderRadius:3,height:5,width:50,overflow:'hidden'}}>
                                  <div style={{height:'100%',width:`${Math.min(e.aderencia,100)}%`,background:corSit}}></div>
                                </div>
                                <span style={{color:corSit,fontWeight:600,fontSize:'0.75rem'}}>{fmtPct(e.aderencia)}</span>
                              </div>
                            </td>
                            <td style={s.td}>
                              <span style={{background:`${corSit}18`,color:corSit,borderRadius:5,padding:'2px 8px',fontSize:'0.68rem',fontWeight:600,whiteSpace:'nowrap'}}>{e.situacao}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {listaFiltrada.length===0&&<tr><td colSpan={8+mesesDisp.length} style={{...s.td,textAlign:'center',color:'#8b92b0',padding:32}}>Nenhuma empresa encontrada</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── PRODUTOS ── */}
            {aba==='produtos' && (
              <div style={s.card}>
                <div style={s.cardTitle}>🎯 Resultado por Produto</div>
                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:12}}>
                  {porProduto.map((p,i)=>{
                    const pctAdere = p.esperado>0?(p.movReal/p.esperado)*100:0;
                    const cor = pctAdere>=90?'#34d399':pctAdere>=50?'#f0b429':'#f87171';
                    return (
                      <div key={p.nome} style={{background:'#f9fafb',borderRadius:12,padding:'16px 20px',border:'1px solid #e4e7ef'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                          <span style={{fontWeight:700}}>{p.nome}</span>
                          <span style={{color:'#8b92b0',fontSize:'0.78rem'}}>{p.contratos} empresa{p.contratos>1?'s':''}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12}}>
                          {[
                            {label:'Mov. Esperada/mês', val:fmt(p.esperado), cor:'#a78bfa'},
                            {label:'Mov. Real Média', val:p.movReal>0?fmt(p.movReal):'—', cor:'#f0b429'},
                            {label:'% Aderência', val:fmtPct(pctAdere), cor},
                          ].map(k=>(
                            <div key={k.label}>
                              <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',marginBottom:4}}>{k.label}</div>
                              <div style={{fontWeight:700,color:k.cor}}>{k.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{background:'#e4e7ef',borderRadius:4,height:6,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${Math.min(pctAdere,100)}%`,background:cor,borderRadius:4}}></div>
                        </div>
                      </div>
                    );
                  })}
                  {porProduto.length===0&&<div style={s.semDados}>Nenhum produto encontrado</div>}
                </div>
              </div>
            )}

            {/* ── RANKING ── */}
            {aba==='ranking' && (
              <div style={s.card}>
                <div style={s.cardTitle}>🏆 Ranking — Movimentação Real por Vendedor</div>
                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:10}}>
                  {ranking.map((c,i)=>{
                    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`;
                    const corM  = i===0?'#f0b429':i===1?'#9ca3af':i===2?'#cd7c2f':'#4b5563';
                    const pctAd = c.esperado>0?(c.movReal/c.esperado)*100:0;
                    const cor   = pctAd>=90?'#34d399':pctAd>=50?'#f0b429':'#f87171';
                    const isAtu = c.id===consultorId;
                    const maxMov = Math.max(...ranking.map(x=>x.movReal),1);
                    return (
                      <div key={c.id} style={{borderRadius:10,overflow:'hidden',background:isAtu?'#fff8e6':'#f9fafb',border:`1px solid ${isAtu?'#f0b429':'#e4e7ef'}`}}>
                        <div style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,fontSize:'1rem',color:corM,minWidth:32,textAlign:'center'}}>{medal}</span>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:700,fontSize:'0.88rem',color:isAtu?'#b45309':'#1a1d2e'}}>{c.nome}</div>
                            <div style={{fontSize:'0.72rem',color:'#8b92b0',marginTop:2}}>{c.empresas} empresa{c.empresas>1?'s':''} · gestor: {c.gestor}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontWeight:700,color:'#f0b429'}}>{fmt(c.movReal)}</div>
                            <div style={{fontSize:'0.68rem',color:cor}}>esperado: {fmt(c.esperado)} · {fmtPct(pctAd)}</div>
                          </div>
                          {isAtu&&<span style={{background:'rgba(240,180,41,0.2)',color:'#f0b429',borderRadius:6,padding:'2px 8px',fontSize:'0.68rem',fontWeight:700}}>você</span>}
                        </div>
                        <div style={{height:3,background:'#f5f6fa'}}>
                          <div style={{height:'100%',width:`${(c.movReal/maxMov)*100}%`,background:isAtu?'#f0b429':i<3?'#34d399':'#d1d5e8',transition:'width 0.6s'}}></div>
                        </div>
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
  page:        {maxWidth:1300,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#1a1d2e',background:'#f5f6fa',minHeight:'100vh'},
  header:      {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24},
  tag:         {color:'#b45309',fontWeight:700,fontSize:'0.75rem',letterSpacing:2,marginBottom:8,textTransform:'uppercase'},
  title:       {fontSize:'1.6rem',fontWeight:700,margin:'0 0 6px',color:'#1a1d2e'},
  sub:         {color:'#8b92b0',fontSize:'0.875rem'},
  filtrosCard: {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',gap:24,flexWrap:'wrap',alignItems:'flex-end',boxShadow:'0 1px 3px rgba(0,0,0,0.06)'},
  filtroGrupo: {display:'flex',flexDirection:'column',gap:6},
  filtroLabel: {color:'#8b92b0',fontSize:'0.65rem',letterSpacing:2,textTransform:'uppercase',fontWeight:600},
  gestorBtn:   {background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'7px 14px',color:'#4a5068',cursor:'pointer',fontSize:'0.82rem',fontWeight:500,fontFamily:'inherit'},
  gestorBtnAtivo:{background:'#fff8e6',border:'1px solid #f0b429',color:'#b45309',fontWeight:700},
  select:      {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 14px',color:'#1a1d2e',fontSize:'0.875rem',fontFamily:'inherit',cursor:'pointer',minWidth:220},
  busca:       {flex:'1 1 200px',background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 12px',color:'#1a1d2e',fontSize:'0.85rem',fontFamily:'inherit',outline:'none'},
  sel:         {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 12px',color:'#1a1d2e',fontSize:'0.85rem',fontFamily:'inherit',cursor:'pointer',outline:'none'},
  vazio:       {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'64px 32px',textAlign:'center'},
  tabs:        {display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'},
  tab:         {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:8,padding:'7px 16px',color:'#4a5068',cursor:'pointer',fontSize:'0.85rem',fontWeight:500,fontFamily:'inherit'},
  tabAtiva:    {background:'#fff8e6',border:'1px solid #f0b429',color:'#b45309',fontWeight:600},
  card:        {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'24px',marginBottom:16,boxShadow:'0 1px 3px rgba(0,0,0,0.05)'},
  cardTitle:   {fontSize:'0.95rem',fontWeight:700,color:'#1a1d2e'},
  table:       {width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'},
  th:          {padding:'8px 12px',textAlign:'left',color:'#8b92b0',fontWeight:600,borderBottom:'1px solid #e4e7ef',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.67rem',letterSpacing:0.5,background:'#f9fafb'},
  td:          {padding:'10px 12px',whiteSpace:'nowrap',color:'#1a1d2e'},
  semDados:    {color:'#8b92b0',fontSize:'0.85rem',textAlign:'center',padding:'32px 0'},
};
