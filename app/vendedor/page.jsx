'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtK   = (v) => { const n=Number(v||0); return n>=1000?`R$${(n/1000).toFixed(1)}k`:fmt(n); };
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };
const norm   = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

async function fetchAll(query) {
  let all=[],from=0;
  while(true){
    const {data,error}=await query.range(from,from+999);
    if(error||!data||!data.length) break;
    all=[...all,...data];
    if(data.length<1000) break;
    from+=1000;
  }
  return all;
}

// Cores por status
const COR = {
  ok:      '#16a34a',
  warn:    '#f0b429',
  bad:     '#f87171',
  neutral: '#6b7280',
  blue:    '#3b82f6',
  purple:  '#a78bfa',
};

function corPct(p) { return p>=100?COR.ok:p>=70?COR.warn:COR.bad; }

// Mini barra horizontal
function Barra({pct, cor, height=8}) {
  return (
    <div style={{background:'rgba(255,255,255,0.07)',borderRadius:4,height,overflow:'hidden',flex:1}}>
      <div style={{height:'100%',width:`${Math.min(pct||0,100)}%`,background:cor,borderRadius:4,transition:'width 0.6s ease'}}/>
    </div>
  );
}

// Card KPI compacto
function KPI({label, val, sub, cor='#e8eaf0', destaque=false, onClick}) {
  return (
    <div onClick={onClick} style={{
      background: destaque?`${cor}12`:'#161a26',
      border:`1px solid ${destaque?cor+'40':'rgba(255,255,255,0.07)'}`,
      borderRadius:14, padding:'18px 20px', display:'flex', flexDirection:'column', gap:6,
      cursor:onClick?'pointer':'default', transition:'all 0.2s',
    }}>
      <span style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1}}>{label}</span>
      <span style={{fontSize:'1.3rem',fontWeight:800,color:cor,lineHeight:1}}>{val}</span>
      {sub&&<span style={{color:'#4b5563',fontSize:'0.7rem'}}>{sub}</span>}
    </div>
  );
}

// Gráfico de barras SVG — 3 barras por grupo: Esperado · Mov. Real · Meta
function GraficoBarras({dados, altura=160}) {
  if(!dados||dados.length===0) return null;

  // Cada grupo tem 3 barras de 18px + 4px gap entre elas + 20px gap entre grupos
  const BAR_W = 18;
  const BAR_GAP = 4;        // gap entre barras do mesmo grupo
  const GROUP_W = BAR_W*3 + BAR_GAP*2;  // largura do grupo = 62px
  const GROUP_GAP = 22;     // gap entre grupos
  const STEP = GROUP_W + GROUP_GAP;     // passo por mês = 84px

  const maxVal = Math.max(...dados.map(d=>Math.max(d.mov||0,d.meta||0.1,d.esperado||0.1)),1);
  const svgW = Math.max(dados.length * STEP + GROUP_GAP, 400);
  const BOTTOM = altura + 24; // espaço para labels

  function barH(v) { return Math.max(Math.round((v||0)/maxVal*(altura-8)),0); }

  return (
    <div style={{overflowX:'auto',marginBottom:4}}>
      <svg width={svgW} height={BOTTOM+10} style={{display:'block'}}>
        {/* Linhas de grade */}
        {[0.25,0.5,0.75,1].map(p=>{
          const y = altura - Math.round(p*( altura-8));
          return <line key={p} x1={0} y1={y} x2={svgW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>;
        })}

        {dados.map((d,i)=>{
          const gx = GROUP_GAP/2 + i*STEP;   // x inicial do grupo
          const corMov = corPct(d.esperado>0?(d.mov/d.esperado)*100:0);

          const hEsp  = barH(d.esperado);
          const hMov  = barH(d.mov);
          const hMeta = barH(d.meta);

          // Posição x de cada barra dentro do grupo
          const xEsp  = gx;
          const xMov  = gx + BAR_W + BAR_GAP;
          const xMeta = gx + (BAR_W + BAR_GAP)*2;

          // Centro do grupo para o label
          const cx = gx + GROUP_W/2;

          return (
            <g key={i}>
              {/* Barra Esperado (roxa) */}
              {hEsp>0&&<rect x={xEsp} y={altura-hEsp} width={BAR_W} height={hEsp} fill="rgba(167,139,250,0.35)" rx={3}/>}
              {hEsp===0&&<rect x={xEsp} y={altura-2} width={BAR_W} height={2} fill="rgba(167,139,250,0.15)" rx={1}/>}

              {/* Barra Movimentação Real */}
              {hMov>0&&<rect x={xMov} y={altura-hMov} width={BAR_W} height={hMov} fill={corMov} rx={3} opacity={0.9}/>}
              {hMov===0&&<rect x={xMov} y={altura-2} width={BAR_W} height={2} fill="rgba(255,255,255,0.1)" rx={1}/>}
              {/* Valor em cima da barra de mov */}
              {hMov>16&&<text x={xMov+BAR_W/2} y={altura-hMov-5} textAnchor="middle" fill={corMov} fontSize={9} fontWeight={700} fontFamily="DM Sans,sans-serif">
                {fmtK(d.mov)}
              </text>}

              {/* Barra Meta (verde) */}
              {hMeta>0&&<rect x={xMeta} y={altura-hMeta} width={BAR_W} height={hMeta} fill={COR.ok} rx={3} opacity={0.75}/>}
              {hMeta===0&&d.meta===0&&<rect x={xMeta} y={altura-2} width={BAR_W} height={2} fill="rgba(52,211,153,0.1)" rx={1}/>}
              {hMeta>16&&<text x={xMeta+BAR_W/2} y={altura-hMeta-5} textAnchor="middle" fill={COR.ok} fontSize={9} fontWeight={700} fontFamily="DM Sans,sans-serif">
                {fmtK(d.meta)}
              </text>}

              {/* Label do mês centralizado no grupo */}
              <text x={cx} y={altura+16} textAnchor="middle" fill="#6b7280" fontSize={10} fontFamily="DM Sans,sans-serif">
                {fmtMes(d.mes+'-01')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Legenda
function Legenda() {
  return (
    <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <div style={{width:12,height:10,borderRadius:2,background:'rgba(167,139,250,0.45)'}}/>
        <span style={{fontSize:'0.72rem',color:'#6b7280'}}>Esperado</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <div style={{width:12,height:10,borderRadius:2,background:'#f0b429'}}/>
        <span style={{fontSize:'0.72rem',color:'#6b7280'}}>Movimentação Real</span>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:5}}>
        <div style={{width:12,height:10,borderRadius:2,background:COR.ok}}/>
        <span style={{fontSize:'0.72rem',color:'#6b7280'}}>Meta Considerada</span>
      </div>
    </div>
  );
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
  const [filtroMesCad,   setFiltroMesCad]   = useState('todos'); // filtro por mês de cadastro na análise
  const [busca,          setBusca]          = useState('');
  const [filtroProduto,  setFiltroProduto]  = useState('');
  const [filtroStatus,   setFiltroStatus]   = useState('');
  const [paginaCarteira, setPaginaCarteira] = useState(1);
  const POR_PAG = 15;

  useEffect(()=>{ carregarBase(); },[]);
  useEffect(()=>{ if(consultores.length) carregarDados(); },[consultorId,gestorFiltro,mesSelecionado,consultores]);
  useEffect(()=>{ setPaginaCarteira(1); },[busca,filtroProduto,filtroStatus,consultorId,gestorFiltro]);

  async function carregarBase() {
    const [{data:cons},{data:libs}] = await Promise.all([
      supabase.from('consultores').select('id,nome,meta_mensal,setor,gestor,equipe').eq('ativo',true).order('nome'),
      supabase.from('liberacoes').select('competencia').order('competencia',{ascending:false}),
    ]);
    setConsultores(cons||[]);
    const gs=['Geral',...new Set((cons||[]).map(c=>c.gestor).filter(Boolean))];
    setGestores(gs);
    const ms=[...new Set((libs||[]).map(l=>l.competencia?.substring(0,7)).filter(Boolean))].sort();
    setMeses(ms);
  }

  async function carregarDados() {
    setLoading(true); setDados(null);
    try {
      let empQuery = supabase.from('empresas').select(`
        id, produto_id, nome, categoria, produto_contratado,
        potencial_movimentacao, peso_categoria, data_cadastro,
        pct_principal, pct_agregado_1, pct_agregado_2,
        consultor_principal:consultor_principal_id(id,nome,gestor,equipe,meta_mensal),
        consultor_agregado:consultor_agregado_id(id,nome),
        consultor_agregado_2:consultor_agregado_2_id(id,nome)
      `).eq('ativo',true)
        .not('produto_contratado','ilike','%desconto condicional%')
        .not('categoria','eq','Taxa Negativa')
        .in('categoria',['Beneficios','Benefícios','Bonus','Bônus','Convênio','Convenio','Mobilidade']);

      if(consultorId) {
        empQuery=empQuery.or(`consultor_principal_id.eq.${consultorId},consultor_agregado_id.eq.${consultorId},consultor_agregado_2_id.eq.${consultorId}`);
      } else if(gestorFiltro!=='Geral') {
        const ids=consultores.filter(c=>c.gestor===gestorFiltro).map(c=>c.id);
        if(!ids.length){setLoading(false);return;}
        empQuery=empQuery.in('consultor_principal_id',ids);
      }

      const empresas = await fetchAll(empQuery);
      const prodIds  = empresas.map(e=>e.produto_id);
      const empIds   = empresas.map(e=>e.id);

      const mesInicio = mesSelecionado?mesSelecionado+'-01':'2000-01-01';
      const mesFim    = mesSelecionado?mesSelecionado+'-28':'2099-12-31';

      const [libsFiltradas,ajustes,vmetas,libsTodas] = await Promise.all([
        prodIds.length ? fetchAll(supabase.from('liberacoes').select('produto_id,competencia,total_liberado').in('produto_id',prodIds).gte('competencia',mesInicio).lte('competencia',mesFim)) : Promise.resolve([]),
        empIds.length  ? fetchAll(supabase.from('ajustes_movimentacao').select('empresa_id,competencia,valor_considerado').in('empresa_id',empIds)) : Promise.resolve([]),
        empIds.length  ? fetchAll(supabase.from('valor_meta_empresa').select('empresa_id,consultor_id,competencia_meta,valor_meta,regra,mes_sequencia').in('empresa_id',empIds)) : Promise.resolve([]),
        prodIds.length ? fetchAll(supabase.from('liberacoes').select('produto_id,competencia,total_liberado').in('produto_id',prodIds).order('competencia')) : Promise.resolve([]),
      ]);

      const libMap={};
      for(const l of libsFiltradas){const k=`${l.produto_id}__${l.competencia?.substring(0,10)}`;libMap[k]=(libMap[k]||0)+l.total_liberado;}
      const ajusteMap={};
      for(const a of ajustes){ajusteMap[`${a.empresa_id}__${a.competencia?.substring(0,10)}`]=a.valor_considerado;}
      const vmetaMap={};
      for(const v of vmetas){vmetaMap[`${v.empresa_id}__${v.consultor_id}`]=v;}

      // libsTodasMap: produto_id → [{comp,val}] ordenado — para cálculo automático de meta
      const libsTodasMap={};
      for(const l of libsTodas){
        const pid=l.produto_id;
        if(!libsTodasMap[pid]) libsTodasMap[pid]=[];
        libsTodasMap[pid].push({comp:l.competencia?.substring(0,10),val:l.total_liberado||0});
      }

      // Calcula meta inline (igual à gestão) — usa gravado se existir, senão calcula
      function calcMetaInline(emp, consId, pct) {
        // Primeiro tenta usar o valor gravado na tabela
        const gravado = vmetaMap[`${emp.id}__${consId}`];
        if(gravado) return {valorMeta:gravado.valor_meta||0, metaComp:gravado.competencia_meta, metaRegra:gravado.regra};

        // Senão calcula automaticamente
        const cat=(emp.categoria||'').toLowerCase();
        const isBenef=cat.includes('benefi')||cat.includes('bonus')||cat.includes('bônus');
        const isConv=cat.includes('conv')||cat.includes('mobil');
        if(!isBenef&&!isConv) return {valorMeta:0,metaComp:null,metaRegra:null};

        const prodNorm=(emp.produto_contratado||'').toLowerCase().trim();
        const isVB=prodNorm==='vegas benefícios'||prodNorm==='vegas beneficios';
        const peso=isVB?(emp.peso_categoria??1):1;

        const libs=(libsTodasMap[emp.produto_id]||[])
          .filter(l=>l.val>0)
          .sort((a,b)=>a.comp.localeCompare(b.comp));

        if(libs.length===0) return {valorMeta:0,metaComp:null,metaRegra:null};

        let mesAlvo=null, regra=null;
        if(isBenef){ mesAlvo=libs[0]; regra='beneficio'; }
        else { if(libs.length<3) return {valorMeta:0,metaComp:null,metaRegra:null}; mesAlvo=libs[2]; regra='convenio'; }

        const comp=mesAlvo.comp;
        const aj=ajusteMap[`${emp.id}__${comp}`];
        const valorBase=aj!==undefined?aj:mesAlvo.val;
        const valorMeta=Math.round(valorBase*peso*(pct/100)*100)/100;
        return {valorMeta,metaComp:comp,metaRegra:regra};
      }

      const mesesDisp=[...new Set(libsFiltradas.map(l=>l.competencia?.substring(0,7)).filter(Boolean))].sort();
      const consultor=consultorId?consultores.find(c=>c.id===consultorId):null;
      const consultoresDaVisao=consultorId?[consultor].filter(Boolean):gestorFiltro==='Geral'?consultores:consultores.filter(c=>c.gestor===gestorFiltro);

      // ── Processa empresas ──────────────────────────────────────────────
      const lista=[];
      for(const e of empresas){
        const pctP=e.pct_principal??100, pctA1=e.pct_agregado_1??0, pctA2=e.pct_agregado_2??0;
        const consultoresEmp=[
          e.consultor_principal?{cons:e.consultor_principal,pct:pctP}:null,
          e.consultor_agregado&&pctA1>0?{cons:e.consultor_agregado,pct:pctA1}:null,
          e.consultor_agregado_2&&pctA2>0?{cons:e.consultor_agregado_2,pct:pctA2}:null,
        ].filter(Boolean);

        for(const {cons,pct} of consultoresEmp){
          if(consultorId&&cons.id!==consultorId) continue;
          if(gestorFiltro!=='Geral'&&!consultorId){
            const cc=consultores.find(c=>c.id===cons.id);
            if(!cc||cc.gestor!==gestorFiltro) continue;
          }
          const fator=pct/100;
          const movPorMes={};
          let totalMov=0;
          for(const m of mesesDisp){
            const comp=m+'-01';
            const aj=ajusteMap[`${e.id}__${comp}`];
            const bruto=libMap[`${e.produto_id}__${comp}`]||0;
            const val=aj!==undefined?aj:bruto;
            const vf=Math.round(val*fator*100)/100;
            movPorMes[m]=vf; totalMov+=vf;
          }
          const mesesAtivos=Object.values(movPorMes).filter(v=>v>0).length;
          const mediaMovMes=mesesAtivos>0?totalMov/mesesAtivos:0;
          const esperadoMes=(e.potencial_movimentacao||0)*(e.peso_categoria||1)*fator;
          const aderencia=esperadoMes>0?(mediaMovMes/esperadoMes)*100:0;

          // Meta: usa gravado ou calcula inline
          const {valorMeta,metaComp,metaRegra} = calcMetaInline(e, cons.id, pct);

          // Ano de cadastro (para segmentar carteira)
          const anoCadastro=e.data_cadastro?new Date(e.data_cadastro).getFullYear():null;

          let situacao='sem movimentação';
          if(totalMov>0&&aderencia<50) situacao='abaixo do esperado';
          if(aderencia>=50&&aderencia<90) situacao='dentro do esperado';
          if(aderencia>=90) situacao='acima do esperado';

          lista.push({
            ...e,
            _key:`${e.id}__${cons.id}`,_cons:cons,_pct:pct,
            vendedor:cons.nome,gestor:cons.gestor||'—',
            movPorMes,totalMov,mediaMovMes,mesesAtivos,esperadoMes,aderencia,situacao,
            creditou:totalMov>0,
            ultimoValor:movPorMes[mesesDisp[mesesDisp.length-1]]||0,
            valorMeta,metaComp,metaRegra,
            anoCadastro,
            produto:e.produto_contratado||'—',
          });
        }
      }

      // ── KPIs ──────────────────────────────────────────────────────────
      const totalMovReal=lista.reduce((s,e)=>s+e.totalMov,0);
      const totalEsperado=lista.reduce((s,e)=>s+e.esperadoMes*(mesesDisp.length||1),0);
      const totalValorMeta=lista.reduce((s,e)=>s+(e.valorMeta||0),0);
      const meta=consultoresDaVisao.reduce((s,c)=>s+(c.meta_mensal||0),0);
      const comMov=lista.filter(e=>e.totalMov>0).length;
      const crescendo=lista.filter(e=>{
        const vals=mesesDisp.map(m=>e.movPorMes[m]||0);
        if(vals.length<2) return false;
        const u=vals[vals.length-1],p=[...vals].reverse().slice(1).find(v=>v>0)||0;
        return u>p*1.05;
      }).length;
      const naMeta=lista.filter(e=>e.valorMeta>0).length;

      // ── Por mês (para gráfico) ─────────────────────────────────────────
      const porMes=mesesDisp.map(m=>({
        mes:m,
        mov:lista.reduce((s,e)=>s+(e.movPorMes[m]||0),0),
        esperado:lista.reduce((s,e)=>s+e.esperadoMes,0),
        // Meta: soma das empresas cujo mês de meta (gravado ou calculado) é este mês
        meta:lista.filter(e=>e.metaComp?.substring(0,7)===m).reduce((s,e)=>s+e.valorMeta,0),
        empresas:lista.filter(e=>(e.movPorMes[m]||0)>0).length,
      }));

      // ── Por produto ────────────────────────────────────────────────────
      const prodMap={};
      lista.forEach(e=>{
        const p=e.produto||'Outros';
        if(!prodMap[p]) prodMap[p]={contratos:0,esperado:0,movReal:0,naMeta:0,totalMeta:0};
        prodMap[p].contratos++;
        prodMap[p].esperado+=e.esperadoMes;
        prodMap[p].movReal+=e.mediaMovMes;
        if(e.valorMeta>0){prodMap[p].naMeta++;prodMap[p].totalMeta+=e.valorMeta;}
      });

      // ── Ranking consultores ────────────────────────────────────────────
      const rankMap={};
      lista.forEach(e=>{
        const cid=e._cons.id;
        if(!rankMap[cid]) rankMap[cid]={id:cid,nome:e.vendedor,gestor:e.gestor,movReal:0,esperado:0,empresas:0,valorMeta:0,naMeta:0,comMov:0};
        rankMap[cid].movReal+=e.mediaMovMes;
        rankMap[cid].esperado+=e.esperadoMes;
        rankMap[cid].empresas++;
        if(e.valorMeta>0){rankMap[cid].valorMeta+=e.valorMeta;rankMap[cid].naMeta++;}
        if(e.totalMov>0) rankMap[cid].comMov++;
      });
      const ranking=Object.values(rankMap).sort((a,b)=>b.movReal-a.movReal);

      // ── Carteira por ano ───────────────────────────────────────────────
      const carteiraPorAno={};
      lista.forEach(e=>{
        const ano=e.anoCadastro||'Indefinido';
        if(!carteiraPorAno[ano]) carteiraPorAno[ano]={empresas:[],totalMov:0,comMov:0,naMeta:0,totalMeta:0};
        carteiraPorAno[ano].empresas.push(e);
        carteiraPorAno[ano].totalMov+=e.totalMov;
        if(e.totalMov>0) carteiraPorAno[ano].comMov++;
        if(e.valorMeta>0){carteiraPorAno[ano].naMeta++;carteiraPorAno[ano].totalMeta+=e.valorMeta;}
      });

      // ── Análise por mês selecionado ────────────────────────────────────
      // Empresas agrupadas por "status no mês": novas, ativas, inativas
      const analise=mesSelecionado?{
        novas: lista.filter(e=>e.anoCadastro===parseInt(mesSelecionado.split('-')[0])&&e.movPorMes[mesSelecionado]>0),
        ativas: lista.filter(e=>(e.movPorMes[mesSelecionado]||0)>0),
        semMov: lista.filter(e=>(e.movPorMes[mesSelecionado]||0)===0),
      }:null;

      setDados({
        consultor,consultoresDaVisao,mesesDisp,lista,
        kpis:{totalMovReal,totalEsperado,meta,totalValorMeta,comMov,crescendo,naMeta,empresas:lista.length},
        porMes,
        porProduto:Object.entries(prodMap).map(([nome,v])=>({nome,...v})).sort((a,b)=>b.movReal-a.movReal),
        ranking,
        carteiraPorAno,
        analise,
      });
    } catch(err){console.error(err);}
    setLoading(false);
  }

  const consultsFiltrados=gestorFiltro==='Geral'?consultores:consultores.filter(c=>c.gestor===gestorFiltro);

  const listaFiltrada=useMemo(()=>{
    if(!dados) return [];
    let arr=[...dados.lista];
    if(busca.trim()){const b=norm(busca);arr=arr.filter(e=>norm(e.nome).includes(b)||String(e.produto_id).includes(b));}
    if(filtroProduto) arr=arr.filter(e=>e.produto_contratado===filtroProduto);
    if(filtroStatus) arr=arr.filter(e=>e.situacao===filtroStatus);
    return arr.sort((a,b)=>b.mediaMovMes-a.mediaMovMes);
  },[dados,busca,filtroProduto,filtroStatus]);

  const paginasCarteira=Math.ceil(listaFiltrada.length/POR_PAG);
  const listaPage=listaFiltrada.slice((paginaCarteira-1)*POR_PAG,paginaCarteira*POR_PAG);

  const ABAS=[
    {key:'resumo',   label:'📊 Resumo'},
    {key:'analise',  label:'🔬 Análise Mensal'},
    {key:'carteira', label:'📋 Carteira'},
    {key:'produtos', label:'🎯 Produtos'},
    {key:'ranking',  label:'🏆 Ranking'},
  ];

  return (
    <div style={s.page}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        select option{background:#1e2435;color:#e8eaf0;}
        .row-hover:hover{background:rgba(255,255,255,0.04)!important;}
      `}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Dashboard do Vendedor</h1>
          <p style={s.sub}>Análise de desempenho — movimentação · meta · carteira</p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={s.filtrosCard}>
        <div style={s.filtroGrupo}>
          <label style={s.filtroLabel}>GESTÃO</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
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
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button style={{...s.gestorBtn,...(mesSelecionado===''?s.gestorBtnAtivo:{})}} onClick={()=>setMesSelecionado('')}>Todos</button>
            {meses.map(m=>(
              <button key={m} style={{...s.gestorBtn,...(mesSelecionado===m?s.gestorBtnAtivo:{})}} onClick={()=>setMesSelecionado(m)}>
                {fmtMes(m+'-01')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading&&(
        <div style={{...s.card,textAlign:'center',padding:64}}>
          <div style={s.spin}/>
          <div style={{color:'#6b7280',marginTop:16}}>Carregando dados...</div>
        </div>
      )}

      {dados&&!loading&&(()=>{
        const {kpis,mesesDisp,porMes,porProduto,ranking,carteiraPorAno,analise,consultor,consultoresDaVisao} = dados;
        const apurado=kpis.totalValorMeta||0;
        const pctApurado=kpis.meta>0?(apurado/kpis.meta)*100:0;
        const corAp=corPct(pctApurado);
        const pctMov=kpis.totalEsperado>0?(kpis.totalMovReal/kpis.totalEsperado)*100:0;

        return (
          <>
            {/* ── Identidade do vendedor ── */}
            <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20,animation:'fadeUp 0.4s ease'}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'rgba(240,180,41,0.15)',border:'2px solid rgba(240,180,41,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',fontWeight:800,color:'#f0b429',flexShrink:0}}>
                {consultorId?consultor?.nome?.[0]:'🌐'}
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:'1.25rem',color:'#e8eaf0'}}>
                  {consultorId?consultor?.nome:gestorFiltro==='Geral'?'Visão Geral — Todas as Equipes':`Equipe ${gestorFiltro}`}
                </div>
                <div style={{color:'#4b5563',fontSize:'0.8rem',marginTop:2}}>
                  {consultorId?`${consultor?.equipe||consultor?.setor||'—'} · ${consultor?.gestor||'—'}`:`${consultoresDaVisao.length} vendedores · ${kpis.empresas} empresas`}
                </div>
              </div>
            </div>

            {/* ── KPIs ── */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:12,marginBottom:16,animation:'fadeUp 0.5s ease'}}>
              <KPI label="Empresas" val={kpis.empresas} sub={`${kpis.comMov} movimentando`}/>
              <KPI label="Mov. Real Acumulada" val={fmtK(kpis.totalMovReal)} sub={`${mesesDisp.length} meses`} cor="#f0b429" destaque/>
              <KPI label="Valor Apurado Meta" val={fmtK(apurado)} sub={`${kpis.naMeta} empresas na meta`} cor={COR.ok} destaque/>
              <KPI label="Meta Mensal" val={kpis.meta>0?fmtK(kpis.meta):'—'} sub="total da equipe"/>
              <KPI label="% Meta Atingida" val={kpis.meta>0?fmtPct(pctApurado):'—'} sub="apurado / meta" cor={corAp} destaque/>
              <KPI label="↑ Crescendo" val={kpis.crescendo} sub="empresas em alta" cor={COR.blue}/>
            </div>

            {/* ── Barras de progresso ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16,animation:'fadeUp 0.55s ease'}}>
              {/* Mov Real vs Esperada */}
              <div style={s.barCard}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <span style={{fontWeight:600,fontSize:'0.82rem',color:'#9ca3af'}}>📊 Mov. Real vs Esperada</span>
                  <span style={{fontWeight:700,color:corPct(pctMov),fontSize:'0.82rem'}}>{fmtPct(pctMov)}</span>
                </div>
                <div style={{background:'rgba(255,255,255,0.06)',borderRadius:6,height:10,overflow:'hidden',marginBottom:8}}>
                  <div style={{height:'100%',width:`${Math.min(pctMov,100)}%`,background:`linear-gradient(90deg,${corPct(pctMov)},${corPct(pctMov)}bb)`,borderRadius:6,transition:'width 0.8s'}}/>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:'#4b5563'}}>
                  <span style={{color:corPct(pctMov),fontWeight:600}}>{fmt(kpis.totalMovReal)} realizados</span>
                  <span>esperado: {fmt(kpis.totalEsperado)}</span>
                </div>
              </div>

              {/* Apurado vs Meta */}
              {kpis.meta>0?(
                <div style={{...s.barCard,borderColor:`${corAp}30`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontWeight:600,fontSize:'0.82rem',color:'#9ca3af'}}>🎯 Apurado na Meta</span>
                    <span style={{background:`${corAp}15`,color:corAp,border:`1px solid ${corAp}30`,borderRadius:5,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700}}>
                      {pctApurado>=100?'✅ Meta atingida':pctApurado>=70?'⚡ Quase lá':'⚠️ Abaixo'}
                    </span>
                  </div>
                  <div style={{background:'rgba(255,255,255,0.06)',borderRadius:6,height:10,overflow:'hidden',marginBottom:8}}>
                    <div style={{height:'100%',width:`${Math.min(pctApurado,100)}%`,background:`linear-gradient(90deg,${corAp},${corAp}bb)`,borderRadius:6,transition:'width 0.8s'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:'#4b5563'}}>
                    <span style={{color:corAp,fontWeight:700}}>{fmt(apurado)} · {fmtPct(pctApurado)}</span>
                    <span>meta: {fmt(kpis.meta)}/mês</span>
                  </div>
                  <div style={{marginTop:6,fontSize:'0.65rem',color:'#374151'}}>
                    Benefícios/Bônus: 1ª recarga · Convênio/Mobilidade: 3º mês
                  </div>
                </div>
              ):(
                <div style={{...s.barCard,display:'flex',alignItems:'center',justifyContent:'center',color:'#4b5563',fontSize:'0.82rem'}}>
                  🎯 Meta não cadastrada para este vendedor
                </div>
              )}
            </div>

            {/* ── Abas ── */}
            <div style={s.tabs}>
              {ABAS.map(a=>(
                <button key={a.key} style={{...s.tab,...(aba===a.key?s.tabAtiva:{})}} onClick={()=>setAba(a.key)}>{a.label}</button>
              ))}
            </div>

            {/* ══════════════ ABA: RESUMO ══════════════ */}
            {aba==='resumo'&&(
              <div style={{...s.card,animation:'fadeUp 0.3s ease'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:8}}>
                  <div style={s.cardTitle}>📈 Evolução da Movimentação por Mês</div>
                  <Legenda/>
                </div>
                {mesesDisp.length===0?(
                  <div style={s.semDados}>Nenhuma liberação importada</div>
                ):(
                  <>
                    <GraficoBarras dados={porMes} altura={160}/>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginTop:20}}>
                      {porMes.map(m=>{
                        const pctM=m.esperado>0?(m.mov/m.esperado)*100:0;
                        const corM=corPct(pctM);
                        return(
                          <div key={m.mes} style={{background:'rgba(255,255,255,0.03)',border:`1px solid rgba(255,255,255,0.07)`,borderRadius:12,padding:'14px 18px',cursor:'pointer',transition:'all 0.15s'}}
                            onClick={()=>setMesSelecionado(mesSelecionado===m.mes?'':m.mes)}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                              <span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:6,padding:'3px 10px',fontSize:'0.78rem',fontWeight:700}}>{fmtMes(m.mes+'-01')}</span>
                              <span style={{color:corM,fontWeight:700,fontSize:'0.82rem'}}>{fmtPct(pctM)}</span>
                            </div>
                            <div style={{fontSize:'1.2rem',fontWeight:800,color:'#f0b429',marginBottom:4}}>{fmt(m.mov)}</div>
                            <div style={{color:'#6b7280',fontSize:'0.72rem',marginBottom:8}}>{m.empresas} empresas · esperado: {fmt(m.esperado)}</div>
                            {m.meta>0&&<div style={{background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.2)',borderRadius:6,padding:'4px 10px',fontSize:'0.72rem',color:'#34d399',fontWeight:600}}>
                              🎯 Meta considerada: {fmt(m.meta)}
                            </div>}
                            <Barra pct={pctM} cor={corM}/>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══════════════ ABA: ANÁLISE MENSAL ══════════════ */}
            {aba==='analise'&&(
              <div style={{display:'flex',flexDirection:'column',gap:16,animation:'fadeUp 0.3s ease'}}>
                {(()=>{
                  // ── Dados consolidados ou do mês selecionado ──────────────────────────
                  const isTodos = !mesSelecionado;

                  const mesesCad = [...new Set(dados.lista.map(e => e.data_cadastro?.substring(0,7)).filter(Boolean))].sort().reverse();

                  // Lista base: todas as empresas (não só as que movimentaram)
                  let listaBase = dados.lista;
                  if (filtroMesCad !== 'todos') listaBase = listaBase.filter(e => e.data_cadastro?.substring(0,7) === filtroMesCad);

                  // Função para obter movimentação de uma empresa num período
                  function movEmpresa(e) {
                    if (isTodos) return e.totalMov || 0;
                    return e.movPorMes?.[mesSelecionado] || 0;
                  }

                  // KPIs do período
                  const totalMov    = listaBase.reduce((s,e) => s + movEmpresa(e), 0);
                  const totalEsp    = listaBase.reduce((s,e) => s + (e.esperadoMes||0), 0);
                  const comMov      = listaBase.filter(e => movEmpresa(e) > 0).length;
                  const semMov      = listaBase.filter(e => movEmpresa(e) === 0).length;
                  const metaLista   = isTodos
                    ? listaBase.filter(e => e.metaComp)
                    : listaBase.filter(e => e.metaComp?.substring(0,7) === mesSelecionado);
                  const totalMeta   = metaLista.reduce((s,e) => s + (e.valorMeta||0), 0);
                  const pctReal     = totalEsp > 0 ? (totalMov / totalEsp) * 100 : 0;

                  // Ordena: com movimentação primeiro, depois por valor desc
                  const listaOrdenada = [...listaBase].sort((a,b) => {
                    const mA = movEmpresa(a), mB = movEmpresa(b);
                    if (mA > 0 && mB === 0) return -1;
                    if (mA === 0 && mB > 0) return 1;
                    return mB - mA;
                  });

                  const labelPeriodo = isTodos ? 'Todos os meses' : fmtMes(mesSelecionado+'-01');

                  return (
                    <>
                      {/* Filtro por mês de cadastro */}
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',background:'rgba(96,165,250,0.05)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:10,padding:'10px 14px'}}>
                        <span style={{color:'#60a5fa',fontSize:'0.75rem',fontWeight:700,whiteSpace:'nowrap'}}>📅 Cadastro em:</span>
                        <select value={filtroMesCad} onChange={ev=>setFiltroMesCad(ev.target.value)}
                          style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(96,165,250,0.3)',borderRadius:7,padding:'5px 10px',color:'#60a5fa',fontSize:'0.78rem',fontFamily:'inherit',cursor:'pointer'}}>
                          <option value="todos">Todos os meses</option>
                          {mesesCad.map(m=>{
                            const qtd=dados.lista.filter(e=>e.data_cadastro?.substring(0,7)===m).length;
                            return <option key={m} value={m}>{fmtMes(m+'-01')} ({qtd} emp.)</option>;
                          })}
                        </select>
                        {filtroMesCad!=='todos'&&(
                          <span style={{color:'#60a5fa',fontSize:'0.75rem'}}>
                            → <strong>{listaBase.length}</strong> empresas cadastradas em {fmtMes(filtroMesCad+'-01')}
                          </span>
                        )}
                      </div>

                      {/* KPIs do período */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}}>
                        <KPI label={`Movimentação`} val={fmt(totalMov)} sub={`${comMov} empresas · ${labelPeriodo}`} cor="#f0b429" destaque/>
                        <KPI label="Esperado" val={fmt(totalEsp)} sub="potencial × peso/mês"/>
                        <KPI label="% Realizado" val={fmtPct(pctReal)} sub="mov / esperado" cor={corPct(pctReal)} destaque/>
                        <KPI label="🎯 Meta Considerada" val={totalMeta>0?fmt(totalMeta):'—'} sub={`${metaLista.length} empresa${metaLista.length!==1?'s':''}`} cor={COR.ok} destaque={totalMeta>0}/>
                        <KPI label="Sem Movimentação" val={semMov} sub={`${listaBase.length} total`} cor={COR.bad}/>
                        <KPI label="Taxa de Ativação" val={fmtPct(listaBase.length>0?(comMov/listaBase.length)*100:0)} sub={`${comMov} / ${listaBase.length}`}/>
                      </div>

                      {/* Tabela unificada — TODAS as empresas */}
                      <div style={s.card}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
                          <div style={s.cardTitle}>
                            📋 Empresas — {labelPeriodo}
                            <span style={{color:'#4b5563',fontSize:'0.78rem',fontWeight:400,marginLeft:8}}>
                              ({comMov} movimentaram · {semMov} sem movimentação)
                            </span>
                          </div>
                        </div>
                        <div style={{overflowX:'auto'}}>
                          <table style={s.table}>
                            <thead><tr>
                              {['Empresa','Data Cad.','Produto','Vendedor','Esperado/mês',isTodos?'Total Mov.':'Mov. '+fmtMes(mesSelecionado+'-01'),'VS Esperado','Meta (mês)'].map(h=>(
                                <th key={h} style={s.th}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {listaOrdenada.map((e,i)=>{
                                const movMes  = movEmpresa(e);
                                const esp     = e.esperadoMes || 0;
                                const pctAd   = esp > 0 ? (movMes/esp)*100 : 0;
                                const corAd   = corPct(pctAd);
                                const ehMeta  = isTodos
                                  ? !!e.metaComp
                                  : e.metaComp?.substring(0,7) === mesSelecionado;
                                const semMovimentacao = movMes === 0;
                                return (
                                  <tr key={e._key} style={{
                                    background: semMovimentacao
                                      ? (i%2===0?'rgba(248,113,113,0.03)':'rgba(248,113,113,0.01)')
                                      : (i%2===0?'rgba(255,255,255,0.02)':'transparent'),
                                    opacity: semMovimentacao ? 0.75 : 1,
                                  }}>
                                    <td style={s.td}>
                                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                                        {semMovimentacao && <span style={{color:'#f87171',fontSize:'0.65rem'}}>●</span>}
                                        <div>
                                          <a href={`/gestao/${e.id}`} target="_blank" style={{fontWeight:600,color:'#e8eaf0',textDecoration:'none'}}
                                            onMouseEnter={ev=>ev.currentTarget.style.color='#34d399'}
                                            onMouseLeave={ev=>ev.currentTarget.style.color='#e8eaf0'}>
                                            {e.nome}
                                          </a>
                                          <div style={{color:'#374151',fontSize:'0.65rem'}}>ID {e.produto_id}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{...s.td,color:'#60a5fa',fontSize:'0.72rem',whiteSpace:'nowrap'}}>
                                      {e.data_cadastro ? fmtMes(e.data_cadastro.substring(0,7)+'-01') : '—'}
                                    </td>
                                    <td style={{...s.td,color:'#a78bfa',fontSize:'0.78rem'}}>{e.produto}</td>
                                    <td style={{...s.td,fontSize:'0.78rem'}}>
                                      {e.vendedor}
                                      {e._pct<100&&<span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:4,padding:'1px 5px',fontSize:'0.6rem',fontWeight:700,marginLeft:3}}>{e._pct}%</span>}
                                    </td>
                                    <td style={{...s.td,color:'#a78bfa',textAlign:'right'}}>{fmt(esp)}</td>
                                    <td style={{...s.td,color: semMovimentacao?'#374151':'#f0b429',fontWeight: semMovimentacao?400:700,textAlign:'right'}}>
                                      {movMes > 0 ? fmt(movMes) : <span style={{color:'#374151'}}>—</span>}
                                    </td>
                                    <td style={s.td}>
                                      {movMes > 0 ? (
                                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                                          <div style={{background:'rgba(255,255,255,0.07)',borderRadius:3,height:5,width:40,overflow:'hidden'}}>
                                            <div style={{height:'100%',width:`${Math.min(pctAd,100)}%`,background:corAd}}/>
                                          </div>
                                          <span style={{color:corAd,fontWeight:600,fontSize:'0.72rem'}}>{fmtPct(pctAd)}</span>
                                        </div>
                                      ) : <span style={{color:'#374151',fontSize:'0.72rem'}}>sem mov.</span>}
                                    </td>
                                    <td style={s.td}>
                                      {ehMeta ? (
                                        <div>
                                          <span style={{background:'rgba(52,211,153,0.1)',color:'#34d399',border:'1px solid rgba(52,211,153,0.25)',borderRadius:5,padding:'2px 7px',fontSize:'0.68rem',fontWeight:700,whiteSpace:'nowrap'}}>
                                            ✅ {fmt(e.valorMeta)}
                                          </span>
                                          <div style={{color:'#374151',fontSize:'0.6rem',marginTop:2}}>
                                            {e.metaRegra==='beneficio'?'1ª recarga':e.metaRegra==='convenio'?'3º mês':'manual'}
                                          </div>
                                        </div>
                                      ) : <span style={{color:'#374151',fontSize:'0.72rem'}}>—</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{borderTop:'2px solid rgba(255,255,255,0.1)',background:'rgba(240,180,41,0.04)'}}>
                                <td colSpan={4} style={{...s.td,fontWeight:700,color:'#f0b429',fontSize:'0.8rem',paddingTop:12}}>
                                  TOTAL ({listaBase.length} empresas)
                                </td>
                                <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#a78bfa',paddingTop:12}}>{fmt(totalEsp)}</td>
                                <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#f0b429',paddingTop:12}}>{fmt(totalMov)}</td>
                                <td style={{...s.td,paddingTop:12}}>
                                  <span style={{color:corPct(pctReal),fontWeight:700,fontSize:'0.82rem'}}>{fmtPct(pctReal)}</span>
                                </td>
                                <td style={{...s.td,paddingTop:12}}>
                                  {totalMeta>0&&<span style={{color:'#34d399',fontWeight:700,fontSize:'0.78rem'}}>{fmt(totalMeta)}</span>}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
                  const mesData=porMes.find(m=>m.mes===mesSelecionado)||{mov:0,esperado:0,meta:0,empresas:0};
                  const empresasMes=dados.lista.filter(e=>(e.movPorMes[mesSelecionado]||0)>0).sort((a,b)=>b.movPorMes[mesSelecionado]-a.movPorMes[mesSelecionado]);
                  const semMovMes=dados.lista.filter(e=>(e.movPorMes[mesSelecionado]||0)===0);
                  const metaMes=dados.lista.filter(e=>e.metaComp?.substring(0,7)===mesSelecionado);
                  const pctMes=mesData.esperado>0?(mesData.mov/mesData.esperado)*100:0;

                  return(
                    <>
                      {/* KPIs do mês */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12}}>
                        <KPI label={`Movimentação ${fmtMes(mesSelecionado+'-01')}`} val={fmt(mesData.mov)} sub={`${mesData.empresas} empresas`} cor="#f0b429" destaque/>
                        <KPI label="Esperado" val={fmt(mesData.esperado)} sub="potencial × peso"/>
                        <KPI label="% Realizado" val={fmtPct(pctMes)} sub="mov / esperado" cor={corPct(pctMes)} destaque/>
                        <KPI label="🎯 Meta Considerada" val={mesData.meta>0?fmt(mesData.meta):'—'} sub={`${metaMes.length} empresa${metaMes.length!==1?'s':''}`} cor={COR.ok} destaque={mesData.meta>0}/>
                        <KPI label="Sem Movimentação" val={semMovMes.length} sub="empresas paradas" cor={COR.bad}/>
                        <KPI label="Taxa de Ativação" val={fmtPct(dados.lista.length>0?(empresasMes.length/dados.lista.length)*100:0)} sub={`${empresasMes.length} / ${dados.lista.length}`}/>
                      </div>

                      {/* Empresas que movimentaram no mês */}
                      <div style={s.card}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                          <div style={s.cardTitle}>✅ Movimentaram em {fmtMes(mesSelecionado+'-01')} ({empresasMes.length})</div>
                        </div>
                        {empresasMes.length===0?<div style={s.semDados}>Nenhuma empresa movimentou neste mês</div>:(
                          <div style={{overflowX:'auto'}}>
                            <table style={s.table}>
                              <thead><tr>
                                {['Empresa','Produto','Vendedor','Movimentação','vs Esperado','Meta (mês)'].map(h=><th key={h} style={s.th}>{h}</th>)}
                              </tr></thead>
                              <tbody>
                                {empresasMes.map((e,i)=>{
                                  const movMes=e.movPorMes[mesSelecionado]||0;
                                  const pctAd=e.esperadoMes>0?(movMes/e.esperadoMes)*100:0;
                                  const corAd=corPct(pctAd);
                                  const ehMetaMes=e.metaComp?.substring(0,7)===mesSelecionado;
                                  return(
                                    <tr key={e._key} className="row-hover" style={{background:i%2===0?'rgba(255,255,255,0.02)':'transparent'}}>
                                      <td style={s.td}>
                                        <a href={`/gestao/${e.id}`} style={{fontWeight:600,color:'#e8eaf0',textDecoration:'none'}}
                                          onMouseEnter={ev=>ev.currentTarget.style.color='#34d399'}
                                          onMouseLeave={ev=>ev.currentTarget.style.color='#e8eaf0'}>
                                          {e.nome}
                                        </a>
                                        <div style={{color:'#374151',fontSize:'0.68rem'}}>ID {e.produto_id}</div>
                                      </td>
                                      <td style={{...s.td,color:'#a78bfa',fontSize:'0.78rem'}}>{e.produto}</td>
                                      <td style={{...s.td,fontSize:'0.78rem'}}>
                                        {e.vendedor}
                                        {e._pct<100&&<span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:4,padding:'1px 6px',fontSize:'0.62rem',fontWeight:700,marginLeft:4}}>{e._pct}%</span>}
                                      </td>
                                      <td style={{...s.td,color:'#f0b429',fontWeight:700}}>{fmt(movMes)}</td>
                                      <td style={s.td}>
                                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                                          <div style={{background:'rgba(255,255,255,0.07)',borderRadius:3,height:5,width:50,overflow:'hidden'}}>
                                            <div style={{height:'100%',width:`${Math.min(pctAd,100)}%`,background:corAd}}/>
                                          </div>
                                          <span style={{color:corAd,fontWeight:600,fontSize:'0.75rem'}}>{fmtPct(pctAd)}</span>
                                        </div>
                                      </td>
                                      <td style={s.td}>
                                        {ehMetaMes?(
                                          <div>
                                            <span style={{background:'rgba(52,211,153,0.1)',color:'#34d399',border:'1px solid rgba(52,211,153,0.25)',borderRadius:5,padding:'2px 8px',fontSize:'0.72rem',fontWeight:700}}>
                                              ✅ {fmt(e.valorMeta)}
                                            </span>
                                            <div style={{color:'#374151',fontSize:'0.62rem',marginTop:2}}>
                                              {e.metaRegra==='beneficio'?'1ª recarga':'3º mês'}
                                            </div>
                                          </div>
                                        ):<span style={{color:'#374151',fontSize:'0.75rem'}}>—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Sem movimentação no mês */}
                      {semMovMes.length>0&&(
                        <div style={s.card}>
                          <div style={{...s.cardTitle,marginBottom:16,color:'#f87171'}}>❌ Sem Movimentação em {fmtMes(mesSelecionado+'-01')} ({semMovMes.length})</div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:8}}>
                            {semMovMes.slice(0,12).map(e=>(
                              <a key={e._key} href={`/gestao/${e.id}`} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(248,113,113,0.04)',border:'1px solid rgba(248,113,113,0.1)',borderRadius:8,padding:'10px 14px',textDecoration:'none',transition:'all 0.15s'}}
                                onMouseEnter={ev=>ev.currentTarget.style.background='rgba(248,113,113,0.08)'}
                                onMouseLeave={ev=>ev.currentTarget.style.background='rgba(248,113,113,0.04)'}>
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:600,fontSize:'0.82rem',color:'#e8eaf0'}}>{e.nome}</div>
                                  <div style={{color:'#4b5563',fontSize:'0.68rem',marginTop:2}}>{e.produto} · {e.vendedor}</div>
                                </div>
                                <span style={{color:'#f87171',fontSize:'0.75rem',fontWeight:700}}>→</span>
                              </a>
                            ))}
                            {semMovMes.length>12&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',color:'#4b5563',fontSize:'0.78rem',background:'rgba(255,255,255,0.02)',borderRadius:8,padding:10}}>+ {semMovMes.length-12} empresas</div>}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ══════════════ ABA: CARTEIRA ══════════════ */}
            {aba==='carteira'&&(
              <div style={{display:'flex',flexDirection:'column',gap:16,animation:'fadeUp 0.3s ease'}}>

                {/* Carteira por ano */}
                <div style={s.card}>
                  <div style={{...s.cardTitle,marginBottom:16}}>📅 Carteira por Ano de Cadastro</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:20}}>
                    {Object.entries(carteiraPorAno).sort((a,b)=>String(b[0]).localeCompare(String(a[0]))).map(([ano,data])=>{
                      const pctAtiv=data.empresas.length>0?(data.comMov/data.empresas.length)*100:0;
                      return(
                        <div key={ano} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'16px 18px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                            <span style={{background:'rgba(96,165,250,0.12)',color:'#60a5fa',borderRadius:6,padding:'3px 10px',fontSize:'0.78rem',fontWeight:700}}>{ano}</span>
                            <span style={{color:'#6b7280',fontSize:'0.75rem'}}>{data.empresas.length} empresas</span>
                          </div>
                          <div style={{fontSize:'1.1rem',fontWeight:700,color:'#f0b429',marginBottom:4}}>{fmt(data.totalMov)}</div>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:'#4b5563',marginBottom:8}}>
                            <span style={{color:'#16a34a'}}>{data.comMov} movimentando</span>
                            {data.naMeta>0&&<span style={{color:'#34d399'}}>🎯 {data.naMeta} na meta</span>}
                          </div>
                          <Barra pct={pctAtiv} cor={corPct(pctAtiv)}/>
                          <div style={{color:'#374151',fontSize:'0.68rem',marginTop:4}}>{fmtPct(pctAtiv)} de ativação</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div style={s.card}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
                    <div style={s.cardTitle}>📋 Todas as Empresas ({listaFiltrada.length})</div>
                    <span style={{color:'#4b5563',fontSize:'0.72rem'}}>pág {paginaCarteira}/{paginasCarteira||1}</span>
                  </div>
                  <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                    <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e=>setBusca(e.target.value)}/>
                    <select style={s.sel} value={filtroProduto} onChange={e=>setFiltroProduto(e.target.value)}>
                      <option value="">Todos os produtos</option>
                      {[...new Set(dados.lista.map(e=>e.produto_contratado).filter(Boolean))].sort().map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                    <select style={s.sel} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
                      <option value="">Todos os status</option>
                      <option value="acima do esperado">✅ Acima</option>
                      <option value="dentro do esperado">⚡ Dentro</option>
                      <option value="abaixo do esperado">⚠️ Abaixo</option>
                      <option value="sem movimentação">❌ Sem mov.</option>
                    </select>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={s.table}>
                      <thead><tr style={{background:'rgba(255,255,255,0.02)'}}>
                        {['Empresa','Produto','Ano','Vendedor',
                          ...(mesesDisp.map(m=>fmtMes(m+'-01'))),
                          'Média/mês','% Adere','Meta','Status'].map(h=><th key={h} style={s.th}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {listaPage.map((e,i)=>{
                          const corSit=e.situacao==='acima do esperado'?COR.ok:e.situacao==='dentro do esperado'?COR.warn:e.situacao==='abaixo do esperado'?COR.bad:COR.neutral;
                          return(
                            <tr key={e._key} className="row-hover" style={{background:i%2===0?'rgba(255,255,255,0.015)':'transparent'}}>
                              <td style={s.td}>
                                <a href={`/gestao/${e.id}`} style={{fontWeight:600,color:'#e8eaf0',textDecoration:'none',fontSize:'0.82rem'}}
                                  onMouseEnter={ev=>ev.currentTarget.style.color='#34d399'}
                                  onMouseLeave={ev=>ev.currentTarget.style.color='#e8eaf0'}>
                                  {e.nome}
                                </a>
                                <div style={{color:'#374151',fontSize:'0.65rem'}}>ID {e.produto_id}</div>
                              </td>
                              <td style={{...s.td,color:'#a78bfa',fontSize:'0.72rem',whiteSpace:'nowrap'}}>{e.produto}</td>
                              <td style={{...s.td,color:'#60a5fa',fontSize:'0.72rem',textAlign:'center'}}>{e.anoCadastro||'—'}</td>
                              <td style={{...s.td,fontSize:'0.75rem'}}>
                                {e.vendedor}
                                {e._pct<100&&<span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:4,padding:'1px 5px',fontSize:'0.6rem',fontWeight:700,marginLeft:4}}>{e._pct}%</span>}
                              </td>
                              {mesesDisp.map(m=>{
                                const v=e.movPorMes[m]||0;
                                const isMetaMes=e.metaComp?.substring(0,7)===m;
                                return(
                                  <td key={m} style={{...s.td,textAlign:'right',background:isMetaMes?'rgba(52,211,153,0.06)':undefined}}>
                                    {v>0?<span style={{color:isMetaMes?'#34d399':'#f0b429',fontWeight:500,fontSize:'0.78rem'}}>{fmt(v)}{isMetaMes?' ✅':''}</span>:<span style={{color:'#1f2937'}}>—</span>}
                                  </td>
                                );
                              })}
                              <td style={{...s.td,textAlign:'right',color:'#f0b429',fontWeight:700,fontSize:'0.78rem'}}>{e.mediaMovMes>0?fmt(e.mediaMovMes):'—'}</td>
                              <td style={s.td}>
                                <div style={{display:'flex',alignItems:'center',gap:5}}>
                                  <div style={{background:'rgba(255,255,255,0.07)',borderRadius:3,height:4,width:40,overflow:'hidden'}}>
                                    <div style={{height:'100%',width:`${Math.min(e.aderencia,100)}%`,background:corSit}}/>
                                  </div>
                                  <span style={{color:corSit,fontWeight:600,fontSize:'0.72rem'}}>{fmtPct(e.aderencia)}</span>
                                </div>
                              </td>
                              <td style={{...s.td,textAlign:'right'}}>
                                {e.valorMeta>0?(
                                  <div>
                                    <div style={{color:'#34d399',fontWeight:700,fontSize:'0.78rem'}}>{fmt(e.valorMeta)}</div>
                                    <div style={{color:'#374151',fontSize:'0.62rem'}}>{e.metaRegra==='beneficio'?'1ª rec.':'3º mês'} · {fmtMes(e.metaComp)}</div>
                                  </div>
                                ):<span style={{color:'#1f2937',fontSize:'0.72rem'}}>—</span>}
                              </td>
                              <td style={s.td}>
                                <span style={{background:`${corSit}15`,color:corSit,borderRadius:5,padding:'2px 7px',fontSize:'0.65rem',fontWeight:600,whiteSpace:'nowrap'}}>{e.situacao}</span>
                              </td>
                            </tr>
                          );
                        })}
                        {listaPage.length===0&&<tr><td colSpan={8+mesesDisp.length} style={{...s.td,textAlign:'center',color:'#4b5563',padding:32}}>Nenhuma empresa encontrada</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {/* Paginação */}
                  {paginasCarteira>1&&(
                    <div style={{display:'flex',justifyContent:'center',gap:6,marginTop:16,flexWrap:'wrap'}}>
                      <button style={s.pagBtn} disabled={paginaCarteira===1} onClick={()=>setPaginaCarteira(p=>p-1)}>‹</button>
                      {Array.from({length:Math.min(paginasCarteira,7)},(_,i)=>i+1).map(p=>(
                        <button key={p} style={{...s.pagBtn,...(p===paginaCarteira?{background:'rgba(240,180,41,0.2)',borderColor:'rgba(240,180,41,0.4)',color:'#f0b429',fontWeight:700}:{})}}
                          onClick={()=>setPaginaCarteira(p)}>{p}</button>
                      ))}
                      {paginasCarteira>7&&<span style={{color:'#4b5563',padding:'5px 8px'}}>…{paginasCarteira}</span>}
                      <button style={s.pagBtn} disabled={paginaCarteira===paginasCarteira} onClick={()=>setPaginaCarteira(p=>p+1)}>›</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════ ABA: PRODUTOS ══════════════ */}
            {aba==='produtos'&&(
              <div style={{...s.card,animation:'fadeUp 0.3s ease'}}>
                <div style={{...s.cardTitle,marginBottom:20}}>🎯 Resultado por Produto</div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {porProduto.map(p=>{
                    const pctAd=p.esperado>0?(p.movReal/p.esperado)*100:0;
                    const cor=corPct(pctAd);
                    return(
                      <div key={p.nome} style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 20px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,flexWrap:'wrap',gap:8}}>
                          <div>
                            <span style={{fontWeight:700,fontSize:'0.92rem'}}>{p.nome}</span>
                            <span style={{marginLeft:10,color:'#6b7280',fontSize:'0.75rem'}}>{p.contratos} empresa{p.contratos>1?'s':''}</span>
                          </div>
                          {p.naMeta>0&&<span style={{background:'rgba(52,211,153,0.1)',color:'#34d399',border:'1px solid rgba(52,211,153,0.25)',borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>
                            🎯 {p.naMeta} na meta · {fmt(p.totalMeta)}
                          </span>}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12}}>
                          {[
                            {label:'Mov. Esperada/mês',val:fmt(p.esperado),cor:'#a78bfa'},
                            {label:'Mov. Real Média',  val:p.movReal>0?fmt(p.movReal):'—',cor:'#f0b429'},
                            {label:'% Aderência',      val:fmtPct(pctAd),cor},
                          ].map(k=>(
                            <div key={k.label}>
                              <div style={{color:'#6b7280',fontSize:'0.65rem',textTransform:'uppercase',marginBottom:4}}>{k.label}</div>
                              <div style={{fontWeight:700,color:k.cor,fontSize:'0.95rem'}}>{k.val}</div>
                            </div>
                          ))}
                        </div>
                        <Barra pct={pctAd} cor={cor}/>
                      </div>
                    );
                  })}
                  {porProduto.length===0&&<div style={s.semDados}>Nenhum dado disponível</div>}
                </div>
              </div>
            )}

            {/* ══════════════ ABA: RANKING ══════════════ */}
            {aba==='ranking'&&(
              <div style={{...s.card,animation:'fadeUp 0.3s ease'}}>
                <div style={{...s.cardTitle,marginBottom:20}}>🏆 Ranking de Vendedores</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {ranking.map((c,i)=>{
                    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`;
                    const corM=i===0?'#f0b429':i===1?'#9ca3af':i===2?'#cd7c2f':'#4b5563';
                    const pctAd=c.esperado>0?(c.movReal/c.esperado)*100:0;
                    const cor=corPct(pctAd);
                    const isAtu=c.id===consultorId;
                    const maxMov=Math.max(...ranking.map(x=>x.movReal),1);
                    const pctAtivacao=c.empresas>0?(c.comMov/c.empresas)*100:0;
                    return(
                      <div key={c.id} style={{borderRadius:10,overflow:'hidden',background:isAtu?'rgba(240,180,41,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${isAtu?'rgba(240,180,41,0.25)':'rgba(255,255,255,0.07)'}`}}>
                        <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',flexWrap:'wrap',gap:10}}>
                          <span style={{fontWeight:800,fontSize:'1.1rem',color:corM,minWidth:36,textAlign:'center'}}>{medal}</span>
                          <div style={{flex:1,minWidth:160}}>
                            <div style={{fontWeight:700,fontSize:'0.9rem',color:isAtu?'#f0b429':'#e8eaf0',display:'flex',alignItems:'center',gap:8}}>
                              {c.nome}
                              {isAtu&&<span style={{background:'rgba(240,180,41,0.2)',color:'#f0b429',borderRadius:5,padding:'1px 7px',fontSize:'0.65rem',fontWeight:700}}>você</span>}
                            </div>
                            <div style={{fontSize:'0.72rem',color:'#4b5563',marginTop:2}}>
                              {c.empresas} empresas · {fmtPct(pctAtivacao)} ativação · gestor: {c.gestor}
                            </div>
                          </div>
                          {/* Métricas em linha */}
                          <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontWeight:700,color:'#f0b429',fontSize:'0.88rem'}}>{fmt(c.movReal)}</div>
                              <div style={{color:'#4b5563',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Mov. Média</div>
                            </div>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontWeight:700,color:cor,fontSize:'0.88rem'}}>{fmtPct(pctAd)}</div>
                              <div style={{color:'#4b5563',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>% Esperado</div>
                            </div>
                            {c.valorMeta>0&&(
                              <div style={{textAlign:'center'}}>
                                <div style={{fontWeight:700,color:'#34d399',fontSize:'0.88rem'}}>{fmt(c.valorMeta)}</div>
                                <div style={{color:'#4b5563',fontSize:'0.62rem',textTransform:'uppercase',letterSpacing:0.5}}>Meta ({c.naMeta})</div>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Barra de progresso relativa ao 1º colocado */}
                        <div style={{height:3,background:'rgba(255,255,255,0.04)'}}>
                          <div style={{height:'100%',width:`${(c.movReal/maxMov)*100}%`,background:isAtu?'#f0b429':i<3?COR.ok:'rgba(255,255,255,0.15)',transition:'width 0.6s'}}/>
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
  page:        {maxWidth:1400,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:      {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20},
  tag:         {color:'#f0b429',fontWeight:800,fontSize:'0.8rem',letterSpacing:2,marginBottom:8,textTransform:'uppercase'},
  title:       {fontSize:'1.6rem',fontWeight:800,margin:'0 0 6px',color:'#e8eaf0'},
  sub:         {color:'#4b5563',fontSize:'0.85rem'},
  filtrosCard: {background:'#111827',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'16px 20px',marginBottom:20,display:'flex',gap:24,flexWrap:'wrap',alignItems:'flex-end'},
  filtroGrupo: {display:'flex',flexDirection:'column',gap:6},
  filtroLabel: {color:'#4b5563',fontSize:'0.65rem',letterSpacing:2,textTransform:'uppercase',fontWeight:600},
  gestorBtn:   {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'6px 14px',color:'#6b7280',cursor:'pointer',fontSize:'0.8rem',fontWeight:500,fontFamily:'inherit',transition:'all 0.15s'},
  gestorBtnAtivo:{background:'rgba(240,180,41,0.12)',border:'1px solid rgba(240,180,41,0.35)',color:'#f0b429',fontWeight:700},
  select:      {background:'#111827',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 14px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',cursor:'pointer',minWidth:220},
  card:        {background:'#111827',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:24,marginBottom:0},
  barCard:     {background:'#111827',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'16px 20px'},
  cardTitle:   {fontSize:'0.85rem',fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:0.5},
  tabs:        {display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'},
  tab:         {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'8px 16px',color:'#6b7280',cursor:'pointer',fontSize:'0.85rem',fontWeight:500,fontFamily:'inherit',transition:'all 0.15s'},
  tabAtiva:    {background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.3)',color:'#f0b429',fontWeight:700},
  table:       {width:'100%',borderCollapse:'collapse',fontSize:'0.78rem'},
  th:          {padding:'8px 12px',textAlign:'left',color:'#4b5563',fontWeight:600,borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.65rem',letterSpacing:0.5},
  td:          {padding:'9px 12px',borderBottom:'1px solid rgba(255,255,255,0.03)',whiteSpace:'nowrap'},
  busca:       {flex:'1 1 200px',background:'#1a1f2e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 12px',color:'#e8eaf0',fontSize:'0.82rem',fontFamily:'inherit',outline:'none'},
  sel:         {background:'#1a1f2e',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 12px',color:'#e8eaf0',fontSize:'0.82rem',fontFamily:'inherit',cursor:'pointer',outline:'none'},
  semDados:    {color:'#4b5563',fontSize:'0.85rem',textAlign:'center',padding:'32px 0'},
  pagBtn:      {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,padding:'5px 10px',color:'#9ca3af',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit',minWidth:32},
  spin:        {width:36,height:36,border:'3px solid rgba(255,255,255,0.08)',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto',animation:'spin 0.8s linear infinite'},
};
