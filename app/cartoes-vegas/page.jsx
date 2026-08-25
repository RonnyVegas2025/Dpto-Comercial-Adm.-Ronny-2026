'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  PlusCircle, Layers, Building2, Users, ChevronRight, ChevronDown,
  Target, TrendingUp, Wallet, FileText,
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

function Metrica({ label, valor, icon, destaque=false, muted=false, valorTitle, corValor }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
      <div style={{ ...LABEL, display:'flex', alignItems:'center', gap:6 }}>{icon}{label}</div>
      <div title={valorTitle} className="vg-num" style={{
        fontFamily:OUTFIT, fontWeight:600, lineHeight:1.15, overflowWrap:'anywhere',
        fontSize: fFit(valor, destaque ? 26 : 20),
        color: muted ? 'var(--vg-muted)' : (corValor || 'var(--vg-ink)'),
        fontStyle: muted ? 'italic' : 'normal',
      }}>{valor}</div>
    </div>
  );
}

const corPct = (p) => p==null ? 'var(--vg-muted)' : p>=80 ? 'var(--vg-success-fg)' : p>=60 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';

export default function CartoesVegas() {
  const [base, setBase]       = useState(null);
  const [meses, setMeses]     = useState([]);
  const [mesFiltro, setMesFiltro] = useState('todos');
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
        fetchAll(supabase.from('consultores').select('id,nome,diretor,gestor,meta_mensal,ativo')),
      ]);

      const empIds  = empresas.map(e => e.id);
      const prodIds = empresas.map(e => e.produto_id);

      const [libs, vmetas] = await Promise.all([
        fetchEmPartes(prodIds, (ids) =>
          supabase.from('liberacoes').select('produto_id,competencia,total_liberado').in('produto_id', ids), 200),
        fetchEmPartes(empIds, (ids) =>
          supabase.from('valor_meta_empresa')
            .select('empresa_id,consultor_id,competencia_meta,valor_meta,regra').in('empresa_id', ids), 300),
      ]);

      const empMap = {};
      for(const e of empresas) empMap[e.id] = e;

      const consultMap = {};
      for(const c of consultores) consultMap[c.id] = c;

      // Movimentação por produto → mês (YYYY-MM)
      const libByProd = {};
      for(const l of libs) {
        const m = l.competencia?.substring(0,7);
        if(!m) continue;
        (libByProd[l.produto_id] = libByProd[l.produto_id] || {})[m] =
          (libByProd[l.produto_id][m] || 0) + (l.total_liberado || 0);
      }

      const mesesUnion = [...new Set([
        ...vmetas.map(v => v.competencia_meta?.substring(0,7)),
        ...libs.map(l => l.competencia?.substring(0,7)),
      ].filter(Boolean))].sort();

      setBase({ empresas, empMap, consultores, consultMap, libByProd, vmetas });
      setMeses(mesesUnion);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  const view = useMemo(() => {
    if(!base) return null;
    const { empresas, empMap, consultores, consultMap, libByProd, vmetas } = base;

    const slotsDe = (e) => {
      const arr = [];
      const add = (id, pct) => { if(id && consultMap[id]) arr.push({ id, pct: pct||0 }); };
      add(e.consultor_principal_id, e.pct_principal  ?? 100);
      add(e.consultor_agregado_id,  e.pct_agregado_1 ?? 0);
      add(e.consultor_agregado_2_id,e.pct_agregado_2 ?? 0);
      return arr;
    };

    // Movimentação real da empresa no período (acumulado se "todos")
    const movPeriodo = (e) => {
      const byM = libByProd[e.produto_id];
      if(!byM) return 0;
      if(mesFiltro === 'todos') return Object.values(byM).reduce((s,x)=>s+x,0);
      return byM[mesFiltro] || 0;
    };

    const noPeriodo = (ym) => mesFiltro === 'todos' ? true : ym === mesFiltro;
    const metaRowsPeriodo = vmetas.filter(v => noPeriodo(v.competencia_meta?.substring(0,7)));

    // Empresas novas (cadastro dentro do período; "todos" = ano 2026)
    const novaNoPeriodo = (e) => {
      const dc = e.data_cadastro;
      if(!dc) return false;
      return mesFiltro === 'todos' ? String(dc).substring(0,4) === '2026' : String(dc).substring(0,7) === mesFiltro;
    };
    const novos = empresas.filter(novaNoPeriodo);
    const novosSet = new Set(novos.map(e => e.id));

    // Constrói estatística por consultor: esperado (SEMPRE mensal), mov (período), meta (período)
    const buildStat = (empresasList, metaRows) => {
      const stat = {};
      const ens = (cid) => stat[cid] || (stat[cid] = { esperado:0, mov:0, meta:0, contratos:new Set() });
      for(const e of empresasList) {
        const movP = movPeriodo(e);
        const espBase = (e.potencial_movimentacao||0) * (e.peso_categoria||1);
        for(const sl of slotsDe(e)) {
          const st = ens(sl.id);
          st.esperado += espBase * (sl.pct/100);
          st.mov      += movP   * (sl.pct/100);
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

    const statAll   = buildStat(empresas, metaRowsPeriodo);
    const statNovos = buildStat(novos, metaRowsPeriodo.filter(v => novosSet.has(v.empresa_id)));

    const sumBy = (stat, pred) => {
      let esperado=0, mov=0, meta=0; const contratos=new Set();
      for(const cid of Object.keys(stat)) {
        const c = consultMap[cid];
        if(pred && !(c && pred(c))) continue;
        const st = stat[cid];
        esperado += st.esperado; mov += st.mov; meta += st.meta;
        for(const id of st.contratos) contratos.add(id);
      }
      return { esperado, mov, meta, contratos: contratos.size };
    };

    const scopePred = aba === 'geral' ? null : (c => c.diretor === aba);
    const card1 = sumBy(statNovos, scopePred);
    const card2 = sumBy(statAll,   scopePred);

    // Bloco 3 — comparativo por diretoria (aba Geral)
    const diretorias = DIRETORIAS.map(d => ({ dir:d, ...sumBy(statAll, c => c.diretor === d) }));

    // Bloco 4 — gestores da diretoria (abas de diretoria)
    let gestores = [];
    if(aba !== 'geral') {
      const consDir = consultores.filter(c => c.diretor === aba && c.ativo);
      const nomes = [...new Set(consDir.map(c => c.gestor).filter(Boolean))];
      gestores = nomes.map(g => {
        const cons  = consDir.filter(c => c.gestor === g);
        const st    = sumBy(statAll, c => c.gestor === g && c.diretor === aba);
        const denom = cons.reduce((s,c) => s + (c.meta_mensal||0), 0);
        const vendedores = cons.map(c => {
          const raw = statAll[c.id];
          const sv = raw ? { esperado:raw.esperado, mov:raw.mov, meta:raw.meta, contratos:raw.contratos.size } : { esperado:0, mov:0, meta:0, contratos:0 };
          return { id:c.id, nome:c.nome, ...sv, denom:c.meta_mensal||0, pctMeta: c.meta_mensal>0 ? sv.meta/c.meta_mensal*100 : null };
        }).sort((a,b) => b.meta - a.meta || b.esperado - a.esperado);
        return { gestor:g, ...st, denom, pctMeta: denom>0 ? st.meta/denom*100 : null, vendedores };
      }).sort((a,b) => b.meta - a.meta || b.esperado - a.esperado);
    }

    return { card1, card2, diretorias, gestores, novosCount: novos.length };
  }, [base, aba, mesFiltro]);

  const toggle = (g) => setExpandidos(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

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

      {/* Filtro de mês */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        {[{ k:'todos', label:'Todos' }, ...meses.map(m => ({ k:m, label:fmtMes(m+'-01') }))].map(op => {
          const ativo = mesFiltro === op.k;
          return (
            <button key={op.k} onClick={()=>setMesFiltro(op.k)}
              style={{ background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface)',
                border:`1px solid ${ativo ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`,
                color: ativo ? 'var(--vg-brand-700)' : 'var(--vg-ink-secondary)',
                borderRadius:'var(--vg-radius)', padding:'7px 14px', fontSize:13, fontWeight:ativo?600:500,
                fontFamily:"'Inter', sans-serif", cursor:'pointer', outline:'none' }}>
              {op.label}
            </button>
          );
        })}
      </div>

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

      {/* CARD 1 — Contratos novos */}
      <div style={{ ...cardStyle, marginBottom:20 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <PlusCircle {...ICON} color={corAba} /> Contratos Novos
        </div>
        <div style={{ ...CAPTION, marginBottom:18 }}>
          {mesFiltro === 'todos' ? 'Cadastrados em 2026' : `Cadastrados em ${fmtMes(mesFiltro+'-01')}`}
          {aba !== 'geral' && ` · Diretoria ${aba}`}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:20 }}>
          <Metrica icon={<FileText {...ICON} />}  label="Contratos novos"       valor={fmtInt(v.card1.contratos)} destaque corValor={corAba} />
          <Metrica icon={<TrendingUp {...ICON} />} label="Mov. esperada (mês)"   valor={fmt(v.card1.esperado)} />
          <Metrica icon={<Target {...ICON} />}     label="Meta apurada"          valor={metaAplic ? fmt(v.card1.meta) : '—'} muted={!metaAplic} valorTitle={metaAplic ? undefined : 'Licitação não entra na meta comercial'} />
          <Metrica icon={<Wallet {...ICON} />}     label="Movimentação real"     valor={fmt(v.card1.mov)} />
        </div>
        <div style={{ ...CAPTION, marginTop:16 }}>Esperado é capacidade mensal do contrato.</div>
      </div>

      {/* CARD 2 — Total da carteira */}
      <div style={{ ...cardStyle, marginBottom:24 }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <Layers {...ICON} color={corAba} /> Total da Carteira {aba !== 'geral' && `· ${aba}`}
        </div>
        <div style={{ ...CAPTION, marginBottom:18 }}>Carteira completa do escopo{mesFiltro==='todos' ? ' · acumulado 2026' : ` · ${fmtMes(mesFiltro+'-01')}`}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:20 }}>
          <Metrica icon={<FileText {...ICON} />}   label="Contratos ativos"      valor={fmtInt(v.card2.contratos)} />
          <Metrica icon={<TrendingUp {...ICON} />} label="Mov. esperada (mês)"   valor={fmt(v.card2.esperado)} destaque corValor={corAba} />
          <Metrica icon={<Target {...ICON} />}     label="Meta apurada"          valor={metaAplic ? fmt(v.card2.meta) : '—'} muted={!metaAplic} valorTitle={metaAplic ? undefined : 'Licitação não entra na meta comercial'} />
          <Metrica icon={<Wallet {...ICON} />}     label="Movimentação real"     valor={fmt(v.card2.mov)} />
        </div>
      </div>

      {/* BLOCO 3 — Comparativo por diretoria (só na aba Geral) */}
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
                    <LinhaMetrica label="Movimentação real" valor={fmt(d.mov)} destaque cor={CORES_DIR[d.dir]} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BLOCO 4 — Gestores da diretoria (abas de diretoria) */}
      {aba !== 'geral' && (
        <div style={{ ...cardStyle, padding:0, overflow:'hidden' }}>
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
                  <th style={{ ...s.th, textAlign:'right' }}>% da meta</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Mov. real</th>
                </tr>
              </thead>
              <tbody>
                {v.gestores.length === 0 && (
                  <tr><td colSpan={6} style={{ ...s.td, textAlign:'center', color:'var(--vg-muted)' }}>Nenhum gestor nesta diretoria.</td></tr>
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
                        <td style={{ ...s.td, textAlign:'right', fontWeight:600, color:metaAplic ? corPct(g.pctMeta) : 'var(--vg-muted)' }} className="vg-num">{metaAplic ? (g.pctMeta==null ? '—' : fmtPct(g.pctMeta)) : '—'}</td>
                        <td style={{ ...s.td, textAlign:'right', fontWeight:600, color:'var(--vg-ink)' }} className="vg-num">{fmt(g.mov)}</td>
                      </tr>
                      {aberto && g.vendedores.map(vd => (
                        <tr key={`${g.gestor}-${vd.id}`} style={{ borderTop:'1px solid var(--vg-border)', background:'var(--vg-surface-muted)' }}>
                          <td style={{ ...s.td, paddingLeft:44, color:'var(--vg-ink-secondary)' }}>{vd.nome}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmtInt(vd.contratos)}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmt(vd.esperado)}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{metaAplic ? fmt(vd.meta) : '—'}</td>
                          <td style={{ ...s.td, textAlign:'right', color:metaAplic ? corPct(vd.pctMeta) : 'var(--vg-muted)' }} className="vg-num">{metaAplic ? (vd.pctMeta==null ? '—' : fmtPct(vd.pctMeta)) : '—'}</td>
                          <td style={{ ...s.td, textAlign:'right', color:'var(--vg-ink-secondary)' }} className="vg-num">{fmt(vd.mov)}</td>
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
    </div>
  );
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
