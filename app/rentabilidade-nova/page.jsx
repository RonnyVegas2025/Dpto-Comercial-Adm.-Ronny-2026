'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import {
  Wallet, TrendingDown, TrendingUp, Percent, Building2, Users, ChevronRight, ChevronDown,
  BarChart3, FileSpreadsheet, Search, FileText, AlertTriangle,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtInt  = (v) => Number(v||0).toLocaleString('pt-BR');
const fmtPct  = (v, dec=4) => `${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec})}%`;
const fmtTaxa = (v) => `${(Number(v||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`;
const fmtMes  = (d) => { if(!d) return '—'; const [y,m]=String(d).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };
const fFit    = (str, base) => { const n=String(str).length; if(n>=17) return base-6; if(n>=15) return base-4; if(n>=13) return base-2; return base; };

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
async function fetchEmPartes(ids, buildQuery, chunk=300) {
  if(!ids?.length) return [];
  const out=[];
  for(let i=0;i<ids.length;i+=chunk) out.push(...await fetchAll(buildQuery(ids.slice(i,i+chunk))));
  return out;
}

const PERIODO_INI = '2026-01', PERIODO_FIM = '2026-07';
const DIRETORIAS = ['Ronny','Rossi','Sartori'];
const CORES_DIR = { Ronny:'var(--vg-rose-400)', Rossi:'var(--vg-brand-500)', Sartori:'var(--vg-peach-400)' };

const ICON    = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = { background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)' };
const H_CARD  = { fontFamily:"'Outfit', sans-serif", fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
const OUTFIT  = "'Outfit', sans-serif";

function Metrica({ label, valor, icon, destaque=false, corValor, sub }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
      <div style={{ ...LABEL, display:'flex', alignItems:'center', gap:6 }}>{icon}{label}</div>
      <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, lineHeight:1.15, overflowWrap:'anywhere', fontSize: fFit(valor, destaque ? 26 : 20), color: corValor || 'var(--vg-ink)' }}>{valor}</div>
      {sub && <div style={{ ...CAPTION, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// Barras agrupadas (SVG puro) — receita × custo por mês.
function GraficoReceitaCusto({ dados }) {
  if(!dados.length) return <div style={{ ...CAPTION, padding:'24px 0' }}>Sem dados no período.</div>;
  const CR = 'var(--vg-success-fg)', CC = 'var(--vg-danger-fg)';
  const H=200, padL=8, padR=8, padT=22, padB=30;
  const W = Math.max(dados.length*90, 380);
  const iW = W-padL-padR, iH = H-padT-padB;
  const max = Math.max(...dados.map(d => Math.max(d.receita, d.custo)), 1);
  const slot = iW/dados.length;
  const bw = Math.min(20, slot*0.28);
  const gc = (i) => padL + (i+0.5)*slot; // centro do grupo
  return (
    <div>
      <div style={{ display:'flex', gap:16, marginBottom:8 }}>
        <span style={{ ...CAPTION, display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:10, height:10, borderRadius:3, background:CR }} /> Receita</span>
        <span style={{ ...CAPTION, display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:10, height:10, borderRadius:3, background:CC }} /> Custo</span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <svg width={W} height={H} style={{ display:'block', minWidth:'100%' }}>
          {dados.map((d,i) => {
            const hr=(d.receita/max)*iH, hc=(d.custo/max)*iH, c=gc(i);
            return (
              <g key={d.mes}>
                <title>{`${fmtMes(d.mes+'-01')}\nReceita ${fmt(d.receita)}\nCusto ${fmt(d.custo)}`}</title>
                <rect x={c-bw-2} y={padT+iH-hr} width={bw} height={Math.max(hr,1)} fill={CR} rx="3" />
                <rect x={c+2}    y={padT+iH-hc} width={bw} height={Math.max(hc,1)} fill={CC} rx="3" />
                <text x={c} y={H-10} textAnchor="middle" fontSize="10" fontFamily="'Inter',sans-serif" fill="var(--vg-muted)">{fmtMes(d.mes+'-01').split('/')[0]}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function RentabilidadeNova() {
  const [dados, setDados]         = useState(null);
  const [meses, setMeses]         = useState([]);
  const [mesesSel, setMesesSel]   = useState(() => new Set()); // vazio = Todos
  const [somenteTaxa, setSomenteTaxa] = useState(false);
  const [dirsSel, setDirsSel]     = useState(() => new Set()); // vazio = Geral
  const [expandidos, setExpandidos] = useState(new Set());
  const [busca, setBusca]         = useState('');
  const [pagina, setPagina]       = useState(1);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { carregar(); }, []);
  useEffect(() => { setPagina(1); }, [mesesSel, somenteTaxa, dirsSel, busca]);

  async function carregar() {
    setLoading(true);
    try {
      const empresas = await fetchAll(supabase.from('empresas').select(
        `id, produto_id, nome, categoria, produto_contratado, taxa_negativa, taxa_positiva, taxa_bandeira,
         consultor_principal:consultor_principal_id(id,nome,diretor,gestor)`)
        .not('produto_contratado','ilike','%desconto condicional%'));

      // Completude da receita (global, não depende de filtros): empresas com taxa positiva ou bandeira > 0.
      const totalCad   = empresas.length;
      const comReceita = empresas.filter(e => (Number(e.taxa_positiva)||0) > 0 || (Number(e.taxa_bandeira)||0) > 0).length;

      const prodIds = empresas.map(e => e.produto_id).filter(v => v != null);
      const libs = await fetchEmPartes(prodIds, (ids) =>
        supabase.from('liberacoes').select('produto_id,competencia,total_liberado')
          .in('produto_id', ids)
          .gte('competencia', PERIODO_INI+'-01').lte('competencia', PERIODO_FIM+'-31'), 200);

      const libByProd = {};
      for(const l of libs) {
        const m = l.competencia?.substring(0,7);
        if(!m || m < PERIODO_INI || m > PERIODO_FIM) continue;
        (libByProd[l.produto_id] = libByProd[l.produto_id] || {})[m] =
          (libByProd[l.produto_id][m] || 0) + (l.total_liberado || 0);
      }

      // Spread importado dos comércios (valor absoluto, não percentual) por produto → mês.
      const spreadsRows = await fetchEmPartes(prodIds, (ids) =>
        supabase.from('spreads').select('produto_id,competencia,spread_planilha')
          .in('produto_id', ids)
          .gte('competencia', PERIODO_INI+'-01').lte('competencia', PERIODO_FIM+'-31'), 200);
      const spreadByProd = {};
      for(const sp of spreadsRows) {
        const m = sp.competencia?.substring(0,7);
        if(!m || m < PERIODO_INI || m > PERIODO_FIM) continue;
        (spreadByProd[sp.produto_id] = spreadByProd[sp.produto_id] || {})[m] =
          (spreadByProd[sp.produto_id][m] || 0) + (Number(sp.spread_planilha) || 0);
      }

      const mesesUnion = [...new Set(libs.map(l => l.competencia?.substring(0,7)).filter(m => m && m >= PERIODO_INI && m <= PERIODO_FIM))].sort();

      setDados({ empresas, libByProd, spreadByProd, receitaConfig: { com: comReceita, total: totalCad } });
      setMeses(mesesUnion);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  const view = useMemo(() => {
    if(!dados) return null;
    const { empresas, libByProd, spreadByProd } = dados;

    const modoGeral = dirsSel.size === 0;
    const inEscopo  = (dir) => modoGeral || dirsSel.has(dir);
    const selMonths = mesesSel.size ? meses.filter(m => mesesSel.has(m)) : meses;

    const recargaMes  = (e, m) => (libByProd[e.produto_id]?.[m] || 0);
    const recargaSel  = (e) => selMonths.reduce((s,m) => s + recargaMes(e,m), 0);
    const comerciosMes = (e, m) => (spreadByProd[e.produto_id]?.[m] || 0);
    const comerciosSel = (e) => selMonths.reduce((s,m) => s + comerciosMes(e,m), 0);

    // Base (meses selecionados + escopo + toggle): empresas com recarga no período.
    const base = [];
    for(const e of empresas) {
      const dir = e.consultor_principal?.diretor || null;
      if(!inEscopo(dir)) continue;
      const taxa = Number(e.taxa_negativa) || 0;
      if(somenteTaxa && !(taxa > 0)) continue;
      const recarga = recargaSel(e);
      if(recarga <= 0) continue;
      const taxaPos = Number(e.taxa_positiva) || 0;
      const taxaBand = Number(e.taxa_bandeira) || 0;
      const custo = recarga * taxa;
      const recTaxa = recarga * taxaPos;
      const recBand = recarga * taxaBand;
      const recComercios = comerciosSel(e); // valor importado, não multiplicar
      const receita = recTaxa + recBand + recComercios;
      base.push({
        id:e.id, produto_id:e.produto_id, nome:e.nome, categoria:e.categoria, produto:e.produto_contratado,
        dir, gestor:e.consultor_principal?.gestor || null, vendedor:e.consultor_principal?.nome || '—',
        taxa, taxaPos, taxaBand, recarga, custo, recTaxa, recBand, recComercios, receita, spread: receita - custo,
      });
    }

    const totalRecarga    = base.reduce((s,e) => s + e.recarga, 0);
    const totalCusto      = base.reduce((s,e) => s + e.custo, 0);
    const totalRecTaxa    = base.reduce((s,e) => s + e.recTaxa, 0);
    const totalRecBand    = base.reduce((s,e) => s + e.recBand, 0);
    const totalRecComercios = base.reduce((s,e) => s + e.recComercios, 0);
    const totalReceita    = totalRecTaxa + totalRecBand + totalRecComercios;
    const totalSpread     = totalReceita - totalCusto;
    const pct           = totalRecarga > 0 ? totalCusto/totalRecarga*100 : 0;
    const margem        = totalRecarga > 0 ? totalSpread/totalRecarga*100 : 0;
    const totalEmpresas = base.length;
    const comTaxa       = base.filter(e => e.taxa > 0).length;

    // Evolução: todos os meses disponíveis (respeita escopo + toggle, ignora o filtro de meses).
    const baseEvol = empresas.filter(e => inEscopo(e.consultor_principal?.diretor || null) && (!somenteTaxa || (Number(e.taxa_negativa)||0) > 0));
    const perMonth = meses.map(m => {
      let recarga=0, custo=0, recTaxa=0, recBand=0, recComerc=0, comTaxaM=0;
      for(const e of baseEvol) {
        const r  = recargaMes(e, m);
        const cm = comerciosMes(e, m);
        if(r <= 0 && cm <= 0) continue;
        const taxa = Number(e.taxa_negativa) || 0;
        recarga += r; custo += r*taxa;
        recTaxa += r*(Number(e.taxa_positiva)||0);
        recBand += r*(Number(e.taxa_bandeira)||0);
        recComerc += cm; // spread importado dos comércios (valor absoluto)
        if(taxa > 0 && r > 0) comTaxaM++;
      }
      const receita = recTaxa + recBand + recComerc, spread = receita - custo;
      return { mes:m, recarga, custo, recTaxa, recBand, recComerc, receita, spread, pct: recarga>0 ? custo/recarga*100 : 0, margem: recarga>0 ? spread/recarga*100 : 0, comTaxa:comTaxaM };
    });

    // Por diretoria + gestor (a partir da base), com vendedores.
    const gmap = {};
    for(const e of base) {
      if(!e.gestor) continue;
      const key = `${e.dir} ${e.gestor}`;
      const g = gmap[key] || (gmap[key] = { key:`${e.dir}::${e.gestor}`, diretor:e.dir, gestor:e.gestor, empresas:0, recarga:0, custo:0, receita:0, spread:0, _vend:{} });
      g.empresas++; g.recarga += e.recarga; g.custo += e.custo; g.receita += e.receita; g.spread += e.spread;
      const vid = e.vendedor;
      const vv = g._vend[vid] || (g._vend[vid] = { nome:e.vendedor, empresas:0, recarga:0, custo:0, receita:0, spread:0 });
      vv.empresas++; vv.recarga += e.recarga; vv.custo += e.custo; vv.receita += e.receita; vv.spread += e.spread;
    }
    const gestores = Object.values(gmap).map(g => ({
      key:g.key, diretor:g.diretor, gestor:g.gestor, empresas:g.empresas, recarga:g.recarga, custo:g.custo, receita:g.receita, spread:g.spread,
      pct: g.recarga>0 ? g.custo/g.recarga*100 : 0,
      vendedores: Object.values(g._vend).map(v => ({ ...v, pct: v.recarga>0 ? v.custo/v.recarga*100 : 0 })).sort((a,b) => b.custo - a.custo),
    })).sort((a,b) => b.custo - a.custo);

    const empresasTab = [...base].sort((a,b) => b.custo - a.custo);

    // Aviso: sobre empresas COM recarga no período, quantas já têm alguma receita
    // (taxa positiva/bandeira cadastrada OU spread de comércio importado no período).
    let comRecargaCnt = 0, comReceitaCnt = 0;
    for(const e of empresas) {
      if(recargaSel(e) <= 0) continue;
      comRecargaCnt++;
      const temTaxa   = (Number(e.taxa_positiva)||0) > 0 || (Number(e.taxa_bandeira)||0) > 0;
      const temComerc = comerciosSel(e) > 0;
      if(temTaxa || temComerc) comReceitaCnt++;
    }
    const receitaConfig = { com: comReceitaCnt, total: comRecargaCnt };

    return {
      totalRecarga, totalCusto, totalReceita, totalRecTaxa, totalRecBand, totalRecComercios, totalSpread,
      pct, margem, totalEmpresas, comTaxa, perMonth, gestores, empresasTab, modoGeral,
      receitaConfig,
    };
  }, [dados, meses, mesesSel, somenteTaxa, dirsSel]);

  const toggleMes = (m) => setMesesSel(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const toggleExp = (k) => setExpandidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if(loading || !view) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={s.spin} />
        <div style={{ color:'var(--vg-muted)', fontSize:14 }}>Carregando rentabilidade…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const v = view;
  const modoGeral = dirsSel.size === 0;
  const dirsArr = [...dirsSel];
  const corAba = dirsSel.size === 1 ? CORES_DIR[dirsArr[0]] : 'var(--vg-brand-500)';
  const escopoTxt = modoGeral ? 'Todas as diretorias' : dirsSel.size === 1 ? `Diretoria ${dirsArr[0]}` : `Diretorias ${dirsArr.join(' + ')}`;
  const periodoLabel = mesesSel.size === 0 ? 'Todos os meses'
    : v && meses.filter(m => mesesSel.has(m)).length === 1 ? fmtMes([...mesesSel][0]+'-01')
    : `${mesesSel.size} meses`;
  const recorteLabel = somenteTaxa ? 'somente com taxa negativa' : 'todas as empresas';

  // Empresas: busca + paginação
  const buscaNorm = busca.trim().toLowerCase();
  const empresasFiltradas = buscaNorm
    ? v.empresasTab.filter(e => (e.nome||'').toLowerCase().includes(buscaNorm) || String(e.produto_id).includes(buscaNorm))
    : v.empresasTab;
  const POR_PAG = 15;
  const totalPags = Math.max(1, Math.ceil(empresasFiltradas.length / POR_PAG));
  const pagAtual = Math.min(pagina, totalPags);
  const empresasPag = empresasFiltradas.slice((pagAtual-1)*POR_PAG, pagAtual*POR_PAG);

  function exportarExcel() {
    const linhas = empresasFiltradas.map(e => ({
      'Empresa': e.nome, 'ID': e.produto_id, 'Categoria': e.categoria || '', 'Produto': e.produto || '',
      'Diretoria': e.dir || '', 'Gestor': e.gestor || '', 'Vendedor': e.vendedor || '',
      'Taxa Neg. (%)': Number(((e.taxa||0)*100).toFixed(4)),
      'Taxa Pos. (%)': Number(((e.taxaPos||0)*100).toFixed(4)),
      'Bandeira (%)': Number(((e.taxaBand||0)*100).toFixed(4)),
      'Recarga': Number(e.recarga.toFixed(2)), 'Spread Comércios': Number((e.recComercios||0).toFixed(2)),
      'Receita': Number(e.receita.toFixed(2)),
      'Custo': Number(e.custo.toFixed(2)), 'Spread': Number(e.spread.toFixed(2)),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rentabilidade');
    XLSX.writeFile(wb, `rentabilidade-custo-${periodoLabel.replace(/[^\w]/g,'_')}.xlsx`);
  }

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      {/* Cabeçalho */}
      <div style={{ marginBottom:20 }}>
        <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Rentabilidade</div>
        <h1 style={{ fontFamily:OUTFIT, fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Custo por Taxa Negativa</h1>
        <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Custo sobre o crédito inserido — etapa 1 (receita/spread na etapa 2)</p>
      </div>

      {/* Filtro de meses */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:6, alignItems:'center' }}>
        <button onClick={()=>setMesesSel(new Set())} style={btnFiltro(mesesSel.size===0)}>Todos</button>
        <button onClick={()=>setMesesSel(new Set(meses.slice(-3)))} style={btnFiltro(false)}>Trimestre</button>
        <button onClick={()=>setMesesSel(new Set(meses.slice(-6)))} style={btnFiltro(false)}>Semestre</button>
        <span style={{ width:1, height:22, background:'var(--vg-border)', margin:'0 4px' }} />
        {meses.map(m => <button key={m} onClick={()=>toggleMes(m)} style={btnFiltro(mesesSel.has(m))}>{fmtMes(m+'-01')}</button>)}
      </div>
      <div style={{ ...CAPTION, marginBottom:16 }}>Clique nos meses para selecionar múltiplos</div>

      {/* Toggle + Abas de diretoria */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:6, alignItems:'center' }}>
        <button onClick={()=>setSomenteTaxa(t=>!t)}
          style={{ display:'inline-flex', alignItems:'center', gap:8, background: somenteTaxa ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
            border:`1px solid ${somenteTaxa ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`, color: somenteTaxa ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
            borderRadius:'var(--vg-radius)', padding:'8px 14px', fontSize:13, fontWeight:600, fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>
          <span style={{ width:34, height:18, borderRadius:9, background: somenteTaxa ? 'var(--vg-brand-500)' : 'var(--vg-neutral-bg)', position:'relative', transition:'background .2s' }}>
            <span style={{ position:'absolute', top:2, left: somenteTaxa ? 18 : 2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
          </span>
          Somente empresas com taxa negativa
        </button>
        <span style={{ width:1, height:22, background:'var(--vg-border)', margin:'0 4px' }} />
        {[{ k:'geral', label:'Geral' }, ...DIRETORIAS.map(d => ({ k:d, label:d }))].map(op => {
          const ativo = op.k === 'geral' ? modoGeral : dirsSel.has(op.k);
          const cor = op.k === 'geral' ? 'var(--vg-brand-500)' : CORES_DIR[op.k];
          const onClick = op.k === 'geral'
            ? () => { setDirsSel(new Set()); setExpandidos(new Set()); }
            : () => { setDirsSel(prev => { const n = new Set(prev); n.has(op.k) ? n.delete(op.k) : n.add(op.k); return n; }); setExpandidos(new Set()); };
          return (
            <button key={op.k} onClick={onClick}
              style={{ position:'relative', overflow:'hidden', background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
                border:`1px solid ${ativo ? cor : 'var(--vg-border)'}`, color: ativo ? 'var(--vg-ink)' : 'var(--vg-ink-secondary)',
                borderRadius:'var(--vg-radius)', padding:'10px 20px', fontSize:14, fontWeight:600, fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>
              {ativo && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:cor }} />}
              {op.label}
            </button>
          );
        })}
      </div>
      <div style={{ ...CAPTION, marginBottom:24 }}>Clique nas diretorias para selecionar múltiplas</div>

      {/* Cards do topo */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:16, marginBottom:16 }}>
        <div style={cardStyle}><Metrica icon={<Wallet {...ICON} />} label="Recarga Total" valor={fmt(v.totalRecarga)} corValor={corAba} /></div>
        <div style={cardStyle}><Metrica icon={<TrendingUp {...ICON} color="var(--vg-success-fg)" />} label="Receita" valor={fmt(v.totalReceita)} corValor="var(--vg-success-fg)" sub={`taxa ${fmt(v.totalRecTaxa)} · bandeira ${fmt(v.totalRecBand)} · comércios ${fmt(v.totalRecComercios)}`} /></div>
        <div style={cardStyle}><Metrica icon={<TrendingDown {...ICON} color="var(--vg-danger-fg)" />} label="Custo (Taxa Negativa)" valor={fmt(v.totalCusto)} corValor="var(--vg-danger-fg)" /></div>
        <div style={{ ...cardStyle, border:'1px solid var(--vg-brand-500)' }}><Metrica icon={<Wallet {...ICON} color="var(--vg-brand-500)" />} label="Spread Líquido" valor={fmt(v.totalSpread)} destaque corValor={v.totalSpread<0 ? 'var(--vg-danger-fg)' : 'var(--vg-brand-700)'} /></div>
        <div style={cardStyle}><Metrica icon={<Percent {...ICON} />} label="Margem" valor={fmtPct(v.margem)} corValor={v.margem<0 ? 'var(--vg-danger-fg)' : 'var(--vg-ink)'} sub={recorteLabel} /></div>
        <div style={cardStyle}><Metrica icon={<FileText {...ICON} />} label="Empresas" valor={fmtInt(v.totalEmpresas)} sub={`${fmtInt(v.comTaxa)} de ${fmtInt(v.totalEmpresas)} com taxa negativa`} /></div>
      </div>

      {/* Aviso de receita incompleta (some quando > 50% das empresas têm receita) */}
      {v.receitaConfig.total > 0 && (v.receitaConfig.com / v.receitaConfig.total) <= 0.5 && (
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, background:'var(--vg-warning-bg)', border:'1px solid var(--vg-warning-fg)', borderRadius:'var(--vg-radius-lg)', padding:'14px 18px', marginBottom:24 }}>
          <AlertTriangle size={18} strokeWidth={2} color="var(--vg-warning-fg)" style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ color:'var(--vg-warning-fg)', fontSize:13, lineHeight:'20px' }}>
            Receita configurada apenas para Vegas Benefícios (<span className="vg-num">{fmtInt(v.receitaConfig.com)}</span> de <span className="vg-num">{fmtInt(v.receitaConfig.total)}</span> empresas). O spread ficará negativo até que as taxas dos demais produtos sejam cadastradas.
          </div>
        </div>
      )}

      {/* Evolução mensal */}
      <div style={{ ...cardStyle, marginBottom:24 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <BarChart3 {...ICON} color={corAba} /> Evolução Mensal — Receita × Custo
        </div>
        <div style={{ ...CAPTION, marginBottom:16 }}>{escopoTxt} · {recorteLabel} · Jan a Jul/2026</div>
        <GraficoReceitaCusto dados={v.perMonth} />
        <div style={{ overflowX:'auto', marginTop:16 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={s.th}>Mês</th>
                <th style={{ ...s.th, textAlign:'right' }}>Recarga</th>
                <th style={{ ...s.th, textAlign:'right' }}>Receita</th>
                <th style={{ ...s.th, textAlign:'right' }}>Custo</th>
                <th style={{ ...s.th, textAlign:'right' }}>Spread</th>
                <th style={{ ...s.th, textAlign:'right' }}>Margem %</th>
                <th style={{ ...s.th, textAlign:'right' }}>Empresas c/ taxa</th>
              </tr>
            </thead>
            <tbody>
              {v.perMonth.map(p => (
                <tr key={p.mes} style={{ borderTop:'1px solid var(--vg-border)' }}>
                  <td style={{ ...s.td, fontWeight:500, color:'var(--vg-ink)' }}>{fmtMes(p.mes+'-01')}</td>
                  <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(p.recarga)}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-success-fg)' }} className="vg-num">{fmt(p.receita)}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-danger-fg)' }} className="vg-num">{fmt(p.custo)}</td>
                  <td style={{ ...s.td, textAlign:'right', fontWeight:600, color: p.spread<0 ? 'var(--vg-danger-fg)' : 'var(--vg-success-fg)' }} className="vg-num">{fmt(p.spread)}</td>
                  <td style={{ ...s.td, textAlign:'right', color: p.margem<0 ? 'var(--vg-danger-fg)' : 'var(--vg-ink-secondary)' }} className="vg-num">{fmtPct(p.margem)}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtInt(p.comTaxa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por diretoria e gestor */}
      <div style={{ ...cardStyle, padding:0, overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'24px 24px 4px' }}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Users {...ICON} color={corAba} /> Por Diretoria e Gestor
          </div>
          <div style={{ ...CAPTION, marginBottom:12 }}>{escopoTxt} · {recorteLabel} · {periodoLabel} · clique num gestor para abrir os vendedores</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={s.th}>Diretoria</th>
                <th style={s.th}>Gestor</th>
                <th style={{ ...s.th, textAlign:'right' }}>Empresas</th>
                <th style={{ ...s.th, textAlign:'right' }}>Recarga</th>
                <th style={{ ...s.th, textAlign:'right' }}>Receita</th>
                <th style={{ ...s.th, textAlign:'right' }}>Custo</th>
                <th style={{ ...s.th, textAlign:'right' }}>Spread</th>
                <th style={{ ...s.th, textAlign:'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {v.gestores.length === 0 && (
                <tr><td colSpan={8} style={{ ...s.td, textAlign:'center', color:'var(--vg-muted)' }}>Nenhum gestor na seleção.</td></tr>
              )}
              {v.gestores.map(g => {
                const aberto = expandidos.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr onClick={()=>toggleExp(g.key)} style={{ borderTop:'1px solid var(--vg-border)', cursor:'pointer', background: aberto ? 'var(--vg-surface-muted)' : 'transparent' }}>
                      <td style={s.td}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
                          {aberto ? <ChevronDown size={15} strokeWidth={2} color="var(--vg-muted)" /> : <ChevronRight size={15} strokeWidth={2} color="var(--vg-muted)" />}
                          <span style={{ width:9, height:9, borderRadius:3, background:CORES_DIR[g.diretor]||'var(--vg-muted)' }} />
                          {g.diretor || '—'}
                        </span>
                      </td>
                      <td style={{ ...s.td, fontWeight:600, color:'var(--vg-ink)' }}>{g.gestor}</td>
                      <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmtInt(g.empresas)}</td>
                      <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(g.recarga)}</td>
                      <td style={{ ...s.td, textAlign:'right', color:'var(--vg-success-fg)' }} className="vg-num">{fmt(g.receita)}</td>
                      <td style={{ ...s.td, textAlign:'right', color:'var(--vg-danger-fg)', fontWeight:600 }} className="vg-num">{fmt(g.custo)}</td>
                      <td style={{ ...s.td, textAlign:'right', fontWeight:600, color: g.spread<0 ? 'var(--vg-danger-fg)' : 'var(--vg-success-fg)' }} className="vg-num">{fmt(g.spread)}</td>
                      <td style={{ ...s.td, textAlign:'right', fontWeight:600, color:'var(--vg-ink)' }} className="vg-num">{fmtPct(g.pct)}</td>
                    </tr>
                    {aberto && g.vendedores.map((vd,i) => (
                      <tr key={`${g.key}-${i}`} style={{ borderTop:'1px solid var(--vg-border)', background:'var(--vg-surface-muted)' }}>
                        <td style={s.td} />
                        <td style={{ ...s.td, paddingLeft:44, color:'var(--vg-ink-secondary)' }}>{vd.nome}</td>
                        <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtInt(vd.empresas)}</td>
                        <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmt(vd.recarga)}</td>
                        <td style={{ ...s.td, textAlign:'right', color:'var(--vg-success-fg)' }} className="vg-num">{fmt(vd.receita)}</td>
                        <td style={{ ...s.td, textAlign:'right', color:'var(--vg-danger-fg)' }} className="vg-num">{fmt(vd.custo)}</td>
                        <td style={{ ...s.td, textAlign:'right', color: vd.spread<0 ? 'var(--vg-danger-fg)' : 'var(--vg-success-fg)' }} className="vg-num">{fmt(vd.spread)}</td>
                        <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtPct(vd.pct)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empresas */}
      <div style={{ ...cardStyle, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'24px 24px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <Building2 {...ICON} color={corAba} /> Empresas
            </div>
            <div style={CAPTION}>{fmtInt(empresasFiltradas.length)} empresas · ordenadas por custo · {periodoLabel}</div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'var(--vg-surface-muted)', border:'1px solid var(--vg-border-field)', borderRadius:'var(--vg-radius)', padding:'6px 12px' }}>
              <Search size={15} strokeWidth={1.75} color="var(--vg-muted)" />
              <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome ou ID"
                style={{ border:'none', outline:'none', background:'transparent', color:'var(--vg-ink)', fontSize:14, fontFamily:"'Inter', sans-serif", width:200 }} />
            </div>
            <button onClick={exportarExcel}
              style={{ display:'inline-flex', alignItems:'center', gap:7, background:'var(--vg-brand-500)', border:'none', borderRadius:'var(--vg-radius)', padding:'8px 16px', color:'#fff', fontSize:14, fontWeight:600, fontFamily:"'Inter', sans-serif", cursor:'pointer' }}>
              <FileSpreadsheet size={16} strokeWidth={1.75} color="#fff" /> Exportar Excel
            </button>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={s.th}>Empresa</th>
                <th style={{ ...s.th, textAlign:'right' }}>ID</th>
                <th style={s.th}>Categoria</th>
                <th style={s.th}>Produto</th>
                <th style={s.th}>Diretoria</th>
                <th style={s.th}>Gestor</th>
                <th style={s.th}>Vendedor</th>
                <th style={{ ...s.th, textAlign:'right' }}>Taxa Neg. %</th>
                <th style={{ ...s.th, textAlign:'right' }}>Taxa Pos. %</th>
                <th style={{ ...s.th, textAlign:'right' }}>Bandeira %</th>
                <th style={{ ...s.th, textAlign:'right' }}>Recarga</th>
                <th style={{ ...s.th, textAlign:'right' }}>Spread Comércios</th>
                <th style={{ ...s.th, textAlign:'right' }}>Receita</th>
                <th style={{ ...s.th, textAlign:'right' }}>Custo</th>
                <th style={{ ...s.th, textAlign:'right' }}>Spread</th>
              </tr>
            </thead>
            <tbody>
              {empresasPag.length === 0 && (
                <tr><td colSpan={15} style={{ ...s.td, textAlign:'center', color:'var(--vg-muted)' }}>Nenhuma empresa encontrada.</td></tr>
              )}
              {empresasPag.map(e => (
                <tr key={e.id} style={{ borderTop:'1px solid var(--vg-border)' }}>
                  <td style={{ ...s.td, fontWeight:500, color:'var(--vg-ink)' }}>{e.nome}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-muted)' }} className="vg-num">{e.produto_id}</td>
                  <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{e.categoria || '—'}</td>
                  <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{e.produto || '—'}</td>
                  <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{e.dir || '—'}</td>
                  <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{e.gestor || '—'}</td>
                  <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{e.vendedor}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtTaxa(e.taxa)}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtTaxa(e.taxaPos)}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtTaxa(e.taxaBand)}</td>
                  <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(e.recarga)}</td>
                  <td style={{ ...s.td, textAlign:'right', color: e.recComercios>0 ? 'var(--vg-success-fg)' : 'var(--vg-muted)' }} className="vg-num">{fmt(e.recComercios)}</td>
                  <td style={{ ...s.td, textAlign:'right', color: e.receita>0 ? 'var(--vg-success-fg)' : 'var(--vg-muted)' }} className="vg-num">{fmt(e.receita)}</td>
                  <td style={{ ...s.td, textAlign:'right', color: e.custo>0 ? 'var(--vg-danger-fg)' : 'var(--vg-muted)', fontWeight:600 }} className="vg-num">{fmt(e.custo)}</td>
                  <td style={{ ...s.td, textAlign:'right', fontWeight:600, color: e.spread<0 ? 'var(--vg-danger-fg)' : e.spread>0 ? 'var(--vg-success-fg)' : 'var(--vg-muted)' }} className="vg-num">{fmt(e.spread)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPags > 1 && (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, padding:'16px 24px' }}>
            <button onClick={()=>setPagina(p=>Math.max(1,p-1))} disabled={pagAtual===1} style={btnPag(pagAtual===1)}>←</button>
            <span style={{ ...CAPTION }}>Página {pagAtual} de {totalPags}</span>
            <button onClick={()=>setPagina(p=>Math.min(totalPags,p+1))} disabled={pagAtual===totalPags} style={btnPag(pagAtual===totalPags)}>→</button>
          </div>
        )}
      </div>
    </div>
  );
}

function btnFiltro(ativo) {
  return {
    background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
    border:`1px solid ${ativo ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`,
    color: ativo ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
    borderRadius:'var(--vg-radius)', padding:'7px 14px', fontSize:13, fontWeight:ativo?600:500,
    fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none',
  };
}
function btnPag(disabled) {
  return {
    background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)',
    padding:'6px 12px', color: disabled ? 'var(--vg-muted)' : 'var(--vg-ink-secondary)',
    cursor: disabled ? 'default' : 'pointer', fontFamily:"'Inter', sans-serif", fontSize:14,
  };
}

const s = {
  page: { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'Inter', sans-serif", color:'var(--vg-ink)', background:'var(--vg-bg)', minHeight:'100vh', boxSizing:'border-box' },
  spin: { width:36, height:36, border:'3px solid var(--vg-border)', borderTop:'3px solid var(--vg-brand-500)', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
  th: { textAlign:'left', padding:'10px 24px', ...LABEL, background:'var(--vg-surface-muted)', whiteSpace:'nowrap' },
  td: { padding:'12px 24px', verticalAlign:'middle' },
};
