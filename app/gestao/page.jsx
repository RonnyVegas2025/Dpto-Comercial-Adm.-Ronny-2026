'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function GestaoEmpresas() {
  const router = useRouter();
  const [empresasCartao,   setEmpresasCartao]   = useState([]);
  const [empresasAgregado, setEmpresasAgregado] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [busca,            setBusca]            = useState('');
  const [filtroCategoria,  setFiltroCategoria]  = useState('');
  const [filtroStatus,     setFiltroStatus]     = useState('ativas');
  const [filtroProduto,    setFiltroProduto]    = useState('');
  const [categorias,       setCategorias]       = useState([]);

  useEffect(() => { carregar(); }, [filtroStatus]);

  async function carregar() {
    setLoading(true);
    try {
      let q = supabase
        .from('empresas')
        .select(`
          id, produto_id, nome, cnpj, categoria, produto_contratado,
          peso_categoria, potencial_movimentacao, taxa_negativa, taxa_positiva,
          data_cadastro, cidade, estado, ativo,
          consultor_principal:consultor_principal_id (nome),
          parceiro:parceiro_id (nome)
        `)
        .order('nome');
      if (filtroStatus === 'ativas')   q = q.eq('ativo', true);
      if (filtroStatus === 'inativas') q = q.eq('ativo', false);
      const { data: cartoes } = await q;

      const { data: agregados } = await supabase
        .from('empresas_agregadas')
        .select(`
          id, cnpj, nome, data_cadastro, ativo,
          consultor_principal:consultor_principal_id (nome),
          contratos:contratos_agregados (
            id, is_combo, combo_nome,
            produto_1:produto_1_id (nome),
            produto_2:produto_2_id (nome),
            produto_3:produto_3_id (nome)
          )
        `)
        .eq('ativo', true);

      setEmpresasCartao(cartoes || []);
      setEmpresasAgregado(agregados || []);
      setCategorias([...new Set((cartoes||[]).map(e=>e.categoria).filter(Boolean))].sort());
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  const listaUnificada = useMemo(() => {
    const map = {};

    (empresasCartao||[]).forEach(e => {
      const cnpj = (e.cnpj||'').replace(/\D/g,'') || `c_${e.id}`;
      if (!map[cnpj]) map[cnpj] = { cnpj:e.cnpj, nome:e.nome, cidade:e.cidade, estado:e.estado,
        consultor:e.consultor_principal?.nome||'—', parceiro:e.parceiro?.nome||'—',
        ativo:e.ativo, cartoes:[], agregados:[], empresa_agregada_id:null };
      map[cnpj].cartoes.push({ id:e.id, produto_id:e.produto_id, produto:e.produto_contratado,
        categoria:e.categoria, potencial:e.potencial_movimentacao,
        taxa_negativa:e.taxa_negativa, taxa_positiva:e.taxa_positiva });
    });

    (empresasAgregado||[]).forEach(e => {
      const cnpj = (e.cnpj||'').replace(/\D/g,'') || `a_${e.id}`;
      if (!map[cnpj]) map[cnpj] = { cnpj:e.cnpj, nome:e.nome, cidade:'—', estado:'—',
        consultor:e.consultor_principal?.nome||'—', parceiro:'—',
        ativo:e.ativo, cartoes:[], agregados:[], empresa_agregada_id:null };
      map[cnpj].empresa_agregada_id = e.id;
      if (map[cnpj].cartoes.length === 0) map[cnpj].consultor = e.consultor_principal?.nome||'—';
      (e.contratos||[]).forEach(c => {
        const prods = [c.produto_1?.nome,c.produto_2?.nome,c.produto_3?.nome].filter(Boolean);
        map[cnpj].agregados.push({ label:c.combo_nome||prods.join(' + ')||'—', isCombo:c.is_combo });
      });
    });

    return Object.values(map).sort((a,b)=>a.nome?.localeCompare(b.nome));
  }, [empresasCartao, empresasAgregado]);

  const filtradas = useMemo(() => listaUnificada.filter(e => {
    const q = busca.toLowerCase();
    if (busca && !e.nome?.toLowerCase().includes(q) && !e.cnpj?.includes(q) &&
        !e.consultor?.toLowerCase().includes(q) &&
        !e.cartoes.some(c=>String(c.produto_id).includes(q)||c.produto?.toLowerCase().includes(q))) return false;
    if (filtroCategoria && !e.cartoes.some(c=>c.categoria===filtroCategoria)) return false;
    if (filtroProduto==='cartao'   && e.cartoes.length===0) return false;
    if (filtroProduto==='agregado' && e.agregados.length===0) return false;
    if (filtroProduto==='ambos'    && (e.cartoes.length===0||e.agregados.length===0)) return false;
    return true;
  }), [listaUnificada, busca, filtroCategoria, filtroProduto]);

  const COR_CAT = { 'Benefícios':'#60a5fa','Bônus':'#a78bfa','Convênio':'#34d399','Taxa Negativa':'#f87171' };

  const totalC = listaUnificada.filter(e=>e.cartoes.length>0).length;
  const totalA = listaUnificada.filter(e=>e.agregados.length>0).length;
  const totalB = listaUnificada.filter(e=>e.cartoes.length>0&&e.agregados.length>0).length;
  const potTotal = filtradas.reduce((s,e)=>s+e.cartoes.reduce((ss,c)=>ss+(c.potencial||0),0),0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Gestão de Empresas</h1>
          <p style={s.sub}>Visão unificada — cartões e produtos agregados pelo CNPJ</p>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {[['ativas','✅ Ativas'],['inativas','❌ Inativas'],['todas','📋 Todas']].map(([v,l])=>(
            <button key={v} style={{...s.tabBtn,...(filtroStatus===v?s.tabBtnAtivo:{})}}
              onClick={()=>setFiltroStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}><span style={s.kpiL}>Exibindo</span><span style={s.kpiV}>{filtradas.length}</span></div>
        <div style={{...s.kpi,borderColor:'rgba(96,165,250,0.2)'}}>
          <span style={s.kpiL}>🃏 Só Cartão</span><span style={{...s.kpiV,color:'#60a5fa'}}>{totalC-totalB}</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(240,180,41,0.2)'}}>
          <span style={s.kpiL}>📦 Só Agregado</span><span style={{...s.kpiV,color:'#f0b429'}}>{totalA-totalB}</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(167,139,250,0.2)'}}>
          <span style={s.kpiL}>🔗 Cartão + Agregado</span><span style={{...s.kpiV,color:'#a78bfa'}}>{totalB}</span>
        </div>
        <div style={{...s.kpi,borderColor:'rgba(52,211,153,0.2)'}}>
          <span style={s.kpiL}>Potencial Filtrado</span>
          <span style={{...s.kpiV,color:'#34d399',fontSize:'1rem'}}>{fmt(potTotal)}</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={s.filtrosBox}>
        <div style={{flex:3,minWidth:240}}>
          <div style={s.filtroL}>🔍 Buscar</div>
          <input style={s.input} placeholder="Nome, CNPJ, ID, consultor..."
            value={busca} onChange={e=>setBusca(e.target.value)}/>
        </div>
        <div style={{flex:1,minWidth:140}}>
          <div style={s.filtroL}>Categoria</div>
          <select style={s.select} value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{flex:1,minWidth:160}}>
          <div style={s.filtroL}>Tipo</div>
          <select style={s.select} value={filtroProduto} onChange={e=>setFiltroProduto(e.target.value)}>
            <option value="">Todos</option>
            <option value="cartao">🃏 Só Cartão</option>
            <option value="agregado">📦 Só Agregado</option>
            <option value="ambos">🔗 Cartão + Agregado</option>
          </select>
        </div>
        {(busca||filtroCategoria||filtroProduto)&&(
          <div style={{display:'flex',alignItems:'flex-end'}}>
            <button style={s.btnLimpar} onClick={()=>{setBusca('');setFiltroCategoria('');setFiltroProduto('');}}>✕ Limpar</button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={s.card}>
        {loading ? (
          <div style={{textAlign:'center',padding:48}}>
            <div style={s.spin}></div>
            <div style={{color:'#6b7280'}}>Carregando...</div>
          </div>
        ) : (
          <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'62vh',
            border:'1px solid rgba(255,255,255,0.05)',borderRadius:8}}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Empresa','CNPJ','Cartões','Agregados','Potencial','Consultor','Cidade/UF','Status',''].map(h=>
                    <th key={h} style={{...s.th,position:'sticky',top:0,background:'#1a1f2e',zIndex:2}}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e,i)=>{
                  const temC = e.cartoes.length>0;
                  const temA = e.agregados.length>0;
                  const potencial = e.cartoes.reduce((s,c)=>s+(c.potencial||0),0);
                  const bordaCor = temC&&temA?'#a78bfa':temA?'#f0b429':'transparent';

                  return (
                    <tr key={i}
                      style={{...(i%2===0?{background:'rgba(255,255,255,0.02)'}:{}),
                        cursor:temC?'pointer':'default',transition:'background 0.15s',
                        borderLeft:`3px solid ${bordaCor}`}}
                      onMouseEnter={ev=>ev.currentTarget.style.background='rgba(240,180,41,0.04)'}
                      onMouseLeave={ev=>ev.currentTarget.style.background=i%2===0?'rgba(255,255,255,0.02)':'transparent'}
                      onClick={()=>{if(temC)router.push(`/gestao/${e.cartoes[0].id}`);}}>

                      <td style={{...s.td,fontWeight:600,minWidth:180,maxWidth:240,
                        overflow:'hidden',textOverflow:'ellipsis'}} title={e.nome}>{e.nome}</td>

                      <td style={{...s.td,color:'#6b7280',fontSize:'0.72rem'}}>{e.cnpj||'—'}</td>

                      {/* Cartões */}
                      <td style={{...s.td,maxWidth:220}}>
                        {temC ? (
                          <div style={{display:'flex',flexDirection:'column',gap:3}}>
                            {e.cartoes.map((c,ci)=>{
                              const cor=COR_CAT[c.categoria]||'#9ca3af';
                              return (
                                <span key={ci} style={{display:'flex',alignItems:'center',gap:4}}>
                                  <span style={{background:`${cor}18`,color:cor,border:`1px solid ${cor}30`,
                                    borderRadius:5,padding:'1px 6px',fontSize:'0.65rem',fontWeight:600,whiteSpace:'nowrap'}}>
                                    {c.categoria}
                                  </span>
                                  <span style={{color:'#9ca3af',fontSize:'0.75rem'}}>{c.produto}</span>
                                </span>
                              );
                            })}
                          </div>
                        ):<span style={{color:'#374151',fontSize:'0.75rem'}}>—</span>}
                      </td>

                      {/* Agregados */}
                      <td style={{...s.td,maxWidth:220}}>
                        {temA ? (
                          <div style={{display:'flex',flexDirection:'column',gap:3}}>
                            {e.agregados.map((a,ai)=>(
                              <span key={ai} style={{display:'flex',alignItems:'center',gap:4}}>
                                <span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',
                                  border:'1px solid rgba(240,180,41,0.25)',borderRadius:5,
                                  padding:'1px 6px',fontSize:'0.65rem',fontWeight:600,whiteSpace:'nowrap'}}>
                                  {a.isCombo?'🔗':' 📦'}
                                </span>
                                <span style={{color:'#9ca3af',fontSize:'0.75rem',whiteSpace:'nowrap'}}>{a.label}</span>
                              </span>
                            ))}
                          </div>
                        ):<span style={{color:'#374151',fontSize:'0.75rem'}}>—</span>}
                      </td>

                      <td style={{...s.td,color:potencial>0?'#34d399':'#374151',fontWeight:600}}>
                        {potencial>0?fmt(potencial):'—'}
                      </td>
                      <td style={{...s.td,color:'#9ca3af',fontSize:'0.8rem'}}>{e.consultor}</td>
                      <td style={{...s.td,color:'#6b7280',fontSize:'0.78rem'}}>
                        {e.cidade&&e.cidade!=='—'?`${e.cidade}/${e.estado}`:'—'}
                      </td>
                      <td style={s.td}>
                        <span style={{background:e.ativo?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)',
                          color:e.ativo?'#34d399':'#f87171',
                          border:`1px solid ${e.ativo?'rgba(52,211,153,0.3)':'rgba(248,113,113,0.3)'}`,
                          borderRadius:6,padding:'2px 8px',fontSize:'0.68rem',fontWeight:600}}>
                          {e.ativo?'Ativa':'Inativa'}
                        </span>
                      </td>
                      <td style={s.td} onClick={ev=>ev.stopPropagation()}>
                        <div style={{display:'flex',gap:6}}>
                          {temC&&<button onClick={()=>router.push(`/gestao/${e.cartoes[0].id}`)}
                            style={{...s.btnAcao,background:'rgba(240,180,41,0.1)',
                              border:'1px solid rgba(240,180,41,0.25)',color:'#f0b429'}}>
                            🃏 Cartão
                          </button>}
                          {temA&&<button onClick={()=>router.push('/agregados')}
                            style={{...s.btnAcao,background:'rgba(240,180,41,0.06)',
                              border:'1px solid rgba(240,180,41,0.15)',color:'#9ca3af'}}>
                            📦 Agregado
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtradas.length===0&&<tr><td colSpan={9} style={{...s.td,textAlign:'center',padding:40,color:'#4b5563'}}>
                  Nenhuma empresa encontrada
                </td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legenda */}
      <div style={{display:'flex',gap:16,marginTop:14,flexWrap:'wrap'}}>
        {[['#a78bfa','Cartão + Agregado'],['#f0b429','Só Agregado'],['transparent','Só Cartão']].map(([cor,label])=>(
          <span key={label} style={{display:'flex',alignItems:'center',gap:6,color:'#4b5563',fontSize:'0.75rem'}}>
            <span style={{width:3,height:16,background:cor,borderRadius:2,display:'inline-block'}}></span>
            {label}
          </span>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const s = {
  page:       {maxWidth:1400,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:     {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:16},
  tag:        {color:'#f0b429',fontWeight:800,fontSize:'0.9rem',letterSpacing:2,marginBottom:8,textTransform:'uppercase'},
  title:      {fontSize:'1.8rem',fontWeight:700,margin:'0 0 6px'},
  sub:        {color:'#6b7280',fontSize:'0.9rem'},
  tabBtn:     {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'8px 16px',color:'#6b7280',cursor:'pointer',fontSize:'0.82rem',fontWeight:500,fontFamily:'inherit'},
  tabBtnAtivo:{background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.3)',color:'#f0b429',fontWeight:700},
  kpis:       {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:20},
  kpi:        {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px 18px',display:'flex',flexDirection:'column'},
  kpiL:       {color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6},
  kpiV:       {fontSize:'1.4rem',fontWeight:700},
  filtrosBox: {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'20px 24px',marginBottom:20,display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-start'},
  filtroL:    {color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6},
  input:      {background:'#1e2235',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',width:'100%',outline:'none'},
  select:     {background:'#1e2235',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',width:'100%',outline:'none'},
  btnLimpar:  {background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:8,padding:'8px 14px',color:'#f87171',cursor:'pointer',fontSize:'0.82rem',fontWeight:600,fontFamily:'inherit'},
  btnAcao:    {borderRadius:7,padding:'4px 10px',cursor:'pointer',fontSize:'0.72rem',fontWeight:600,fontFamily:'inherit',whiteSpace:'nowrap'},
  card:       {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:20},
  table:      {width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'},
  th:         {padding:'8px 12px',textAlign:'left',color:'#6b7280',fontWeight:500,borderBottom:'1px solid rgba(255,255,255,0.07)',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.68rem',letterSpacing:0.5},
  td:         {padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'},
  spin:       {width:36,height:36,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 16px',animation:'spin 0.8s linear infinite'},
};
