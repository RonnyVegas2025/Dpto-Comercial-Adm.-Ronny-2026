'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Wallet, Target, BarChart3, CheckCircle2, TrendingUp, TrendingDown,
  Building2, Globe, Users, CalendarDays, Trophy, ClipboardList, Scale,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtK   = (v) => fmt(v);
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

// Paleta derivada da marca (VEGAS PLATFORM UI STANDARD v1.0)
const CORES_GESTOR = {
  'Fabiano':          '#4D56A1',
  'Vago':             '#6E68AE',
  'Wagner Fernandes': '#9E7A9C',
  'Ronny Peterson':   '#7A5A78',
  'William':          '#D69086',
};

const ICON = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = {
  background:'var(--vg-surface)', border:'1px solid var(--vg-border)',
  borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)',
};
const H_CARD = { fontFamily:"'Outfit', sans-serif", fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };

function BarraProgresso({ valor, maximo, cor='var(--vg-brand-500)', altura=8 }) {
  const pct = maximo > 0 ? Math.min((valor/maximo)*100, 100) : 0;
  return (
    <div style={{ background:'var(--vg-neutral-bg)', borderRadius:4, height:altura, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:cor, borderRadius:4, transition:'width 0.5s' }} />
    </div>
  );
}

function CardKPI({ label, valor, sub, cor='var(--vg-ink)', icon, subCor='var(--vg-ink-secondary)' }) {
  return (
    <div style={{ ...cardStyle, display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, display:'flex', alignItems:'center', gap:6 }}>
        {icon}{label}
      </div>
      <div className="vg-num" style={{ fontFamily:"'Outfit', sans-serif", fontSize:24, lineHeight:'32px', fontWeight:600, color:cor }}>{valor}</div>
      {sub && <div style={{ fontSize:12, lineHeight:'18px', color:subCor, display:'flex', alignItems:'center', gap:5 }}>{sub}</div>}
    </div>
  );
}

function GraficoBarras({ dados, valorKey, corKey, height=120 }) {
  const max = Math.max(...dados.map(d => d[valorKey]||0), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height, padding:'0 4px' }}>
      {dados.map((d, i) => {
        const pct = (d[valorKey]||0)/max*100;
        const cor = d[corKey] || 'var(--vg-brand-500)';
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div className="vg-num" style={{ ...CAPTION, fontWeight:500 }}>{fmtK(d[valorKey])}</div>
            <div style={{ width:'100%', height:`${pct}%`, background:cor, borderRadius:'4px 4px 0 0', minHeight:4, transition:'height 0.5s' }} />
            <div style={{ ...CAPTION, textAlign:'center', wordBreak:'break-word' }}>{d.label?.split(' ')[0]}</div>
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
      const ultimos6 = [...meses].reverse();
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

  // ── Camada visual (VEGAS PLATFORM UI STANDARD v1.0) ──────────────────
  const corAtiv = pctAtivacao>=70 ? 'var(--vg-success-fg)' : pctAtivacao>=50 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';
  const corMeta = pctMeta>=80 ? 'var(--vg-success-fg)' : pctMeta>=60 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';

  if(loading && !dados) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={s.spin}/>
        <div style={{ color:'var(--vg-muted)', fontSize:14 }}>Carregando dashboard...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`}</style>

      {/* Faixa de gradiente no topo da página */}
      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      {/* Cabeçalho */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24, flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Dashboard Executivo</div>
          <h1 style={{ fontFamily:"'Outfit', sans-serif", fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Dashboard Executivo</h1>
          <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Visão consolidada de resultados por diretoria</p>
        </div>
        <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
          style={{ background:'var(--vg-surface)', border:'1px solid var(--vg-border-field)', borderRadius:'var(--vg-radius)', padding:'9px 14px', color:'var(--vg-ink)', fontSize:14, fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>
          {meses.map(m=><option key={m} value={m}>{fmtMes(m+'-01')}</option>)}
        </select>
      </div>

      {/* Abas de visão */}
      <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
        {[
          { key:'geral', label:'Visão Geral',    sub:'Todas as diretorias',      Icon:Globe },
          { key:'rossi', label:'Diretoria Rossi', sub:'Fabiano · Vago · Wagner',  Icon:Users },
          { key:'ronny', label:'Diretoria Ronny', sub:'Ronny Peterson · William', Icon:Users },
        ].map(v => {
          const ativa = visao===v.key;
          return (
            <button key={v.key} onClick={()=>setVisao(v.key)}
              style={{ position:'relative', overflow:'hidden',
                background: ativa ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
                border:`1px solid ${ativa ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`,
                borderRadius:'var(--vg-radius)', padding:'12px 20px',
                color: ativa ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
                cursor:'pointer', fontFamily:"'Inter', sans-serif", textAlign:'left' }}>
              {ativa && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--vg-gradient)' }} />}
              <div style={{ display:'flex', alignItems:'center', gap:7, fontWeight:600, fontSize:14, lineHeight:'22px' }}>
                <v.Icon size={16} strokeWidth={1.75} color={ativa ? 'var(--vg-brand-500)' : 'var(--vg-ink-secondary)'} />
                {v.label}
              </div>
              <div style={{ ...CAPTION, marginTop:2 }}>{v.sub}</div>
            </button>
          );
        })}
      </div>

      {/* KPIs principais */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:14, marginBottom:24 }}>
        <CardKPI icon={<Wallet {...ICON} />}   label="Total Movimentado" valor={fmtK(totais.movimentado)} sub={fmtMes(mesSel+'-01')} />
        <CardKPI icon={<Target {...ICON} />}   label="Meta Apurada"      valor={fmtK(totais.meta)}        sub={`${totais.naMeta} empresas na meta`} />
        <CardKPI icon={<BarChart3 {...ICON} />} label="Potencial/mês"     valor={fmtK(totais.previsto)}    sub="base dos contratos" />
        <CardKPI icon={<CheckCircle2 {...ICON} />} label="% Ativação" valor={fmtPct(pctAtivacao)} cor={corAtiv} sub={`${totais.movimentaram} de ${totais.empresas} movimentaram`} />
        <CardKPI icon={<TrendingUp {...ICON} />} label="Realizado vs Potencial" valor={fmtPct(pctMeta)} cor={corMeta}
          sub={totais.movimentado>totais.previsto
            ? <><TrendingUp size={13} strokeWidth={1.75} color="var(--vg-success-fg)" /> Acima do potencial</>
            : <><TrendingDown size={13} strokeWidth={1.75} color="var(--vg-danger-fg)" /> Abaixo do potencial</>} />
        <CardKPI icon={<Building2 {...ICON} />} label="Total Contratos" valor={totais.empresas.toLocaleString('pt-BR')} sub="empresas ativas" />
      </div>

      {/* Grid principal: Histórico + Ranking gestores */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>

        {/* Histórico */}
        <div style={cardStyle}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <CalendarDays {...ICON} /> Histórico de Movimentação
          </div>
          <div style={{ ...CAPTION, marginBottom:20 }}>Últimos {dados?.ultimos6?.length||6} meses · todas as categorias</div>
          {dados && (
            <GraficoBarras
              dados={dados.ultimos6.map(m=>({ label:fmtMes(m+'-01'), totalMovimentado:dados.histMap[m]||0, cor:'var(--vg-brand-500)' }))}
              valorKey="totalMovimentado" corKey="cor" height={140}
            />
          )}
          <div style={{ marginTop:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={CAPTION}>Movimentação total da empresa</div>
            <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{fmtK(totais.movimentado)} este mês</div>
          </div>
        </div>

        {/* Ranking por gestor */}
        <div style={cardStyle}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <Trophy {...ICON} /> Performance por Gestor
          </div>
          <div style={{ ...CAPTION, marginBottom:16 }}>{fmtMes(mesSel+'-01')} · movimentação vs potencial</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {gestoresFiltrados
              .sort((a,b)=>b.totalMovimentado-a.totalMovimentado)
              .map((g,i) => {
                const cor = CORES_GESTOR[g.gestor] || 'var(--vg-brand-500)';
                const pct = g.totalPrevisto>0 ? (g.totalMovimentado/g.totalPrevisto)*100 : 0;
                return (
                  <div key={g.gestor}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span className="vg-num" style={{ background:cor+'20', color:cor, borderRadius:6, padding:'2px 8px', fontSize:12, fontWeight:600 }}>#{i+1}</span>
                        <span style={{ fontWeight:500, fontSize:14, color:'var(--vg-ink)' }}>{g.gestor}</span>
                        <span style={CAPTION}>→ {g.diretor}</span>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{fmtK(g.totalMovimentado)}</div>
                        <div className="vg-num" style={CAPTION}>{fmtPct(pct)} do potencial</div>
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
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <ClipboardList {...ICON} /> Detalhamento por Equipe
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:16 }}>
          {gestoresFiltrados
            .sort((a,b)=>b.totalMovimentado-a.totalMovimentado)
            .map(g => {
              const cor = CORES_GESTOR[g.gestor] || 'var(--vg-brand-500)';
              const pctAtiv = g.empresas>0 ? (g.movimentaram/g.empresas)*100 : 0;
              const pctPot  = g.totalPrevisto>0 ? (g.totalMovimentado/g.totalPrevisto)*100 : 0;
              const corPctPot  = pctPot>=80 ? 'var(--vg-success-fg)' : pctPot>=50 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';
              const corPctAtiv = pctAtiv>=70 ? 'var(--vg-success-fg)' : pctAtiv>=50 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';
              const cats = Object.entries(g.categorias).sort((a,b)=>b[1].mov-a[1].mov);
              return (
                <div key={g.gestor} style={cardStyle}>
                  {/* Header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:"'Outfit', sans-serif", fontWeight:600, fontSize:16, lineHeight:'24px', color:'var(--vg-ink)', marginBottom:3 }}>
                        <Users size={16} strokeWidth={1.75} color={cor} /> {g.gestor}
                      </div>
                      <div style={CAPTION}>Diretoria {g.diretor}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:18, fontFamily:"'Outfit', sans-serif" }}>{fmtK(g.totalMovimentado)}</div>
                      <div style={CAPTION}>{g.empresas} contratos</div>
                    </div>
                  </div>

                  {/* Barra principal */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={CAPTION}>Movimentado vs Potencial</span>
                      <span className="vg-num" style={{ color:corPctPot, fontSize:13, lineHeight:'20px', fontWeight:600 }}>{fmtPct(pctPot)}</span>
                    </div>
                    <BarraProgresso valor={g.totalMovimentado} maximo={g.totalPrevisto} cor={cor} altura={6} />
                  </div>

                  {/* Stats — sem card-dentro-de-card: divisor + grid 3 col */}
                  <div style={{ borderTop:'1px solid var(--vg-border)', paddingTop:12, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Meta Apurada</div>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{fmt(g.totalMeta)}</div>
                      <div style={CAPTION}>{g.naMeta} empresas</div>
                    </div>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Potencial/mês</div>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{fmt(g.totalPrevisto)}</div>
                      <div style={CAPTION}>base contratos</div>
                    </div>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Ativação</div>
                      <div className="vg-num" style={{ color:corPctAtiv, fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{fmtPct(pctAtiv)}</div>
                      <div style={CAPTION}>{g.movimentaram}/{g.empresas} mov.</div>
                    </div>
                  </div>

                  {/* Por categoria */}
                  {cats.length > 0 && (
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8 }}>Por Categoria</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        {cats.slice(0,3).map(([cat,val])=>(
                          <div key={cat} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ color:'var(--vg-ink-secondary)', fontSize:13, lineHeight:'20px' }}>{cat}</span>
                            <span className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:13, lineHeight:'20px' }}>{fmtK(val.mov)}</span>
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
        <div style={cardStyle}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <Scale {...ICON} /> Comparativo por Diretoria
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
            {['Rossi','Ronny'].map((dir, di) => {
              const gsDiretor = gestores.filter(g=>DIRETOR_POR_GESTOR[g.gestor]===dir);
              const movDir    = gsDiretor.reduce((s,g)=>s+g.totalMovimentado,0);
              const metaDir   = gsDiretor.reduce((s,g)=>s+g.totalMeta,0);
              const prevDir   = gsDiretor.reduce((s,g)=>s+g.totalPrevisto,0);
              const empDir    = gsDiretor.reduce((s,g)=>s+g.empresas,0);
              const movDir2   = gsDiretor.reduce((s,g)=>s+g.movimentaram,0);
              const pct       = prevDir>0?(movDir/prevDir)*100:0;
              const corPct    = pct>=80 ? 'var(--vg-success-fg)' : pct>=50 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';
              const cor       = dir==='Rossi' ? 'var(--vg-brand-500)' : 'var(--vg-rose-400)';
              return (
                <div key={dir} style={{ paddingLeft: di===1 ? 24 : 0, borderLeft: di===1 ? '1px solid var(--vg-border)' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, color:cor, fontFamily:"'Outfit', sans-serif", fontWeight:600, fontSize:16, lineHeight:'24px', marginBottom:12 }}>
                    <Users size={16} strokeWidth={1.75} color={cor} /> Diretoria {dir}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Movimentado</div>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:16, fontFamily:"'Outfit', sans-serif" }}>{fmtK(movDir)}</div>
                    </div>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Meta</div>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:16, fontFamily:"'Outfit', sans-serif" }}>{fmtK(metaDir)}</div>
                    </div>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Potencial</div>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{fmtK(prevDir)}</div>
                    </div>
                    <div>
                      <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, marginBottom:2 }}>Ativação</div>
                      <div className="vg-num" style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14, fontFamily:"'Outfit', sans-serif" }}>{empDir>0?fmtPct(movDir2/empDir*100):'—'}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={CAPTION}>Realizado vs Potencial</span>
                      <span className="vg-num" style={{ color:corPct, fontSize:13, lineHeight:'20px', fontWeight:600 }}>{fmtPct(pct)}</span>
                    </div>
                    <BarraProgresso valor={movDir} maximo={prevDir} cor={cor} altura={6} />
                  </div>
                  <div style={{ ...CAPTION, marginTop:8 }}>{gsDiretor.length} gestores · {empDir} contratos</div>
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
  page: { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'Inter', sans-serif", color:'var(--vg-ink)', background:'var(--vg-bg)', minHeight:'100vh', boxSizing:'border-box' },
  spin: { width:36, height:36, border:'3px solid var(--vg-border)', borderTop:'3px solid var(--vg-brand-500)', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
};
