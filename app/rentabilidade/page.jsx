'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => `${Number(v || 0).toFixed(2)}%`;
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`;
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const POR_PAGINA = 15;

function Paginacao({ pagina, total, onChange }) {
  if (total <= 1) return null;
  const start = Math.max(1, pagina-2), end = Math.min(total, pagina+2);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <button style={{ ...ps.btn, ...(pagina===1?ps.dis:{}) }} onClick={() => onChange(pagina-1)} disabled={pagina===1}>‹</button>
      {start>1 && <><button style={ps.btn} onClick={()=>onChange(1)}>1</button><span style={ps.dots}>…</span></>}
      {pages.map(p => <button key={p} style={{ ...ps.btn, ...(p===pagina?ps.ativo:{}) }} onClick={()=>onChange(p)}>{p}</button>)}
      {end<total && <><span style={ps.dots}>…</span><button style={ps.btn} onClick={()=>onChange(total)}>{total}</button></>}
      <button style={{ ...ps.btn, ...(pagina===total?ps.dis:{}) }} onClick={() => onChange(pagina+1)} disabled={pagina===total}>›</button>
      <span style={{ color:'#4b5563', fontSize:'0.75rem', marginLeft:4 }}>de {total}</span>
    </div>
  );
}

export default function Rentabilidade() {
  const [loading, setLoading]   = useState(true);
  const [spreads, setSpreads]   = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [libs,    setLibs]      = useState([]);
  const [meses,   setMeses]     = useState([]);
  const [aba,     setAba]       = useState('evolucao');
  const [pagina,  setPagina]    = useState(1);

  const [busca,           setBusca]           = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroProduto,   setFiltroProduto]   = useState('todos');
  const [filtroGestor,    setFiltroGestor]    = useState('todos');
  const [filtroVendedor,  setFiltroVendedor]  = useState('todos');
  const [ordenar,         setOrdenar]         = useState('ultimo');

  useEffect(() => { carregar(); }, []);
  useEffect(() => { setPagina(1); }, [busca, filtroCategoria, filtroProduto, filtroGestor, filtroVendedor, ordenar]);

  async function carregar() {
    setLoading(true);
    const [{ data: sp }, { data: emps }, { data: libs }] = await Promise.all([
      supabase.from('spreads').select('produto_id, empresa_nome, competencia, spread_planilha, spread_bandeira, spread_total').order('competencia'),
      supabase.from('empresas').select('produto_id, nome, categoria, produto_contratado, potencial_movimentacao, peso_categoria, consultor_principal:consultor_principal_id(nome, gestor)').eq('ativo', true),
      supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia'),
    ]);
    setMeses([...new Set((sp||[]).map(s => s.competencia))].sort());
    setSpreads(sp || []);
    setEmpresas(emps || []);
    setLibs(libs || []);
    setLoading(false);
  }

  // Mapa movimentação: produto_id__competencia → total_liberado
  const libMap = useMemo(() => {
    const m = {};
    for (const l of libs) {
      const key = `${l.produto_id}__${l.competencia}`;
      m[key] = (m[key] || 0) + l.total_liberado;
    }
    return m;
  }, [libs]);
  const spreadMap = useMemo(() => {
    const m = {};
    for (const s of spreads) {
      m[`${s.produto_id}__${s.competencia}`] = {
        planilha: s.spread_planilha,
        bandeira: s.spread_bandeira,
        total:    s.spread_total,
      };
    }
    return m;
  }, [spreads]);

  // Lista completa enriquecida
  const listaCompleta = useMemo(() => {
    return empresas.map(e => {
      const vals    = meses.map(m => spreadMap[`${e.produto_id}__${m}`]?.total || 0);
      const movVals = meses.map(m => libMap[`${e.produto_id}__${m}`] || 0);

      const totalSpread = vals.reduce((s,v) => s+v, 0);
      const totalMov    = movVals.reduce((s,v) => s+v, 0); // movimentação real

      // % spread = spread total / movimentação real total
      const pctMedio = totalMov > 0 ? (totalSpread / totalMov) * 100 : null;

      // % por mês para exibir na tabela
      const pctPorMes = meses.map((m, i) => {
        const mov = movVals[i];
        const sp  = vals[i];
        return mov > 0 ? (sp / mov) * 100 : null;
      });

      return {
        ...e,
        vals,
        movVals,
        totalSpread,
        totalMov,
        pctMedio,
        pctPorMes,
        mediaSpread:  vals.filter(v=>v>0).length > 0 ? totalSpread/meses.length : 0,
        ultimoSpread: vals[vals.length-1] || 0,
        temSpread:    totalSpread > 0,
        vendedor:     e.consultor_principal?.nome || '—',
        gestor:       e.consultor_principal?.gestor || '—',
      };
    });
  }, [empresas, meses, spreadMap, libMap]);

  // Opções de filtro
  const opcoes = useMemo(() => ({
    categorias: [...new Set(listaCompleta.map(e=>e.categoria).filter(Boolean))].sort(),
    produtos:   [...new Set(listaCompleta.map(e=>e.produto_contratado).filter(Boolean))].sort(),
    gestores:   [...new Set(listaCompleta.map(e=>e.gestor).filter(v=>v!=='—'))].sort(),
    vendedores: [...new Set(listaCompleta.map(e=>e.vendedor).filter(v=>v!=='—'))].sort(),
  }), [listaCompleta]);

  // Lista filtrada
  const listaFiltrada = useMemo(() => {
    let arr = [...listaCompleta];
    if (busca.trim()) { const b=norm(busca); arr=arr.filter(e=>norm(e.nome).includes(b)||String(e.produto_id).includes(b)); }
    if (filtroCategoria!=='todos') arr=arr.filter(e=>e.categoria===filtroCategoria);
    if (filtroProduto!=='todos')   arr=arr.filter(e=>e.produto_contratado===filtroProduto);
    if (filtroGestor!=='todos')    arr=arr.filter(e=>e.gestor===filtroGestor);
    if (filtroVendedor!=='todos')  arr=arr.filter(e=>e.vendedor===filtroVendedor);
    if (ordenar==='ultimo')   arr.sort((a,b)=>b.ultimoSpread-a.ultimoSpread);
    if (ordenar==='total')    arr.sort((a,b)=>b.totalSpread-a.totalSpread);
    if (ordenar==='pct')      arr.sort((a,b)=>(b.pctMedio||0)-(a.pctMedio||0));
    if (ordenar==='nome')     arr.sort((a,b)=>a.nome.localeCompare(b.nome));
    if (ordenar==='sem')      arr.sort((a,b)=>Number(a.temSpread)-Number(b.temSpread));
    return arr;
  }, [listaCompleta, busca, filtroCategoria, filtroProduto, filtroGestor, filtroVendedor, ordenar]);

  // KPIs
  const kpis = useMemo(() => {
    const total        = listaFiltrada.length;
    const totalSpread  = listaFiltrada.reduce((s,e)=>s+e.totalSpread,0);
    const totalMov     = listaFiltrada.reduce((s,e)=>s+e.totalMov,0); // movimentação REAL (liberacoes)
    const comSpread    = listaFiltrada.filter(e=>e.temSpread).length;
    const pctGeral     = totalMov > 0 ? (totalSpread/totalMov)*100 : 0;
    const spreadBandeira = spreads.filter(s => {
      const e = empresas.find(x=>x.produto_id===s.produto_id);
      return e?.produto_contratado?.toLowerCase().includes('vegas benef');
    }).reduce((s,x)=>s+(x.spread_bandeira||0),0);
    const porMes = meses.map(m => {
      const totMesSpread = listaFiltrada.reduce((s,e)=>s+(spreadMap[`${e.produto_id}__${m}`]?.total||0),0);
      const totMesMov    = listaFiltrada.reduce((s,e)=>s+(libMap[`${e.produto_id}__${m}`]||0),0);
      return {
        mes: m,
        total:    totMesSpread,
        mov:      totMesMov,
        pct:      totMesMov > 0 ? (totMesSpread/totMesMov)*100 : 0,
        empresas: listaFiltrada.filter(e=>(spreadMap[`${e.produto_id}__${m}`]?.total||0)>0).length,
      };
    });
    return { total, totalSpread, totalMov, comSpread, pctGeral, spreadBandeira, porMes };
  }, [listaFiltrada, meses, spreadMap, libMap, spreads, empresas]);

  // Paginação
  const totalPaginas = Math.ceil(listaFiltrada.length / POR_PAGINA);
  const listaPagina  = listaFiltrada.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const temFiltro = busca||filtroCategoria!=='todos'||filtroProduto!=='todos'||filtroGestor!=='todos'||filtroVendedor!=='todos';

  function limpar() { setBusca(''); setFiltroCategoria('todos'); setFiltroProduto('todos'); setFiltroGestor('todos'); setFiltroVendedor('todos'); setOrdenar('ultimo'); }

  if (loading) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}><div style={s.spin}></div><div style={{ color:'#6b7280' }}>Carregando dados...</div></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const abas = [
    { key:'evolucao',   label:'💹 Evolução por Empresa' },
    { key:'resumo',     label:'🔢 Resumo por Mês' },
    { key:'ranking',    label:'🏆 Ranking de Spread' },
  ];

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} select option{background:#1e2435!important;color:#e8eaf0!important;}`}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={{ color:'#a78bfa', fontWeight:800, fontSize:'0.9rem', letterSpacing:2, marginBottom:12, textTransform:'uppercase' }}>♠ Vegas Card</div>
          <h1 style={s.title}>Rentabilidade / Spread</h1>
          <p style={s.sub}>Evolução da receita de spread e taxa ADM por empresa</p>
        </div>
        <a href="/importar-spreads" style={{ background:'rgba(167,139,250,0.08)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:10, padding:'10px 20px', color:'#a78bfa', textDecoration:'none', fontSize:'0.85rem', fontWeight:600 }}>
          💹 Importar Spreads
        </a>
      </div>

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Empresas</span>
          <span style={s.kpiVal}>{kpis.total}</span>
          <span style={s.kpiSub}>{kpis.comSpread} com spread</span>
        </div>
        <div style={{ ...s.kpi, borderColor:'rgba(167,139,250,0.35)' }}>
          <span style={s.kpiLabel}>Total Spread</span>
          <span style={{ ...s.kpiVal, color:'#a78bfa' }}>{fmt(kpis.totalSpread)}</span>
          <span style={s.kpiSub}>{meses.length} meses</span>
        </div>
        <div style={{ ...s.kpi, borderColor:'rgba(52,211,153,0.35)' }}>
          <span style={s.kpiLabel}>% Spread Médio</span>
          <span style={{ ...s.kpiVal, color:'#34d399' }}>{fmtPct(kpis.pctGeral)}</span>
          <span style={s.kpiSub}>spread ÷ movimentação real</span>
          {kpis.totalMov > 0 && <span style={{ color:'#4b5563', fontSize:'0.68rem' }}>mov: {fmt(kpis.totalMov)}</span>}
        </div>
        <div style={{ ...s.kpi, borderColor:'rgba(240,180,41,0.35)' }}>
          <span style={s.kpiLabel}>Bandeira Vegas Benef.</span>
          <span style={{ ...s.kpiVal, color:'#f0b429' }}>{fmt(kpis.spreadBandeira)}</span>
          <span style={s.kpiSub}>0,75% × movimentação</span>
        </div>
        {kpis.porMes.slice(-1).map(m => (
          <div key={m.mes} style={{ ...s.kpi, borderColor:'rgba(96,165,250,0.35)' }}>
            <span style={s.kpiLabel}>Último mês ({fmtMes(m.mes)})</span>
            <span style={{ ...s.kpiVal, color:'#60a5fa' }}>{fmt(m.total)}</span>
            <span style={s.kpiSub}>{m.empresas} empresas</span>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div style={s.tabs}>
        {abas.map(a => <button key={a.key} style={{ ...s.tab, ...(aba===a.key?s.tabAtiva:{}) }} onClick={()=>setAba(a.key)}>{a.label}</button>)}
      </div>

      {/* ═══ ABA: EVOLUÇÃO ═══ */}
      {aba==='evolucao' && (
        <div style={s.card}>
          {/* Filtros */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 }}>
            <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e=>setBusca(e.target.value)} />
            <select style={s.sel} value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)}>
              <option value="todos">Todas as categorias</option>
              {opcoes.categorias.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select style={s.sel} value={filtroProduto} onChange={e=>setFiltroProduto(e.target.value)}>
              <option value="todos">Todos os produtos</option>
              {opcoes.produtos.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            <select style={s.sel} value={filtroGestor} onChange={e=>setFiltroGestor(e.target.value)}>
              <option value="todos">Todos os gestores</option>
              {opcoes.gestores.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
            <select style={s.sel} value={filtroVendedor} onChange={e=>setFiltroVendedor(e.target.value)}>
              <option value="todos">Todos os vendedores</option>
              {opcoes.vendedores.map(v=><option key={v} value={v}>{v}</option>)}
            </select>
            <select style={s.sel} value={ordenar} onChange={e=>setOrdenar(e.target.value)}>
              <option value="ultimo">Ordenar: Último mês</option>
              <option value="total">Ordenar: Total spread</option>
              <option value="pct">Ordenar: % Spread</option>
              <option value="sem">Ordenar: Sem spread primeiro</option>
              <option value="nome">Ordenar: Nome A-Z</option>
            </select>
            {temFiltro && <button style={{ background:'rgba(220,38,38,0.1)', border:'1px solid rgba(220,38,38,0.25)', borderRadius:10, padding:'9px 14px', color:'#f87171', fontSize:'0.85rem', fontFamily:'inherit', cursor:'pointer' }} onClick={limpar}>✕ Limpar</button>}
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div style={{ color:'#6b7280', fontSize:'0.78rem' }}>
              <strong style={{ color:'#e8eaf0' }}>{listaFiltrada.length}</strong> empresas
              {temFiltro && <span style={{ color:'#a78bfa', marginLeft:8 }}>· filtro ativo</span>}
            </div>
            <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
          </div>

          <div style={{ overflowX:'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Empresa</th>
                  <th style={s.th}>Produto</th>
                  <th style={s.th}>Vendedor</th>
                  {meses.map(m=><th key={m} style={{ ...s.th, textAlign:'right' }}>{fmtMes(m)}</th>)}
                  <th style={{ ...s.th, textAlign:'right' }}>Total</th>
                  <th style={{ ...s.th, textAlign:'right' }}>% Spread</th>
                </tr>
              </thead>
              <tbody>
                {listaPagina.map((e,i) => (
                  <tr key={e.produto_id} style={{ background:i%2===0?'rgba(255,255,255,0.02)':'transparent', opacity:!e.temSpread?0.5:1 }}>
                    <td style={s.td}><div style={{ fontWeight:600 }}>{e.nome}</div><div style={{ color:'#4b5563', fontSize:'0.7rem' }}>ID {e.produto_id}</div></td>
                    <td style={{ ...s.td, color:'#9ca3af', fontSize:'0.78rem' }}>{e.produto_contratado||'—'}</td>
                    <td style={{ ...s.td, fontSize:'0.78rem' }}>{e.vendedor}</td>
                    {meses.map(m => {
                      const v = spreadMap[`${e.produto_id}__${m}`]?.total || 0;
                      const band = spreadMap[`${e.produto_id}__${m}`]?.bandeira || 0;
                      return <td key={m} style={{ ...s.td, textAlign:'right' }}>
                        {v>0 ? (
                          <div>
                            <div style={{ color:'#a78bfa', fontWeight:500 }}>{fmt(v)}</div>
                            {band>0 && <div style={{ color:'#f0b429', fontSize:'0.68rem' }}>+{fmt(band)} bdra</div>}
                          </div>
                        ) : <span style={{ color:'#374151' }}>—</span>}
                      </td>;
                    })}
                    <td style={{ ...s.td, textAlign:'right', fontWeight:700, color:'#a78bfa' }}>
                      {e.totalSpread>0?fmt(e.totalSpread):<span style={{ color:'#374151' }}>—</span>}
                    </td>
                    <td style={{ ...s.td, textAlign:'right' }}>
                      {e.pctMedio!=null ? <span style={{ color:e.pctMedio>1?'#34d399':e.pctMedio>0.5?'#f0b429':'#9ca3af', fontWeight:600 }}>{fmtPct(e.pctMedio)}</span> : <span style={{ color:'#374151' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Linha de totais */}
              <tfoot>
                <tr style={{ borderTop:'2px solid rgba(255,255,255,0.12)', background:'rgba(167,139,250,0.05)' }}>
                  <td colSpan={3} style={{ ...s.td, fontWeight:700, color:'#a78bfa', fontSize:'0.82rem', paddingTop:14 }}>TOTAL ({listaFiltrada.length} empresas)</td>
                  {meses.map(m => {
                    const t = listaFiltrada.reduce((sum,e)=>sum+(spreadMap[`${e.produto_id}__${m}`]?.total||0),0);
                    return <td key={m} style={{ ...s.td, textAlign:'right', fontWeight:700, color:'#a78bfa', paddingTop:14 }}>{t>0?fmt(t):<span style={{ color:'#374151' }}>—</span>}</td>;
                  })}
                  <td style={{ ...s.td, textAlign:'right', fontWeight:700, color:'#a78bfa', paddingTop:14 }}>{fmt(listaFiltrada.reduce((s,e)=>s+e.totalSpread,0))}</td>
                  <td style={{ ...s.td, textAlign:'right', fontWeight:700, color:'#34d399', paddingTop:14 }}>{fmtPct(kpis.pctGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {totalPaginas>1 && <div style={{ display:'flex', justifyContent:'center', marginTop:20 }}><Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina}/></div>}
        </div>
      )}

      {/* ═══ ABA: RESUMO POR MÊS ═══ */}
      {aba==='resumo' && (
        <div style={s.card}>
          <div style={{ fontWeight:700, marginBottom:20 }}>🔢 Spread por Mês</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {kpis.porMes.map(m => (
              <div key={m.mes} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'20px 24px', flex:'1 1 200px', minWidth:180 }}>
                <div style={{ display:'inline-block', background:'rgba(167,139,250,0.12)', border:'1px solid rgba(167,139,250,0.3)', color:'#a78bfa', borderRadius:8, padding:'4px 12px', fontSize:'0.85rem', fontWeight:700, marginBottom:12 }}>{fmtMes(m.mes)}</div>
                <div style={{ fontSize:'1.5rem', fontWeight:700, color:'#a78bfa', marginBottom:4 }}>{fmt(m.total)}</div>
                <div style={{ color:'#9ca3af', fontSize:'0.8rem' }}>{m.empresas} empresas com spread</div>
                {m.mov > 0 && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
                    <span style={{ color:'#34d399', fontWeight:700, fontSize:'1rem' }}>{fmtPct(m.pct)}</span>
                    <span style={{ color:'#4b5563', fontSize:'0.72rem' }}>spread / movimentação</span>
                  </div>
                )}
                {m.mov > 0 && <div style={{ color:'#6b7280', fontSize:'0.7rem', marginTop:2 }}>mov: {fmt(m.mov)}</div>}
                <div style={{ marginTop:10 }}>
                  <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:4, height:6, overflow:'hidden' }}>
                    <div style={{ background:'#a78bfa', height:'100%', width:`${kpis.totalSpread>0?(m.total/kpis.totalSpread)*100:0}%` }}></div>
                  </div>
                  <div style={{ color:'#6b7280', fontSize:'0.72rem', marginTop:4 }}>{kpis.totalSpread>0?fmtPct((m.total/kpis.totalSpread)*100):'0%'} do spread total</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ABA: RANKING ═══ */}
      {aba==='ranking' && (
        <div style={s.card}>
          <div style={{ fontWeight:700, marginBottom:20 }}>🏆 Top 20 Empresas por Spread Total</div>
          <div style={{ overflowX:'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['#','Empresa','Produto','Vendedor','Total Spread','% Spread','Bandeira'].map(h=><th key={h} style={s.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...listaCompleta].filter(e=>e.totalSpread>0).sort((a,b)=>b.totalSpread-a.totalSpread).slice(0,20).map((e,i) => {
                  const bandeira = meses.reduce((s,m)=>s+(spreadMap[`${e.produto_id}__${m}`]?.bandeira||0),0);
                  const cor = e.pctMedio>1?'#34d399':e.pctMedio>0.5?'#f0b429':'#9ca3af';
                  return (
                    <tr key={e.produto_id} style={{ background:i%2===0?'rgba(255,255,255,0.02)':'transparent' }}>
                      <td style={{ ...s.td, color:'#a78bfa', fontWeight:700, textAlign:'center' }}>{i+1}</td>
                      <td style={s.td}><div style={{ fontWeight:600 }}>{e.nome}</div><div style={{ color:'#4b5563', fontSize:'0.7rem' }}>ID {e.produto_id}</div></td>
                      <td style={{ ...s.td, color:'#9ca3af', fontSize:'0.78rem' }}>{e.produto_contratado||'—'}</td>
                      <td style={{ ...s.td, fontSize:'0.78rem' }}>{e.vendedor}</td>
                      <td style={{ ...s.td, color:'#a78bfa', fontWeight:700 }}>{fmt(e.totalSpread)}</td>
                      <td style={{ ...s.td, color:cor, fontWeight:700 }}>{e.pctMedio!=null?fmtPct(e.pctMedio):'—'}</td>
                      <td style={{ ...s.td, color:'#f0b429' }}>{bandeira>0?fmt(bandeira):'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const ps = { btn:{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:7,padding:'5px 10px',color:'#9ca3af',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit',minWidth:32}, ativo:{background:'rgba(167,139,250,0.2)',borderColor:'rgba(167,139,250,0.5)',color:'#a78bfa',fontWeight:700}, dis:{opacity:0.3,cursor:'default'}, dots:{color:'#4b5563',fontSize:'0.82rem',padding:'0 2px'} };

const s = {
  page:     { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh' },
  header:   { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:16 },
  title:    { fontSize:'1.8rem', fontWeight:700, margin:'0 0 8px' },
  sub:      { color:'#6b7280', fontSize:'0.9rem' },
  kpis:     { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:20 },
  kpi:      { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 22px', display:'flex', flexDirection:'column', gap:4 },
  kpiLabel: { color:'#6b7280', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:1 },
  kpiVal:   { fontSize:'1.4rem', fontWeight:700 },
  kpiSub:   { color:'#4b5563', fontSize:'0.72rem' },
  tabs:     { display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' },
  tab:      { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'8px 16px', color:'#6b7280', cursor:'pointer', fontSize:'0.85rem', fontWeight:500, fontFamily:'inherit' },
  tabAtiva: { background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.3)', color:'#a78bfa' },
  card:     { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:28, marginBottom:24 },
  busca:    { flex:'1 1 220px', background:'#1e2435', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, padding:'9px 14px', color:'#e8eaf0', fontSize:'0.85rem', fontFamily:'inherit', outline:'none' },
  sel:      { background:'#1e2435', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, padding:'9px 14px', color:'#e8eaf0', fontSize:'0.85rem', fontFamily:'inherit', cursor:'pointer', outline:'none' },
  table:    { width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' },
  th:       { padding:'8px 12px', textAlign:'left', color:'#6b7280', fontWeight:500, borderBottom:'1px solid rgba(255,255,255,0.07)', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.7rem', letterSpacing:0.5 },
  td:       { padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', whiteSpace:'nowrap' },
  spin:     { width:40, height:40, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #a78bfa', borderRadius:'50%', margin:'0 auto 20px', animation:'spin 0.8s linear infinite' },
};
