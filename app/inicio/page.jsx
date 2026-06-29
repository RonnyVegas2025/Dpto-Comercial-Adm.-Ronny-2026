'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct = (v) => `${Number(v||0).toFixed(1)}%`;
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = String(d).substring(0,7).split('-');
  return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`;
};

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

      // ── 3. fetchAll (igual ao Vendedor) ──────────────────────────────────
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
      const [libsFiltradas, libsTodas, vmetasRows, ajustesData, mesDispRaw] = await Promise.all([
        prodIds.length ? fetchAll(
          supabase.from('liberacoes')
            .select('produto_id,competencia,total_liberado')
            .in('produto_id', prodIds)
            .order('competencia')
        ) : Promise.resolve([]),
        prodIds.length ? fetchAll(
          supabase.from('liberacoes')
            .select('produto_id,competencia,total_liberado')
            .in('produto_id', prodIds)
            .order('competencia')
        ) : Promise.resolve([]),
        empIds.length ? fetchAll(
          supabase.from('valor_meta_empresa')
            .select('empresa_id,consultor_id,competencia_meta,valor_meta,valor_considerado,valor_bruto,regra,pct_consultor')
            .in('empresa_id', empIds)
        ) : Promise.resolve([]),
        empIds.length ? fetchAll(
          supabase.from('ajustes_movimentacao')
            .select('empresa_id,competencia,valor_considerado')
            .in('empresa_id', empIds)
        ) : Promise.resolve([]),
        supabase.from('liberacoes').select('competencia').order('competencia', { ascending: false })
          .then(r => [...new Set((r.data||[]).map(l => l.competencia?.substring(0,7)).filter(Boolean))].sort()),
      ]);

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

      for (const e of empresasMov) {
        const vUlt = meses.filter(m => m.substring(0,7) === ultimoMesYM)
          .reduce((s,m) => s+(libMap[`${e.produto_id}__${m}`]||0), 0);
        const vPen = meses.filter(m => m.substring(0,7) === penultimoMesYM)
          .reduce((s,m) => s+(libMap[`${e.produto_id}__${m}`]||0), 0);
        movUltimoMes    += vUlt;
        movPenultimoMes += vPen;
        if (vUlt > 0) comMovUltimoMes++; else semMovUltimoMes++;
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

        const banco = vmetasRows.filter(v => v.empresa_id === e.id);
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
          if (v.regra === 'upsell' || !v.consultor_id) {
            for (const c of cons) {
              const parcela = v.valor_meta * (c.pct / totalPct);
              metaPorConsultor[c.id] = (metaPorConsultor[c.id]||0) + parcela;
              metaPorMesEq[c.equipe] = metaPorMesEq[c.equipe] || {};
              metaPorMesEq[c.equipe][m] = (metaPorMesEq[c.equipe][m]||0) + parcela;
            }
          } else {
            const dono = consultores.find(c => c.id === v.consultor_id);
            if (dono) {
              metaPorConsultor[dono.id] = (metaPorConsultor[dono.id]||0) + v.valor_meta;
              metaPorMesEq[dono.equipe] = metaPorMesEq[dono.equipe] || {};
              metaPorMesEq[dono.equipe][m] = (metaPorMesEq[dono.equipe][m]||0) + v.valor_meta;
            }
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
      const esperadoTotal = empresasMov.reduce((s,e) => {
        const fator = (e.pct_principal??100)/100;
        return s + (e.potencial_movimentacao||0)*(e.peso_categoria||1)*fator;
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#f5f6fa',flexDirection:'column',gap:16}}>
      <div style={{width:40,height:40,border:'3px solid #e4e7ef',borderTop:'3px solid #f0b429',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
      <div style={{color:'#8b92b0',fontSize:'0.85rem'}}>Carregando seu painel...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!dados || dados.vazio) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'#f5f6fa',flexDirection:'column',gap:16}}>
      <div style={{fontSize:'3rem'}}>📭</div>
      <div style={{color:'#4a5068',fontWeight:600}}>Nenhum dado encontrado</div>
      <div style={{color:'#8b92b0',fontSize:'0.85rem'}}>Verifique suas permissões de acesso</div>
    </div>
  );

  const {
    perfMsg, perf, top3, semMovCritico, novasEsteMes, mesesComMeta,
    movAtual, movAnterior, comMovAtual, semMovAtual, variacao,
    metaTotal, metaApurada, naMeta, esperadoTotal, pctAderencia, pctMeta,
    consultores, totalEmpresas, mesAtual, mesAnterior, metaPorConsultor, mesesDisp, mesesComLib,
  } = dados;

  const corPct  = (p) => p>=80?'#16a34a':p>=60?'#d97706':'#dc2626';

  // ── Filtro de equipe (Melhoria 2): deriva as métricas da equipe selecionada ──
  const equipes      = dados.equipesDisponiveis || [];
  const equipeAtiva  = (filtroEquipe !== 'Geral' && equipes.includes(filtroEquipe)) ? filtroEquipe : null;
  const consEscopo   = equipeAtiva ? consultores.filter(c => c.equipe === equipeAtiva) : consultores;
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
  const top3View = consEscopo
    .map(c => ({ ...c, metaApurada: (metaPorConsultor?.[c.id]) || 0 }))
    .filter(c => c.metaApurada > 0)
    .sort((a,b) => b.metaApurada - a.metaApurada)
    .slice(0, equipeAtiva ? 50 : 3);
  const semMovCriticoView = equipeAtiva ? ((dados.semMovPorEquipe?.[equipeAtiva]) || 0) : semMovCritico;

  // Banner de performance — usa o pct filtrado pela equipe (pctMetaView)
  const perfView  = pctMetaView >= 80 ? 'verde' : pctMetaView >= 60 ? 'amarelo' : 'vermelho';
  const perfMsgView = perfView === 'verde'
    ? { emoji:'🟢', titulo:'Parabéns! Sua equipe está performando bem.',  sub:`Meta atingida em ${fmtPct(pctMetaView)} — continue assim!` }
    : perfView === 'amarelo'
    ? { emoji:'🟡', titulo:'Sua equipe está quase lá!',                   sub:`${fmtPct(pctMetaView)} da meta — foco para fechar forte o mês.` }
    : { emoji:'🔴', titulo:'Atenção! Sua equipe precisa de foco.',        sub:`Apenas ${fmtPct(pctMetaView)} da meta atingida — revise as prioridades.` };
  const corPerf = perfView==='verde'?'#16a34a':perfView==='amarelo'?'#d97706':'#dc2626';
  const bgPerf  = perfView==='verde'?'rgba(22,163,74,0.06)':perfView==='amarelo'?'rgba(217,119,6,0.06)':'rgba(220,38,38,0.06)';
  const bdPerf  = perfView==='verde'?'rgba(22,163,74,0.2)':perfView==='amarelo'?'rgba(217,119,6,0.2)':'rgba(220,38,38,0.2)';

  return (
    <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#1a1d2e',background:'#f5f6fa',minHeight:'100vh'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{color:'#b45309',fontWeight:700,fontSize:'0.75rem',letterSpacing:2,marginBottom:8,textTransform:'uppercase'}}>♠ Vegas Card</div>
        <h1 style={{fontSize:'1.8rem',fontWeight:700,margin:'0 0 4px',color:'#1a1d2e'}}>
          Olá, {dados.prof?.nome?.split(' ')[0]} 👋
        </h1>
        <p style={{color:'#8b92b0',fontSize:'0.9rem',margin:0}}>
          Resumo da sua equipe
        </p>

        {/* Filtro de equipe (Melhoria 2) — só aparece se houver mais de uma equipe */}
        {equipes.length > 1 && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>
            {['Geral', ...equipes].map(eq => {
              const ativo = filtroEquipe === eq;
              return (
                <button key={eq} onClick={() => setFiltroEquipe(eq)}
                  style={{padding:'6px 14px',borderRadius:8,fontSize:'0.8rem',fontWeight:ativo?700:500,cursor:'pointer',fontFamily:'inherit',
                    border:`1px solid ${ativo?'#f0b429':'#e4e7ef'}`,background:ativo?'#fff8e6':'#ffffff',color:ativo?'#b45309':'#6b7280'}}>
                  {eq === 'Geral' ? '🌐 Geral' : `👥 ${eq}`}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Banner de performance */}
      <div style={{background:bgPerf,border:`1px solid ${bdPerf}`,borderRadius:14,padding:'20px 24px',marginBottom:24,display:'flex',alignItems:'center',gap:16,animation:'fadeIn 0.4s ease'}}>
        <div style={{fontSize:'2.5rem',lineHeight:1}}>{perfMsgView.emoji}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:'1.05rem',color:corPerf,marginBottom:4}}>{perfMsgView.titulo}</div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>{perfMsgView.sub}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:'2rem',fontWeight:800,color:corPerf}}>{fmtPct(pctMetaView)}</div>
          <div style={{color:'#9ca3af',fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:1}}>da meta</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:24}}>
        {[
          {
            label: 'Empresas Ativas',
            val:   totalEmpresas,
            sub:   `${comMovAtual} movimentando em ${fmtMes(mesAtual ? mesAtual+'-01' : null)}`,
            subCor:'#16a34a',
          },
          {
            label: `Mov. ${fmtMes(mesAtual ? mesAtual+'-01' : null)}`,
            val:   fmt(movAtual),
            sub:   movAnterior > 0
              ? `${variacao>=0?'▲':'▼'} ${fmtPct(Math.abs(variacao))} vs ${fmtMes(mesAnterior ? mesAnterior+'-01' : null)}`
              : '—',
            subCor: variacao >= 0 ? '#16a34a' : '#dc2626',
          },
          {
            label: 'Esperado/mês',
            val:   fmt(esperadoTotal),
            sub:   `${fmtPct(pctAderencia)} realizado`,
            subCor: corPct(pctAderencia),
          },
          {
            label: 'Meta Apurada',
            val:   fmt(metaApuradaView),
            sub:   `meta: ${fmt(metaTotalView)}/mês`,
            subCor:'#8b92b0',
          },
          {
            label: 'Meta Acumulada',
            val:   fmt(metaTotalView),
            sub:   `${fmt(consEscopo.reduce((s,c) => s+(c.meta_mensal||0), 0))}/mês`,
            subCor: '#8b92b0',
          },
          {
            label: 'Novos Contratos',
            val:   novasEsteMes,
            sub:   `em ${fmtMes(mesAtual ? mesAtual+'-01' : null)}`,
            subCor:'#60a5fa',
          },
        ].map((k,i) => (
          <div key={i} style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'18px 20px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',animation:`fadeIn 0.4s ease ${i*0.05}s both`}}>
            <div style={{color:'#8b92b0',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>{k.label}</div>
            <div style={{fontSize:'1.3rem',fontWeight:700,color:'#1a1d2e',marginBottom:4}}>{k.val}</div>
            <div style={{fontSize:'0.72rem',color:k.subCor,fontWeight:500}}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>

        {/* Barra de meta */}
        <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#1a1d2e',marginBottom:16}}>🎯 Meta da Equipe</div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:'0.8rem',color:'#6b7280'}}>Apurado vs Meta mensal</span>
            <span style={{fontSize:'0.82rem',fontWeight:700,color:corPct(pctMetaView)}}>{fmtPct(pctMetaView)}</span>
          </div>
          <div style={{background:'#f0f2f8',borderRadius:8,height:14,overflow:'hidden',marginBottom:12}}>
            <div style={{height:'100%',borderRadius:8,transition:'width 1s ease',width:`${Math.min(pctMetaView,100)}%`,background:corPct(pctMetaView)}}></div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',marginBottom:16}}>
            <span style={{color:corPct(pctMetaView),fontWeight:700}}>{fmt(metaApuradaView)} apurado</span>
            <span style={{color:'#9ca3af'}}>{fmt(metaTotalView)}/mês</span>
          </div>
          <div style={{paddingTop:14,borderTop:'1px solid #f0f2f8'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:'0.8rem',color:'#6b7280'}}>Mov. real vs esperada ({fmtMes(mesAtual ? mesAtual+'-01' : null)})</span>
              <span style={{fontSize:'0.82rem',fontWeight:700,color:corPct(pctAderencia)}}>{fmtPct(pctAderencia)}</span>
            </div>
            <div style={{background:'#f0f2f8',borderRadius:8,height:10,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:8,width:`${Math.min(pctAderencia,100)}%`,background:corPct(pctAderencia)}}></div>
            </div>
          </div>
        </div>

        {/* Meta por mês */}
        <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#1a1d2e',marginBottom:16}}>📅 Meta Apurada por Mês</div>
          {mesesComMetaView.length === 0 ? (
            <div style={{color:'#8b92b0',fontSize:'0.85rem',textAlign:'center',padding:'24px 0'}}>Nenhuma meta apurada ainda</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {mesesComMetaView.map(([mes, val]) => {
                const maxVal = Math.max(...mesesComMetaView.map(([,v])=>v), 1);
                const pct    = (val/maxVal)*100;
                // Destaca o mês com a MAIOR meta apurada (verde forte); os demais em verde claro.
                const isMax  = val >= maxVal;
                const corTexto = isMax ? '#15803d' : '#4a5068';
                const corBarra = isMax ? '#16a34a' : '#86efac';
                return (
                  <div key={mes}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:'0.78rem',fontWeight:isMax?700:500,color:corTexto}}>
                        {fmtMes(mes+'-01')}{isMax?' ← maior':''}
                      </span>
                      <span style={{fontSize:'0.78rem',fontWeight:700,color:isMax?'#15803d':'#16a34a'}}>{fmt(val)}</span>
                    </div>
                    <div style={{background:'#f0f2f8',borderRadius:4,height:8,overflow:'hidden'}}>
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
      <div style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#1a1d2e'}}>{equipeAtiva ? `👥 Vendedores — ${equipeAtiva}` : '🏆 Top Vendedores — Meta Apurada'}</div>
          <Link href="/vendedor" style={{color:'#b45309',fontSize:'0.78rem',fontWeight:600,textDecoration:'none'}}>Ver ranking completo →</Link>
        </div>
        {top3View.length === 0 ? (
          <div style={{color:'#8b92b0',fontSize:'0.85rem',textAlign:'center',padding:'16px 0'}}>Nenhum dado ainda</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {top3View.map((vend,i) => {
              const medal      = i===0?'🥇':i===1?'🥈':'🥉';
              const validaMesV = (vend.meta_inicio ? String(vend.meta_inicio).substring(0,7) : '2026-01');
              const validaV    = validaMesV > '2026-01' ? validaMesV : '2026-01';
              const qtdV       = (mesesComLib||mesesDisp||[]).filter(m => m >= validaV).length || 1;
              const metaAcum   = (vend.meta_mensal||0) * qtdV;
              const pct        = metaAcum > 0 ? (vend.metaApurada/metaAcum)*100 : 0;
              const cor        = corPct(pct);
              return (
                <div key={vend.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:i===0?'rgba(240,180,41,0.05)':'#f9fafb',borderRadius:10,border:`1px solid ${i===0?'rgba(240,180,41,0.2)':'#f0f2f8'}`}}>
                  <span style={{fontSize:'1.3rem'}}>{medal}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:'0.88rem',color:'#1a1d2e'}}>{vend.nome}</div>
                    <div style={{color:'#8b92b0',fontSize:'0.72rem'}}>{vend.equipe||vend.gestor||'—'}</div>
                  </div>
                  <div style={{textAlign:'right',minWidth:100}}>
                    <div style={{fontWeight:700,color:'#34d399',fontSize:'0.9rem'}}>{fmt(vend.metaApurada)}</div>
                    {metaAcum > 0 && <div style={{fontSize:'0.68rem',color:cor,fontWeight:600}}>{fmtPct(pct)} da meta</div>}
                  </div>
                  {metaAcum > 0 && (
                    <div style={{width:60}}>
                      <div style={{background:'#f0f2f8',borderRadius:4,height:6,overflow:'hidden'}}>
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
          <div style={{background:'#ffffff',border:'1px solid rgba(220,38,38,0.2)',borderRadius:12,marginBottom:16,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
            {/* Header do card */}
            <div style={{background:'rgba(220,38,38,0.04)',borderBottom:'1px solid rgba(220,38,38,0.12)',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:'1.3rem'}}>🔍</span>
                <div>
                  <div style={{fontWeight:700,color:'#d97706',fontSize:'0.9rem'}}>
                    🔍 Análise da Equipe — Vendedores com Meta
                  </div>
                  <div style={{color:'#6b7280',fontSize:'0.75rem',marginTop:1,display:'flex',gap:10,flexWrap:'wrap'}}>
                    {ok > 0 && <span style={{color:'#16a34a',fontWeight:600}}>✅ {ok} no verde</span>}
                    {abaixo.length > 0 && <span style={{color: criticos > 0 ? '#dc2626' : '#d97706',fontWeight:600}}>⚠️ {abaixo.length} abaixo de 80%{criticos > 0 ? ` (${criticos} crítico${criticos>1?'s':''})` : ''}</span>}
                    {semMeta.length > 0 && <span style={{color:'#6b7280',fontWeight:500}}>— {semMeta.length} sem meta cadastrada</span>}
                  </div>
                </div>
              </div>
              <Link href="/vendedor" style={{color:'#dc2626',fontSize:'0.75rem',fontWeight:600,textDecoration:'none',background:'rgba(220,38,38,0.08)',padding:'5px 12px',borderRadius:6,border:'1px solid rgba(220,38,38,0.2)'}}>
                Ver detalhes →
              </Link>
            </div>
            {/* Lista de vendedores */}
            <div style={{padding:'12px 20px',display:'flex',flexDirection:'column',gap:6}}>
              {abaixo.length === 0 && (
                <div style={{textAlign:'center',padding:'16px 0',color:'#16a34a',fontWeight:600,fontSize:'0.85rem'}}>
                  ✅ Todos os vendedores com meta estão acima de 80%
                </div>
              )}
              {abaixo.map((cons,i) => {
                const cor = cons.pct < 50 ? '#dc2626' : cons.pct < 65 ? '#ea580c' : '#d97706';
                const bgBar = cons.pct < 50 ? 'rgba(220,38,38,0.08)' : cons.pct < 65 ? 'rgba(234,88,12,0.06)' : 'rgba(217,119,6,0.06)';
                return (
                  <div key={cons.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:bgBar,borderRadius:8}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:cor+'20',border:`1.5px solid ${cor}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,color:cor,flexShrink:0}}>
                      {i+1}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:'0.82rem',color:'#1a1d2e',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cons.nome}</div>
                      <div style={{color:'#8b92b0',fontSize:'0.68rem'}}>{cons.equipe||'—'}</div>
                    </div>
                    <div style={{minWidth:120}}>
                      <div style={{background:'#f0f2f8',borderRadius:3,height:5,overflow:'hidden',marginBottom:2}}>
                        <div style={{height:'100%',width:`${Math.min(cons.pct,100)}%`,background:cor,borderRadius:3}}></div>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.65rem'}}>
                        <span style={{color:cor,fontWeight:700}}>{fmtPct(cons.pct)}</span>
                        <span style={{color:'#9ca3af'}}>{fmt(cons.apurado)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {abaixo.length > 6 && (
                <div style={{textAlign:'center',padding:'6px 0',color:'#9ca3af',fontSize:'0.73rem',borderTop:'1px solid #f0f2f8',marginTop:2}}>
                  + {abaixo.length - 6} outros vendedores abaixo da meta
                </div>
              )}
            </div>
            {/* Vendedores sem meta */}
            {semMeta.length > 0 && (
              <div style={{borderTop:'1px solid #f0f2f8',padding:'10px 20px',background:'#fafafa'}}>
                <div style={{fontSize:'0.7rem',color:'#9ca3af',fontWeight:600,textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Sem meta cadastrada:</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {semMeta.map(cons => (
                    <span key={cons.id} style={{background:'#f0f2f8',border:'1px solid #e4e7ef',borderRadius:5,padding:'2px 8px',fontSize:'0.72rem',color:'#6b7280'}}>
                      {cons.nome} <span style={{color:'#b0b7cc',fontSize:'0.65rem'}}>({cons.equipe||'—'})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rodapé com resumo por equipe */}
            {Object.keys(porEquipe).length > 0 && (
              <div style={{borderTop:'1px solid #f0f2f8',padding:'8px 20px',display:'flex',gap:8,flexWrap:'wrap',background:'#fafafa'}}>
                <span style={{color:'#9ca3af',fontSize:'0.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:0.5,alignSelf:'center'}}>Por equipe:</span>
                {Object.entries(porEquipe).map(([eq, data]) => {
                  const cor = data.piorPct < 50 ? '#dc2626' : data.piorPct < 65 ? '#ea580c' : '#d97706';
                  return (
                    <span key={eq} style={{background:cor+'12',border:`1px solid ${cor}25`,borderRadius:5,padding:'2px 8px',fontSize:'0.7rem',color:cor,fontWeight:600}}>
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
        <div style={{background:'rgba(220,38,38,0.04)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:12,padding:'16px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
          <div style={{fontSize:'1.8rem'}}>⚠️</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:'#dc2626',marginBottom:2}}>
              {semMovCriticoView} empresa{semMovCriticoView>1?'s':''} nunca movimentaram desde o início
            </div>
            <div style={{color:'#6b7280',fontSize:'0.82rem'}}>Revise a carteira e entre em contato com essas empresas.</div>
          </div>
          <Link href="/vendedor" style={{background:'#dc2626',color:'white',borderRadius:8,padding:'8px 16px',textDecoration:'none',fontSize:'0.82rem',fontWeight:600,whiteSpace:'nowrap'}}>
            Ver Carteira →
          </Link>
        </div>
      )}


    </div>
  );
}
