'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;

export default function DashboardPrevisao() {
  const [rawEmpresas, setRawEmpresas]   = useState([]);
  const [rawConsultores, setRawConsultores] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [aba, setAba]                   = useState('consultores');
  const [gestorFiltro, setGestorFiltro] = useState('Geral');
  const [gestores, setGestores]         = useState(['Geral']);
  const [dados, setDados]               = useState(null);

  useEffect(() => { carregarDados(); }, []);
  useEffect(() => { if (rawEmpresas.length) processarDados(); }, [gestorFiltro, rawEmpresas, rawConsultores]);

  async function carregarDados() {
    setLoading(true);
    try {
      const { data: empresas } = await supabase
        .from('empresas')
        .select(`
          nome, potencial_movimentacao, peso_categoria, categoria, produto_contratado,
          consultor_principal:consultor_principal_id (id, nome, meta_mensal, setor, gestor),
          parceiro:parceiro_id (id, nome)
        `)
        .eq('ativo', true);

      const { data: consultores } = await supabase
        .from('consultores')
        .select('id, nome, meta_mensal, setor, gestor')
        .eq('ativo', true);

      // Extrai gestores únicos
      const gs = ['Geral', ...new Set((consultores||[]).map(c => c.gestor).filter(Boolean))];
      setGestores(gs);
      setRawEmpresas(empresas || []);
      setRawConsultores(consultores || []);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  function processarDados() {
    const empresas    = rawEmpresas;
    const consultores = rawConsultores;

    // Filtra consultores pelo gestor selecionado
    const consultsFiltrados = gestorFiltro === 'Geral'
      ? consultores
      : consultores.filter(c => c.gestor === gestorFiltro);

    // IDs dos consultores filtrados
    const consultIds = new Set(consultsFiltrados.map(c => c.id));

    // Filtra empresas pelos consultores do gestor
    const empresasFiltradas = gestorFiltro === 'Geral'
      ? empresas
      : empresas.filter(e => e.consultor_principal?.id && consultIds.has(e.consultor_principal.id));

    // Monta mapa de consultores
    const consultorMap = {};
    consultsFiltrados.forEach(c => {
      consultorMap[c.id] = { nome: c.nome, meta: c.meta_mensal||0, setor: c.setor, gestor: c.gestor, potencial: 0, resultado: 0, empresas: 0 };
    });

    const catMap  = {};
    const prodMap = {};
    const parcMap = {};
    const topEmpresas = [];

    empresasFiltradas.forEach(e => {
      const pot      = e.potencial_movimentacao || 0;
      const peso     = e.peso_categoria || 1;
      const resultado = pot * peso;
      const cId      = e.consultor_principal?.id;

      if (cId && consultorMap[cId]) {
        consultorMap[cId].potencial += pot;
        consultorMap[cId].resultado += resultado;
        consultorMap[cId].empresas  += 1;
      }

      const cat = e.categoria || 'Outros';
      if (!catMap[cat]) catMap[cat] = { potencial:0, resultado:0, empresas:0 };
      catMap[cat].potencial += pot;
      catMap[cat].resultado += resultado;
      catMap[cat].empresas  += 1;

      const prod = e.produto_contratado || 'Outros';
      if (!prodMap[prod]) prodMap[prod] = { potencial:0, resultado:0, empresas:0, peso };
      prodMap[prod].potencial += pot;
      prodMap[prod].resultado += resultado;
      prodMap[prod].empresas  += 1;

      const parc = e.parceiro?.nome || 'Sem Parceiro';
      if (!parcMap[parc]) parcMap[parc] = { potencial:0, resultado:0, empresas:0 };
      parcMap[parc].potencial += pot;
      parcMap[parc].resultado += resultado;
      parcMap[parc].empresas  += 1;

      topEmpresas.push({ nome: e.nome, produto: e.produto_contratado, categoria: e.categoria, consultor: e.consultor_principal?.nome||'—', parceiro: e.parceiro?.nome||'—', potencial: pot, resultado });
    });

    const totalPotencial = empresasFiltradas.reduce((s,e) => s+(e.potencial_movimentacao||0), 0);
    const totalResultado = empresasFiltradas.reduce((s,e) => s+((e.potencial_movimentacao||0)*(e.peso_categoria||1)), 0);
    const totalMeta      = consultsFiltrados.reduce((s,c) => s+(c.meta_mensal||0), 0);

    setDados({
      totais: { potencial: totalPotencial, resultado: totalResultado, meta: totalMeta, empresas: empresasFiltradas.length },
      consultores: Object.values(consultorMap).filter(c => c.resultado > 0 || c.meta > 0).sort((a,b) => b.resultado - a.resultado),
      categorias: Object.entries(catMap).map(([nome,v]) => ({nome,...v})).sort((a,b) => b.resultado - a.resultado),
      produtos: Object.entries(prodMap).map(([nome,v]) => ({nome,...v})).sort((a,b) => b.resultado - a.resultado),
      parceiros: Object.entries(parcMap).filter(([n]) => n !== 'Sem Parceiro').map(([nome,v]) => ({nome,...v})).sort((a,b) => b.resultado - a.resultado),
      topEmpresas: topEmpresas.sort((a,b) => b.resultado - a.resultado).slice(0,15),
    });
  }

  if (loading) return (
    <div style={{...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={s.spin}></div>
        <div style={{color:'#6b7280'}}>Carregando previsões...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const { totais, consultores, categorias, produtos, parceiros, topEmpresas } = dados || {};
  const pctMeta = totais?.meta > 0 ? (totais.resultado / totais.meta) * 100 : 0;

  const abas = [
    { key:'consultores', label:'👤 Por Consultor' },
    { key:'categorias',  label:'📦 Por Categoria' },
    { key:'produtos',    label:'🎯 Por Produto' },
    { key:'parceiros',   label:'🤝 Por Parceiro' },
    { key:'empresas',    label:'🏆 Top Empresas' },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Dashboard de Previsão</h1>
          <p style={s.sub}>Potencial de movimentação das empresas cadastradas — v2</p>
        </div>
        <a href="/importar" style={s.linkBtn}>📥 Importar Empresas</a>
      </div>

      {/* Filtro de Gestor */}
      <div style={s.gestorBar}>
        <span style={{color:'#6b7280', fontSize:'0.8rem', marginRight:8}}>GESTÃO:</span>
        {gestores.map(g => (
          <button key={g} style={{...s.gestorBtn, ...(gestorFiltro===g ? s.gestorBtnAtivo : {})}}
            onClick={() => setGestorFiltro(g)}>
            {g === 'Geral' ? '🌐 Geral' : `👔 ${g}`}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Empresas Ativas</span>
          <span style={s.kpiVal}>{totais?.empresas || 0}</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Potencial Bruto</span>
          <span style={s.kpiVal}>{fmt(totais?.potencial)}</span>
        </div>
        <div style={{...s.kpi, borderColor:'rgba(240,180,41,0.3)'}}>
          <span style={s.kpiLabel}>Resultado Esperado</span>
          <span style={{...s.kpiVal, color:'#f0b429'}}>{fmt(totais?.resultado)}</span>
          <span style={{color:'#6b7280', fontSize:'0.72rem', marginTop:4}}>potencial × peso</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Meta Total</span>
          <span style={s.kpiVal}>{fmt(totais?.meta)}</span>
        </div>
        <div style={{...s.kpi, borderColor: pctMeta >= 100 ? 'rgba(52,211,153,0.3)' : pctMeta >= 70 ? 'rgba(240,180,41,0.3)' : 'rgba(248,113,113,0.3)'}}>
          <span style={s.kpiLabel}>Previsão vs Meta</span>
          <span style={{...s.kpiVal, color: pctMeta >= 100 ? '#34d399' : pctMeta >= 70 ? '#f0b429' : '#f87171'}}>{fmtPct(pctMeta)}</span>
        </div>
      </div>

      {/* Abas */}
      <div style={s.tabs}>
        {abas.map(a => (
          <button key={a.key} style={{...s.tab, ...(aba===a.key?s.tabAtiva:{})}} onClick={() => setAba(a.key)}>
            {a.label}
          </button>
        ))}
      </div>

      <div style={s.card}>

        {/* CONSULTORES */}
        {aba === 'consultores' && (
          <>
            <div style={s.cardTitle}>👤 Previsão por Consultor vs Meta</div>
            <div style={{overflowX:'auto', marginTop:16}}>
              <table style={s.table}>
                <thead><tr>
                  {['Consultor','Setor','Gestor','Empresas','Potencial Bruto','Resultado Esperado','Meta','% Previsão','Barra'].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(consultores||[]).map((c,i) => {
                    const pct = c.meta > 0 ? (c.resultado / c.meta) * 100 : 0;
                    const cor = pct >= 100 ? '#34d399' : pct >= 70 ? '#f0b429' : '#f87171';
                    return (
                      <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                        <td style={{...s.td, fontWeight:600}}>{c.nome}</td>
                        <td style={{...s.td, color:'#9ca3af'}}>{c.setor||'—'}</td>
                        <td style={{...s.td, color:'#9ca3af'}}>{c.gestor||'—'}</td>
                        <td style={{...s.td, textAlign:'center'}}>{c.empresas}</td>
                        <td style={s.td}>{fmt(c.potencial)}</td>
                        <td style={{...s.td, color:'#f0b429', fontWeight:600}}>{fmt(c.resultado)}</td>
                        <td style={s.td}>{c.meta > 0 ? fmt(c.meta) : '—'}</td>
                        <td style={{...s.td, color: c.meta > 0 ? cor : '#6b7280', fontWeight:700}}>{c.meta > 0 ? fmtPct(pct) : '—'}</td>
                        <td style={{...s.td, minWidth:120}}>
                          {c.meta > 0 && (
                            <div style={{background:'rgba(255,255,255,0.07)', borderRadius:4, height:8, overflow:'hidden'}}>
                              <div style={{background:cor, height:'100%', width:`${Math.min(pct,100)}%`, borderRadius:4}}></div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* CATEGORIAS */}
        {aba === 'categorias' && (
          <>
            <div style={s.cardTitle}>📦 Previsão por Categoria</div>
            <div style={{overflowX:'auto', marginTop:16}}>
              <table style={s.table}>
                <thead><tr>
                  {['Categoria','Empresas','Potencial Bruto','Resultado Esperado','% do Total'].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(categorias||[]).map((c,i) => (
                    <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                      <td style={{...s.td, fontWeight:600}}>{c.nome}</td>
                      <td style={{...s.td, textAlign:'center'}}>{c.empresas}</td>
                      <td style={s.td}>{fmt(c.potencial)}</td>
                      <td style={{...s.td, color:'#f0b429', fontWeight:600}}>{fmt(c.resultado)}</td>
                      <td style={s.td}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <div style={{background:'rgba(255,255,255,0.07)', borderRadius:4, height:8, width:80, overflow:'hidden'}}>
                            <div style={{background:'#f0b429', height:'100%', width:`${totais?.resultado > 0 ? (c.resultado/totais.resultado)*100 : 0}%`, borderRadius:4}}></div>
                          </div>
                          <span style={{color:'#9ca3af', fontSize:'0.75rem'}}>{totais?.resultado > 0 ? fmtPct((c.resultado/totais.resultado)*100) : '0%'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* PRODUTOS */}
        {aba === 'produtos' && (
          <>
            <div style={s.cardTitle}>🎯 Previsão por Produto</div>
            <div style={{overflowX:'auto', marginTop:16}}>
              <table style={s.table}>
                <thead><tr>
                  {['Produto','Peso','Empresas','Potencial Bruto','Resultado Esperado'].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(produtos||[]).map((p,i) => (
                    <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                      <td style={{...s.td, fontWeight:600}}>{p.nome}</td>
                      <td style={{...s.td, color:'#f0b429'}}>{(p.peso*100).toFixed(0)}%</td>
                      <td style={{...s.td, textAlign:'center'}}>{p.empresas}</td>
                      <td style={s.td}>{fmt(p.potencial)}</td>
                      <td style={{...s.td, color:'#34d399', fontWeight:600}}>{fmt(p.resultado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* PARCEIROS */}
        {aba === 'parceiros' && (
          <>
            <div style={s.cardTitle}>🤝 Previsão por Parceiro Comercial</div>
            <div style={{overflowX:'auto', marginTop:16}}>
              <table style={s.table}>
                <thead><tr>
                  {['Parceiro','Empresas','Potencial Bruto','Resultado Esperado','% do Total'].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(parceiros||[]).map((p,i) => (
                    <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                      <td style={{...s.td, fontWeight:600}}>{p.nome}</td>
                      <td style={{...s.td, textAlign:'center'}}>{p.empresas}</td>
                      <td style={s.td}>{fmt(p.potencial)}</td>
                      <td style={{...s.td, color:'#f0b429', fontWeight:600}}>{fmt(p.resultado)}</td>
                      <td style={s.td}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <div style={{background:'rgba(255,255,255,0.07)', borderRadius:4, height:8, width:80, overflow:'hidden'}}>
                            <div style={{background:'#f0b429', height:'100%', width:`${totais?.resultado > 0 ? (p.resultado/totais.resultado)*100 : 0}%`, borderRadius:4}}></div>
                          </div>
                          <span style={{color:'#9ca3af', fontSize:'0.75rem'}}>{totais?.resultado > 0 ? fmtPct((p.resultado/totais.resultado)*100) : '0%'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TOP EMPRESAS */}
        {aba === 'empresas' && (
          <>
            <div style={s.cardTitle}>🏆 Top 15 Empresas por Resultado Esperado</div>
            <div style={{overflowX:'auto', marginTop:16}}>
              <table style={s.table}>
                <thead><tr>
                  {['#','Empresa','Produto','Categoria','Consultor','Parceiro','Potencial Bruto','Resultado Esperado'].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(topEmpresas||[]).map((e,i) => (
                    <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                      <td style={{...s.td, color:'#f0b429', fontWeight:700, textAlign:'center'}}>{i+1}</td>
                      <td style={{...s.td, fontWeight:600}}>{e.nome}</td>
                      <td style={s.td}>{e.produto||'—'}</td>
                      <td style={{...s.td, color:'#9ca3af'}}>{e.categoria||'—'}</td>
                      <td style={s.td}>{e.consultor}</td>
                      <td style={{...s.td, color:'#9ca3af'}}>{e.parceiro}</td>
                      <td style={s.td}>{fmt(e.potencial)}</td>
                      <td style={{...s.td, color:'#34d399', fontWeight:600}}>{fmt(e.resultado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:          {maxWidth:1200, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans', sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh'},
  header:        {display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:16},
  tag:           {color:'#f0b429', fontWeight:800, fontSize:'0.9rem', letterSpacing:2, marginBottom:12, textTransform:'uppercase'},
  title:         {fontSize:'1.8rem', fontWeight:700, margin:'0 0 8px'},
  sub:           {color:'#6b7280', fontSize:'0.9rem'},
  linkBtn:       {background:'rgba(240,180,41,0.08)', border:'1px solid rgba(240,180,41,0.2)', borderRadius:10, padding:'10px 20px', color:'#f0b429', textDecoration:'none', fontSize:'0.85rem', fontWeight:600},
  gestorBar:     {display:'flex', alignItems:'center', gap:8, marginBottom:20, flexWrap:'wrap', background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 16px'},
  gestorBtn:     {background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'6px 14px', color:'#6b7280', cursor:'pointer', fontSize:'0.85rem', fontWeight:500, fontFamily:'inherit'},
  gestorBtnAtivo:{background:'rgba(240,180,41,0.15)', border:'1px solid rgba(240,180,41,0.4)', color:'#f0b429', fontWeight:700},
  kpis:          {display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16, marginBottom:20},
  kpi:           {background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'18px 22px', display:'flex', flexDirection:'column'},
  kpiLabel:      {color:'#6b7280', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:1, marginBottom:8},
  kpiVal:        {fontSize:'1.4rem', fontWeight:700},
  tabs:          {display:'flex', gap:8, marginBottom:16, flexWrap:'wrap'},
  tab:           {background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'8px 16px', color:'#6b7280', cursor:'pointer', fontSize:'0.85rem', fontWeight:500, fontFamily:'inherit'},
  tabAtiva:      {background:'rgba(240,180,41,0.1)', border:'1px solid rgba(240,180,41,0.3)', color:'#f0b429'},
  card:          {background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:28, marginBottom:24},
  cardTitle:     {fontSize:'1rem', fontWeight:700},
  table:         {width:'100%', borderCollapse:'collapse', fontSize:'0.8rem'},
  th:            {padding:'8px 12px', textAlign:'left', color:'#6b7280', fontWeight:500, borderBottom:'1px solid rgba(255,255,255,0.07)', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.7rem', letterSpacing:0.5},
  td:            {padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', whiteSpace:'nowrap'},
  spin:          {width:40, height:40, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto 20px', animation:'spin 0.8s linear infinite'},
};
