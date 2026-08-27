'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Layers, Building2, Users, ChevronRight, ChevronDown,
  Target, TrendingUp, Wallet, FileText, Package, Trophy, LineChart,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtInt = (v) => Number(v||0).toLocaleString('pt-BR');
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };
// Reduz a fonte para valores muito longos (8+ dígitos) não estourarem o card.
const fFit = (str, base) => { const n=String(str).length; if(n>=17) return base-6; if(n>=15) return base-4; if(n>=13) return base-2; return base; };

const MOV_DESDE = '2026-04'; // movimentacoes só tem dados de 2026-04 em diante

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

const DIRETORIAS = ['Ronny','Rossi','Sartori'];
const CORES_DIR = { Ronny:'var(--vg-rose-400)', Rossi:'var(--vg-brand-500)', Sartori:'var(--vg-peach-400)' };
const metaAplicavel = (dir) => dir !== 'Sartori';

// ── Estilos base (VEGAS PLATFORM UI STANDARD v1.0) ─────────────────────
const ICON    = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = {
  background:'var(--vg-surface)', border:'1px solid var(--vg-border)',
  borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)',
};
const H_CARD  = { fontFamily:"'Outfit', sans-serif", fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
const OUTFIT  = "'Outfit', sans-serif";

function Metrica({ label, valor, icon, destaque=false, muted=false, valorTitle, corValor, sub }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
      <div style={{ ...LABEL, display:'flex', alignItems:'center', gap:6 }}>{icon}{label}</div>
      <div title={valorTitle} className="vg-num" style={{
        fontFamily:OUTFIT, fontWeight:600, lineHeight:1.15, overflowWrap:'anywhere',
        fontSize: fFit(valor, destaque ? 26 : 20),
        color: muted ? 'var(--vg-muted)' : (corValor || 'var(--vg-ink)'),
        fontStyle: muted ? 'italic' : 'normal',
      }}>{valor}</div>
      {sub && <div style={{ ...CAPTION, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

const corPct = (p) => p==null ? 'var(--vg-muted)' : p>=100 ? 'var(--vg-success-fg)' : p>=70 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';

// Gráfico de evolução (SVG puro) — meta apurada mês a mês.
function GraficoEvolucao({ serie, cor='var(--vg-brand-500)' }) {
  if(!serie.length) return <div style={{ ...CAPTION, padding:'24px 0' }}>Sem dados de meta no período.</div>;
  const H=190, padL=8, padR=8, padT=22, padB=30;
  const W = Math.max(serie.length*84, 360);
  const iW = W-padL-padR, iH = H-padT-padB;
  const max = Math.max(...serie.map(s=>s.valor), 1);
  const x = (i) => serie.length===1 ? padL+iW/2 : padL + (i/(serie.length-1))*iW;
  const y = (val) => padT + iH - (val/max)*iH;
  const linePts = serie.map((s,i)=>`${x(i).toFixed(1)},${y(s.valor).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${(padT+iH).toFixed(1)} ${linePts} ${(padL+iW).toFixed(1)},${(padT+iH).toFixed(1)}`;
  return (
    <div style={{ overflowX:'auto' }}>
      <svg width={W} height={H} style={{ display:'block', minWidth:'100%' }}>
        <polygon points={areaPts} fill={cor} opacity="0.08" />
        <polyline points={linePts} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((s,i)=>(
          <g key={s.mes}>
            <title>{`${fmtMes(s.mes+'-01')} · ${fmt(s.valor)}`}</title>
            <circle cx={x(i)} cy={y(s.valor)} r="3.5" fill={cor} />
            <text x={x(i)} y={y(s.valor)-9} textAnchor="middle" fontSize="9.5" fontFamily="'Outfit',sans-serif" fontWeight="600" fill="var(--vg-ink-secondary)">
              {s.valor>=1000 ? `${Math.round(s.valor/1000)}k` : Math.round(s.valor)}
            </text>
            <text x={x(i)} y={H-10} textAnchor="middle" fontSize="10" fontFamily="'Inter',sans-serif" fill="var(--vg-muted)">
              {fmtMes(s.mes+'-01').split('/')[0]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function CartoesVegas() {
  const [base, setBase]       = useState(null);
  const [meses, setMeses]     = useState([]);
  const [mesesSel, setMesesSel] = useState(() => new Set()); // vazio = Todos
  const [aba, setAba]         = useState('geral'); // geral | Ronny | Rossi | Sartori
  const [expandidos, setExpandidos] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [empresas, consultores] = await Promise.all([
        fetchAll(supabase.from('empresas').select(
          `id, produto_id, nome, categoria, produto_contratado,
           potencial_movimentacao, peso_categoria, data_cadastro,
           pct_principal, pct_agregado_1, pct_agregado_2,
           consultor_principal_id, consultor_agregado_id, consultor_agregado_2_id`)
          .eq('ativo', true)
          .not('produto_contratado','ilike','%desconto condicional%')
          .not('categoria','eq','Taxa Negativa')),
        fetchAll(supabase.from('consultores').select('id,nome,diretor,gestor,setor,meta_mensal,meta_inicio,ativo')),
      ]);

      const empIds  = empresas.map(e => e.id);
      const prodIds = empresas.map(e => e.produto_id);

      const [libs, vmetas, movs] = await Promise.all([
        fetchEmPartes(prodIds, (ids) =>
          supabase.from('liberacoes').select('produto_id,competencia,total_liberado').in('produto_id', ids), 200),
        fetchEmPartes(empIds, (ids) =>
          supabase.from('valor_meta_empresa')
            .select('empresa_id,consultor_id,competencia_meta,valor_meta,regra').in('empresa_id', ids), 300),
        fetchEmPartes(empIds, (ids) =>
          supabase.from('movimentacoes')
            .select('empresa_id,competencia,valor_movimentacao').in('empresa_id', ids), 300),
      ]);

      const empMap = {};
      for(const e of empresas) empMap[e.id] = e;

      const consultMap = {};
      for(const c of consultores) consultMap[c.id] = c;

      // Creditado (liberacoes) por produto → mês (YYYY-MM)
      const libByProd = {};
      for(const l of libs) {
        const m = l.competencia?.substring(0,7);
        if(!m) continue;
        (libByProd[l.produto_id] = libByProd[l.produto_id] || {})[m] =
          (libByProd[l.produto_id][m] || 0) + (l.total_liberado || 0);
      }

      // Movimentação real (movimentacoes) por empresa → mês (YYYY-MM)
      const movByEmp = {};
      for(const mv of movs) {
        const m = mv.competencia?.substring(0,7);
        if(!m) continue;
        (movByEmp[mv.empresa_id] = movByEmp[mv.empresa_id] || {})[m] =
          (movByEmp[mv.empresa_id][m] || 0) + (mv.valor_movimentacao || 0);
      }

      const mesesUnion = [...new Set([
        ...vmetas.map(v => v.competencia_meta?.substring(0,7)),
        ...libs.map(l => l.competencia?.substring(0,7)),
      ].filter(Boolean))].sort();

      setBase({ empresas, empMap, consultores, consultMap, libByProd, movByEmp, vmetas });
      setMeses(mesesUnion);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  const view = useMemo(() => {
    if(!base) return null;
    const { empresas, empMap, consultores, consultMap, libByProd, movByEmp, vmetas } = base;

    // Período = meses marcados (ordenados) ou todos.
    const periodoMeses = mesesSel.size ? meses.filter(m => mesesSel.has(m)) : meses;
    const periodoSet   = new Set(periodoMeses);
    const ultimoMes    = periodoMeses.length ? periodoMeses[periodoMeses.length-1] : null;
    const movDisponivel = !!ultimoMes && ultimoMes >= MOV_DESDE;

    const slotsDe = (e) => {
      const arr = [];
      const add = (id, pct) => { if(id && consultMap[id]) arr.push({ id, pct: pct||0 }); };
      add(e.consultor_principal_id, e.pct_principal  ?? 100);
      add(e.consultor_agregado_id,  e.pct_agregado_1 ?? 0);
      add(e.consultor_agregado_2_id,e.pct_agregado_2 ?? 0);
      return arr;
    };

    // Movimentação real da empresa = ÚLTIMO mês do período (de movimentacoes).
    const movRealEmp   = (e) => movDisponivel ? (movByEmp[e.id]?.[ultimoMes] || 0) : 0;
    // Creditado (liberacoes) do mesmo último mês.
    const creditadoEmp = (e) => ultimoMes ? (libByProd[e.produto_id]?.[ultimoMes] || 0) : 0;

    const metaRowsPeriodo = vmetas.filter(v => periodoSet.has(v.competencia_meta?.substring(0,7)));

    // Meta DO PERÍODO por consultor: meta_mensal × nº de meses do período >= piso (meta_inicio; ≥ 2026-01).
    const pisoDe = (c) => { const mi = c.meta_inicio ? String(c.meta_inicio).substring(0,7) : '2026-01'; return mi > '2026-01' ? mi : '2026-01'; };
    const metaPeriodoCons = (c) => (c.meta_mensal||0) * periodoMeses.filter(m => m >= pisoDe(c)).length;

    // Média mensal = meta apurada ÷ nº de meses válidos. Com meta cadastrada, meses = metaPeriodo/metaMensal
    // (contagem que respeita o meta_inicio); sem meta cadastrada, meses = nº de meses do período.
    const mediaMensal = (metaApurada, metaPeriodo, metaMensal) => {
      // Com meta cadastrada: divisor = metaPeriodo/metaMensal (já respeita meta_inicio).
      // Sem meta cadastrada: conta só os meses do período a partir de 2026-01 (descarta 2025).
      const mesesV = metaPeriodo > 0 ? Math.round(metaPeriodo / (metaMensal || 1)) : periodoMeses.filter(m => m >= '2026-01').length;
      if(mesesV <= 0) return null;
      if(metaPeriodo > 0) return metaApurada / mesesV; // exibe mesmo quando apurada = 0
      return metaApurada > 0 ? metaApurada / mesesV : null; // sem cadastrada e sem apuração → "—"
    };

    // Estatística por consultor: esperado (SEMPRE mensal), mov (último mês), creditado, meta (período).
    const buildStat = (empresasList, metaRows) => {
      const stat = {};
      const ens = (cid) => stat[cid] || (stat[cid] = { esperado:0, mov:0, creditado:0, meta:0, contratos:new Set() });
      for(const e of empresasList) {
        const mv = movRealEmp(e), cr = creditadoEmp(e);
        const espBase = (e.potencial_movimentacao||0) * (e.peso_categoria||1);
        for(const sl of slotsDe(e)) {
          const st = ens(sl.id);
          st.esperado  += espBase * (sl.pct/100);
          st.mov       += mv      * (sl.pct/100);
          st.creditado += cr      * (sl.pct/100);
          st.contratos.add(e.id);
        }
      }
      for(const v of metaRows) {
        const emp = empMap[v.empresa_id];
        if(!emp) continue;
        const donoId = (v.regra === 'upsell' || !v.consultor_id) ? emp.consultor_principal_id : v.consultor_id;
        const dono = consultMap[donoId];
        if(!dono) continue;
        ens(dono.id).meta += v.valor_meta || 0;
      }
      return stat;
    };

    const statAll = buildStat(empresas, metaRowsPeriodo);

    const sumBy = (stat, pred) => {
      let esperado=0, mov=0, creditado=0, meta=0; const contratos=new Set();
      for(const cid of Object.keys(stat)) {
        const c = consultMap[cid];
        if(pred && !(c && pred(c))) continue;
        const st = stat[cid];
        esperado += st.esperado; mov += st.mov; creditado += st.creditado; meta += st.meta;
        for(const id of st.contratos) contratos.add(id);
      }
      return { esperado, mov, creditado, meta, contratos: contratos.size };
    };

    const scopePred = aba === 'geral' ? null : (c => c.diretor === aba);
    const card2 = sumBy(statAll, scopePred);

    // ── "Novo em 2026" — meta considerada (gravada + elegível não gravada), inclui licitação ──
    const libsList = {}; // produto -> [{comp, val}] ordenado asc
    for(const pid in libByProd) libsList[pid] = Object.entries(libByProd[pid]).map(([comp,val])=>({comp,val})).sort((a,b)=>a.comp.localeCompare(b.comp));
    const hoje = new Date();
    const hojeYM = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const isVB = (e) => { const p=(e.produto_contratado||'').toLowerCase().trim(); return p==='vegas benefícios'||p==='vegas beneficios'; };
    const calcElegib = (e) => {
      const cat=(e.categoria||'').toLowerCase();
      const isConv = cat.includes('conv') || cat.includes('mobil');
      const peso = isVB(e) ? (e.peso_categoria ?? 1) : 1;
      const list = libsList[e.produto_id] || [];
      const comValor = list.filter(l => l.val > 0);
      let mesAlvo=null, valorBase=0;
      if(!isConv) {
        if(!comValor.length) return null;
        mesAlvo = comValor[0].comp; valorBase = comValor[0].val;
      } else {
        if(!comValor.length) return null;
        const [y0,m0] = comValor[0].comp.split('-').map(Number);
        const tres = [0,1,2].map(i => { const d=new Date(y0, m0-1+i, 1); const comp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return { comp, val: (list.find(l=>l.comp===comp)?.val)||0 }; });
        const alvo = tres[2].val>0 ? tres[2] : [...tres].reverse().find(t=>t.val>0);
        if(!alvo) return null;
        mesAlvo = alvo.comp; valorBase = alvo.val;
      }
      if(!mesAlvo || mesAlvo > hojeYM) return null; // mês alvo tem que já ter chegado
      return { mesAlvo, valor: valorBase * peso }; // pct = 100 (valor cheio da empresa)
    };

    // Gravada por empresa: soma no período + meses gravados (para não duplicar (a) com (b)).
    const gravadaPeriodoEmp = {}, gravadaMesesEmp = {};
    for(const v of vmetas) {
      const m = v.competencia_meta?.substring(0,7); if(!m) continue;
      (gravadaMesesEmp[v.empresa_id] = gravadaMesesEmp[v.empresa_id] || new Set()).add(m);
      if(periodoSet.has(m)) gravadaPeriodoEmp[v.empresa_id] = (gravadaPeriodoEmp[v.empresa_id]||0) + (v.valor_meta||0);
    }
    const consideradoEmpresa = (e) => {
      let val = gravadaPeriodoEmp[e.id] || 0;              // (a) gravado no período
      const calc = calcElegib(e);                          // (b) elegível não gravado
      if(calc && periodoSet.has(calc.mesAlvo) && !gravadaMesesEmp[e.id]?.has(calc.mesAlvo)) val += calc.valor;
      return val;
    };
    let novoComercial=0, novoLicitacao=0;
    for(const e of empresas) {
      const dir = consultMap[e.consultor_principal_id]?.diretor;
      if(aba !== 'geral' && dir !== aba) continue;
      const val = consideradoEmpresa(e);
      if(dir === 'Sartori') novoLicitacao += val; else novoComercial += val;
    }
    const novo = { comercial:novoComercial, licitacao:novoLicitacao, total:novoComercial+novoLicitacao };

    // Bloco — comparativo por diretoria (aba Geral)
    const diretorias = DIRETORIAS.map(d => ({ dir:d, ...sumBy(statAll, c => c.diretor === d) }));

    // Bloco — gestores da diretoria (abas de diretoria)
    let gestores = [];
    if(aba !== 'geral') {
      const consDir = consultores.filter(c => c.diretor === aba && c.ativo);
      const nomes = [...new Set(consDir.map(c => c.gestor).filter(Boolean))];
      gestores = nomes.map(g => {
        const cons  = consDir.filter(c => c.gestor === g);
        const st    = sumBy(statAll, c => c.gestor === g && c.diretor === aba);
        const metaPeriodo = cons.reduce((s,c) => s + metaPeriodoCons(c), 0);
        const metaMensal  = cons.reduce((s,c) => s + (c.meta_mensal||0), 0);
        const vendedores = cons.map(c => {
          const raw = statAll[c.id];
          const sv = raw ? { esperado:raw.esperado, mov:raw.mov, meta:raw.meta, contratos:raw.contratos.size } : { esperado:0, mov:0, meta:0, contratos:0 };
          const mp = metaPeriodoCons(c);
          return { id:c.id, nome:c.nome, ...sv, metaPeriodo:mp, metaMensal:c.meta_mensal||0, media: mediaMensal(sv.meta, mp, c.meta_mensal||0), pctMeta: mp>0 ? sv.meta/mp*100 : null };
        }).sort((a,b) => b.mov - a.mov || b.meta - a.meta);
        return { gestor:g, ...st, metaPeriodo, metaMensal, media: mediaMensal(st.meta, metaPeriodo, metaMensal), pctMeta: metaPeriodo>0 ? st.meta/metaPeriodo*100 : null, vendedores };
      }).sort((a,b) => b.mov - a.mov || b.meta - a.meta);
    }

    // Bloco — distribuição por produto (respeita escopo + período)
    const scopeSlot = (c) => aba === 'geral' || c.diretor === aba;
    const prodStat = {};
    const ensP = (p) => prodStat[p] || (prodStat[p] = { esperado:0, mov:0, meta:0, contratos:new Set() });
    for(const e of empresas) {
      const prod = e.produto_contratado || '—';
      const mv = movRealEmp(e);
      const espBase = (e.potencial_movimentacao||0) * (e.peso_categoria||1);
      for(const sl of slotsDe(e)) {
        const c = consultMap[sl.id];
        if(!c || !scopeSlot(c)) continue;
        const st = ensP(prod);
        st.esperado += espBase * (sl.pct/100);
        st.mov      += mv      * (sl.pct/100);
        st.contratos.add(e.id);
      }
    }
    for(const v of metaRowsPeriodo) {
      const emp = empMap[v.empresa_id]; if(!emp) continue;
      const donoId = (v.regra === 'upsell' || !v.consultor_id) ? emp.consultor_principal_id : v.consultor_id;
      const dono = consultMap[donoId]; if(!dono || !scopeSlot(dono)) continue;
      ensP(emp.produto_contratado || '—').meta += v.valor_meta || 0;
    }
    const metaTotalEscopo = card2.meta;
    const produtos = Object.entries(prodStat).map(([produto, st]) => ({
      produto, esperado:st.esperado, mov:st.mov, meta:st.meta, contratos:st.contratos.size,
      pctTotal: metaTotalEscopo > 0 ? st.meta/metaTotalEscopo*100 : 0,
    })).filter(p => p.meta > 0 || p.esperado > 0 || p.mov > 0)
      .sort((a,b) => b.meta - a.meta);

    // Nota: quanto do produto Alimentação vem de licitação (Sartori).
    let alimLicitMov=0, alimTotalMov=0;
    for(const e of empresas) {
      if(!/aliment/i.test(e.produto_contratado||'')) continue;
      const dir = consultMap[e.consultor_principal_id]?.diretor;
      if(aba !== 'geral' && dir !== aba) continue;
      const mv = movRealEmp(e);
      alimTotalMov += mv;
      if(dir === 'Sartori') alimLicitMov += mv;
    }

    // Bloco — ranking de vendedores por MOVIMENTAÇÃO REAL (desc)
    const ranking = consultores
      .filter(c => c.ativo && (aba === 'geral' || c.diretor === aba))
      .map(c => {
        const st = statAll[c.id];
        const mov = st?.mov || 0;
        const meta = st?.meta || 0;
        const mp = metaPeriodoCons(c);
        return { id:c.id, nome:c.nome, gestor:c.gestor || '—', mov, metaApurada:meta, metaPeriodo:mp, media: mediaMensal(meta, mp, c.meta_mensal||0), pctMeta: mp>0 ? meta/mp*100 : null, isLicit: c.setor === 'Licitação' };
      })
      .filter(r => r.mov > 0 || r.metaApurada > 0 || r.metaPeriodo > 0)
      // Licitação (setor) SEMPRE no topo (maior volume); depois quem apurou (meta apurada desc);
      // por último quem apurou zero, ordenados por movimentação real desc.
      .sort((a,b) => {
        if(a.isLicit !== b.isLicit) return a.isLicit ? -1 : 1;
        const aTem = a.metaApurada > 0, bTem = b.metaApurada > 0;
        if(aTem !== bTem) return aTem ? -1 : 1;
        if(aTem) return b.metaApurada - a.metaApurada;
        return b.mov - a.mov;
      });

    // Evolução: meta apurada mês a mês (todos os meses, mesmo escopo dos cards).
    const metaSerie = meses.map(m => {
      let val = 0;
      for(const v of vmetas) {
        if(v.competencia_meta?.substring(0,7) !== m) continue;
        const emp = empMap[v.empresa_id]; if(!emp) continue;
        const donoId = (v.regra === 'upsell' || !v.consultor_id) ? emp.consultor_principal_id : v.consultor_id;
        const dono = consultMap[donoId]; if(!dono) continue;
        if(scopePred && !scopePred(dono)) continue;
        val += v.valor_meta || 0;
      }
      return { mes:m, valor:val };
    });

    return {
      card2, novo, diretorias, gestores, produtos, ranking, metaSerie,
      ultimoMes, movDisponivel, periodoMeses,
      alim: { licit:alimLicitMov, total:alimTotalMov },
    };
  }, [base, meses, aba, mesesSel]);

  const toggle = (g) => setExpandidos(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const toggleMes = (m) => setMesesSel(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });

  if(loading || !view) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={s.spin} />
        <div style={{ color:'var(--vg-muted)', fontSize:14 }}>Carregando resultado comercial…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const v = view;
  const metaAplic = metaAplicavel(aba); // false só na aba Sartori
  const corAba = aba === 'geral' ? 'var(--vg-brand-500)' : CORES_DIR[aba];

  // Rótulos de período
  const periodoLabel = mesesSel.size === 0 ? 'acumulado 2026'
    : v.periodoMeses.length === 1 ? fmtMes(v.periodoMeses[0]+'-01')
    : `${v.periodoMeses.length} meses`;
  const ultimoLabel = v.ultimoMes ? fmtMes(v.ultimoMes+'-01') : '—';
  const rotuloPeriodo = mesesSel.size === 0 ? 'Todos os meses' : v.periodoMeses.map(m => fmtMes(m+'-01')).join(', ');

  // Movimentação real do escopo (último mês) + utilização
  const movCell = (val) => v.movDisponivel ? fmt(val) : '—';
  const utilizacao = v.card2.creditado > 0 ? v.card2.mov/v.card2.creditado*100 : null;
  const movSub = !v.movDisponivel
    ? `movimentação real disponível a partir de ${fmtMes(MOV_DESDE+'-01')}`
    : `creditado ${fmt(v.card2.creditado)} · utilização ${utilizacao==null ? '—' : fmtPct(utilizacao)}`;

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Faixa de assinatura */}
      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      {/* Cabeçalho */}
      <div style={{ marginBottom:20 }}>
        <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Resultado Comercial</div>
        <h1 style={{ fontFamily:OUTFIT, fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Cartões Vegas</h1>
        <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Resultado comercial por diretoria — resumo primeiro, detalhe sob demanda</p>
      </div>

      {/* Filtro de meses — multi-seleção */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:6, alignItems:'center' }}>
        <button onClick={()=>setMesesSel(new Set())}
          style={btnMes(mesesSel.size===0)}>Todos</button>
        <button onClick={()=>setMesesSel(new Set(meses.slice(-3)))}
          style={btnMes(false)}>Trimestre</button>
        <button onClick={()=>setMesesSel(new Set(meses.slice(-6)))}
          style={btnMes(false)}>Semestre</button>
        <span style={{ width:1, height:22, background:'var(--vg-border)', margin:'0 4px' }} />
        {meses.map(m => (
          <button key={m} onClick={()=>toggleMes(m)} style={btnMes(mesesSel.has(m))}>{fmtMes(m+'-01')}</button>
        ))}
      </div>
      <div style={{ ...CAPTION, marginBottom:16 }}>Clique nos meses para selecionar múltiplos</div>

      {/* Abas de diretoria */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:24 }}>
        {[{ k:'geral', label:'Geral' }, ...DIRETORIAS.map(d => ({ k:d, label:d }))].map(op => {
          const ativo = aba === op.k;
          const cor = op.k === 'geral' ? 'var(--vg-brand-500)' : CORES_DIR[op.k];
          return (
            <button key={op.k} onClick={()=>{ setAba(op.k); setExpandidos(new Set()); }}
              style={{ position:'relative', overflow:'hidden',
                background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
                border:`1px solid ${ativo ? cor : 'var(--vg-border)'}`,
                color: ativo ? 'var(--vg-ink)' : 'var(--vg-ink-secondary)',
                borderRadius:'var(--vg-radius)', padding:'10px 22px', fontSize:14, fontWeight:600,
                fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>
              {ativo && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:cor }} />}
              {op.label}
            </button>
          );
        })}
      </div>

      {/* CARD — Novo em 2026 */}
      <div style={{ ...cardStyle, marginBottom:20 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <TrendingUp {...ICON} color={corAba} /> Novo em 2026
        </div>
        <div style={{ ...CAPTION, marginBottom:18 }}>Meta considerada (confirmada + calculada) no período · {periodoLabel}{aba!=='geral' && ` · Diretoria ${aba}`}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:20 }}>
          <Metrica icon={<Building2 {...ICON} />} label="Comercial (Ronny + Rossi)" valor={fmt(v.novo.comercial)} />
          <Metrica icon={<Layers {...ICON} />}    label="Licitação (Sartori)"       valor={fmt(v.novo.licitacao)} corValor="var(--vg-peach-400)" />
          <Metrica icon={<TrendingUp {...ICON} color={corAba} />} label="Total" valor={fmt(v.novo.total)} destaque corValor={corAba} />
        </div>
        <div style={{ ...CAPTION, marginTop:16 }}>Inclui licitação — não entra na meta comercial.</div>
      </div>

      {/* CARD — Total da carteira */}
      <div style={{ ...cardStyle, marginBottom:24 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <Layers {...ICON} color={corAba} /> Total da Carteira {aba !== 'geral' && `· ${aba}`}
        </div>
        <div style={{ ...CAPTION, marginBottom:18 }}>Carteira completa do escopo · {periodoLabel}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:20 }}>
          <Metrica icon={<FileText {...ICON} />}   label="Contratos ativos"    valor={fmtInt(v.card2.contratos)} />
          <Metrica icon={<TrendingUp {...ICON} />} label="Mov. esperada (mês)" valor={fmt(v.card2.esperado)} />
          <Metrica icon={<Target {...ICON} />}     label="Meta apurada"        valor={metaAplic ? fmt(v.card2.meta) : '—'} muted={!metaAplic} valorTitle={metaAplic ? undefined : 'Licitação não entra na meta comercial'} />
          <Metrica icon={<Wallet {...ICON} />}     label={`Mov. real (${ultimoLabel})`} valor={movCell(v.card2.mov)} destaque corValor={corAba}
            muted={!v.movDisponivel} sub={movSub} />
        </div>
      </div>

      {/* BLOCO — Evolução da meta apurada */}
      <div style={{ ...cardStyle, marginBottom:24 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <LineChart {...ICON} color={corAba} /> Evolução da Meta Apurada
        </div>
        <div style={{ ...CAPTION, marginBottom:16 }}>Meta apurada mês a mês · {aba==='geral' ? 'todas as diretorias' : `Diretoria ${aba}`}</div>
        <GraficoEvolucao serie={v.metaSerie} cor={corAba} />
      </div>

      {/* BLOCO — Comparativo por diretoria (só na aba Geral) */}
      {aba === 'geral' && (
        <div style={{ marginBottom:24 }}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <Building2 {...ICON} /> Comparativo por Diretoria
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px,1fr))', gap:16 }}>
            {v.diretorias.map(d => {
              const aplica = metaAplicavel(d.dir);
              return (
                <div key={d.dir} style={{ ...cardStyle, borderTop:`3px solid ${CORES_DIR[d.dir]}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:CORES_DIR[d.dir], flexShrink:0 }} />
                    <span style={{ fontFamily:OUTFIT, fontWeight:600, fontSize:16, color:'var(--vg-ink)' }}>Diretoria {d.dir}</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    <LinhaMetrica label="Contratos"        valor={fmtInt(d.contratos)} />
                    <LinhaMetrica label="Esperado / mês"   valor={fmt(d.esperado)} />
                    <LinhaMetrica label="Meta apurada"     valor={aplica ? fmt(d.meta) : '—'} muted={!aplica} valorTitle={aplica ? undefined : 'Licitação não entra na meta comercial'} />
                    <LinhaMetrica label={`Mov. real (${ultimoLabel})`} valor={movCell(d.mov)} muted={!v.movDisponivel} destaque cor={CORES_DIR[d.dir]} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BLOCO — Gestores da diretoria (abas de diretoria) */}
      {aba !== 'geral' && (
        <div style={{ ...cardStyle, padding:0, overflow:'hidden', marginBottom:24 }}>
          <div style={{ padding:'24px 24px 4px' }}>
            <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <Users {...ICON} color={corAba} /> Gestores · Diretoria {aba}
            </div>
            <div style={{ ...CAPTION, marginBottom:12 }}>Clique em um gestor para abrir os vendedores</div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
              <thead>
                <tr>
                  <th style={s.th}>Gestor</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Contratos</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Esperado / mês</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Meta apurada</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Média / mês</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Meta do período</th>
                  <th style={{ ...s.th, textAlign:'right' }}>% da meta</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Mov. real</th>
                </tr>
              </thead>
              <tbody>
                {v.gestores.length === 0 && (
                  <tr><td colSpan={8} style={{ ...s.td, textAlign:'center', color:'var(--vg-muted)' }}>Nenhum gestor nesta diretoria.</td></tr>
                )}
                {v.gestores.map(g => {
                  const aberto = expandidos.has(g.gestor);
                  return (
                    <Fragment key={g.gestor}>
                      <tr onClick={()=>toggle(g.gestor)}
                        style={{ borderTop:'1px solid var(--vg-border)', cursor:'pointer', background: aberto ? 'var(--vg-surface-muted)' : 'transparent' }}>
                        <td style={{ ...s.td, fontWeight:600, color:'var(--vg-ink)' }}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
                            {aberto ? <ChevronDown size={15} strokeWidth={2} color="var(--vg-muted)" /> : <ChevronRight size={15} strokeWidth={2} color="var(--vg-muted)" />}
                            {g.gestor}
                          </span>
                        </td>
                        <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmtInt(g.contratos)}</td>
                        <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(g.esperado)}</td>
                        <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{metaAplic ? fmt(g.meta) : '—'}</td>
                        <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink)' }} className="vg-num">{metaAplic && g.media != null ? fmt(g.media) : '—'}</td>
                        <td style={{ ...s.td, textAlign:'right' }}>
                          {metaAplic && g.metaPeriodo > 0 ? (
                            <><div className="vg-num" style={{ fontWeight:600, color:'var(--vg-ink)' }}>{fmt(g.metaPeriodo)}</div>
                            <div className="vg-num" style={CAPTION}>{fmt(g.metaMensal)}/mês</div></>
                          ) : <span style={{ color:'var(--vg-muted)' }}>—</span>}
                        </td>
                        <td style={{ ...s.td, textAlign:'right', fontWeight:600, color:metaAplic ? corPct(g.pctMeta) : 'var(--vg-muted)' }} className="vg-num">{metaAplic ? (g.pctMeta==null ? '—' : fmtPct(g.pctMeta)) : '—'}</td>
                        <td style={{ ...s.td, textAlign:'right', fontWeight:600, color:'var(--vg-ink)' }} className="vg-num">{movCell(g.mov)}</td>
                      </tr>
                      {aberto && g.vendedores.map(vd => (
                        <tr key={`${g.gestor}-${vd.id}`} style={{ borderTop:'1px solid var(--vg-border)', background:'var(--vg-surface-muted)' }}>
                          <td style={{ ...s.td, paddingLeft:44, color:'var(--vg-ink-secondary)' }}>{vd.nome}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtInt(vd.contratos)}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmt(vd.esperado)}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{metaAplic ? fmt(vd.meta) : '—'}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink)' }} className="vg-num">{metaAplic && vd.media != null ? fmt(vd.media) : '—'}</td>
                          <td style={{ ...s.td, textAlign:'right' }}>
                            {metaAplic && vd.metaPeriodo > 0 ? (
                              <><div className="vg-num" style={{ color:'var(--vg-ink-secondary)' }}>{fmt(vd.metaPeriodo)}</div>
                              <div className="vg-num" style={CAPTION}>{fmt(vd.metaMensal)}/mês</div></>
                            ) : <span style={{ color:'var(--vg-muted)' }}>—</span>}
                          </td>
                          <td style={{ ...s.td, textAlign:'right', color:metaAplic ? corPct(vd.pctMeta) : 'var(--vg-muted)' }} className="vg-num">{metaAplic ? (vd.pctMeta==null ? '—' : fmtPct(vd.pctMeta)) : '—'}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{movCell(vd.mov)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BLOCO — Distribuição por produto */}
      <div style={{ ...cardStyle, padding:0, overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'24px 24px 4px' }}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Package {...ICON} color={corAba} /> Distribuição por Produto
          </div>
          <div style={{ ...CAPTION, marginBottom:12 }}>{aba==='geral' ? 'Todos os produtos' : `Diretoria ${aba}`} · {periodoLabel}</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={s.th}>Produto</th>
                <th style={{ ...s.th, textAlign:'right' }}>Contratos</th>
                <th style={{ ...s.th, textAlign:'right' }}>Esperado / mês</th>
                <th style={{ ...s.th, textAlign:'right' }}>Meta apurada</th>
                <th style={{ ...s.th, textAlign:'right' }}>Mov. real</th>
                <th style={{ ...s.th, minWidth:150 }}>% do total</th>
              </tr>
            </thead>
            <tbody>
              {v.produtos.length === 0 && (
                <tr><td colSpan={6} style={{ ...s.td, textAlign:'center', color:'var(--vg-muted)' }}>Nenhum produto com valor no período.</td></tr>
              )}
              {v.produtos.map(p => (
                <tr key={p.produto} style={{ borderTop:'1px solid var(--vg-border)' }}>
                  <td style={{ ...s.td, fontWeight:500, color:'var(--vg-ink)' }}>{p.produto}</td>
                  <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmtInt(p.contratos)}</td>
                  <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(p.esperado)}</td>
                  <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{metaAplic ? fmt(p.meta) : '—'}</td>
                  <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{movCell(p.mov)}</td>
                  <td style={s.td}>
                    {metaAplic ? (
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ flex:1, height:6, background:'var(--vg-neutral-bg)', borderRadius:3, overflow:'hidden', minWidth:60 }}>
                          <div style={{ height:'100%', width:`${Math.min(p.pctTotal,100)}%`, background:corAba, borderRadius:3 }} />
                        </div>
                        <span className="vg-num" style={{ ...CAPTION, minWidth:46, textAlign:'right', fontWeight:600 }}>{fmtPct(p.pctTotal)}</span>
                      </div>
                    ) : <span style={{ color:'var(--vg-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.alim.licit > 0 && (
          <div style={{ padding:'12px 24px 20px', ...CAPTION }}>
            Do produto <strong style={{ color:'var(--vg-ink-secondary)' }}>Alimentação</strong>, <span className="vg-num">{fmt(v.alim.licit)}</span> de <span className="vg-num">{fmt(v.alim.total)}</span> em movimentação vêm de <strong style={{ color:'var(--vg-peach-400)' }}>licitação (Sartori)</strong> — não é venda comercial.
          </div>
        )}
      </div>

      {/* BLOCO — Ranking de vendedores (por movimentação real) */}
      <div style={{ ...cardStyle, padding:0, overflow:'hidden' }}>
        <div style={{ padding:'24px 24px 4px' }}>
          <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Trophy {...ICON} color={corAba} /> Ranking de Vendedores
          </div>
          <div style={{ ...CAPTION, marginBottom:12 }}>{aba==='geral' ? 'Todas as diretorias' : `Diretoria ${aba}`} · ordenado por meta apurada · período: {rotuloPeriodo} · mov. real de {ultimoLabel}</div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
            <thead>
              <tr>
                <th style={{ ...s.th, width:60, textAlign:'center' }}>#</th>
                <th style={s.th}>Vendedor</th>
                <th style={s.th}>Gestor</th>
                <th style={{ ...s.th, textAlign:'right' }}>Mov. real</th>
                <th style={{ ...s.th, textAlign:'right' }}>Meta apurada</th>
                <th style={{ ...s.th, textAlign:'right' }}>Média / mês</th>
                <th style={{ ...s.th, textAlign:'right' }}>Meta do período</th>
                <th style={{ ...s.th, textAlign:'right' }}>% da meta</th>
              </tr>
            </thead>
            <tbody>
              {v.ranking.length === 0 && (
                <tr><td colSpan={8} style={{ ...s.td, textAlign:'center', color:'var(--vg-muted)' }}>Nenhum vendedor com movimentação no período.</td></tr>
              )}
              {v.ranking.map((r,i) => {
                const top3 = i < 3;
                const temMeta = r.metaPeriodo > 0;
                return (
                  <tr key={r.id} style={{ borderTop:'1px solid var(--vg-border)' }}>
                    <td style={{ ...s.td, textAlign:'center' }}>
                      <span className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:700, fontSize: top3 ? 18 : 14, color: top3 ? 'var(--vg-brand-500)' : 'var(--vg-muted)' }}>{i+1}</span>
                    </td>
                    <td style={{ ...s.td, fontWeight:600, color:'var(--vg-ink)' }}>{r.nome}</td>
                    <td style={{ ...s.td, color:'var(--vg-ink-secondary)' }}>{r.gestor}</td>
                    <td style={{ ...s.td, textAlign:'right', fontWeight:600, color:'var(--vg-ink)' }} className="vg-num">{movCell(r.mov)}</td>
                    <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{fmt(r.metaApurada)}</td>
                    <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink)' }} className="vg-num">{r.media != null ? fmt(r.media) : '—'}</td>
                    <td style={{ ...s.td, textAlign:'right' }} className="vg-num">{temMeta ? fmt(r.metaPeriodo) : '—'}</td>
                    <td style={{ ...s.td, textAlign:'right', fontWeight:700, color: temMeta ? corPct(r.pctMeta) : 'var(--vg-muted)' }} className="vg-num">{temMeta ? fmtPct(r.pctMeta) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 24px 20px', ...CAPTION }}>Ordenado por meta apurada — licitação em primeiro por volume; vendedores sem meta apurada aparecem no fim, ordenados por movimentação real.</div>
      </div>
    </div>
  );
}

function btnMes(ativo) {
  return {
    background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
    border:`1px solid ${ativo ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`,
    color: ativo ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
    borderRadius:'var(--vg-radius)', padding:'7px 14px', fontSize:13, fontWeight:ativo?600:500,
    fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none',
  };
}

function LinhaMetrica({ label, valor, destaque=false, muted=false, cor, valorTitle }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
      <span style={LABEL}>{label}</span>
      <span title={valorTitle} className="vg-num" style={{
        fontFamily:OUTFIT, fontWeight:600, textAlign:'right', overflowWrap:'anywhere',
        fontSize: fFit(valor, destaque ? 18 : 15),
        color: muted ? 'var(--vg-muted)' : (destaque ? (cor || 'var(--vg-ink)') : 'var(--vg-ink)'),
        fontStyle: muted ? 'italic' : 'normal',
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
