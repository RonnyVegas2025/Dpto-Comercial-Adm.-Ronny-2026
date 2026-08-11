'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtK   = (v) => { const n = Number(v||0); return n >= 1000000 ? `R$ ${(n/1000000).toFixed(1)}M` : n >= 1000 ? `R$ ${(n/1000).toFixed(0)}K` : fmt(n); };
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };

async function fetchAll(query) {
  let all=[], from=0;
  while(true) {
    const {data,error} = await query.range(from, from+999);
    if(error||!data||!data.length) break;
    all=[...all,...data];
    if(data.length<1000) break;
    from+=1000;
  }
  return all;
}

const DIRETOR_POR_GESTOR = {
  'Fabiano':'Rossi','Vago':'Rossi','Wagner Fernandes':'Rossi',
  'Ronny Peterson':'Ronny','William':'Ronny',
};

const CORES_GESTOR = {
  'Fabiano':    '#60a5fa',
  'Vago':       '#34d399',
  'Wagner Fernandes': '#f0b429',
  'Ronny Peterson':   '#a78bfa',
  'William':    '#f97316',
};

function BarraProgresso({ valor, maximo, cor='#34d399', altura=8 }) {
  const pct = maximo > 0 ? Math.min((valor/maximo)*100, 100) : 0;
  return (
    <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:4, height:altura, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:cor, borderRadius:4, transition:'width 0.5s' }} />
    </div>
  );
}

function CardKPI({ label, valor, sub, cor='#e8eaf0', borderColor='rgba(255,255,255,0.07)', icon }) {
  return (
    <div style={{ background:'#161a26', border:`1px solid ${borderColor}`, borderRadius:14, padding:'16px 20px', display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ color:'#6b7280', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
        {icon && <span>{icon}</span>}{label}
      </div>
      <div style={{ fontSize:'1.4rem', fontWeight:700, color:cor }}>{valor}</div>
      {sub && <div style={{ color:'#4b5563', fontSize:'0.72rem' }}>{sub}</div>}
    </div>
  );
}

function GraficoBarras({ dados, label, valorKey, corKey, height=120 }) {
  const max = Math.max(...dados.map(d => d[valorKey]||0), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height, padding:'0 4px' }}>
      {dados.map((d, i) => {
        const pct = (d[valorKey]||0)/max*100;
        const cor = d[corKey] || '#34d399';
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ fontSize:'0.6rem', color:'#6b7280', fontWeight:600 }}>{fmtK(d[valorKey])}</div>
            <div style={{ width:'100%', height:`${pct}%`, background:cor, borderRadius:'3px 3px 0 0', minHeight:4, transition:'height 0.5s' }} />
            <div style={{ fontSize:'0.6rem', color:'#9ca3af', textAlign:'center', lineHeight:1.2, wordBreak:'break-word' }}>
              {d.label?.split(' ')[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardDiretor() {
  const [loading, setLoading]     = useState(true);
  const [mesSel, setMesSel]       = useState('');
  const [meses, setMeses]         = useState([]);
  const [visao, setVisao]         = useState('geral'); // geral | rossi | ronny
  const [dados, setDados]         = useState(null);

  useEffect(() => { carregarMeses(); }, []);
  useEffect(() => { if(mesSel) carregarDados(); }, [mesSel]);

  async function carregarMeses() {
    const { data } = await supabase.from('liberacoes').select('competencia').order('competencia', {ascending:false}).limit(100);
    const unicos = [...new Set((data||[]).map(l => l.competencia?.substring(0,7)))].slice(0,12);
    setMeses(unicos);
    if(unicos.length) setMesSel(unicos[0]);
  }

  async function carregarDados() {
    setLoading(true);
    try {
      const comp = mesSel + '-01';

      // Busca dados em paralelo
      const [empresas, libs, vmetas, consults] = await Promise.all([
        fetchAll(supabase.from('empresas').select(`
          id, produto_id, nome, categoria, produto_contratado, potencial_movimentacao, peso_categoria,
          pct_principal, pct_agregado_1, pct_agregado_2,
          consultor_principal:consultor_principal_id(id,nome,gestor,diretor,equipe),
          consultor_agregado:consultor_agregado_id(id,nome,gestor),
          consultor_agregado_2:consultor_agregado_2_id(id,nome,gestor)
        `).eq('ativo',true)),
        fetchAll(supabase.from('liberacoes').select('produto_id,competencia,total_liberado').eq('competencia',comp)),
        fetchAll(supabase.from('valor_meta_empresa').select('empresa_id,consultor_id,competencia_meta,valor_meta,regra').eq('competencia_meta',comp)),
        fetchAll(supabase.from('consultores').select('id,nome,gestor,diretor,equipe').eq('ativo',true)),
      ]);

      // Mapas
      const libMap = {};
      for(const l of libs) { libMap[l.produto_id] = (libMap[l.produto_id]||0) + l.total_liberado; }

      const metaMap = {};
      for(const v of (vmetas||[])) {
        const key = `${v.empresa_id}__${v.consultor_id||'null'}`;
        if(!metaMap[v.empresa_id]) metaMap[v.empresa_id] = [];
        metaMap[v.empresa_id].push(v);
      }

      const consultMap = {};
      for(const c of (consults||[])) consultMap[c.id] = c;

      // Processa por gestor
      const porGestor = {};
      for(const e of empresas) {
        const cons = e.consultor_principal;
        if(!cons) continue;
        const gestor = cons.gestor || '—';
        if(!porGestor[gestor]) porGestor[gestor] = {
          gestor, diretor: DIRETOR_POR_GESTOR[gestor]||'—',
          totalMovimentado:0, totalMeta:0, totalPrevisto:0,
          empresas:0, naMeta:0, movimentaram:0,
          categorias:{}, equipes:{},
        };

        const mov = libMap[e.produto_id] || 0;
        const fator = (e.pct_principal||100)/100;
        const movConsultor = mov * fator;
        const previsto = (e.potencial_movimentacao||0) * (e.peso_categoria||1) * fator;

        porGestor[gestor].totalMovimentado += movConsultor;
        porGestor[gestor].totalPrevisto += previsto;
        porGestor[gestor].empresas += 1;
        if(mov > 0) porGestor[gestor].movimentaram += 1;

        const metas = metaMap[e.id] || [];
        const metaConsultor = metas.find(m => m.consultor_id === cons.id || m.consultor_id === null);
        if(metaConsultor) {
          porGestor[gestor].totalMeta += metaConsultor.valor_meta||0;
          porGestor[gestor].naMeta += 1;
        }

        // Por categoria
        const cat = e.categoria || 'Outros';
        if(!porGestor[gestor].categorias[cat]) porGestor[gestor].categorias[cat] = {mov:0, count:0};
        porGestor[gestor].categorias[cat].mov += movConsultor;
        porGestor[gestor].categorias[cat].count += 1;
      }

      // Histórico últimos 6 meses
      const ultimos6 = meses.slice(0, 6).reverse();
      const libsHist = await fetchAll(
        supabase.from('liberacoes').select('produto_id,competencia,total_liberado')
          .in('competencia', ultimos6.map(m => m+'-01'))
      );
      const histMap = {};
      for(const l of libsHist) {
        const comp2 = l.competencia?.substring(0,7);
        histMap[comp2] = (histMap[comp2]||0) + l.total_liberado;
      }

      setDados({ porGestor, histMap, ultimos6, totalEmpresas: empresas.length });
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  const gestores = dados ? Object.values(dados.porGestor) : [];

  const gestoresFiltrados = useMemo(() => {
    if(visao === 'geral') return gestores;
    if(visao === 'rossi') return gestores.filter(g => DIRETOR_POR_GESTOR[g.gestor] === 'Rossi');
    if(visao === 'ronny') return gestores.filter(g => DIRETOR_POR_GESTOR[g.gestor] === 'Ronny');
    return gestores;
  }, [gestores, visao]);

  const totais = useMemo(() => ({
    movimentado: gestoresFiltrados.reduce((s,g)=>s+g.totalMovimentado,0),
    meta:        gestoresFiltrados.reduce((s,g)=>s+g.totalMeta,0),
    previsto:    gestoresFiltrados.reduce((s,g)=>s+g.totalPrevisto,0),
    empresas:    gestoresFiltrados.reduce((s,g)=>s+g.empresas,0),
    naMeta:      gestoresFiltrados.reduce((s,g)=>s+g.naMeta,0),
    movimentaram:gestoresFiltrados.reduce((s,g)=>s+g.movimentaram,0),
  }), [gestoresFiltrados]);

  const pctAtivacao = totais.empresas > 0 ? (totais.movimentaram/totais.empresas)*100 : 0;
  const pctMeta     = totais.previsto > 0 ? (totais.movimentado/totais.previsto)*100 : 0;

  if(loading && !dados) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={s.spin}/>
        <div style={{ color:'#6b7280' }}>Carregando dashboard...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`}</style>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ color:'#f0b429', fontWeight:800, fontSize:'0.85rem', letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>♠ Vegas Card</div>
          <h1 style={{ fontSize:'1.8rem', fontWeight:700, margin:'0 0 6px' }}>Dashboard Executivo</h1>
          <p style={{ color:'#6b7280', fontSize:'0.9rem' }}>Visão consolidada de resultados por diretoria</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
            style={{ background:'#1e2435', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, padding:'9px 14px', color:'#e8eaf0', fontSize:'0.85rem', fontFamily:'inherit', cursor:'pointer', outline:'none' }}>
            {meses.map(m=><option key={m} value={m}>{fmtMes(m+'-01')}</option>)}
          </select>
        </div>
      </div>

      {/* Abas de visão */}
      <div style={{ display:'flex', gap:6, marginBottom:24 }}>
        {[
          { key:'geral', label:'🌐 Visão Geral', sub:'Todas as diretorias' },
          { key:'rossi', label:'👔 Diretoria Rossi', sub:'Fabiano · Vago · Wagner' },
          { key:'ronny', label:'👔 Diretoria Ronny', sub:'Ronny Peterson · William' },
        ].map(v => (
          <button key={v.key} onClick={()=>setVisao(v.key)}
            style={{ background: visao===v.key ? 'rgba(240,180,41,0.12)' : 'rgba(255,255,255,0.04)', border:`1px solid ${visao===v.key ? 'rgba(240,180,41,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius:12, padding:'10px 20px', color: visao===v.key ? '#f0b429' : '#6b7280', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
            <div style={{ fontWeight:700, fontSize:'0.88rem' }}>{v.label}</div>
            <div style={{ fontSize:'0.7rem', marginTop:2, opacity:0.7 }}>{v.sub}</div>
          </button>
        ))}
      </div>

      {/* KPIs principais */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:14, marginBottom:24 }}>
        <CardKPI icon="💰" label="Total Movimentado" valor={fmtK(totais.movimentado)} sub={fmtMes(mesSel+'-01')} cor="#34d399" borderColor="rgba(52,211,153,0.3)" />
        <CardKPI icon="🎯" label="Meta Apurada" valor={fmtK(totais.meta)} sub={`${totais.naMeta} empresas na meta`} cor="#60a5fa" borderColor="rgba(96,165,250,0.3)" />
        <CardKPI icon="📊" label="Potencial/mês" valor={fmtK(totais.previsto)} sub="base dos contratos" cor="#a78bfa" borderColor="rgba(167,139,250,0.3)" />
        <CardKPI icon="✅" label="% Ativação" valor={fmtPct(pctAtivacao)} sub={`${totais.movimentaram} de ${totais.empresas} movimentaram`} cor={pctAtivacao>=70?'#34d399':pctAtivacao>=50?'#f0b429':'#f87171'} borderColor={pctAtivacao>=70?'rgba(52,211,153,0.3)':pctAtivacao>=50?'rgba(240,180,41,0.3)':'rgba(248,113,113,0.3)'} />
        <CardKPI icon="📈" label="Realizado vs Potencial" valor={fmtPct(pctMeta)} sub={totais.movimentado>totais.previsto?'🟢 Acima do potencial':'🔴 Abaixo do potencial'} cor={pctMeta>=80?'#34d399':pctMeta>=60?'#f0b429':'#f87171'} borderColor="rgba(255,255,255,0.07)" />
        <CardKPI icon="🏢" label="Total Contratos" valor={totais.empresas.toLocaleString('pt-BR')} sub="empresas ativas" cor="#e8eaf0" />
      </div>

      {/* Grid principal: Gráfico histórico + Ranking gestores */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>

        {/* Histórico últimos meses */}
        <div style={{ background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 }}>
          <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:6 }}>📅 Histórico de Movimentação</div>
          <div style={{ color:'#6b7280', fontSize:'0.78rem', marginBottom:20 }}>Últimos {dados?.ultimos6?.length||6} meses · todas as categorias</div>
          {dados && (
            <GraficoBarras
              dados={dados.ultimos6.map(m=>({ label:fmtMes(m+'-01'), totalMovimentado:dados.histMap[m]||0, cor:'#34d399' }))}
              valorKey="totalMovimentado" corKey="cor" height={140}
            />
          )}
          <div style={{ marginTop:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ color:'#4b5563', fontSize:'0.72rem' }}>Movimentação total da empresa</div>
            <div style={{ color:'#34d399', fontWeight:700, fontSize:'0.85rem' }}>{fmtK(totais.movimentado)} este mês</div>
          </div>
        </div>

        {/* Ranking por gestor */}
        <div style={{ background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 }}>
          <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:6 }}>🏆 Performance por Gestor</div>
          <div style={{ color:'#6b7280', fontSize:'0.78rem', marginBottom:16 }}>{fmtMes(mesSel+'-01')} · movimentação vs potencial</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gestoresFiltrados
              .sort((a,b)=>b.totalMovimentado-a.totalMovimentado)
              .map((g,i) => {
                const cor = CORES_GESTOR[g.gestor] || '#34d399';
                const pct = g.totalPrevisto>0 ? (g.totalMovimentado/g.totalPrevisto)*100 : 0;
                return (
                  <div key={g.gestor}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ background:cor+'20', color:cor, borderRadius:6, padding:'2px 8px', fontSize:'0.7rem', fontWeight:700 }}>#{i+1}</span>
                        <span style={{ fontWeight:600, fontSize:'0.85rem' }}>{g.gestor}</span>
                        <span style={{ color:'#4b5563', fontSize:'0.7rem' }}>→ {g.diretor}</span>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ color:cor, fontWeight:700, fontSize:'0.88rem' }}>{fmtK(g.totalMovimentado)}</div>
                        <div style={{ color:'#4b5563', fontSize:'0.68rem' }}>{fmtPct(pct)} do potencial</div>
                      </div>
                    </div>
                    <BarraProgresso valor={g.totalMovimentado} maximo={g.totalPrevisto} cor={cor} />
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Cards detalhados por gestor */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:16 }}>📋 Detalhamento por Equipe</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:16 }}>
          {gestoresFiltrados
            .sort((a,b)=>b.totalMovimentado-a.totalMovimentado)
            .map(g => {
              const cor = CORES_GESTOR[g.gestor] || '#34d399';
              const pctAtiv = g.empresas>0 ? (g.movimentaram/g.empresas)*100 : 0;
              const pctPot  = g.totalPrevisto>0 ? (g.totalMovimentado/g.totalPrevisto)*100 : 0;
              const cats = Object.entries(g.categorias).sort((a,b)=>b[1].mov-a[1].mov);
              return (
                <div key={g.gestor} style={{ background:'#161a26', border:`1px solid ${cor}30`, borderRadius:16, padding:20 }}>
                  {/* Header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:3 }}>👔 {g.gestor}</div>
                      <div style={{ color:'#4b5563', fontSize:'0.7rem' }}>Diretoria {g.diretor}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ color:cor, fontWeight:700, fontSize:'1.1rem' }}>{fmtK(g.totalMovimentado)}</div>
                      <div style={{ color:'#4b5563', fontSize:'0.68rem' }}>{g.empresas} contratos</div>
                    </div>
                  </div>

                  {/* Barra principal */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ color:'#6b7280', fontSize:'0.68rem' }}>Movimentado vs Potencial</span>
                      <span style={{ color:pctPot>=80?'#34d399':pctPot>=50?'#f0b429':'#f87171', fontSize:'0.72rem', fontWeight:700 }}>{fmtPct(pctPot)}</span>
                    </div>
                    <BarraProgresso valor={g.totalMovimentado} maximo={g.totalPrevisto} cor={cor} altura={6} />
                  </div>

                  {/* Stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                    <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Meta Apurada</div>
                      <div style={{ color:'#60a5fa', fontWeight:700, fontSize:'0.85rem' }}>{fmtK(g.totalMeta)}</div>
                      <div style={{ color:'#374151', fontSize:'0.62rem' }}>{g.naMeta} empresas</div>
                    </div>
                    <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Ativação</div>
                      <div style={{ color:pctAtiv>=70?'#34d399':pctAtiv>=50?'#f0b429':'#f87171', fontWeight:700, fontSize:'0.85rem' }}>{fmtPct(pctAtiv)}</div>
                      <div style={{ color:'#374151', fontSize:'0.62rem' }}>{g.movimentaram}/{g.empresas} mov.</div>
                    </div>
                  </div>

                  {/* Por categoria */}
                  {cats.length > 0 && (
                    <div>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>Por Categoria</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        {cats.slice(0,3).map(([cat,val])=>(
                          <div key={cat} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ color:'#9ca3af', fontSize:'0.72rem' }}>{cat}</span>
                            <span style={{ color:'#e8eaf0', fontWeight:600, fontSize:'0.72rem' }}>{fmtK(val.mov)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Comparativo diretorias (só na visão geral) */}
      {visao === 'geral' && (
        <div style={{ background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 }}>
          <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:16 }}>⚖️ Comparativo por Diretoria</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {['Rossi','Ronny'].map(dir => {
              const gsDiretor = gestores.filter(g=>DIRETOR_POR_GESTOR[g.gestor]===dir);
              const movDir    = gsDiretor.reduce((s,g)=>s+g.totalMovimentado,0);
              const metaDir   = gsDiretor.reduce((s,g)=>s+g.totalMeta,0);
              const prevDir   = gsDiretor.reduce((s,g)=>s+g.totalPrevisto,0);
              const empDir    = gsDiretor.reduce((s,g)=>s+g.empresas,0);
              const movDir2   = gsDiretor.reduce((s,g)=>s+g.movimentaram,0);
              const pct       = prevDir>0?(movDir/prevDir)*100:0;
              const cor       = dir==='Rossi'?'#60a5fa':'#a78bfa';
              return (
                <div key={dir} style={{ background:'rgba(255,255,255,0.02)', borderRadius:12, padding:20, border:`1px solid ${cor}25` }}>
                  <div style={{ color:cor, fontWeight:700, fontSize:'1rem', marginBottom:12 }}>👔 Diretoria {dir}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                    <div>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Movimentado</div>
                      <div style={{ color:'#34d399', fontWeight:700, fontSize:'1rem' }}>{fmtK(movDir)}</div>
                    </div>
                    <div>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Meta</div>
                      <div style={{ color:'#60a5fa', fontWeight:700, fontSize:'1rem' }}>{fmtK(metaDir)}</div>
                    </div>
                    <div>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Potencial</div>
                      <div style={{ color:'#a78bfa', fontWeight:700, fontSize:'0.88rem' }}>{fmtK(prevDir)}</div>
                    </div>
                    <div>
                      <div style={{ color:'#4b5563', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Ativação</div>
                      <div style={{ color:'#f0b429', fontWeight:700, fontSize:'0.88rem' }}>{empDir>0?fmtPct(movDir2/empDir*100):'—'}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ color:'#6b7280', fontSize:'0.68rem' }}>Realizado vs Potencial</span>
                      <span style={{ color:pct>=80?'#34d399':pct>=50?'#f0b429':'#f87171', fontSize:'0.72rem', fontWeight:700 }}>{fmtPct(pct)}</span>
                    </div>
                    <BarraProgresso valor={movDir} maximo={prevDir} cor={cor} altura={6} />
                  </div>
                  <div style={{ color:'#4b5563', fontSize:'0.68rem', marginTop:8 }}>{gsDiretor.length} gestores · {empDir} contratos</div>
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
  page: { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans', sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh', boxSizing:'border-box' },
  spin: { width:36, height:36, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
};
