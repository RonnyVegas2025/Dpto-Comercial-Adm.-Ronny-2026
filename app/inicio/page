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
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };

export default function HomePage() {
  const [loading, setLoading]   = useState(true);
  const [dados,   setDados]     = useState(null);
  const [prof,    setProf]      = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: profData }, { data: vis }] = await Promise.all([
        supabase.from('user_profiles').select('perfil,nome').eq('id', user.id).single(),
        supabase.from('user_visibilidade').select('tipo,consultor_ids,equipes').eq('user_id', user.id).maybeSingle(),
      ]);
      setProf(profData);

      // Busca consultores filtrados pela visibilidade
      const { data: todosConsultores } = await supabase
        .from('consultores')
        .select('id,nome,meta_mensal,gestor,equipe,meta_inicio')
        .eq('ativo', true);

      let consultores = todosConsultores || [];
      const perfisRestritos = ['gestor_comercial','supervisor_comercial','vendedor'];
      if (profData && perfisRestritos.includes(profData.perfil)) {
        if (vis?.tipo === 'equipes' && vis.equipes?.length > 0) {
          consultores = consultores.filter(c =>
            vis.equipes.includes(c.equipe) && c.gestor === profData.nome
          );
        } else if (vis?.tipo === 'especificos' && vis.consultor_ids?.length > 0) {
          const idSet = new Set(vis.consultor_ids);
          consultores = consultores.filter(c => idSet.has(c.id));
        }
      }

      const consIds = consultores.map(c => c.id);
      if (!consIds.length) { setDados({ vazio: true }); setLoading(false); return; }

      // Empresas dos consultores
      const { data: empresas } = await supabase
        .from('empresas')
        .select('id, produto_id, nome, categoria, produto_contratado, potencial_movimentacao, peso_categoria, pct_principal, data_cadastro, consultor_principal_id')
        .eq('ativo', true)
        .in('consultor_principal_id', consIds)
        .not('produto_contratado','ilike','%desconto condicional%')
        .not('categoria','eq','Taxa Negativa')
        .in('categoria',['Beneficios','Benefícios','Bonus','Bônus','Convênio','Convenio','Mobilidade']);

      const empIds  = (empresas||[]).map(e => e.id);
      const prodIds = (empresas||[]).map(e => e.produto_id);

      // Liberações dos últimos 2 meses
      const hoje = new Date();
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
      const mesAnterior = (() => {
        const d = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      })();

      const [{ data: libs }, { data: vmetas }] = await Promise.all([
        prodIds.length ? supabase.from('liberacoes')
          .select('produto_id,competencia,total_liberado')
          .in('produto_id', prodIds)
          .gte('competencia', mesAnterior+'-01') : Promise.resolve({ data: [] }),
        empIds.length ? supabase.from('valor_meta_empresa')
          .select('empresa_id,competencia_meta,valor_meta,regra')
          .in('empresa_id', empIds) : Promise.resolve({ data: [] }),
      ]);

      // Calcula movimentação por empresa no mês atual e anterior
      const libMap = {};
      for (const l of (libs||[])) {
        const k = `${l.produto_id}__${l.competencia?.substring(0,7)}`;
        libMap[k] = (libMap[k]||0) + l.total_liberado;
      }

      let movAtual = 0, movAnterior = 0, comMovAtual = 0, semMovAtual = 0;
      for (const e of (empresas||[])) {
        const va = libMap[`${e.produto_id}__${mesAtual}`]||0;
        const vb = libMap[`${e.produto_id}__${mesAnterior}`]||0;
        movAtual    += va;
        movAnterior += vb;
        if (va > 0) comMovAtual++; else semMovAtual++;
      }

      // Meta total
      const metaTotal = consultores.reduce((s,c) => s + (c.meta_mensal||0), 0);

      // Meta apurada total (vmetasRows)
      const metaApurada = (vmetas||[]).reduce((s,v) => s + (v.valor_meta||0), 0);

      // % aderência: mov atual vs esperado
      const esperadoTotal = (empresas||[]).reduce((s,e) => {
        const fator = (e.pct_principal??100)/100;
        return s + (e.potencial_movimentacao||0)*(e.peso_categoria||1)*fator;
      }, 0);
      const pctAderencia = esperadoTotal > 0 ? (movAtual/esperadoTotal)*100 : 0;
      const pctMeta      = metaTotal > 0 ? (metaApurada/metaTotal)*100 : 0;

      // Performance badge
      const perf = pctMeta >= 80 ? 'verde' : pctMeta >= 60 ? 'amarelo' : 'vermelho';
      const perfMsg = perf === 'verde'
        ? { emoji:'🟢', titulo:'Parabéns! Sua equipe está performando bem.', sub:`Meta atingida em ${fmtPct(pctMeta)} — continue assim!` }
        : perf === 'amarelo'
        ? { emoji:'🟡', titulo:'Sua equipe está quase lá!', sub:`${fmtPct(pctMeta)} da meta — foco para fechar forte o mês.` }
        : { emoji:'🔴', titulo:'Atenção! Sua equipe precisa de foco.', sub:`Apenas ${fmtPct(pctMeta)} da meta atingida — revise as prioridades.` };

      // Top 3 consultores por meta apurada
      const metaPorConsultor = {};
      for (const v of (vmetas||[])) {
        const emp = (empresas||[]).find(e=>e.id===v.empresa_id);
        if (!emp) continue;
        const cid = emp.consultor_principal_id;
        if (!metaPorConsultor[cid]) metaPorConsultor[cid] = 0;
        metaPorConsultor[cid] += (v.valor_meta||0);
      }
      const top3 = consultores
        .map(c => ({ ...c, metaApurada: metaPorConsultor[c.id]||0 }))
        .sort((a,b) => b.metaApurada - a.metaApurada)
        .slice(0,3);

      // Empresas sem movimentação > 2 meses (sem mov no mês atual e anterior)
      const semMovCritico = (empresas||[]).filter(e => {
        const va = libMap[`${e.produto_id}__${mesAtual}`]||0;
        const vb = libMap[`${e.produto_id}__${mesAnterior}`]||0;
        return va === 0 && vb === 0;
      }).length;

      // Novas empresas este mês
      const novasEsteMes = (empresas||[]).filter(e =>
        e.data_cadastro?.substring(0,7) === mesAtual
      ).length;

      // Meta por mês (últimos meses com meta apurada)
      const metaPorMes = {};
      for (const v of (vmetas||[])) {
        const m = v.competencia_meta?.substring(0,7);
        if (m) metaPorMes[m] = (metaPorMes[m]||0) + (v.valor_meta||0);
      }
      const mesesComMeta = Object.entries(metaPorMes).sort((a,b)=>a[0].localeCompare(b[0])).slice(-5);

      setDados({
        prof: profData,
        consultores,
        empresas: empresas||[],
        movAtual, movAnterior, comMovAtual, semMovAtual,
        metaTotal, metaApurada, esperadoTotal,
        pctAderencia, pctMeta, perf, perfMsg,
        top3, semMovCritico, novasEsteMes,
        mesesComMeta, mesAtual, mesAnterior,
      });
    } catch(err) {
      console.error(err);
    }
    setLoading(false);
  }

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

  const { perfMsg, perf, top3, semMovCritico, novasEsteMes, mesesComMeta,
    movAtual, movAnterior, comMovAtual, semMovAtual,
    metaTotal, metaApurada, esperadoTotal, pctAderencia, pctMeta,
    consultores, empresas, mesAtual, mesAnterior } = dados;

  const corPerf = perf==='verde'?'#16a34a':perf==='amarelo'?'#d97706':'#dc2626';
  const bgPerf  = perf==='verde'?'rgba(22,163,74,0.06)':perf==='amarelo'?'rgba(217,119,6,0.06)':'rgba(220,38,38,0.06)';
  const bdPerf  = perf==='verde'?'rgba(22,163,74,0.2)':perf==='amarelo'?'rgba(217,119,6,0.2)':'rgba(220,38,38,0.2)';
  const corPct  = (p) => p>=80?'#16a34a':p>=60?'#d97706':'#dc2626';
  const variacao = movAnterior > 0 ? ((movAtual - movAnterior)/movAnterior)*100 : 0;

  return (
    <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#1a1d2e',background:'#f5f6fa',minHeight:'100vh'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{color:'#b45309',fontWeight:700,fontSize:'0.75rem',letterSpacing:2,marginBottom:8,textTransform:'uppercase'}}>♠ Vegas Card</div>
        <h1 style={{fontSize:'1.8rem',fontWeight:700,margin:'0 0 4px',color:'#1a1d2e'}}>
          Olá, {dados.prof?.nome?.split(' ')[0]} 👋
        </h1>
        <p style={{color:'#8b92b0',fontSize:'0.9rem',margin:0}}>
          Aqui está o resumo da sua equipe — {fmtMes(mesAtual+'-01')}
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

      {/* KPIs principais */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:24}}>
        {[
          { label:'Empresas Ativas', val: empresas.length, sub: `${comMovAtual} movimentando`, subCor:'#16a34a' },
          { label:'Mov. Mês Atual', val: fmt(movAtual), sub: movAnterior>0?`${variacao>=0?'▲':'▼'} ${fmtPct(Math.abs(variacao))} vs mês ant.`:'—', subCor: variacao>=0?'#16a34a':'#dc2626' },
          { label:'Esperado/mês', val: fmt(esperadoTotal), sub: `${fmtPct(pctAderencia)} realizado`, subCor: corPct(pctAderencia) },
          { label:'Meta Apurada', val: fmt(metaApurada), sub: `meta: ${fmt(metaTotal)}/mês`, subCor:'#8b92b0' },
          { label:'Sem Movimentação', val: semMovAtual, sub: `${semMovCritico} há 2+ meses`, subCor: semMovCritico>0?'#dc2626':'#8b92b0' },
          { label:'Novos Contratos', val: novasEsteMes, sub: `em ${fmtMes(mesAtual+'-01')}`, subCor:'#60a5fa' },
        ].map((k,i)=>(
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
            <div style={{height:'100%',borderRadius:8,transition:'width 1s ease',width:`${Math.min(pctMeta,100)}%`,background:`linear-gradient(90deg,${corPct(pctMeta)},${corPct(pctMeta)}cc)`}}></div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem'}}>
            <span style={{color:corPct(pctMeta),fontWeight:700}}>{fmt(metaApurada)} apurado</span>
            <span style={{color:'#9ca3af'}}>{fmt(metaTotal)}/mês</span>
          </div>
          <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid #f0f2f8'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:'0.8rem',color:'#6b7280'}}>Mov. real vs esperada</span>
              <span style={{fontSize:'0.82rem',fontWeight:700,color:corPct(pctAderencia)}}>{fmtPct(pctAderencia)}</span>
            </div>
            <div style={{background:'#f0f2f8',borderRadius:8,height:10,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:8,width:`${Math.min(pctAderencia,100)}%`,background:`linear-gradient(90deg,${corPct(pctAderencia)},${corPct(pctAderencia)}cc)`}}></div>
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
                const pct = (val/maxVal)*100;
                const isCurrent = mes === mesAtual;
                return (
                  <div key={mes}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:'0.78rem',fontWeight:isCurrent?700:400,color:isCurrent?'#b45309':'#4a5068'}}>{fmtMes(mes+'-01')}{isCurrent?' ← atual':''}</span>
                      <span style={{fontSize:'0.78rem',fontWeight:700,color:isCurrent?'#b45309':'#16a34a'}}>{fmt(val)}</span>
                    </div>
                    <div style={{background:'#f0f2f8',borderRadius:4,height:8,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:isCurrent?'#f0b429':'#34d399',borderRadius:4,transition:'width 0.8s'}}></div>
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
              const medal = i===0?'🥇':i===1?'🥈':'🥉';
              const metaMensal = c.meta_mensal || 0;
              const pct = metaMensal > 0 ? (c.metaApurada/metaMensal)*100 : 0;
              const cor = corPct(pct);
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:i===0?'rgba(240,180,41,0.05)':'#f9fafb',borderRadius:10,border:`1px solid ${i===0?'rgba(240,180,41,0.2)':'#f0f2f8'}`}}>
                  <span style={{fontSize:'1.3rem'}}>{medal}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:'0.88rem',color:'#1a1d2e'}}>{c.nome}</div>
                    <div style={{color:'#8b92b0',fontSize:'0.72rem'}}>{c.equipe||c.gestor||'—'}</div>
                  </div>
                  <div style={{textAlign:'right',minWidth:100}}>
                    <div style={{fontWeight:700,color:'#34d399',fontSize:'0.9rem'}}>{fmt(c.metaApurada)}</div>
                    {metaMensal > 0 && <div style={{fontSize:'0.68rem',color:cor,fontWeight:600}}>{fmtPct(pct)} da meta</div>}
                  </div>
                  {metaMensal > 0 && (
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

      {/* Alertas */}
      {semMovCritico > 0 && (
        <div style={{background:'rgba(220,38,38,0.04)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:12,padding:'16px 20px',marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
          <div style={{fontSize:'1.8rem'}}>⚠️</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:'#dc2626',marginBottom:2}}>{semMovCritico} empresa{semMovCritico>1?'s':''} sem movimentação há 2+ meses</div>
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
          { href:'/vendedor',   emoji:'📊', label:'Dashboard Vendedor', desc:'Análise detalhada por equipe' },
          { href:'/gestao',     emoji:'⚙️', label:'Gestão',             desc:'Gerenciar metas e ajustes' },
          { href:'/evolucao',   emoji:'📈', label:'Evolução',           desc:'Acompanhar crescimento' },
        ].map(a=>(
          <Link key={a.href} href={a.href} style={{background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'18px 20px',textDecoration:'none',boxShadow:'0 1px 3px rgba(0,0,0,0.05)',display:'flex',alignItems:'center',gap:14,transition:'border-color 0.2s'}}>
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

