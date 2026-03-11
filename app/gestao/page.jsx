'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function GestaoEmpresas() {
  const [empresas, setEmpresas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatus, setFiltroStatus]       = useState('ativas');
  const [categorias, setCategorias]           = useState([]);

  useEffect(() => { carregar(); }, [filtroStatus]);

  async function carregar() {
    setLoading(true);
    let query = supabase
      .from('empresas')
      .select(`
        id, produto_id, nome, cnpj, categoria, produto_contratado,
        peso_categoria, potencial_movimentacao, taxa_negativa, taxa_positiva,
        data_cadastro, cidade, estado, ativo,
        consultor_principal:consultor_principal_id (nome),
        consultor_agregado:consultor_agregado_id (nome),
        parceiro:parceiro_id (nome)
      `)
      .order('nome');

    if (filtroStatus === 'ativas')   query = query.eq('ativo', true);
    if (filtroStatus === 'inativas') query = query.eq('ativo', false);

    const { data } = await query;
    setEmpresas(data || []);
    setCategorias([...new Set((data || []).map(e => e.categoria).filter(Boolean))].sort());
    setLoading(false);
  }

  const filtradas = empresas.filter(e => {
    const q = busca.toLowerCase();
    return (!busca ||
      e.nome?.toLowerCase().includes(q) ||
      String(e.produto_id).includes(q) ||
      e.cnpj?.includes(q) ||
      e.consultor_principal?.nome?.toLowerCase().includes(q)
    ) && (!filtroCategoria || e.categoria === filtroCategoria);
  });

  const COR_CAT = {
    'Benefícios':   '#60a5fa',
    'Bônus':        '#a78bfa',
    'Convênio':     '#34d399',
    'Taxa Negativa':'#f87171',
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Gestão de Empresas</h1>
          <p style={s.sub}>Clique em uma empresa para visualizar e editar o cadastro completo</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['ativas','inativas','todas'].map(v => (
            <button key={v} style={{ ...s.tabBtn, ...(filtroStatus === v ? s.tabBtnAtivo : {}) }}
              onClick={() => setFiltroStatus(v)}>
              {v === 'ativas' ? '✅ Ativas' : v === 'inativas' ? '❌ Inativas' : '📋 Todas'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}><span style={s.kpiL}>Exibindo</span><span style={s.kpiV}>{filtradas.length}</span></div>
        <div style={s.kpi}><span style={s.kpiL}>Total Ativas</span><span style={s.kpiV}>{empresas.filter(e=>e.ativo).length}</span></div>
        <div style={s.kpi}><span style={s.kpiL}>Inativas</span><span style={{ ...s.kpiV, color:'#f87171' }}>{empresas.filter(e=>!e.ativo).length}</span></div>
        <div style={s.kpi}><span style={s.kpiL}>Potencial Filtrado</span><span style={{ ...s.kpiV, color:'#34d399', fontSize:'1rem' }}>{fmt(filtradas.reduce((s,e)=>s+(e.potencial_movimentacao||0),0))}</span></div>
      </div>

      {/* Filtros */}
      <div style={s.filtrosBox}>
        <div style={{ flex: 3, minWidth: 260 }}>
          <div style={s.filtroL}>🔍 Buscar</div>
          <input style={s.input} placeholder="Nome, ID, CNPJ, consultor..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={s.filtroL}>Categoria</div>
          <select style={s.select} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(busca || filtroCategoria) && (
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <button style={s.btnLimpar} onClick={() => { setBusca(''); setFiltroCategoria(''); }}>✕ Limpar</button>
          </div>
        )}
      </div>

      {/* Lista */}
      <div style={s.card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:48 }}>
            <div style={s.spin}></div>
            <div style={{ color:'#6b7280' }}>Carregando...</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['ID','Empresa','Categoria','Produto','Potencial','Taxa Neg.','Consultor Principal','Parceiro','Cidade/UF','Status',''].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0,150).map((e, i) => {
                  const cor = COR_CAT[e.categoria] || '#9ca3af';
                  return (
                    <tr key={e.id} style={{ ...( i%2===0 ? { background:'rgba(255,255,255,0.02)' } : {}), cursor:'pointer', transition:'background 0.15s' }}
                      onMouseEnter={ev => ev.currentTarget.style.background='rgba(240,180,41,0.05)'}
                      onMouseLeave={ev => ev.currentTarget.style.background= i%2===0?'rgba(255,255,255,0.02)':'transparent'}>
                      <td style={{ ...s.td, color:'#f0b429', fontWeight:700 }}>{e.produto_id}</td>
                      <td style={{ ...s.td, fontWeight:600, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={e.nome}>{e.nome}</td>
                      <td style={s.td}>
                        <span style={{ background:`${cor}18`, color:cor, border:`1px solid ${cor}30`, borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', fontWeight:600, whiteSpace:'nowrap' }}>
                          {e.categoria}
                        </span>
                      </td>
                      <td style={{ ...s.td, color:'#9ca3af', fontSize:'0.78rem' }}>{e.produto_contratado}</td>
                      <td style={{ ...s.td, color:'#34d399', fontWeight:600 }}>{fmt(e.potencial_movimentacao)}</td>
                      <td style={{ ...s.td, color: e.taxa_negativa > 0 ? '#f87171' : '#374151', textAlign:'center' }}>
                        {e.taxa_negativa > 0 ? `${(e.taxa_negativa*100).toFixed(2)}%` : '—'}
                      </td>
                      <td style={s.td}>{e.consultor_principal?.nome || '—'}</td>
                      <td style={{ ...s.td, color:'#9ca3af', fontSize:'0.78rem' }}>{e.parceiro?.nome || '—'}</td>
                      <td style={{ ...s.td, color:'#9ca3af', fontSize:'0.78rem' }}>{e.cidade} / {e.estado}</td>
                      <td style={s.td}>
                        <span style={{ background: e.ativo ? 'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)', color: e.ativo ? '#34d399':'#f87171', border:`1px solid ${e.ativo?'rgba(52,211,153,0.3)':'rgba(248,113,113,0.3)'}`, borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', fontWeight:600 }}>
                          {e.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td style={s.td}>
                        <Link href={`/gestao/${e.id}`} style={{ background:'rgba(240,180,41,0.1)', border:'1px solid rgba(240,180,41,0.25)', borderRadius:8, padding:'5px 12px', color:'#f0b429', textDecoration:'none', fontSize:'0.78rem', fontWeight:600, whiteSpace:'nowrap' }}>
                          ✏️ Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtradas.length === 0 && <div style={{ textAlign:'center', padding:40, color:'#4b5563' }}>Nenhuma empresa encontrada</div>}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const s = {
  page:      { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh' },
  header:    { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:16 },
  tag:       { color:'#f0b429', fontWeight:800, fontSize:'0.9rem', letterSpacing:2, marginBottom:8, textTransform:'uppercase' },
  title:     { fontSize:'1.8rem', fontWeight:700, margin:'0 0 6px' },
  sub:       { color:'#6b7280', fontSize:'0.9rem' },
  tabBtn:    { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'8px 16px', color:'#6b7280', cursor:'pointer', fontSize:'0.82rem', fontWeight:500, fontFamily:'inherit' },
  tabBtnAtivo:{ background:'rgba(240,180,41,0.1)', border:'1px solid rgba(240,180,41,0.3)', color:'#f0b429', fontWeight:700 },
  kpis:      { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:20 },
  kpi:       { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 18px', display:'flex', flexDirection:'column' },
  kpiL:      { color:'#6b7280', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 },
  kpiV:      { fontSize:'1.4rem', fontWeight:700 },
  filtrosBox:{ background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'20px 24px', marginBottom:20, display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' },
  filtroL:   { color:'#6b7280', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 },
  input:     { background:'#1e2235', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'8px 12px', color:'#e8eaf0', fontSize:'0.85rem', fontFamily:'inherit', width:'100%', outline:'none' },
  select:    { background:'#1e2235', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'8px 12px', color:'#e8eaf0', fontSize:'0.85rem', fontFamily:'inherit', width:'100%', outline:'none' },
  btnLimpar: { background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, padding:'8px 14px', color:'#f87171', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, fontFamily:'inherit' },
  card:      { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' },
  th:        { padding:'8px 12px', textAlign:'left', color:'#6b7280', fontWeight:500, borderBottom:'1px solid rgba(255,255,255,0.07)', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.68rem', letterSpacing:0.5 },
  td:        { padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', whiteSpace:'nowrap' },
  spin:      { width:36, height:36, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
};

