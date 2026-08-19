'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Wallet, Percent, TrendingUp, ArrowUpRight, ArrowDownRight,
  Building2, PieChart, BarChart3, Briefcase, ReceiptText,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
const fmtInt = (v) => Number(v||0).toLocaleString('pt-BR');
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };
// Reduz a fonte para valores muito longos (ex.: 11 dígitos) não estourarem o card.
const fFit = (str, base) => { const n=String(str).length; if(n>=17) return base-6; if(n>=15) return base-4; if(n>=13) return base-2; return base; };

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

const MES_INICIAL = '2026-04-01';

// Diretorias exibidas (cor de marca por diretor)
const DIRETORIAS = [
  { key:'Rossi',   cor:'var(--vg-brand-500)', meta:true  },
  { key:'Ronny',   cor:'var(--vg-rose-400)',  meta:true  },
  { key:'Sartori', cor:'var(--vg-peach-400)', meta:false },
];
const COR_LICITACAO = 'var(--vg-brand-500)';
const COR_COMERCIAL = 'var(--vg-peach-400)';

// ── Estilos base (VEGAS PLATFORM UI STANDARD v1.0) ─────────────────────
const ICON = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = {
  background:'var(--vg-surface)', border:'1px solid var(--vg-border)',
  borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)',
};
const H_CARD  = { fontFamily:"'Outfit', sans-serif", fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
const OUTFIT  = "'Outfit', sans-serif";

function Variacao({ atual, anterior, sufixo='vs mês ant.' }) {
  if(anterior === null || anterior === undefined || anterior === 0)
    return <span style={CAPTION}>— sem base anterior</span>;
  const d = (atual - anterior) / Math.abs(anterior) * 100;
  const up = d >= 0;
  const Ico = up ? ArrowUpRight : ArrowDownRight;
  const cor = up ? 'var(--vg-success-fg)' : 'var(--vg-danger-fg)';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, color:cor, fontSize:12, fontWeight:600 }}>
      <Ico size={13} strokeWidth={2} /> {Math.abs(d).toFixed(1)}% {sufixo}
    </span>
  );
}

function CardKPI({ label, valor, icon, destaque=false, sub, corValor='var(--vg-ink)' }) {
  return (
    <div style={{
      ...cardStyle,
      padding: destaque ? 24 : 20,
      border: destaque ? '1px solid var(--vg-brand-500)' : '1px solid var(--vg-border)',
      display:'flex', flexDirection:'column', gap:6,
    }}>
      <div style={{ ...LABEL, display:'flex', alignItems:'center', gap:6 }}>{icon}{label}</div>
      <div className="vg-num" style={{
        fontFamily:OUTFIT, fontWeight:600, color:corValor, lineHeight:1.15,
        fontSize: fFit(valor, destaque ? 30 : 22), overflowWrap:'anywhere',
      }}>{valor}</div>
      {sub && <div style={{ display:'flex', alignItems:'center', gap:5 }}>{sub}</div>}
    </div>
  );
}

// Barras empilhadas: Licitação (base) + Comercial (topo) por mês.
function GraficoEmpilhado({ series, height=170 }) {
  const max = Math.max(...series.map(s => s.licit + s.comerc), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:10, height, padding:'0 2px' }}>
      {series.map((s,i) => {
        const total = s.licit + s.comerc;
        const hTotal = (total / max) * 100;
        const hLic = total > 0 ? (s.licit / total) * hTotal : 0;
        const hCom = total > 0 ? (s.comerc / total) * hTotal : 0;
        return (
          <div key={i} title={`${fmtMes(s.mes+'-01')}\nLicitação ${fmt(s.licit)}\nComercial ${fmt(s.comerc)}`}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, height:'100%', justifyContent:'flex-end' }}>
            <div style={{ width:'100%', maxWidth:44, display:'flex', flexDirection:'column', justifyContent:'flex-end', height:'100%' }}>
              <div style={{ height:`${hCom}%`, background:COR_COMERCIAL, borderRadius:'4px 4px 0 0', minHeight: s.comerc>0?3:0 }} />
              <div style={{ height:`${hLic}%`, background:COR_LICITACAO, borderRadius: s.comerc>0?0:'4px 4px 0 0', minHeight: s.licit>0?3:0 }} />
            </div>
            <div style={{ ...CAPTION, textAlign:'center' }}>{fmtMes(s.mes+'-01').split('/')[0]}</div>
          </div>
        );
      })}
    </div>
  );
}

// Barras simples (série única).
function GraficoBarras({ series, cor='var(--vg-peach-400)', height=150 }) {
  const max = Math.max(...series.map(s => s.valor), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:10, height, padding:'0 2px' }}>
      {series.map((s,i) => {
        const h = (s.valor / max) * 100;
        return (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, height:'100%', justifyContent:'flex-end' }}>
            <div className="vg-num" style={{ ...CAPTION, fontWeight:500 }}>{s.valor>0 ? fmt(s.valor) : ''}</div>
            <div title={`${fmtMes(s.mes+'-01')} · ${fmt(s.valor)}`}
              style={{ width:'100%', maxWidth:44, height:`${h}%`, background:cor, borderRadius:'4px 4px 0 0', minHeight: s.valor>0?3:0 }} />
            <div style={{ ...CAPTION, textAlign:'center' }}>{fmtMes(s.mes+'-01').split('/')[0]}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardDiretor() {
  const [base,   setBase]   = useState(null);
  const [metas,  setMetas]  = useState([]);
  const [meses,  setMeses]  = useState([]);
  const [mesSel, setMesSel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregarBase(); }, []);
  useEffect(() => { if(base && mesSel) carregarMetas(mesSel); }, [base, mesSel]);

  async function carregarBase() {
    setLoading(true);
    try {
      const [empresas, consultores, movs] = await Promise.all([
        fetchAll(supabase.from('empresas').select(
          'id, nome, consultor_principal_id, data_cadastro, consultor_principal:consultor_principal_id(id,nome,diretor,setor)'
        )),
        fetchAll(supabase.from('consultores').select('id,nome,diretor,setor,gestor')),
        fetchAll(supabase.from('movimentacoes')
          .select('empresa_id,competencia,valor_movimentacao,receita_bruta,custo_taxa_negativa,spread_liquido')
          .gte('competencia', MES_INICIAL)),
      ]);

      const empresasMap = {};
      const empresasArr = [];
      for(const e of empresas) {
        const info = {
          id: e.id, nome: e.nome,
          consultor_principal_id: e.consultor_principal_id,
          data_cadastro: e.data_cadastro,
          diretor: e.consultor_principal?.diretor || null,
          setor:   e.consultor_principal?.setor   || null,
        };
        empresasMap[e.id] = info;
        empresasArr.push(info);
      }

      const consultMap = {};
      for(const c of consultores) consultMap[c.id] = c;

      const mesesAsc = [...new Set(movs.map(m => m.competencia?.substring(0,7)).filter(Boolean))].sort();

      setBase({ empresasMap, empresasArr, consultMap, movs });
      setMeses(mesesAsc);
      setMesSel(mesesAsc[mesesAsc.length-1] || '');
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  async function carregarMetas(mes) {
    const comp = mes + '-01';
    const rows = await fetchAll(supabase.from('valor_meta_empresa')
      .select('empresa_id,consultor_id,competencia_meta,valor_meta,regra')
      .eq('competencia_meta', comp));
    setMetas(rows);
  }

  // ── Cálculo de todos os blocos ──────────────────────────────────────
  const view = useMemo(() => {
    if(!base || !mesSel) return null;
    const { empresasMap, empresasArr, consultMap, movs } = base;

    const setorDe = (id) => empresasMap[id]?.setor;
    const dirDe   = (id) => empresasMap[id]?.diretor || null;
    const segDe   = (id) => (setorDe(id) === 'Licitação' ? 'Licitação' : 'Comercial');
    const sum = (arr, k) => arr.reduce((s,m) => s + (Number(m[k])||0), 0);

    const idx = meses.indexOf(mesSel);
    const mesPrev = idx > 0 ? meses[idx-1] : null;
    const noMes  = (mes) => movs.filter(m => m.competencia?.substring(0,7) === mes);
    const movsMes  = noMes(mesSel);
    const movsPrev = mesPrev ? noMes(mesPrev) : [];

    // Bloco 1 — o negócio
    const receita  = sum(movsMes,'receita_bruta');
    const custo    = sum(movsMes,'custo_taxa_negativa');
    const spread   = sum(movsMes,'spread_liquido');
    const valorMov = sum(movsMes,'valor_movimentacao');
    const margem   = valorMov > 0 ? spread/valorMov*100 : 0;
    const receitaP = sum(movsPrev,'receita_bruta');
    const custoP   = sum(movsPrev,'custo_taxa_negativa');
    const spreadP  = sum(movsPrev,'spread_liquido');
    const valorMovP= sum(movsPrev,'valor_movimentacao');
    const margemP  = valorMovP > 0 ? spreadP/valorMovP*100 : null;

    // Bloco 2 — composição da margem (série mensal por segmento)
    const serie = meses.map(mes => {
      let licit=0, comerc=0;
      for(const m of noMes(mes)) {
        const v = Number(m.spread_liquido)||0;
        if(segDe(m.empresa_id) === 'Licitação') licit += v; else comerc += v;
      }
      return { mes, licit, comerc };
    });
    const segMes  = serie.find(s => s.mes === mesSel) || { licit:0, comerc:0 };
    const totalSeg = segMes.licit + segMes.comerc;
    const pctLic = totalSeg > 0 ? segMes.licit/totalSeg*100 : 0;
    const pctCom = totalSeg > 0 ? segMes.comerc/totalSeg*100 : 0;
    const base0  = serie[0];
    const crescLic = base0 && base0.licit  > 0 ? (segMes.licit - base0.licit)/base0.licit*100   : null;
    const crescCom = base0 && base0.comerc > 0 ? (segMes.comerc - base0.comerc)/base0.comerc*100 : null;

    // Bloco 3 — por diretoria
    const porDir = {};
    DIRETORIAS.forEach(d => { porDir[d.key] = { spread:0, mov:0, contratos:new Set() }; });
    for(const m of movsMes) {
      const d = dirDe(m.empresa_id);
      if(!porDir[d]) continue;
      porDir[d].spread += Number(m.spread_liquido)||0;
      porDir[d].mov    += Number(m.valor_movimentacao)||0;
      porDir[d].contratos.add(m.empresa_id);
    }

    // Meta apurada por diretoria (mesma regra de /vendedor)
    const metaDir = { Rossi:0, Ronny:0, Sartori:0 };
    for(const v of metas) {
      const emp = empresasMap[v.empresa_id];
      const donoId = (v.regra === 'upsell' || !v.consultor_id)
        ? emp?.consultor_principal_id
        : v.consultor_id;
      const od = consultMap[donoId]?.diretor || emp?.diretor;
      if(od && metaDir[od] != null) metaDir[od] += Number(v.valor_meta)||0;
    }
    const metaTotal = metaDir.Rossi + metaDir.Ronny;

    // Bloco 4 — maiores contas (top 10 por spread)
    const spreadEmp = {};
    for(const m of movsMes) spreadEmp[m.empresa_id] = (spreadEmp[m.empresa_id]||0) + (Number(m.spread_liquido)||0);
    const topEmp = Object.entries(spreadEmp)
      .map(([id,sp]) => ({ id, spread:sp, nome: empresasMap[id]?.nome || `Empresa ${id}`, diretor: empresasMap[id]?.diretor || '—' }))
      .sort((a,b) => b.spread - a.spread)
      .slice(0,10);

    // Bloco 5 — crescimento comercial
    const serieComercial = serie.map(s => ({ mes:s.mes, valor:s.comerc }));
    const contratosNovos = empresasArr.filter(e => String(e.data_cadastro||'').substring(0,7) === mesSel).length;

    return {
      mesPrev,
      receita, custo, spread, valorMov, margem,
      receitaP, custoP, spreadP, margemP,
      serie, segMes, totalSeg, pctLic, pctCom, crescLic, crescCom,
      porDir, metaDir, metaTotal,
      topEmp,
      serieComercial, contratosNovos,
    };
  }, [base, metas, meses, mesSel]);

  if(loading || !view) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={s.spin} />
        <div style={{ color:'var(--vg-muted)', fontSize:14 }}>Carregando visão executiva…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const v = view;

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Faixa de assinatura */}
      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      {/* Cabeçalho */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24, flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Visão Executiva</div>
          <h1 style={{ fontFamily:OUTFIT, fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Visão Executiva do Negócio</h1>
          <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Receita, margem e composição do resultado</p>
        </div>
        <select value={mesSel} onChange={e=>setMesSel(e.target.value)}
          style={{ background:'var(--vg-surface)', border:'1px solid var(--vg-border-field)', borderRadius:'var(--vg-radius)', padding:'9px 14px', color:'var(--vg-ink)', fontSize:14, fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>
          {[...meses].reverse().map(m => <option key={m} value={m}>{fmtMes(m+'-01')}</option>)}
        </select>
      </div>

      {/* ── BLOCO 1 — O negócio ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:14, marginBottom:28 }}>
        <CardKPI icon={<Wallet {...ICON} />} label="Receita Bruta" valor={fmt(v.receita)}
          sub={<Variacao atual={v.receita} anterior={v.receitaP} />} />
        <CardKPI icon={<ReceiptText {...ICON} />} label="Custo" valor={fmt(v.custo)}
          sub={<Variacao atual={v.custo} anterior={v.custoP} />} />
        <CardKPI icon={<TrendingUp {...ICON} size={18} color="var(--vg-brand-500)" />} label="Spread Líquido" valor={fmt(v.spread)}
          destaque corValor="var(--vg-brand-700)"
          sub={<Variacao atual={v.spread} anterior={v.spreadP} />} />
        <CardKPI icon={<Percent {...ICON} />} label="Margem" valor={fmtPct(v.margem)}
          sub={v.margemP===null ? <span style={CAPTION}>spread / movimentação</span> : <Variacao atual={v.margem} anterior={v.margemP} />} />
      </div>

      {/* ── BLOCO 2 — Composição da margem ── */}
      <div style={{ ...cardStyle, marginBottom:28 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <PieChart {...ICON} /> Composição da Margem
        </div>
        <div style={{ ...CAPTION, marginBottom:20 }}>Spread líquido dividido entre Licitação e Comercial — evolução mês a mês</div>

        <div style={{ display:'grid', gridTemplateColumns:'minmax(220px, 320px) 1fr', gap:28, alignItems:'center' }}>
          {/* Resumo dos segmentos no mês */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {[
              { nome:'Licitação', cor:COR_LICITACAO, val:v.segMes.licit, pct:v.pctLic, cresc:v.crescLic },
              { nome:'Comercial', cor:COR_COMERCIAL, val:v.segMes.comerc, pct:v.pctCom, cresc:v.crescCom },
            ].map(seg => (
              <div key={seg.nome} style={{ borderLeft:`3px solid ${seg.cor}`, paddingLeft:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                  <span style={{ color:'var(--vg-ink)', fontWeight:600, fontSize:14 }}>{seg.nome}</span>
                  <span className="vg-num" style={{ ...CAPTION, fontWeight:600 }}>{fmtPct(seg.pct)}</span>
                </div>
                <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, color:'var(--vg-ink)', fontSize:fFit(fmt(seg.val),20), overflowWrap:'anywhere' }}>{fmt(seg.val)}</div>
                <div style={CAPTION}>
                  {seg.cresc===null ? 'sem base no período'
                    : `${seg.cresc>=0?'+':''}${seg.cresc.toFixed(1)}% desde ${fmtMes(v.serie[0].mes+'-01')}`}
                </div>
              </div>
            ))}
            <div style={{ display:'flex', gap:16, paddingTop:4 }}>
              <Legenda cor={COR_LICITACAO} texto="Licitação" />
              <Legenda cor={COR_COMERCIAL} texto="Comercial" />
            </div>
          </div>

          {/* Evolução empilhada */}
          <GraficoEmpilhado series={v.serie} />
        </div>
      </div>

      {/* ── BLOCO 3 — Por diretoria ── */}
      <div style={{ marginBottom:28 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <Building2 {...ICON} /> Resultado por Diretoria
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:16 }}>
          {DIRETORIAS.map(d => {
            const dd = v.porDir[d.key];
            return (
              <div key={d.key} style={{ ...cardStyle, borderTop:`3px solid ${d.cor}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:d.cor, flexShrink:0 }} />
                  <span style={{ fontFamily:OUTFIT, fontWeight:600, fontSize:16, color:'var(--vg-ink)' }}>Diretoria {d.key}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <LinhaMetrica label="Spread líquido" valor={fmt(dd.spread)} destaque />
                  <LinhaMetrica label="Movimentação"   valor={fmt(dd.mov)} />
                  <LinhaMetrica
                    label="Meta apurada"
                    valor={d.meta ? fmt(v.metaDir[d.key]) : 'não se aplica'}
                    valorTitle={d.meta ? undefined : 'Licitação não entra na meta comercial'}
                    mutedValor={!d.meta}
                  />
                  <LinhaMetrica label="Contratos ativos" valor={fmtInt(dd.contratos.size)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BLOCO 4 — Maiores contas ── */}
      <div style={{ ...cardStyle, marginBottom:28, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'24px 24px 4px' }}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <BarChart3 {...ICON} /> Maiores Contas
          </div>
          <div style={{ ...CAPTION, marginBottom:12 }}>Top 10 empresas por spread líquido em {fmtMes(mesSel+'-01')} · composição do portfólio</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={s.th}>#</th>
                <th style={s.th}>Empresa</th>
                <th style={s.th}>Diretoria</th>
                <th style={{ ...s.th, textAlign:'right' }}>Spread líquido</th>
                <th style={{ ...s.th, textAlign:'right' }}>% do spread</th>
              </tr>
            </thead>
            <tbody>
              {v.topEmp.map((e,i) => (
                <tr key={e.id} style={{ borderTop:'1px solid var(--vg-border)' }}>
                  <td style={{ ...s.td, color:'var(--vg-muted)', width:40 }} className="vg-num">{i+1}</td>
                  <td style={{ ...s.td, color:'var(--vg-ink)', fontWeight:500 }}>{e.nome}</td>
                  <td style={s.td}>
                    <span style={{ ...CAPTION, background:'var(--vg-neutral-bg)', color:'var(--vg-neutral-fg)', borderRadius:6, padding:'2px 8px' }}>{e.diretor}</span>
                  </td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink)', fontWeight:600 }} className="vg-num">{fmt(e.spread)}</td>
                  <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtPct(v.spread>0 ? e.spread/v.spread*100 : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BLOCO 5 — Crescimento comercial ── */}
      <div style={{ ...cardStyle }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <Briefcase {...ICON} /> Crescimento Comercial
        </div>
        <div style={{ ...CAPTION, marginBottom:20 }}>Spread do segmento Comercial (sem licitação) — evolução mensal</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr minmax(200px, 260px)', gap:28, alignItems:'center' }}>
          <GraficoBarras series={v.serieComercial} cor={COR_COMERCIAL} />
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div style={{ borderLeft:'3px solid var(--vg-peach-400)', paddingLeft:14 }}>
              <div style={LABEL}>Spread comercial no mês</div>
              <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, color:'var(--vg-ink)', fontSize:fFit(fmt(v.segMes.comerc),22), overflowWrap:'anywhere' }}>{fmt(v.segMes.comerc)}</div>
            </div>
            <div style={{ borderLeft:'3px solid var(--vg-brand-500)', paddingLeft:14 }}>
              <div style={LABEL}>Meta apurada total</div>
              <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, color:'var(--vg-ink)', fontSize:fFit(fmt(v.metaTotal),22), overflowWrap:'anywhere' }}>{fmt(v.metaTotal)}</div>
              <div style={CAPTION}>Rossi + Ronny · {fmtMes(mesSel+'-01')}</div>
            </div>
            <div style={{ borderLeft:'3px solid var(--vg-border-field)', paddingLeft:14 }}>
              <div style={LABEL}>Contratos novos no mês</div>
              <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, color:'var(--vg-ink)', fontSize:22 }}>{fmtInt(v.contratosNovos)}</div>
              <div style={CAPTION}>empresas cadastradas em {fmtMes(mesSel+'-01')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legenda({ cor, texto }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, ...CAPTION }}>
      <span style={{ width:10, height:10, borderRadius:3, background:cor }} /> {texto}
    </span>
  );
}

function LinhaMetrica({ label, valor, destaque=false, mutedValor=false, valorTitle }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
      <span style={LABEL}>{label}</span>
      <span
        title={valorTitle}
        className="vg-num"
        style={{
          fontFamily:OUTFIT, fontWeight:600, textAlign:'right', overflowWrap:'anywhere',
          fontSize: fFit(valor, destaque ? 18 : 15),
          color: mutedValor ? 'var(--vg-muted)' : (destaque ? 'var(--vg-brand-700)' : 'var(--vg-ink)'),
          fontStyle: mutedValor ? 'italic' : 'normal',
        }}>{valor}</span>
    </div>
  );
}

const s = {
  page: { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'Inter', sans-serif", color:'var(--vg-ink)', background:'var(--vg-bg)', minHeight:'100vh', boxSizing:'border-box' },
  spin: { width:36, height:36, border:'3px solid var(--vg-border)', borderTop:'3px solid var(--vg-brand-500)', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
  th: { textAlign:'left', padding:'10px 24px', ...LABEL, background:'var(--vg-surface-muted)', whiteSpace:'nowrap' },
  td: { padding:'12px 24px', verticalAlign:'middle' },
};
