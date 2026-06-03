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
      const perfisRestritos = ['gestor_comercial','supervisor_comercial','vendedor'];
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
              consultor_principal_id`)
            .eq('ativo', true)
            .in('consultor_principal_id', consIds)
            .not('produto_contratado','ilike','%desconto condicional%')
            .not('categoria','eq','Taxa Negativa')
            .in('categoria',['Beneficios','Benefícios','Bonus','Bônus','Convênio','Convenio','Mobilidade'])
        ),
        fetchAll(
          supabase.from('empresas')
            .select(`id, produto_id, nome, categoria, produto_contratado,
              potencial_movimentacao, peso_categoria, pct_principal, data_cadastro,
              consultor_principal_id`)
            .eq('ativo', true)
            .in('consultor_principal_id', consIds)
            .not('produto_contratado','ilike','%desconto condicional%')
            .not('categoria','eq','Taxa Negativa')
            .in('categoria',['Beneficios','Benefícios','Bonus','Bônus','Convênio','Convenio','Mobilidade'])
        ),
      ]);

      // Para meta usamos as mesmas empresas filtradas por categoria (igual ao Vendedor)
      const empIds  = todasEmpresas.map(e => e.id);
      const prodIds = todasEmpresas.map(e => e.produto_id);

      // ── 5. Busca em paralelo: libs filtradas + libs todas + metas + meses ──
      const [libsFiltradas, libsTodas, vmetasRows, mesDispRaw] = await Promise.all([
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
        supabase.from('liberacoes').select('competencia').order('competencia', { ascending: false })
          .then(r => [...new Set((r.data||[]).map(l => l.competencia?.substring(0,7)).filter(Boolean))].sort()),
      ]);

      // ── 6. Mapas ─────────────────────────────────────────────────────────
      const libMap = {};
      for (const l of libsFiltradas) {
        const k = `${l.produto_id}__${l.competencia?.substring(0,10)}`;
        libMap[k] = (libMap[k]||0) + (l.total_liberado||0);
      }

      const ajusteMap = {}; // sem ajustes na página início por simplicidade

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
      let movUltimoMes = 0, movPenultimoMes = 0;
      let comMovUltimoMes = 0, semMovUltimoMes = 0, semMovDoisMeses = 0;

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
        if (nuncaMovimentou) semMovDoisMeses++;
      }

      // ── 9. calcularValorMeta — CÓPIA EXATA do Vendedor ───────────────────
      function calcularValorMeta(empresa, pct, validaDesdeMes) {
        const catLower = (empresa.categoria||'').toLowerCase();
        const prodNorm = (empresa.produto_contratado||'').toLowerCase().trim();
        const isConv   = catLower.includes('conv') || catLower.includes('mobil');
        const limite   = (() => {
          const v = validaDesdeMes ? String(validaDesdeMes).substring(0,7) : '2026-01';
          return v > '2026-01' ? v : '2026-01';
        })();
        const libs = (libsTodasMap[empresa.produto_id]||[])
          .filter(l => l.val > 0 && l.comp >= limite)
          .sort((a,b) => a.comp.localeCompare(b.comp));
        if (!libs.length) return null;
        const isVB   = prodNorm === 'vegas benefícios' || prodNorm === 'vegas beneficios';
        const peso   = isVB ? (empresa.peso_categoria??1) : 1;
        let mesAlvo, valorBruto;
        if (!isConv) {
          mesAlvo = libs[0].comp; valorBruto = libs[0].val;
        } else {
          if (libs.length < 3) return null;
          mesAlvo = libs[2].comp; valorBruto = libs[2].val;
        }
        const aj = ajusteMap[`${empresa.id}__${mesAlvo}`];
        const valorConsid = aj !== undefined ? aj : valorBruto;
        const valorMeta   = Math.round(valorConsid * peso * (pct/100) * 100) / 100;
        return { valor_meta: valorMeta, competencia_meta: mesAlvo, regra: isConv?'convenio':'beneficio' };
      }

      // ── 10. metaApurada — IGUAL ao Vendedor ──────────────────────────────
      // Vendedor: para cada empresa, usa entradaBanco se existir, senão calcula
      // Aqui fazemos o mesmo loop sobre todasEmpresas
      let metaApuradaTotal = 0;
      const metaPorConsultor = {};
      const metaPorMes = {};
      let naMeta = 0;

      for (const e of todasEmpresas) {
        const pct = (e.pct_principal??100);
        const consId = e.consultor_principal_id;
        const cons = consultores.find(c => c.id === consId);
        const validaDesdeMes = cons?.meta_inicio || null;

        // Busca entrada gravada no banco (excluindo upsell)
        const entradaBanco = vmetasRows.find(v =>
          v.empresa_id === e.id && v.regra !== 'upsell' &&
          (v.consultor_id === consId || v.consultor_id === null)
        );
        const entradaUpsell = vmetasRows.find(v =>
          v.empresa_id === e.id && v.regra === 'upsell'
        );

        let valorMeta = 0;
        let compMeta  = null;

        if (entradaBanco) {
          // Usa o que está gravado no banco (igual ao Vendedor)
          valorMeta = (entradaBanco.valor_meta||0) + (entradaUpsell?.valor_meta||0);
          compMeta  = entradaBanco.competencia_meta;
        } else {
          // Calcula automaticamente (igual ao Vendedor quando não tem entrada)
          const calc = calcularValorMeta(e, pct, validaDesdeMes);
          if (calc) {
            valorMeta = calc.valor_meta;
            compMeta  = calc.competencia_meta;
          }
        }

        if (valorMeta > 0) {
          metaApuradaTotal += valorMeta;
          naMeta++;
          metaPorConsultor[consId] = (metaPorConsultor[consId]||0) + valorMeta;
          const m = compMeta?.substring(0,7);
          if (m) metaPorMes[m] = (metaPorMes[m]||0) + valorMeta;
        }
      }

      // ── 11. metaTotal — igual ao Vendedor ────────────────────────────────
      const metaTotal = consultores.reduce((total, cons) => {
        const metaMes   = cons.meta_mensal || 0;
        if (!metaMes) return total;
        const validaMes = (cons.meta_inicio ? String(cons.meta_inicio).substring(0,7) : '2026-01');
        const valida    = validaMes > '2026-01' ? validaMes : '2026-01';
        const qtd       = mesesDisp.filter(m => m >= valida).length || 1;
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
        variacao,
        metaTotal,
        metaApurada:   metaApuradaTotal,
        metaPorConsultor,
        mesesDisp,
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
    consultores, totalEmpresas, mesAtual, mesAnterior, metaPorConsultor, mesesDisp,
  } = dados;

  const corPerf = perf==='verde'?'#16a34a':perf==='amarelo'?'#d97706':'#dc2626';
  const bgPerf  = perf==='verde'?'rgba(22,163,74,0.06)':perf==='amarelo'?'rgba(217,119,6,0.06)':'rgba(220,38,38,0.06)';
  const bdPerf  = perf==='verde'?'rgba(22,163,74,0.2)':perf==='amarelo'?'rgba(217,119,6,0.2)':'rgba(220,38,38,0.2)';
  const corPct  = (p) => p>=80?'#16a34a':p>=60?'#d97706':'#dc2626';

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
      </div>

      {/* Banner de performance */}
      <div style={{background:bgPerf,border:`1px solid ${bdPerf}`,borderRadius:14,padding:'20px 24px',marginBottom:24,display:'flex',alignItems:'center',gap:16,animation:'fadeIn 0.4s ease'}}>
        <div style={{fontSize:'2.5rem',lineHeight:1}}>{perfMsg.emoji}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:'1.05rem',color:corPerf,marginBottom:4}}>{perfMsg.titulo}</div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>{perfMsg.sub}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:'2rem',fontWeight:800,color:corPerf}}>{fmtPct(pctMeta)}</div>
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
            val:   fmt(metaApurada),
            sub:   `meta: ${fmt(metaTotal)}/mês`,
            subCor:'#8b92b0',
          },
          {
            label: 'Meta Acumulada',
            val:   fmt(metaTotal),
            sub:   `${fmt(consultores.reduce((s,c) => s+(c.meta_mensal||0), 0))}/mês`,
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
            <span style={{fontSize:'0.82rem',fontWeight:700,color:corPct(pctMeta)}}>{fmtPct(pctMeta)}</span>
          </div>
          <div style={{background:'#f0f2f8',borderRadius:8,height:14,overflow:'hidden',marginBottom:12}}>
            <div style={{height:'100%',borderRadius:8,transition:'width 1s ease',width:`${Math.min(pctMeta,100)}%`,background:corPct(pctMeta)}}></div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',marginBottom:16}}>
            <span style={{color:corPct(pctMeta),fontWeight:700}}>{fmt(metaApurada)} apurado</span>
            <span style={{color:'#9ca3af'}}>{fmt(metaTotal)}/mês</span>
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
          {mesesComMeta.length === 0 ? (
            <div style={{color:'#8b92b0',fontSize:'0.85rem',textAlign:'center',padding:'24px 0'}}>Nenhuma meta apurada ainda</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {mesesComMeta.map(([mes, val]) => {
                const maxVal = Math.max(...mesesComMeta.map(([,v])=>v), 1);
                const pct    = (val/maxVal)*100;
                const isLast = mes === mesAtual;
                return (
                  <div key={mes}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:'0.78rem',fontWeight:isLast?700:400,color:isLast?'#b45309':'#4a5068'}}>
                        {fmtMes(mes+'-01')}{isLast?' ← último mês':''}
                      </span>
                      <span style={{fontSize:'0.78rem',fontWeight:700,color:isLast?'#b45309':'#16a34a'}}>{fmt(val)}</span>
                    </div>
                    <div style={{background:'#f0f2f8',borderRadius:4,height:8,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:isLast?'#f0b429':'#34d399',borderRadius:4,transition:'width 0.8s'}}></div>
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
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'#1a1d2e'}}>🏆 Top Vendedores — Meta Apurada</div>
          <Link href="/vendedor" style={{color:'#b45309',fontSize:'0.78rem',fontWeight:600,textDecoration:'none'}}>Ver ranking completo →</Link>
        </div>
        {top3.length === 0 ? (
          <div style={{color:'#8b92b0',fontSize:'0.85rem',textAlign:'center',padding:'16px 0'}}>Nenhum dado ainda</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {top3.map((c,i) => {
              const medal    = i===0?'🥇':i===1?'🥈':'🥉';
              // % correto: metaApurada vs meta ACUMULADA (meta_mensal × meses válidos)
              const validaMesC = (c.meta_inicio ? String(c.meta_inicio).substring(0,7) : '2026-01');
              const validaC    = validaMesC > '2026-01' ? validaMesC : '2026-01';
              const qtdC       = (mesesDisp||[]).filter(m => m >= validaC).length || 1;
              const metaAcum   = (c.meta_mensal||0) * qtdC;
              const pct        = metaAcum > 0 ? (c.metaApurada/metaAcum)*100 : 0;
              const cor      = corPct(pct);
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:i===0?'rgba(240,180,41,0.05)':'#f9fafb',borderRadius:10,border:`1px solid ${i===0?'rgba(240,180,41,0.2)':'#f0f2f8'}`}}>
                  <span style={{fontSize:'1.3rem'}}>{medal}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:'0.88rem',color:'#1a1d2e'}}>{c.nome}</div>
                    <div style={{color:'#8b92b0',fontSize:'0.72rem'}}>{c.equipe||c.gestor||'—'}</div>
                  </div>
                  <div style={{textAlign:'right',minWidth:100}}>
                    <div style={{fontWeight:700,color:'#34d399',fontSize:'0.9rem'}}>{fmt(c.metaApurada)}</div>
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

        // Só considera consultores COM meta_mensal cadastrada
        const comMeta = consultores.filter(cons => (cons.meta_mensal||0) > 0);
        if (!comMeta.length) return null;

        const todos = comMeta.map(cons => {
          const apurado  = metaPorConsultor[cons.id] || 0;
          // % correto: vs meta ACUMULADA (meta_mensal × meses), não só 1 mês
          const validaM = (cons.meta_inicio ? String(cons.meta_inicio).substring(0,7) : '2026-01');
          const validaR = validaM > '2026-01' ? validaM : '2026-01';
          const qtdM    = (mesesDisp||[]).filter(m => m >= validaR).length || 1;
          const mAcum   = (cons.meta_mensal||0) * qtdM;
          const pct   = mAcum > 0 ? (apurado / mAcum) * 100 : 0;
          return { ...cons, apurado, metaAcum: mAcum, pct };
        });

        const abaixo   = todos.filter(cons => cons.pct < 80).sort((a,b) => a.pct - b.pct);
        const ok       = todos.filter(cons => cons.pct >= 80).length;
        const criticos = abaixo.filter(cons => cons.pct < 50).length;

        // Vendedores SEM meta mas que existem na equipe
        const semMeta  = consultores.filter(cons => !(cons.meta_mensal > 0));

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
              {abaixo.slice(0,6).map((cons,i) => {
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
                        <div style={{height:'100%',width:`${Math.min(c.pct,100)}%`,background:cor,borderRadius:3}}></div>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.65rem'}}>
                        <span style={{color:cor,fontWeight:700}}>{fmtPct(c.pct)}</span>
                        <span style={{color:'#9ca3af'}}>{fmt(c.apurado)}</span>
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
      {semMovCritico > 0 && (
        <div style={{background:'rgba(220,38,38,0.04)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:12,padding:'16px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
          <div style={{fontSize:'1.8rem'}}>⚠️</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:'#dc2626',marginBottom:2}}>
              {semMovCritico} empresa{semMovCritico>1?'s':''} nunca movimentaram desde o início
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
