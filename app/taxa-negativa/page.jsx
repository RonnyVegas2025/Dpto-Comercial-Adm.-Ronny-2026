'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct = (v) => `${Number(v||0).toFixed(2)}%`;
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=d.split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };
const norm   = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

export default function TaxaNegativa() {
  const [loading,  setLoading]  = useState(true);
  const [movs,     setMovs]     = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [meses,    setMeses]    = useState([]);
  const [busca,    setBusca]    = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos'); // todos | usou | nao_usou
  const [aba,      setAba]      = useState('evolucao');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: mv }, { data: emps }] = await Promise.all([
      supabase.from('taxa_negativa_mov')
        .select('produto_id, empresa_nome, competencia, valor_movimentado, desconto_disponivel, desconto_utilizado')
        .order('competencia'),
      supabase.from('empresas')
        .select('produto_id, nome, taxa_negativa, consultor_principal:consultor_principal_id(nome, gestor)')
        .ilike('produto_contratado', '%desconto condicional%')
        .eq('ativo', true),
    ]);
    setMovs(mv || []);
    setEmpresas(emps || []);
    setMeses([...new Set((mv||[]).map(m => m.competencia))].sort());
    setLoading(false);
  }

  // Mapa: produto_id__competencia → dados
  const movMap = useMemo(() => {
    const m = {};
    for (const mv of movs) {
      m[`${mv.produto_id}__${mv.competencia}`] = mv;
    }
    return m;
  }, [movs]);

  // Lista enriquecida
  const lista = useMemo(() => {
    return empresas.map(e => {
      const vals = meses.map(m => movMap[`${e.produto_id}__${m}`]);
      const totalMov       = vals.reduce((s,v) => s+(v?.valor_movimentado||0), 0);
      const totalDisp      = vals.reduce((s,v) => s+(v?.desconto_disponivel||0), 0);
      const totalUtilizado = vals.reduce((s,v) => s+(v?.desconto_utilizado||0), 0);
      const mesesComMov    = vals.filter(v => (v?.valor_movimentado||0) > 0).length;
      const usouAlgo       = totalUtilizado > 0;
      const pctUtilizacao  = totalDisp > 0 ? (totalUtilizado/totalDisp)*100 : 0;

      // Tendência: crescendo, estável, sem uso
      let tendencia = 'sem_uso';
      if (mesesComMov >= 2) {
        const ultimo     = vals[vals.length-1]?.valor_movimentado || 0;
        const penultimo  = vals[vals.length-2]?.valor_movimentado || 0;
        if (ultimo > penultimo * 1.05) tendencia = 'crescendo';
        else if (ultimo > 0) tendencia = 'estavel';
      } else if (mesesComMov === 1) tendencia = 'estavel';

      return {
        ...e,
        vals,
        totalMov,
        totalDisp,
        totalUtilizado,
        mesesComMov,
        usouAlgo,
        pctUtilizacao,
        tendencia,
        vendedor: e.consultor_principal?.nome || '—',
        gestor:   e.consultor_principal?.gestor || '—',
      };
    });
  }, [empresas, meses, movMap]);

  const filtrada = useMemo(() => {
    let arr = [...lista];
    if (busca.trim()) { const b = norm(busca); arr = arr.filter(e => norm(e.nome).includes(b) || String(e.produto_id).includes(b)); }
    if (filtroStatus === 'usou')    arr = arr.filter(e => e.usouAlgo);
    if (filtroStatus === 'nao_usou') arr = arr.filter(e => !e.usouAlgo && e.mesesComMov > 0);
    if (filtroStatus === 'sem_mov') arr = arr.filter(e => e.mesesComMov === 0);
    return arr;
  }, [lista, busca, filtroStatus]);

  // KPIs
  const kpis = useMemo(() => {
    const total         = lista.length;
    const movimentaram  = lista.filter(e => e.mesesComMov > 0).length;
    const semMov        = lista.filter(e => e.mesesComMov === 0).length;
    const totalMov      = lista.reduce((s,e) => s+e.totalMov, 0);
    const totalDisp     = lista.reduce((s,e) => s+e.totalDisp, 0);
    const totalUtil     = lista.reduce((s,e) => s+e.totalUtilizado, 0);
    const descNaoUsado  = totalDisp - totalUtil;
    return { total, movimentaram, semMov, totalMov, totalDisp, totalUtil, descNaoUsado };
  }, [lista]);

  if (loading) return (
    <div style={{...s.page,display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}>
      <div style={{textAlign:'center'}}><div style={s.spin}></div><div style={{color:'#6b7280'}}>Carregando...</div></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const TEND = {
    crescendo: { icon:'↑', label:'Crescendo', cor:'#34d399' },
    estavel:   { icon:'→', label:'Estável',   cor:'#f0b429' },
    sem_uso:   { icon:'—', label:'Sem uso',   cor:'#6b7280' },
  };

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} select option{background:#1e2435;color:#e8eaf0;}`}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={{color:'#f87171',fontWeight:800,fontSize:'0.9rem',letterSpacing:2,marginBottom:12,textTransform:'uppercase'}}>♠ Vegas Card</div>
          <h1 style={s.title}>Acompanhamento — Taxa Negativa</h1>
          <p style={s.sub}>Contratos Desconto Condicional — monitore o uso do desconto concedido</p>
        </div>
        <a href="/importar-taxa-negativa" style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:'10px 20px',color:'#f87171',textDecoration:'none',fontSize:'0.85rem',fontWeight:600}}>
          📉 Importar Taxa Negativa
        </a>
      </div>

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Contratos</span>
          <span style={s.kpiVal}>{kpis.total}</span>
          <span style={s.kpiSub}>{kpis.movimentaram} com movimentação</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(248,113,113,0.35)'}}>
          <span style={s.kpiLabel}>Total Movimentado</span>
          <span style={{...s.kpiVal,color:'#f87171'}}>{fmt(kpis.totalMov)}</span>
          <span style={s.kpiSub}>{meses.length} meses</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(251,191,36,0.35)'}}>
          <span style={s.kpiLabel}>Desconto Disponível</span>
          <span style={{...s.kpiVal,color:'#fbbf24'}}>{fmt(kpis.totalDisp)}</span>
          <span style={s.kpiSub}>mov × taxa negativa</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(52,211,153,0.35)'}}>
          <span style={s.kpiLabel}>Desconto Utilizado</span>
          <span style={{...s.kpiVal,color:'#34d399'}}>{fmt(kpis.totalUtil)}</span>
          <span style={s.kpiSub}>{kpis.totalDisp>0?fmtPct((kpis.totalUtil/kpis.totalDisp)*100):'0%'} do disponível</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(167,139,250,0.35)'}}>
          <span style={s.kpiLabel}>Desconto Não Usado</span>
          <span style={{...s.kpiVal,color:'#a78bfa'}}>{fmt(kpis.descNaoUsado)}</span>
          <span style={s.kpiSub}>oportunidade de renegociação</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(248,113,113,0.35)'}}>
          <span style={s.kpiLabel}>Sem Movimentação</span>
          <span style={{...s.kpiVal,color:'#f87171'}}>{kpis.semMov}</span>
          <span style={s.kpiSub}>não usaram o desconto</span>
        </div>
      </div>

      {/* Abas */}
      <div style={s.tabs}>
        {[
          {key:'evolucao', label:'📉 Evolução por Contrato'},
          {key:'resumo',   label:'🔢 Resumo por Mês'},
        ].map(a => (
          <button key={a.key} style={{...s.tab,...(aba===a.key?s.tabAtiva:{})}} onClick={()=>setAba(a.key)}>{a.label}</button>
        ))}
      </div>

      {/* ABA: EVOLUÇÃO */}
      {aba==='evolucao' && (
        <div style={s.card}>
          {/* Filtros */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16}}>
            <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e=>setBusca(e.target.value)} />
            <select style={s.sel} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}>
              <option value="todos">Todos os contratos</option>
              <option value="usou">✅ Usou o desconto</option>
              <option value="nao_usou">⚠️ Não usou (mas movimentou)</option>
              <option value="sem_mov">❌ Sem movimentação</option>
            </select>
          </div>

          <div style={{color:'#6b7280',fontSize:'0.78rem',marginBottom:12}}>
            <strong style={{color:'#e8eaf0'}}>{filtrada.length}</strong> contratos
          </div>

          <div style={{overflowX:'auto'}}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Empresa</th>
                <th style={s.th}>Vendedor</th>
                <th style={{...s.th,textAlign:'right'}}>Taxa Neg.</th>
                {meses.map(m => <th key={m} style={{...s.th,textAlign:'right'}}>{fmtMes(m)}</th>)}
                <th style={{...s.th,textAlign:'right'}}>Total Mov.</th>
                <th style={{...s.th,textAlign:'right'}}>Desc. Disp.</th>
                <th style={{...s.th,textAlign:'center'}}>Tendência</th>
              </tr></thead>
              <tbody>
                {filtrada.map((e,i) => {
                  const tend = TEND[e.tendencia];
                  return (
                    <tr key={e.produto_id} style={{background:i%2===0?'rgba(255,255,255,0.02)':'transparent'}}>
                      <td style={s.td}>
                        <div style={{fontWeight:600}}>{e.nome}</div>
                        <div style={{color:'#4b5563',fontSize:'0.7rem'}}>ID {e.produto_id}</div>
                      </td>
                      <td style={{...s.td,fontSize:'0.78rem'}}>{e.vendedor}</td>
                      <td style={{...s.td,textAlign:'right',color:'#f87171',fontWeight:600}}>
                        {fmtPct((e.taxa_negativa||0)*100)}
                      </td>
                      {meses.map(m => {
                        const mv = movMap[`${e.produto_id}__${m}`];
                        const v  = mv?.valor_movimentado || 0;
                        const d  = mv?.desconto_disponivel || 0;
                        return (
                          <td key={m} style={{...s.td,textAlign:'right'}}>
                            {v > 0 ? (
                              <div>
                                <div style={{color:'#fca5a5',fontWeight:500}}>{fmt(v)}</div>
                                <div style={{color:'#f87171',fontSize:'0.68rem'}}>desc: {fmt(d)}</div>
                              </div>
                            ) : <span style={{color:'#374151'}}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#fca5a5'}}>
                        {e.totalMov > 0 ? fmt(e.totalMov) : <span style={{color:'#374151'}}>—</span>}
                      </td>
                      <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#fbbf24'}}>
                        {e.totalDisp > 0 ? fmt(e.totalDisp) : <span style={{color:'#374151'}}>—</span>}
                      </td>
                      <td style={{...s.td,textAlign:'center'}}>
                        <span style={{background:`${tend.cor}15`,color:tend.cor,border:`1px solid ${tend.cor}30`,borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>
                          {tend.icon} {tend.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {/* Totais */}
                <tr style={{borderTop:'2px solid rgba(255,255,255,0.12)',background:'rgba(248,113,113,0.05)'}}>
                  <td colSpan={3} style={{...s.td,fontWeight:700,color:'#f87171',fontSize:'0.82rem',paddingTop:14}}>TOTAL ({filtrada.length} contratos)</td>
                  {meses.map(m => {
                    const t = filtrada.reduce((s,e)=>{
                      const mv = movMap[`${e.produto_id}__${m}`];
                      return s+(mv?.valor_movimentado||0);
                    },0);
                    return <td key={m} style={{...s.td,textAlign:'right',fontWeight:700,color:'#fca5a5',paddingTop:14}}>{t>0?fmt(t):'—'}</td>;
                  })}
                  <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#fca5a5',paddingTop:14}}>{fmt(filtrada.reduce((s,e)=>s+e.totalMov,0))}</td>
                  <td style={{...s.td,textAlign:'right',fontWeight:700,color:'#fbbf24',paddingTop:14}}>{fmt(filtrada.reduce((s,e)=>s+e.totalDisp,0))}</td>
                  <td style={s.td}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA: RESUMO POR MÊS */}
      {aba==='resumo' && (
        <div style={s.card}>
          <div style={{fontWeight:700,marginBottom:20}}>🔢 Resumo por Mês</div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
            {meses.map(m => {
              const totalMovMes  = movs.filter(mv=>mv.competencia===m).reduce((s,mv)=>s+mv.valor_movimentado,0);
              const totalDispMes = movs.filter(mv=>mv.competencia===m).reduce((s,mv)=>s+mv.desconto_disponivel,0);
              const totalUtilMes = movs.filter(mv=>mv.competencia===m).reduce((s,mv)=>s+mv.desconto_utilizado,0);
              const empresasMes  = movs.filter(mv=>mv.competencia===m&&mv.valor_movimentado>0).length;
              return (
                <div key={m} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'20px 24px',flex:'1 1 200px',minWidth:200}}>
                  <div style={{display:'inline-block',background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.3)',color:'#f87171',borderRadius:8,padding:'4px 12px',fontSize:'0.85rem',fontWeight:700,marginBottom:12}}>{fmtMes(m)}</div>
                  <div style={{fontSize:'1.3rem',fontWeight:700,color:'#fca5a5',marginBottom:4}}>{fmt(totalMovMes)}</div>
                  <div style={{color:'#9ca3af',fontSize:'0.8rem',marginBottom:8}}>{empresasMes} contratos movimentaram</div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem'}}>
                      <span style={{color:'#6b7280'}}>Desconto disponível</span>
                      <span style={{color:'#fbbf24',fontWeight:600}}>{fmt(totalDispMes)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem'}}>
                      <span style={{color:'#6b7280'}}>Desconto utilizado</span>
                      <span style={{color:'#34d399',fontWeight:600}}>{fmt(totalUtilMes)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem'}}>
                      <span style={{color:'#6b7280'}}>Não utilizado</span>
                      <span style={{color:'#a78bfa',fontWeight:600}}>{fmt(totalDispMes-totalUtilMes)}</span>
                    </div>
                  </div>
                  <div style={{background:'rgba(255,255,255,0.07)',borderRadius:4,height:6,overflow:'hidden',marginTop:12}}>
                    <div style={{background:'#f87171',height:'100%',width:`${kpis.totalMov>0?(totalMovMes/kpis.totalMov)*100:0}%`}}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page:     {maxWidth:1400,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:   {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:16},
  title:    {fontSize:'1.8rem',fontWeight:700,margin:'0 0 8px'},
  sub:      {color:'#6b7280',fontSize:'0.9rem'},
  kpis:     {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:14,marginBottom:20},
  kpi:      {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'18px 22px',display:'flex',flexDirection:'column',gap:4},
  kpiLabel: {color:'#6b7280',fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:1},
  kpiVal:   {fontSize:'1.4rem',fontWeight:700},
  kpiSub:   {color:'#4b5563',fontSize:'0.72rem'},
  tabs:     {display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'},
  tab:      {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'8px 16px',color:'#6b7280',cursor:'pointer',fontSize:'0.85rem',fontWeight:500,fontFamily:'inherit'},
  tabAtiva: {background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',color:'#f87171'},
  card:     {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:28,marginBottom:24},
  busca:    {flex:'1 1 220px',background:'#1e2435',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'9px 14px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',outline:'none'},
  sel:      {background:'#1e2435',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,padding:'9px 14px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',cursor:'pointer',outline:'none'},
  table:    {width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'},
  th:       {padding:'8px 12px',textAlign:'left',color:'#6b7280',fontWeight:500,borderBottom:'1px solid rgba(255,255,255,0.07)',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.7rem',letterSpacing:0.5},
  td:       {padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'},
  spin:     {width:40,height:40,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #f87171',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite'},
};

