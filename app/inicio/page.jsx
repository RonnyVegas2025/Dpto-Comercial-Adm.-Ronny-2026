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

      // ── 2. Consultores filtrados pela visibilidade ───────────────────────
      const { data: todosConsultores } = await supabase
        .from('consultores')
        .select('id,nome,meta_mensal,gestor,equipe,meta_inicio')
        .eq('ativo', true);

      let consultores = todosConsultores || [];
      const perfisRestritos = ['gestor_comercial','supervisor_comercial','vendedor'];
      if (profData && perfisRestritos.includes(profData.perfil)) {
        if (vis?.tipo === 'equipes' && vis.equipes?.length > 0) {
          // CORRECAO: banco tem "Ronny Peterson", perfil tem "Ronny Peterson Izidorio"
          // Compara se um nome e prefixo do outro
          const nomePerf = profData.nome || '';
          consultores = consultores.filter(c => {
            if (!vis.equipes.includes(c.equipe)) return false;
            const nomeGestor = c.gestor || '';
            return nomePerf.startsWith(nomeGestor) || nomeGestor.startsWith(nomePerf);
          });
        } else if (vis?.tipo === 'especificos' && vis.consultor_ids?.length > 0) {
          const idSet = new Set(vis.consultor_ids);
          consultores = consultores.filter(c => idSet.has(c.id));
        }
      }

      const consIds = consultores.map(c => c.id);
      if (!consIds.length) { setDados({ vazio: true }); setLoading(false); return; }

      // ── 3. fetchAll helper (igual ao Vendedor) ────────────────────────────
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

      // ── 4. Empresas — MESMA query do Vendedor ────────────────────────────
      // O Vendedor filtra por categoria E usa fetchAll para paginação.
      // Fazemos o mesmo: uma query filtrada (para mov) e buscamos vmetas
      // com os IDs de TODAS as empresas ativas dos consultores.

      const [empresasMov, todasEmpIds] = await Promise.all([
        // A) Para movimentação — categorias filtradas (igual ao Vendedor)
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
        // B) IDs de TODAS as empresas (para meta, total ativo, novos contratos)
        fetchAll(
          supabase.from('empresas')
            .select('id, data_cadastro, consultor_principal_id')
            .eq('ativo', true)
            .in('consultor_principal_id', consIds)
        ),
      ]);

      const empIdsParaMeta = todasEmpIds.map(e => e.id);
      const prodIdsParaMov = empresasMov.map(e => e.produto_id);

      if (!empIdsParaMeta.length) { setDados({ vazio: true }); setLoading(false); return; }

      // ── 5. Liberações + Metas + Meses disponíveis ─────────────────────────
      // fetchAll para garantir que não trunca (igual ao Vendedor)
      const [todasLibs, vmetas, mesDisp] = await Promise.all([
        prodIdsParaMov.length
          ? fetchAll(
              supabase.from('liberacoes')
                .select('produto_id, competencia, total_liberado')
                .in('produto_id', prodIdsParaMov)
                .order('competencia')
            )
          : Promise.resolve([]),
        // valor_meta_empresa de TODAS as empresas — sem filtro de categoria
        // É AQUI que o Vendedor busca os R$ 993k
        empIdsParaMeta.length
          ? fetchAll(
              supabase.from('valor_meta_empresa')
                .select('empresa_id, competencia_meta, valor_meta, regra, pct_consultor')
                .in('empresa_id', empIdsParaMeta)
            )
          : Promise.resolve([]),
        // Meses disponíveis no banco (para calcular metaTotal igual ao Vendedor)
        supabase.from('liberacoes')
          .select('competencia')
          .order('competencia', { ascending: false })
          .then(r => [...new Set((r.data||[]).map(l => l.competencia?.substring(0,7)).filter(Boolean))].sort()),
      ]);

      // ── 6. libMap ────────────────────────────────────────────────────────
      const libMap = {};
      for (const l of todasLibs) {
        const k = `${l.produto_id}__${l.competencia?.substring(0,10)}`;
        libMap[k] = (libMap[k]||0) + (l.total_liberado||0);
      }

      // ── 7. Meses com dados (YYYY-MM-DD formato do banco) ──────────────────
      const meses        = [...new Set(todasLibs.map(l => l.competencia?.substring(0,10)))].sort();
      const ultimoMes    = meses[meses.length - 1] || null;
      const penultimoMes = meses[meses.length - 2] || null;
      const ultimoMesYM    = ultimoMes?.substring(0,7)    || null;
      const penultimoMesYM = penultimoMes?.substring(0,7) || null;

      // mesesDisp em YYYY-MM (igual ao Vendedor para calcular metaTotal)
      const mesesDisp = mesDisp.length ? mesDisp : (ultimoMesYM ? [ultimoMesYM] : []);

      // ── 8. Movimentação — sobre empresasMov ───────────────────────────────
      let movUltimoMes    = 0;
      let movPenultimoMes = 0;
      let comMovUltimoMes = 0;
      let semMovUltimoMes = 0;
      let semMovDoisMeses = 0;

      for (const e of empresasMov) {
        const vUlt = meses
          .filter(m => m.substring(0,7) === ultimoMesYM)
          .reduce((s, m) => s + (libMap[`${e.produto_id}__${m}`]||0), 0);
        const vPen = meses
          .filter(m => m.substring(0,7) === penultimoMesYM)
          .reduce((s, m) => s + (libMap[`${e.produto_id}__${m}`]||0), 0);
        movUltimoMes    += vUlt;
        movPenultimoMes += vPen;
        if (vUlt > 0) comMovUltimoMes++; else semMovUltimoMes++;
        if (vUlt === 0 && vPen === 0) semMovDoisMeses++;
      }

      // ── 9. metaApurada — soma de valor_meta_empresa (igual ao Vendedor) ───
      // O Vendedor: kpis.totalValorMeta = listaProcessada.reduce(s + e.valorMeta)
      // e.valorMeta vem de entradaBanco.valor_meta (gravado em valor_meta_empresa)
      // Portanto: somamos diretamente valor_meta de todas as entradas não-upsell
      const metaApurada = vmetas
        .filter(v => v.regra !== 'upsell')  // upsell entra separado no Vendedor
        .reduce((s, v) => s + (v.valor_meta||0), 0)
        + vmetas
          .filter(v => v.regra === 'upsell')
          .reduce((s, v) => s + (v.valor_meta||0), 0);
      // simplificando: soma tudo igual ao Vendedor
      const metaApuradaTotal = vmetas.reduce((s, v) => s + (v.valor_meta||0), 0);

      // ── 10. metaTotal — IGUAL ao Vendedor ────────────────────────────────
      // Vendedor: meta = consultoresDaVisao.reduce((total, cons) => {
      //   const qtd = mesesDisp.filter(m => m >= validaMes).length;
      //   return total + metaMes * qtd;
      // })
      // SEM mês selecionado — soma meta_mensal × qtd de meses válidos
      const metaTotal = consultores.reduce((total, cons) => {
        const metaMes    = cons.meta_mensal || 0;
        if (!metaMes) return total;
        const validaMes  = (cons.meta_inicio ? String(cons.meta_inicio).substring(0,7) : '2026-01');
        const validaReal = validaMes > '2026-01' ? validaMes : '2026-01';
        const qtd        = mesesDisp.filter(m => m >= validaReal).length || 1;
        return total + metaMes * qtd;
      }, 0);

      const empIdsComMeta  = new Set(vmetas.map(v => v.empresa_id));
      const naMeta         = todasEmpIds.filter(e => empIdsComMeta.has(e.id)).length;

      // ── 11. Esperado/mês ──────────────────────────────────────────────────
      const esperadoTotal = empresasMov.reduce((s,e) => {
        const fator = (e.pct_principal??100)/100;
        return s + (e.potencial_movimentacao||0)*(e.peso_categoria||1)*fator;
      }, 0);

      const pctAderencia = esperadoTotal > 0 ? (movUltimoMes/esperadoTotal)*100 : 0;
      const pctMeta      = metaTotal > 0 ? (metaApuradaTotal/metaTotal)*100 : 0;

      // ── 10. Badge de performance ─────────────────────────────────────────
      const perf = pctMeta >= 80 ? 'verde' : pctMeta >= 60 ? 'amarelo' : 'vermelho';
      const perfMsg = perf === 'verde'
        ? { emoji:'🟢', titulo:'Parabéns! Sua equipe está performando bem.', sub:`Meta atingida em ${fmtPct(pctMeta)} — continue assim!` }
        : perf === 'amarelo'
        ? { emoji:'🟡', titulo:'Sua equipe está quase lá!', sub:`${fmtPct(pctMeta)} da meta — foco para fechar forte o mês.` }
        : { emoji:'🔴', titulo:'Atenção! Sua equipe precisa de foco.', sub:`Apenas ${fmtPct(pctMeta)} da meta atingida — revise as prioridades.` };

      // ── 12. Top 3 consultores por meta apurada ───────────────────────────
      const metaPorConsultor = {};
      for (const v of vmetas) {
        const emp = todasEmpIds.find(e => e.id === v.empresa_id);
        if (!emp) continue;
        const cid = emp.consultor_principal_id;
        metaPorConsultor[cid] = (metaPorConsultor[cid]||0) + (v.valor_meta||0);
      }
      const top3 = consultores
        .map(c => ({ ...c, metaApurada: metaPorConsultor[c.id]||0 }))
        .sort((a,b) => b.metaApurada - a.metaApurada)
        .slice(0,3);

      // ── 13. Meta apurada por mês ─────────────────────────────────────────
      const metaPorMes = {};
      for (const v of vmetas) {
        const m = v.competencia_meta?.substring(0,7);
        if (m) metaPorMes[m] = (metaPorMes[m]||0) + (v.valor_meta||0);
      }
      const mesesComMeta = Object.entries(metaPorMes)
        .sort((a,b) => a[0].localeCompare(b[0]))
        .slice(-5);

      // ── 14. Novos contratos + variação ────────────────────────────────────
      const novasEsteMes = todasEmpIds.filter(e =>
        e.data_cadastro?.substring(0,7) === ultimoMesYM
      ).length;

      const variacao = movPenultimoMes > 0
        ? ((movUltimoMes - movPenultimoMes) / movPenultimoMes) * 100
        : 0;

      setDados({
        prof:          profData,
        consultores,
        totalEmpresas: todasEmpIds.length,
        movAtual:      movUltimoMes,
        movAnterior:   movPenultimoMes,
        comMovAtual:   comMovUltimoMes,
        semMovAtual:   semMovUltimoMes,
        semMovCritico: semMovDoisMeses,
        variacao,
        metaTotal,
        metaApurada:   metaApuradaTotal,
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
    consultores, totalEmpresas, mesAtual, mesAnterior,
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
          Resumo da equipe — referência: <strong style={{color:'#b45309'}}>{fmtMes(mesAtual ? mesAtual+'-01' : null)}</strong>
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
            label: 'Sem Movimentação',
            val:   semMovAtual,
            sub:   `${semMovCritico} há 2+ meses`,
            subCor: semMovCritico > 0 ? '#dc2626' : '#8b92b0',
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
              const metaMens = c.meta_mensal || 0;
              const pct      = metaMens > 0 ? (c.metaApurada/metaMens)*100 : 0;
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
                    {metaMens > 0 && <div style={{fontSize:'0.68rem',color:cor,fontWeight:600}}>{fmtPct(pct)} da meta</div>}
                  </div>
                  {metaMens > 0 && (
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

      {/* Alerta empresas sem movimentação */}
      {semMovCritico > 0 && (
        <div style={{background:'rgba(220,38,38,0.04)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:12,padding:'16px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
          <div style={{fontSize:'1.8rem'}}>⚠️</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:'#dc2626',marginBottom:2}}>
              {semMovCritico} empresa{semMovCritico>1?'s':''} sem movimentação em {fmtMes(mesAtual ? mesAtual+'-01' : null)} e {fmtMes(mesAnterior ? mesAnterior+'-01' : null)}
            </div>
            <div style={{color:'#6b7280',fontSize:'0.82rem'}}>Revise a carteira e entre em contato com essas empresas.</div>
          </div>
          <Link href="/vendedor" style={{background:'#dc2626',color:'white',borderRadius:8,padding:'8px 16px',textDecoration:'none',fontSize:'0.82rem',fontWeight:600,whiteSpace:'nowrap'}}>
            Ver Carteira →
          </Link>
        </div>
      )}

      {/* Ações rápidas */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
        {[
          { href:'/vendedor', emoji:'📊', label:'Dashboard Vendedor', desc:'Análise detalhada por equipe'    },
          { href:'/gestao',   emoji:'⚙️', label:'Gestão',             desc:'Gerenciar metas e ajustes'      },
          { href:'/evolucao', emoji:'📈', label:'Evolução',           desc:'Movimentação de todas as empresas' },
        ].map(a => (
          <Link key={a.href} href={a.href} style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'18px 20px',textDecoration:'none',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',display:'flex',alignItems:'center',gap:14}}>
            <div style={{fontSize:'1.6rem'}}>{a.emoji}</div>
            <div>
              <div style={{fontWeight:700,color:'#1a1d2e',fontSize:'0.88rem'}}>{a.label}</div>
              <div style={{color:'#8b92b0',fontSize:'0.72rem',marginTop:2}}>{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
