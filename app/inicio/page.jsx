'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  Target, CalendarDays, Users, BarChart3, Wallet, Building2, CheckCircle2,
  TrendingUp, TrendingDown, Trophy, Globe, FileText, AlertTriangle, ArrowRight, Search, Inbox,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── VEGAS PLATFORM UI STANDARD — tokens de estilo (100% visual) ──────────
const OUTFIT = "'Outfit', sans-serif";
const INTER  = "'Inter', sans-serif";
const ICON   = { size:18, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = { background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)' };
const H_CARD  = { fontFamily:OUTFIT, fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
// Cor semântica de performance: >=80 success · >=50 warning · abaixo danger.
const corSem  = (p) => p>=80 ? 'var(--vg-success-fg)' : p>=50 ? 'var(--vg-warning-fg)' : 'var(--vg-danger-fg)';

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
// Fonte responsiva ao comprimento do valor formatado — evita a quebra no meio
// do número em valores de 8+ dígitos. Mesmo padrão de app/cartoes-vegas/page.jsx.
const fitKpi = (str) => { const n = String(str).length; if (n <= 12) return 24; if (n <= 16) return 20; return 17; };
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = String(d).substring(0,7).split('-');
  return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`;
};

async function fetchAll(query) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + 999);
    if (error || !data || !data.length) break;
    all = [...all, ...data];
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function fetchEmPartes(empIds, buildQuery, chunk = 300) {
  if (!empIds?.length) return [];
  const out = [];
  for (let i = 0; i < empIds.length; i += chunk) {
    out.push(...await fetchAll(buildQuery(empIds.slice(i, i + chunk))));
  }
  return out;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [dados,   setDados]   = useState(null);
  const [filtroEquipe, setFiltroEquipe] = useState('Geral');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      // ── 1. Usuário e perfil ──────────────────────────────────────────────
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: profData }, { data: vis }] = await Promise.all([
        supabase.from('user_profiles').select('perfil,nome').eq('id', user.id).single(),
        supabase.from('user_visibilidade').select('tipo,consultor_ids,equipes').eq('user_id', user.id).maybeSingle(),
      ]);

      // ── 2. Consultores ───────────────────────────────────────────────────
      const { data: todosConsultores } = await supabase
        .from('consultores')
        .select('id,nome,meta_mensal,gestor,equipe,meta_inicio')
        .eq('ativo', true);

      let consultores = todosConsultores || [];
      // supervisor_comercial (Diretor Comercial) respeita user_visibilidade (ex.: Rossi → 27 consultores específicos).
      const perfisRestritos = ['gestor_comercial','supervisor_comercial','vendedor','administrativo'];
      if (profData && perfisRestritos.includes(profData.perfil)) {
        if (vis?.tipo === 'equipes' && vis.equipes?.length > 0) {
          const nomePerf = profData.nome || '';
          consultores = consultores.filter(c => {
            if (!vis.equipes.includes(c.equipe)) return false;
            const g = c.gestor || '';
            return nomePerf.startsWith(g) || g.startsWith(nomePerf);
          });
        } else if (vis?.tipo === 'especificos' && vis.consultor_ids?.length > 0) {
          const idSet = new Set(vis.consultor_ids);
          consultores = consultores.filter(c => idSet.has(c.id));
        }
      }

      const consIds = consultores.map(c => c.id);
      if (!consIds.length) { setDados({ vazio: true }); setLoading(false); return; }

      // ── 4. Empresas ───────────────────────────────────────────────────────
      // empresasMov: categorias filtradas → para movimentação real
      // todasEmpresas: todas → para meta, total ativo, novos contratos
      const [empresasMov, todasEmpresas] = await Promise.all([
        fetchAll(
          supabase.from('empresas')
            .select(`id, produto_id, nome, categoria, produto_contratado,
              potencial_movimentacao, peso_categoria, pct_principal, data_cadastro,
              consultor_principal_id, consultor_agregado_id, consultor_agregado_2_id`)
            .eq('ativo', true)
            .or(`consultor_principal_id.in.(${consIds.join(',')}),consultor_agregado_id.in.(${consIds.join(',')}),consultor_agregado_2_id.in.(${consIds.join(',')})`)
            .not('produto_contratado','ilike','%desconto condicional%')
            .not('categoria','eq','Taxa Negativa')
            .in('categoria',['Beneficios','Benefícios','Bonus','Bônus','Convênio','Convenio','Mobilidade'])
        ),
        fetchAll(
          // todasEmpresas (p/ meta): TODAS as categorias elegíveis (igual ao Vendedor),
          // com os pcts de agregado p/ somar a meta de principal + agregados.
          supabase.from('empresas')
            .select(`id, produto_id, nome, categoria, produto_contratado,
              potencial_movimentacao, peso_categoria, pct_principal, pct_agregado_1, pct_agregado_2, data_cadastro,
              consultor_principal_id, consultor_agregado_id, consultor_agregado_2_id`)
            .eq('ativo', true)
            .or(`consultor_principal_id.in.(${consIds.join(',')}),consultor_agregado_id.in.(${consIds.join(',')}),consultor_agregado_2_id.in.(${consIds.join(',')})`)
            .not('produto_contratado','ilike','%desconto condicional%')
            .not('categoria','eq','Taxa Negativa')
        ),
      ]);

      // Para meta usamos as mesmas empresas filtradas por categoria (igual ao Vendedor)
      const empIds  = todasEmpresas.map(e => e.id);
      const prodIds = todasEmpresas.map(e => e.produto_id);

      // ── 5. Busca em paralelo: libs filtradas + libs todas + metas + meses ──
      const [libsTodas, vmetasRows, ajustesData, mesDispRaw] = await Promise.all([
        fetchEmPartes(prodIds, (ids) =>
          supabase.from('liberacoes')
            .select('produto_id,competencia,total_liberado')
            .in('produto_id', ids).order('competencia'), 200),
        fetchEmPartes(empIds, (ids) =>
          supabase.from('valor_meta_empresa')
            .select('empresa_id,consultor_id,competencia_meta,valor_meta,valor_considerado,valor_bruto,regra,pct_consultor')
            .in('empresa_id', ids).order('empresa_id')),
        fetchEmPartes(empIds, (ids) =>
          supabase.from('ajustes_movimentacao')
            .select('empresa_id,competencia,valor_considerado')
            .in('empresa_id', ids)),
        fetchAll(supabase.from('liberacoes').select('competencia').order('competencia', { ascending: false }))
          .then(rows => [...new Set((rows||[]).map(l => l.competencia?.substring(0,7)).filter(Boolean))].sort()),
      ]);
      const libsFiltradas = libsTodas;

      // ── 6. Mapas ─────────────────────────────────────────────────────────
      const libMap = {};
      for (const l of libsFiltradas) {
        const k = `${l.produto_id}__${l.competencia?.substring(0,10)}`;
        libMap[k] = (libMap[k]||0) + (l.total_liberado||0);
      }

      const ajusteMap = {};
      for (const a of (ajustesData||[])) {
        ajusteMap[`${a.empresa_id}__${a.competencia?.substring(0,10)}`] = a.valor_considerado;
      }

      const libsTodasMap = {};
      for (const l of libsTodas) {
        const pid = l.produto_id;
        if (!libsTodasMap[pid]) libsTodasMap[pid] = [];
        libsTodasMap[pid].push({ comp: l.competencia?.substring(0,10), val: l.total_liberado||0 });
      }

      // ── 7. Meses disponíveis ─────────────────────────────────────────────
      const meses        = [...new Set(libsFiltradas.map(l => l.competencia?.substring(0,10)))].sort();
      const mesesDisp    = mesDispRaw.length ? mesDispRaw : [];
      const ultimoMesYM    = meses.length ? meses[meses.length-1].substring(0,7) : null;
      const penultimoMesYM = meses.length > 1 ? meses[meses.length-2].substring(0,7) : null;

      // ── 8. Movimentação ──────────────────────────────────────────────────
      const consIdSet = new Set(consIds);
      const equipeDe  = (id) => consultores.find(c => c.id === id)?.equipe || 'Sem equipe';
      const equipesDaEmpresa = (e) => {
        const set = new Set();
        for (const id of [e.consultor_principal_id, e.consultor_agregado_id, e.consultor_agregado_2_id]) {
          if (id && consIdSet.has(id)) set.add(equipeDe(id));
        }
        return [...set];
      };

      let movUltimoMes = 0, movPenultimoMes = 0;
      let comMovUltimoMes = 0, semMovUltimoMes = 0, semMovDoisMeses = 0;
      const semMovPorEquipe = {};   // { equipe: nº de empresas que nunca movimentaram }
      const movAtualPorEquipe = {}; // { equipe: movimentação do mês atual (equipe do principal) }
      const comMovPorEquipe = {};   // { equipe: nº de empresas com movimentação no mês atual }

      for (const e of empresasMov) {
        const vUlt = meses.filter(m => m.substring(0,7) === ultimoMesYM)
          .reduce((s,m) => s+(libMap[`${e.produto_id}__${m}`]||0), 0);
        const vPen = meses.filter(m => m.substring(0,7) === penultimoMesYM)
          .reduce((s,m) => s+(libMap[`${e.produto_id}__${m}`]||0), 0);
        movUltimoMes    += vUlt;
        movPenultimoMes += vPen;
        const eqPrincMov = equipeDe(e.consultor_principal_id);
        movAtualPorEquipe[eqPrincMov] = (movAtualPorEquipe[eqPrincMov]||0) + vUlt;
        if (vUlt > 0) { comMovUltimoMes++; comMovPorEquipe[eqPrincMov] = (comMovPorEquipe[eqPrincMov]||0) + 1; } else semMovUltimoMes++;
        // "Nunca movimentou" = zero em TODOS os meses disponíveis (igual ao filtro Carteira do Vendedor)
        const nuncaMovimentou = meses.every(m => (libMap[`${e.produto_id}__${m}`]||0) === 0);
        if (nuncaMovimentou) {
          semMovDoisMeses++;
          equipesDaEmpresa(e).forEach(eq => { semMovPorEquipe[eq] = (semMovPorEquipe[eq]||0) + 1; });
        }
      }

      // ── 9. calcularValorMeta — CÓPIA EXATA da função calcularMeta do Vendedor ──
      // Benefício = 1ª liberação real; Convênio/Mobilidade = 3º mês CORRIDO a partir
      // do 1º com movimentação, com checagem de "o 3º mês chegou" (existe registro OU
      // a data atual já passou). Usa ajusteMap (ajustes_movimentacao) e peso só p/ Vegas Benefícios.
      function calcularValorMeta(empresa, pct, validaDesdeMes) {
        const catLower  = (empresa.categoria || '').toLowerCase();
        const prodNorm  = (empresa.produto_contratado || '').toLowerCase().trim();
        const isConv    = catLower.includes('conv') || catLower.includes('mobil');
        const isBenef   = !isConv;
        if (!isBenef && !isConv) return null;

        const validaMes = validaDesdeMes?.substring(0,7) || '2000-01';

        const libsOrdenadas = (libsTodasMap[empresa.produto_id] || [])
          .filter(l => l.val > 0 && l.comp >= validaMes)
          .sort((a, b) => a.comp.localeCompare(b.comp));
        const totalMesesComMov = libsOrdenadas.length;

        const isVB = prodNorm === 'vegas benefícios' || prodNorm === 'vegas beneficios';
        const peso = isVB ? (empresa.peso_categoria ?? 1) : 1;
        const calcValorMeta = (valorConsid) => Math.round(valorConsid * peso * (pct / 100) * 100) / 100;

        if (isBenef) {
          if (totalMesesComMov === 0) return null;
          const mesAlvo     = libsOrdenadas[0].comp;
          const ajuste      = ajusteMap[`${empresa.id}__${mesAlvo}`];
          const valorBruto  = libsOrdenadas[0].val;
          const valorConsid = ajuste !== undefined ? ajuste : valorBruto;
          return { valor_meta: calcValorMeta(valorConsid), competencia_meta: mesAlvo, regra: 'beneficio' };
        }

        // Convênio/Mobilidade: 3 meses CORRIDOS a partir do 1º com movimentação válida
        const todosOsMeses = (libsTodasMap[empresa.produto_id] || [])
          .filter(l => l.comp >= validaMes)
          .sort((a, b) => a.comp.localeCompare(b.comp));
        const primeiroCom = todosOsMeses.find(l => l.val > 0);
        if (!primeiroCom) return null;

        const [y0, m0] = primeiroCom.comp.split('-').map(Number);
        const tresMeses = [0, 1, 2].map(i => {
          const d    = new Date(y0, m0 - 1 + i, 1);
          const comp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const lib  = todosOsMeses.find(l => l.comp === comp);
          return { comp, val: lib?.val || 0 };
        });

        const terceiro   = tresMeses[2];
        const hoje       = new Date();
        const mesAtual   = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
        const terceiroJaPassou = terceiro.comp < mesAtual;
        const temTerceiro = todosOsMeses.some(l => l.comp === terceiro.comp) || terceiroJaPassou;
        if (!temTerceiro) return null;

        const mesAlvoObj = terceiro.val > 0
          ? terceiro
          : [...tresMeses].reverse().find(m => m.val > 0);
        if (!mesAlvoObj) return null;

        const mesAlvo     = mesAlvoObj.comp;
        const ajuste      = ajusteMap[`${empresa.id}__${mesAlvo}`];
        const valorBruto  = mesAlvoObj.val;
        const valorConsid = ajuste !== undefined ? ajuste : valorBruto;
        return { valor_meta: calcValorMeta(valorConsid), competencia_meta: mesAlvo, regra: 'convenio' };
      }

      // ── 10. metaApurada — IGUAL ao Vendedor ──────────────────────────────
      // Vendedor: para cada empresa, usa entradaBanco se existir, senão calcula
      // Aqui fazemos o mesmo loop sobre todasEmpresas
      let metaApuradaTotal = 0;
      const metaPorConsultor = {};   // por consultor (parcela = valor × pct/total) → p/ Top e filtro de equipe
      const metaPorMes = {};         // total (todas as equipes)
      const metaPorMesEq = {};       // { equipe: { mes: valor } } — parcela de cada equipe (split por pct)
      let naMeta = 0;

      // consIdSet e equipeDe já definidos na seção 8 (Movimentação).
      // Consultores do escopo numa empresa, com seu pct e equipe.
      const consDaEmpresa = (e) => {
        const arr = [];
        const add = (id, p) => { if (id && consIdSet.has(id)) arr.push({ id, pct: p || 0, equipe: equipeDe(id) }); };
        add(e.consultor_principal_id,  e.pct_principal  ?? 100);
        add(e.consultor_agregado_id,   e.pct_agregado_1 ?? 0);
        add(e.consultor_agregado_2_id, e.pct_agregado_2 ?? 0);
        return arr;
      };

      for (const e of todasEmpresas) {
        const cons = consDaEmpresa(e);
        const totalPct = cons.reduce((s,c) => s + c.pct, 0);
        if (totalPct <= 0) continue;

        const banco = vmetasRows.filter(v => {
          if (v.empresa_id !== e.id) return false;
          if (v.regra === 'upsell' || !v.consultor_id) {
            // upsell/legado: pertence ao principal — só entra se ele está no escopo
            return consIdSet.has(e.consultor_principal_id);
          }
          return consIdSet.has(v.consultor_id);
        });

        let entradas = [];
        if (banco.length > 0) {
          entradas = banco;
        } else {
          const calc = calcularValorMeta(e, totalPct, '2026-01');
          if (calc) entradas = [{ valor_meta: calc.valor_meta, competencia_meta: calc.competencia_meta, consultor_id: null, regra: 'auto' }];
        }

        let metaEmpresa = 0;
        for (const v of entradas) {
          if (!(v.valor_meta > 0)) continue;
          const m = (v.competencia_meta || v.comp)?.substring(0,7);
          if (!m) continue;
          metaPorMes[m] = (metaPorMes[m]||0) + v.valor_meta;
          metaEmpresa += v.valor_meta;

          // Dono da linha: consultor_id quando existe; senão o principal da empresa.
          // Valor INTEGRAL — valor_meta já vem dividido por consultor no banco.
          const donoId = v.consultor_id || e.consultor_principal_id;
          const dono   = consultores.find(c => c.id === donoId);
          if (dono) {
            metaPorConsultor[dono.id] = (metaPorConsultor[dono.id]||0) + v.valor_meta;
            metaPorMesEq[dono.equipe] = metaPorMesEq[dono.equipe] || {};
            metaPorMesEq[dono.equipe][m] = (metaPorMesEq[dono.equipe][m]||0) + v.valor_meta;
          }
        }
        if (metaEmpresa > 0) { metaApuradaTotal += metaEmpresa; naMeta++; }
      }

      // ── 11. metaTotal — igual ao Vendedor ────────────────────────────────
      // Usa apenas meses com liberações reais (meses de libsFiltradas), não todos do banco
      const mesesComLib = [...new Set(libsFiltradas.map(l => l.competencia?.substring(0,7)).filter(Boolean))].sort();
      const metaTotal = consultores.reduce((total, cons) => {
        const metaMes   = cons.meta_mensal || 0;
        if (!metaMes) return total;
        const validaMes = (cons.meta_inicio ? String(cons.meta_inicio).substring(0,7) : '2026-01');
        const valida    = validaMes > '2026-01' ? validaMes : '2026-01';
        // Usa mesesComLib — sem || 1, consultor com qtd=0 não entra (ex: Adriana Diniz Abr/2026)
        const qtd       = mesesComLib.filter(m => m >= valida).length;
        if (qtd === 0) return total;
        return total + metaMes * qtd;
      }, 0);

      // ── 12. Demais cálculos ──────────────────────────────────────────────
      const esperadoPorEquipe = {};
      const esperadoTotal = empresasMov.reduce((s,e) => {
        const fator = (e.pct_principal??100)/100;
        const val = (e.potencial_movimentacao||0)*(e.peso_categoria||1)*fator;
        const eqPrincEsp = equipeDe(e.consultor_principal_id);
        esperadoPorEquipe[eqPrincEsp] = (esperadoPorEquipe[eqPrincEsp]||0) + val;
        return s + val;
      }, 0);

      const pctAderencia = esperadoTotal > 0 ? (movUltimoMes/esperadoTotal)*100 : 0;
      const pctMeta      = metaTotal > 0 ? (metaApuradaTotal/metaTotal)*100 : 0;

      const perf = pctMeta >= 80 ? 'verde' : pctMeta >= 60 ? 'amarelo' : 'vermelho';
      const perfMsg = perf === 'verde'
        ? { emoji:'🟢', titulo:'Parabéns! Sua equipe está performando bem.',  sub:`Meta atingida em ${fmtPct(pctMeta)} — continue assim!` }
        : perf === 'amarelo'
        ? { emoji:'🟡', titulo:'Sua equipe está quase lá!',                   sub:`${fmtPct(pctMeta)} da meta — foco para fechar forte o mês.` }
        : { emoji:'🔴', titulo:'Atenção! Sua equipe precisa de foco.',        sub:`Apenas ${fmtPct(pctMeta)} da meta atingida — revise as prioridades.` };

      const top3 = consultores
        .map(c => ({ ...c, metaApurada: metaPorConsultor[c.id]||0 }))
        .sort((a,b) => b.metaApurada - a.metaApurada)
        .slice(0,3);

      const mesesComMeta = Object.entries(metaPorMes)
        .sort((a,b) => a[0].localeCompare(b[0]))
        .slice(-5);

      const novasEsteMes = todasEmpresas.filter(e =>
        e.data_cadastro?.substring(0,7) === ultimoMesYM
      ).length;

      // Por equipe (membership pela equipe do consultor principal) — p/ filtro de equipe nos KPIs
      const empresasPorEquipe = {};
      const novasPorEquipe = {};
      for (const e of todasEmpresas) {
        const eqPrinc = equipeDe(e.consultor_principal_id);
        empresasPorEquipe[eqPrinc] = (empresasPorEquipe[eqPrinc]||0) + 1;
        if (e.data_cadastro?.substring(0,7) === ultimoMesYM) {
          novasPorEquipe[eqPrinc] = (novasPorEquipe[eqPrinc]||0) + 1;
        }
      }

      const variacao = movPenultimoMes > 0
        ? ((movUltimoMes - movPenultimoMes) / movPenultimoMes) * 100
        : 0;

      setDados({
        prof:          profData,
        consultores,
        totalEmpresas: todasEmpresas.length,
        movAtual:      movUltimoMes,
        movAnterior:   movPenultimoMes,
        comMovAtual:   comMovUltimoMes,
        semMovAtual:   semMovUltimoMes,
        semMovCritico: semMovDoisMeses,
        semMovPorEquipe,
        variacao,
        metaTotal,
        metaApurada:   metaApuradaTotal,
        metaPorConsultor,
        metaPorMes,
        metaPorMesEq,
        equipesDisponiveis: [...new Set(consultores.map(c => c.equipe).filter(Boolean))].sort(),
        mesesDisp,
        mesesComLib,
        naMeta,
        esperadoTotal, pctAderencia, pctMeta,
        empresasPorEquipe, movAtualPorEquipe, esperadoPorEquipe, novasPorEquipe, comMovPorEquipe,
        perf, perfMsg, top3,
        mesesComMeta, novasEsteMes,
        mesAtual:    ultimoMesYM,
        mesAnterior: penultimoMesYM,
      });
    } catch(err) {
      console.error('[inicio] erro:', err);
    }
    setLoading(false);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'var(--vg-bg)',flexDirection:'column',gap:16,fontFamily:INTER}}>
      <div style={{width:36,height:36,border:'3px solid var(--vg-border)',borderTop:'3px solid var(--vg-brand-500)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
      <div style={{color:'var(--vg-muted)',fontSize:14}}>Carregando seu painel…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!dados || dados.vazio) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'var(--vg-bg)',flexDirection:'column',gap:12,fontFamily:INTER}}>
      <Inbox size={40} strokeWidth={1.5} color="var(--vg-muted)" />
      <div style={{color:'var(--vg-ink)',fontWeight:600,fontFamily:OUTFIT}}>Nenhum dado encontrado</div>
      <div style={{color:'var(--vg-muted)',fontSize:14}}>Verifique suas permissões de acesso</div>
    </div>
  );

  const {
    perfMsg, perf, top3, semMovCritico, novasEsteMes, mesesComMeta,
    movAtual, movAnterior, comMovAtual, semMovAtual, variacao,
    metaTotal, metaApurada, naMeta, esperadoTotal, pctAderencia, pctMeta,
    consultores, totalEmpresas, mesAtual, mesAnterior, metaPorConsultor, mesesDisp, mesesComLib,
  } = dados;

  const corPct  = corSem;

  // ── Filtro de equipe (Melhoria 2): deriva as métricas da equipe selecionada ──
  const equipes      = dados.equipesDisponiveis || [];
  const equipeAtiva  = (filtroEquipe !== 'Geral' && equipes.includes(filtroEquipe)) ? filtroEquipe : null;
  const consEscopo   = equipeAtiva ? consultores.filter(c => c.equipe === equipeAtiva) : consultores;
  // KPIs do topo (Empresas Ativas, Mov. mês, Esperado/mês, Novos Contratos) — filtram por equipe
  const totalEmpresasView = equipeAtiva ? (dados.empresasPorEquipe?.[equipeAtiva] || 0)  : totalEmpresas;
  const movAtualView      = equipeAtiva ? (dados.movAtualPorEquipe?.[equipeAtiva] || 0)  : movAtual;
  const esperadoView      = equipeAtiva ? (dados.esperadoPorEquipe?.[equipeAtiva] || 0)  : esperadoTotal;
  const novasView         = equipeAtiva ? (dados.novasPorEquipe?.[equipeAtiva] || 0)     : novasEsteMes;
  const comMovView        = equipeAtiva ? (dados.comMovPorEquipe?.[equipeAtiva] || 0)    : comMovAtual;
  const pctAderenciaView  = esperadoView > 0 ? (movAtualView / esperadoView) * 100       : 0;
  const metaPorMesView = equipeAtiva ? (dados.metaPorMesEq?.[equipeAtiva] || {}) : (dados.metaPorMes || {});
  const metaApuradaView = equipeAtiva
    ? Object.values(metaPorMesView).reduce((s,v) => s + v, 0)
    : metaApurada;
  const metaTotalView = equipeAtiva
    ? consEscopo.reduce((t, c) => {
        const mm = c.meta_mensal || 0; if (!mm) return t;
        const vm = (c.meta_inicio ? String(c.meta_inicio).substring(0,7) : '2026-01');
        const valida = vm > '2026-01' ? vm : '2026-01';
        const qtd = (mesesComLib || []).filter(m => m >= valida).length;
        return qtd === 0 ? t : t + mm * qtd;
      }, 0)
    : metaTotal;
  const pctMetaView      = metaTotalView > 0 ? (metaApuradaView / metaTotalView) * 100 : 0;
  const mesesComMetaView = Object.entries(metaPorMesView).sort((a,b) => a[0].localeCompare(b[0])).slice(-5);
  // Período coberto pelo acumulado (chaves de metaPorMes já disponíveis) — só rótulo.
  const mesesMetaKeys = Object.keys(metaPorMesView).sort();
  const periodoMetaApurada = mesesMetaKeys.length
    ? `acumulado ${fmtMes(mesesMetaKeys[0])} a ${fmtMes(mesesMetaKeys[mesesMetaKeys.length-1])}`
    : 'acumulado de todos os meses';
  const top3View = consEscopo
    .map(c => ({ ...c, metaApurada: (metaPorConsultor?.[c.id]) || 0 }))
    .filter(c => c.metaApurada > 0)
    .sort((a,b) => b.metaApurada - a.metaApurada)
    .slice(0, equipeAtiva ? 50 : 3);
  const semMovCriticoView = equipeAtiva ? ((dados.semMovPorEquipe?.[equipeAtiva]) || 0) : semMovCritico;

  // Banner de performance — usa o pct filtrado pela equipe (pctMetaView).
  // Faixas semânticas do padrão: >=80 success · >=50 warning · abaixo danger.
  const perfView  = pctMetaView >= 80 ? 'verde' : pctMetaView >= 50 ? 'amarelo' : 'vermelho';
  const perfMsgView = perfView === 'verde'
    ? { titulo:'Parabéns! Sua equipe está performando bem.',  sub:`Meta atingida em ${fmtPct(pctMetaView)} — continue assim!` }
    : perfView === 'amarelo'
    ? { titulo:'Sua equipe está quase lá!',                   sub:`${fmtPct(pctMetaView)} da meta — foco para fechar forte o mês.` }
    : { titulo:'Atenção! Sua equipe precisa de foco.',        sub:`Apenas ${fmtPct(pctMetaView)} da meta atingida — revise as prioridades.` };
  const PERF_TOK = { verde:{ bg:'var(--vg-success-bg)', fg:'var(--vg-success-fg)' }, amarelo:{ bg:'var(--vg-warning-bg)', fg:'var(--vg-warning-fg)' }, vermelho:{ bg:'var(--vg-danger-bg)', fg:'var(--vg-danger-fg)' } };
  const corPerf = PERF_TOK[perfView].fg;
  const bgPerf  = PERF_TOK[perfView].bg;
  const PerfIcon = perfView === 'vermelho' ? AlertTriangle : TrendingUp;

  return (
    <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px',fontFamily:INTER,color:'var(--vg-ink)',background:'var(--vg-bg)',minHeight:'100vh',boxSizing:'border-box'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{...CAPTION,marginBottom:6}}>Vegas Card / Início</div>
        <h1 style={{fontFamily:OUTFIT,fontSize:24,lineHeight:'32px',fontWeight:600,margin:0,color:'var(--vg-ink)'}}>
          Olá, {dados.prof?.nome?.split(' ')[0]}
        </h1>
        <p style={{color:'var(--vg-ink-secondary)',fontSize:14,lineHeight:'22px',margin:'6px 0 0'}}>
          Resumo da sua equipe
        </p>

        {/* Filtro de equipe (Melhoria 2) — só aparece se houver mais de uma equipe */}
        {equipes.length > 1 && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
            {['Geral', ...equipes].map(eq => {
              const ativo = filtroEquipe === eq;
              const Ico = eq === 'Geral' ? Globe : Users;
              return (
                <button key={eq} onClick={() => setFiltroEquipe(eq)}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:'var(--vg-radius)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:INTER,
                    border:`1px solid ${ativo?'var(--vg-brand-500)':'var(--vg-border)'}`,background:ativo?'var(--vg-brand-50)':'var(--vg-surface)',color:ativo?'var(--vg-brand-700)':'var(--vg-ink-secondary)'}}>
                  <Ico size={15} strokeWidth={1.75} color={ativo?'var(--vg-brand-500)':'var(--vg-muted)'} /> {eq}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Banner de performance */}
      <div style={{background:bgPerf,border:`1px solid ${corPerf}`,borderRadius:'var(--vg-radius-lg)',padding:'20px 24px',marginBottom:24,display:'flex',alignItems:'center',gap:16,animation:'fadeIn 0.4s ease'}}>
        <PerfIcon size={28} strokeWidth={1.75} color={corPerf} style={{flexShrink:0}} />
        <div style={{flex:1}}>
          <div style={{fontFamily:OUTFIT,fontWeight:600,fontSize:16,lineHeight:'24px',color:corPerf,marginBottom:2}}>{perfMsgView.titulo}</div>
          <div style={{color:'var(--vg-ink-secondary)',fontSize:14,lineHeight:'22px'}}>{perfMsgView.sub}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div className="vg-num" style={{fontFamily:OUTFIT,fontSize:28,fontWeight:600,color:corPerf,lineHeight:1.1}}>{fmtPct(pctMetaView)}</div>
          <div style={{...LABEL}}>da meta</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:24}}>
        {[
          {
            Ico: Building2, num: false,
            label: 'Empresas Ativas',
            val:   totalEmpresasView,
            sub:   `${comMovView} movimentando em ${fmtMes(mesAtual ? mesAtual+'-01' : null)}`,
            subCor:'var(--vg-ink-secondary)',
          },
          {
            Ico: Wallet, num: true,
            label: `Mov. ${fmtMes(mesAtual ? mesAtual+'-01' : null)}`,
            val:   fmt(movAtualView),
            sub:   movAnterior > 0
              ? `${variacao>=0?'▲':'▼'} ${fmtPct(Math.abs(variacao))} vs ${fmtMes(mesAnterior ? mesAnterior+'-01' : null)}`
              : '—',
            subCor: variacao >= 0 ? 'var(--vg-success-fg)' : 'var(--vg-danger-fg)',
          },
          {
            Ico: BarChart3, num: true,
            label: 'Esperado/mês',
            val:   fmt(esperadoView),
            sub:   `${fmtPct(pctAderenciaView)} realizado`,
            subCor: corPct(pctAderenciaView),
          },
          {
            Ico: Target, num: true,
            label: 'Meta Apurada (Acumulado)',
            val:   fmt(metaApuradaView),
            sub:   periodoMetaApurada,
            subCor:'var(--vg-muted)',
          },
          {
            Ico: Target, num: true,
            label: 'Meta Acumulada',
            val:   fmt(metaTotalView),
            sub:   `${fmt(consEscopo.reduce((s,c) => s+(c.meta_mensal||0), 0))}/mês`,
            subCor: 'var(--vg-muted)',
          },
          {
            Ico: CheckCircle2, num: false,
            label: 'Novos Contratos',
            val:   novasView,
            sub:   `em ${fmtMes(mesAtual ? mesAtual+'-01' : null)}`,
            subCor:'var(--vg-ink-secondary)',
          },
        ].map((k,i) => (
          <div key={i} style={{...cardStyle,padding:20,animation:`fadeIn 0.4s ease ${i*0.05}s both`}}>
            <div style={{...LABEL,display:'flex',alignItems:'center',gap:6,marginBottom:8}}><k.Ico {...ICON} color="var(--vg-muted)" />{k.label}</div>
            <div className={k.num ? 'vg-num' : undefined} style={{fontFamily:OUTFIT,fontSize:fitKpi(k.val),lineHeight:'32px',fontWeight:600,color:'var(--vg-ink)',marginBottom:4,whiteSpace:'nowrap'}}>{k.val}</div>
            <div className="vg-num" style={{fontSize:12,lineHeight:'18px',color:k.subCor,fontWeight:500}}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>

        {/* Barra de meta */}
        <div style={cardStyle}>
          <div style={{...H_CARD,display:'flex',alignItems:'center',gap:8,marginBottom:16}}><Target {...ICON} /> Meta da Equipe</div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:13,color:'var(--vg-ink-secondary)'}}>Apurado vs Meta mensal</span>
            <span className="vg-num" style={{fontSize:13,fontWeight:600,color:corPct(pctMetaView)}}>{fmtPct(pctMetaView)}</span>
          </div>
          <div style={{background:'var(--vg-neutral-bg)',borderRadius:4,height:12,overflow:'hidden',marginBottom:12}}>
            <div style={{height:'100%',borderRadius:4,transition:'width 1s ease',width:`${Math.min(pctMetaView,100)}%`,background:corPct(pctMetaView)}}></div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:16}}>
            <span className="vg-num" style={{color:corPct(pctMetaView),fontWeight:600}}>{fmt(metaApuradaView)} apurado</span>
            <span className="vg-num" style={{color:'var(--vg-muted)'}}>{fmt(metaTotalView)}/mês</span>
          </div>
          <div style={{paddingTop:14,borderTop:'1px solid var(--vg-border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:13,color:'var(--vg-ink-secondary)'}}>Mov. real vs esperada ({fmtMes(mesAtual ? mesAtual+'-01' : null)})</span>
              <span className="vg-num" style={{fontSize:13,fontWeight:600,color:corPct(pctAderenciaView)}}>{fmtPct(pctAderenciaView)}</span>
            </div>
            <div style={{background:'var(--vg-neutral-bg)',borderRadius:4,height:10,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:4,width:`${Math.min(pctAderenciaView,100)}%`,background:corPct(pctAderenciaView)}}></div>
            </div>
          </div>
        </div>

        {/* Meta por mês */}
        <div style={cardStyle}>
          <div style={{...H_CARD,display:'flex',alignItems:'center',gap:8}}><CalendarDays {...ICON} /> Meta Apurada por Mês</div>
          <div style={{...CAPTION,marginBottom:16,marginTop:2}}>apurado e elegível por mês</div>
          {mesesComMetaView.length === 0 ? (
            <div style={{color:'var(--vg-muted)',fontSize:14,textAlign:'center',padding:'24px 0'}}>Nenhuma meta apurada ainda</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {mesesComMetaView.map(([mes, val]) => {
                const maxVal = Math.max(...mesesComMetaView.map(([,v])=>v), 1);
                const pct    = (val/maxVal)*100;
                // Destaca o mês com a MAIOR meta apurada (marca); os demais em tom neutro.
                const isMax  = val >= maxVal;
                const corBarra = isMax ? 'var(--vg-brand-500)' : 'var(--vg-brand-400)';
                return (
                  <div key={mes}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:isMax?600:500,color:isMax?'var(--vg-ink)':'var(--vg-ink-secondary)'}}>
                        {fmtMes(mes+'-01')}{isMax?' · maior':''}
                      </span>
                      <span className="vg-num" style={{fontSize:13,fontWeight:600,color:'var(--vg-ink)'}}>{fmt(val)}</span>
                    </div>
                    <div style={{background:'var(--vg-neutral-bg)',borderRadius:4,height:8,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:corBarra,borderRadius:4,transition:'width 0.8s'}}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top 3 vendedores */}
      <div style={{...cardStyle,marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{...H_CARD,display:'flex',alignItems:'center',gap:8}}>
            {equipeAtiva ? <Users {...ICON} /> : <Trophy {...ICON} />} {equipeAtiva ? `Vendedores — ${equipeAtiva}` : 'Top Vendedores — Meta Apurada'}
          </div>
          <Link href="/vendedor" style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--vg-brand-700)',fontSize:13,fontWeight:600,textDecoration:'none'}}>Ver ranking completo <ArrowRight size={14} strokeWidth={2} /></Link>
        </div>
        {top3View.length === 0 ? (
          <div style={{color:'var(--vg-muted)',fontSize:14,textAlign:'center',padding:'16px 0'}}>Nenhum dado ainda</div>
        ) : (
          <div>
            {top3View.map((vend,i) => {
              const validaMesV = (vend.meta_inicio ? String(vend.meta_inicio).substring(0,7) : '2026-01');
              const validaV    = validaMesV > '2026-01' ? validaMesV : '2026-01';
              const qtdV       = (mesesComLib||mesesDisp||[]).filter(m => m >= validaV).length || 1;
              const metaAcum   = (vend.meta_mensal||0) * qtdV;
              const pct        = metaAcum > 0 ? (vend.metaApurada/metaAcum)*100 : 0;
              const cor        = corPct(pct);
              const top3       = i < 3;
              return (
                <div key={vend.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderTop:i>0?'1px solid var(--vg-border)':'none'}}>
                  <span className="vg-num" style={{fontFamily:OUTFIT,fontWeight:700,fontSize:top3?18:14,color:top3?'var(--vg-brand-500)':'var(--vg-muted)',width:24,textAlign:'center',flexShrink:0}}>{i+1}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,color:'var(--vg-ink)'}}>{vend.nome}</div>
                    <div style={{color:'var(--vg-muted)',fontSize:12}}>{vend.equipe||vend.gestor||'—'}</div>
                  </div>
                  <div style={{textAlign:'right',minWidth:100}}>
                    <div className="vg-num" style={{fontWeight:600,color:'var(--vg-ink)',fontSize:14,fontFamily:OUTFIT}}>{fmt(vend.metaApurada)}</div>
                    {metaAcum > 0 && <div className="vg-num" style={{fontSize:12,color:cor,fontWeight:600}}>{fmtPct(pct)} da meta</div>}
                  </div>
                  {metaAcum > 0 && (
                    <div style={{width:60}}>
                      <div style={{background:'var(--vg-neutral-bg)',borderRadius:4,height:6,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${Math.min(pct,100)}%`,background:cor,borderRadius:4}}></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Card de Atenção — vendedores abaixo da meta */}
      {(() => {
        if (!metaPorConsultor) return null;

        // Só considera consultores COM meta_mensal cadastrada (e da equipe filtrada)
        const comMeta = consEscopo.filter(cons => (cons.meta_mensal||0) > 0);
        if (!comMeta.length) return null;

        const todos = comMeta.map(cons => {
          const apurado  = metaPorConsultor[cons.id] || 0;
          // % correto: vs meta ACUMULADA (meta_mensal × meses), não só 1 mês
          const validaM = (cons.meta_inicio ? String(cons.meta_inicio).substring(0,7) : '2026-01');
          const validaR = validaM > '2026-01' ? validaM : '2026-01';
          const qtdM    = (mesesComLib||mesesDisp||[]).filter(m => m >= validaR).length || 1;
          const mAcum   = (cons.meta_mensal||0) * qtdM;
          const pct   = mAcum > 0 ? (apurado / mAcum) * 100 : 0;
          return { ...cons, apurado, metaAcum: mAcum, pct };
        });

        const abaixo   = todos.filter(cons => cons.pct < 80).sort((a,b) => a.pct - b.pct);
        const ok       = todos.filter(cons => cons.pct >= 80).length;
        const criticos = abaixo.filter(cons => cons.pct < 50).length;

        // Vendedores SEM meta mas que existem na equipe (filtrada)
        const semMeta  = consEscopo.filter(cons => !(cons.meta_mensal > 0));

        // Só mostra o card se tiver alguém abaixo OU sem meta
        if (abaixo.length === 0 && semMeta.length === 0) return null;

        // Agrupa por equipe apenas quem está abaixo
        const porEquipe = {};
        abaixo.forEach(cons => {
          const eq = cons.equipe || 'Sem equipe';
          if (!porEquipe[eq]) porEquipe[eq] = { count:0, piorPct:100 };
          porEquipe[eq].count++;
          if (cons.pct < porEquipe[eq].piorPct) porEquipe[eq].piorPct = cons.pct;
        });

        return (
          <div style={{...cardStyle,padding:0,overflow:'hidden',marginBottom:16}}>
            {/* Header do card */}
            <div style={{borderBottom:'1px solid var(--vg-border)',padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <Search {...ICON} color="var(--vg-ink-secondary)" />
                <div>
                  <div style={{...H_CARD}}>Análise da Equipe — Vendedores com Meta</div>
                  <div style={{...CAPTION,marginTop:2,display:'flex',gap:10,flexWrap:'wrap'}}>
                    {ok > 0 && <span style={{color:'var(--vg-success-fg)',fontWeight:600}}>{ok} no verde</span>}
                    {abaixo.length > 0 && <span style={{color: criticos > 0 ? 'var(--vg-danger-fg)' : 'var(--vg-warning-fg)',fontWeight:600}}>{abaixo.length} abaixo de 80%{criticos > 0 ? ` (${criticos} crítico${criticos>1?'s':''})` : ''}</span>}
                    {semMeta.length > 0 && <span style={{color:'var(--vg-muted)',fontWeight:500}}>· {semMeta.length} sem meta cadastrada</span>}
                  </div>
                </div>
              </div>
              <Link href="/vendedor" style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--vg-danger-fg)',fontSize:13,fontWeight:600,textDecoration:'none',background:'var(--vg-danger-bg)',padding:'6px 12px',borderRadius:'var(--vg-radius)'}}>
                Ver detalhes <ArrowRight size={14} strokeWidth={2} />
              </Link>
            </div>
            {/* Lista de vendedores */}
            <div style={{padding:'4px 20px'}}>
              {abaixo.length === 0 && (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'16px 0',color:'var(--vg-success-fg)',fontWeight:600,fontSize:14}}>
                  <CheckCircle2 size={16} strokeWidth={2} /> Todos os vendedores com meta estão acima de 80%
                </div>
              )}
              {abaixo.map((cons,i) => {
                const cor = cons.pct < 50 ? 'var(--vg-danger-fg)' : 'var(--vg-warning-fg)';
                return (
                  <div key={cons.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderTop:i>0?'1px solid var(--vg-border)':'none'}}>
                    <div style={{width:26,height:26,borderRadius:'50%',background:'var(--vg-neutral-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:cor,flexShrink:0}} className="vg-num">
                      {i+1}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'var(--vg-ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cons.nome}</div>
                      <div style={{color:'var(--vg-muted)',fontSize:12}}>{cons.equipe||'—'}</div>
                    </div>
                    <div style={{minWidth:120}}>
                      <div style={{background:'var(--vg-neutral-bg)',borderRadius:4,height:5,overflow:'hidden',marginBottom:2}}>
                        <div style={{height:'100%',width:`${Math.min(cons.pct,100)}%`,background:cor,borderRadius:4}}></div>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                        <span className="vg-num" style={{color:cor,fontWeight:600}}>{fmtPct(cons.pct)}</span>
                        <span className="vg-num" style={{color:'var(--vg-muted)'}}>{fmt(cons.apurado)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {abaixo.length > 6 && (
                <div style={{textAlign:'center',padding:'8px 0',color:'var(--vg-muted)',fontSize:12,borderTop:'1px solid var(--vg-border)'}}>
                  + {abaixo.length - 6} outros vendedores abaixo da meta
                </div>
              )}
            </div>
            {/* Vendedores sem meta */}
            {semMeta.length > 0 && (
              <div style={{borderTop:'1px solid var(--vg-border)',padding:'12px 20px',background:'var(--vg-surface-muted)'}}>
                <div style={{...LABEL,marginBottom:6}}>Sem meta cadastrada:</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {semMeta.map(cons => (
                    <span key={cons.id} style={{background:'var(--vg-surface)',border:'1px solid var(--vg-border)',borderRadius:'var(--vg-radius-sm)',padding:'3px 8px',fontSize:12,color:'var(--vg-ink-secondary)'}}>
                      {cons.nome} <span style={{color:'var(--vg-muted)'}}>({cons.equipe||'—'})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rodapé com resumo por equipe */}
            {Object.keys(porEquipe).length > 0 && (
              <div style={{borderTop:'1px solid var(--vg-border)',padding:'10px 20px',display:'flex',gap:8,flexWrap:'wrap',background:'var(--vg-surface-muted)'}}>
                <span style={{...LABEL,alignSelf:'center'}}>Por equipe:</span>
                {Object.entries(porEquipe).map(([eq, data]) => {
                  const cor = data.piorPct < 50 ? 'var(--vg-danger-fg)' : 'var(--vg-warning-fg)';
                  return (
                    <span key={eq} style={{background:'var(--vg-neutral-bg)',border:'1px solid var(--vg-border)',borderRadius:'var(--vg-radius-sm)',padding:'3px 8px',fontSize:12,color:cor,fontWeight:600}}>
                      {eq}: {data.count} vendedor{data.count>1?'es':''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Alerta empresas sem movimentação */}
      {semMovCriticoView > 0 && (
        <div style={{background:'var(--vg-danger-bg)',border:'1px solid var(--vg-danger-fg)',borderRadius:'var(--vg-radius-lg)',padding:'16px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
          <AlertTriangle size={22} strokeWidth={1.75} color="var(--vg-danger-fg)" style={{flexShrink:0}} />
          <div style={{flex:1}}>
            <div style={{fontFamily:OUTFIT,fontWeight:600,color:'var(--vg-danger-fg)',marginBottom:2}}>
              {semMovCriticoView} empresa{semMovCriticoView>1?'s':''} nunca movimentaram desde o início
            </div>
            <div style={{color:'var(--vg-ink-secondary)',fontSize:14}}>Revise a carteira e entre em contato com essas empresas.</div>
          </div>
          <Link href="/vendedor" style={{display:'inline-flex',alignItems:'center',gap:5,background:'var(--vg-danger-fg)',color:'#fff',borderRadius:'var(--vg-radius)',padding:'9px 16px',textDecoration:'none',fontSize:14,fontWeight:600,whiteSpace:'nowrap'}}>
            Ver Carteira <ArrowRight size={14} strokeWidth={2} />
          </Link>
        </div>
      )}


    </div>
  );
}
