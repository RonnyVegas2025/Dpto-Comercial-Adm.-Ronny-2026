
'use client';

import { useState, useEffect, use } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = (d) => { if(!d) return '—'; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; };
const fmtMes  = (d) => { if(!d) return '—'; const [y,m]=String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };

const TIPO_CONFIG = {
  contato:    { icon:'📞', label:'Contato',     cor:'#60a5fa' },
  negociacao: { icon:'🤝', label:'Negociação',  cor:'#34d399' },
  renovacao:  { icon:'🔄', label:'Renovação',   cor:'#a78bfa' },
  reclamacao: { icon:'⚠️', label:'Reclamação',  cor:'#f87171' },
  prazo:      { icon:'⏳', label:'Prazo',        cor:'#f0b429' },
  outro:      { icon:'📌', label:'Outro',        cor:'#9ca3af' },
};

const COR_GRUPO = { lucrativo:'#34d399', subsidio:'#f0b429', retencao:'#f87171' };
const EMOJI_GRUPO = { lucrativo:'💚', subsidio:'⚡', retencao:'❄️' };
const LABEL_GRUPO = { lucrativo:'Lucrativo', subsidio:'Subsídio', retencao:'Retenção' };

export default function AgregadoDetalhe({ params }) {
  const router = useRouter();
  const { id } = use(params); // empresa_agregada_id

  const [empresa,      setEmpresa]      = useState(null);
  const [contratos,    setContratos]    = useState([]);
  const [fechamentos,  setFechamentos]  = useState([]);
  const [historico,    setHistorico]    = useState([]);
  const [consultores,  setConsultores]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [salvando,     setSalvando]     = useState(false);
  const [sucesso,      setSucesso]      = useState(false);
  const [editando,     setEditando]     = useState(false);
  const [form,         setForm]         = useState(null);
  const [novaOco,      setNovaOco]      = useState({ tipo:'contato', titulo:'', descricao:'' });
  const [adicionando,  setAdicionando]  = useState(false);
  const [salvandoOco,  setSalvandoOco]  = useState(false);

  useEffect(() => { if (id) carregarTudo(); }, [id]);

  async function carregarTudo() {
    setLoading(true);
    const [{ data: emp }, { data: conts }, { data: cons }, { data: hist }] = await Promise.all([
      supabase.from('empresas_agregadas').select(`
        *, consultor_principal:consultor_principal_id (id, nome),
        consultor_agregado:consultor_agregado_id (id, nome)
      `).eq('id', id).single(),
      supabase.from('contratos_agregados').select(`
        *, produto_1:produto_1_id (id, nome, custo),
        produto_2:produto_2_id (id, nome, custo),
        produto_3:produto_3_id (id, nome, custo)
      `).eq('empresa_agregada_id', id),
      supabase.from('consultores').select('id, nome, gestor').eq('ativo', true).order('nome'),
      supabase.from('historico_empresa')
        .select('*').eq('empresa_id', id).order('criado_em', { ascending: false }),
    ]);

    setEmpresa(emp);
    setContratos(conts || []);
    setConsultores(cons || []);
    setHistorico(hist || []);

    if (emp) setForm({
      nome: emp.nome || '',
      consultor_principal_id: emp.consultor_principal_id || '',
      consultor_agregado_id:  emp.consultor_agregado_id  || '',
      ativo: emp.ativo ?? true,
    });

    // Busca fechamentos de todos os contratos
    if (conts && conts.length > 0) {
      const { data: fecData } = await supabase
        .from('fechamentos_agregados')
        .select('*, contrato:contrato_id (produto_1:produto_1_id(nome), combo_nome, is_combo)')
        .in('contrato_id', conts.map(c => c.id))
        .order('competencia', { ascending: false });
      setFechamentos(fecData || []);
    }
    setLoading(false);
  }

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from('empresas_agregadas').update({
      nome: form.nome,
      consultor_principal_id: form.consultor_principal_id || null,
      consultor_agregado_id:  form.consultor_agregado_id  || null,
      ativo: form.ativo,
    }).eq('id', id);
    if (!error) { setSucesso(true); setEditando(false); await carregarTudo(); setTimeout(()=>setSucesso(false),3000); }
    setSalvando(false);
  }

  async function salvarOcorrencia() {
    if (!novaOco.titulo.trim()) return;
    setSalvandoOco(true);
    const { error } = await supabase.from('historico_empresa').insert({
      empresa_id: id, tipo: novaOco.tipo,
      titulo: novaOco.titulo.trim(), descricao: novaOco.descricao.trim() || null,
    });
    if (!error) {
      setNovaOco({ tipo:'contato', titulo:'', descricao:'' });
      setAdicionando(false);
      const { data } = await supabase.from('historico_empresa')
        .select('*').eq('empresa_id', id).order('criado_em', { ascending: false });
      setHistorico(data || []);
    }
    setSalvandoOco(false);
  }

  async function deletarOcorrencia(ocId) {
    if (!confirm('Remover este registro?')) return;
    await supabase.from('historico_empresa').delete().eq('id', ocId);
    setHistorico(h => h.filter(x => x.id !== ocId));
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Agrupa fechamentos por competência
  const fechPorMes = {};
  fechamentos.forEach(f => {
    const mes = f.competencia?.substring(0,7) || '—';
    if (!fechPorMes[mes]) fechPorMes[mes] = { boleto:0, custo:0, lucro:0, vidas:0, grupo:'lucrativo' };
    fechPorMes[mes].boleto += f.valor_boleto || 0;
    fechPorMes[mes].custo  += f.custo_mes    || 0;
    fechPorMes[mes].lucro  += f.lucro_mes    || 0;
    fechPorMes[mes].vidas  += (f.titulares_mes||0) + (f.dependentes_mes||0);
    // Grupo = pior do mês
    if (f.grupo==='retencao') fechPorMes[mes].grupo='retencao';
    else if (f.grupo==='subsidio'&&fechPorMes[mes].grupo!=='retencao') fechPorMes[mes].grupo='subsidio';
  });
  const mesesArray = Object.entries(fechPorMes).sort(([a],[b])=>b.localeCompare(a));

  // KPIs totais
  const totalBoleto = Object.values(fechPorMes).reduce((s,m)=>s+m.boleto,0);
  const totalCusto  = Object.values(fechPorMes).reduce((s,m)=>s+m.custo,0);
  const totalLucro  = Object.values(fechPorMes).reduce((s,m)=>s+m.lucro,0);
  const grupoGeral  = totalBoleto===0?'retencao':totalLucro<0?'subsidio':'lucrativo';

  if (loading) return (
    <div style={{...s.page,display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}>
      <div style={{textAlign:'center'}}><div style={s.spin}></div><div style={{color:'#6b7280'}}>Carregando...</div></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!empresa) return (
    <div style={{...s.page,textAlign:'center',paddingTop:80}}>
      <div style={{fontSize:'2rem',marginBottom:12}}>❌</div>
      <div style={{color:'#f87171'}}>Empresa não encontrada</div>
      <button style={s.btnSec} onClick={()=>router.push('/gestao')}>← Voltar</button>
    </div>
  );

  const corGrupo = COR_GRUPO[grupoGeral];

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus,textarea:focus{border-color:rgba(240,180,41,0.5)!important;outline:none;}`}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <button style={s.btnBack} onClick={()=>router.push('/gestao')}>← Voltar</button>
          <div>
            <div style={s.tag}>♠ Vegas Card · Agregados</div>
            <h1 style={s.title}>{empresa.nome}</h1>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4,flexWrap:'wrap'}}>
              <span style={{color:'#6b7280',fontSize:'0.82rem'}}>{empresa.cnpj||'—'}</span>
              <span style={{color:'#374151'}}>·</span>
              <span style={{background:`${corGrupo}18`,color:corGrupo,border:`1px solid ${corGrupo}30`,
                borderRadius:6,padding:'2px 8px',fontSize:'0.7rem',fontWeight:600}}>
                {EMOJI_GRUPO[grupoGeral]} {LABEL_GRUPO[grupoGeral]}
              </span>
              <span style={{background:empresa.ativo?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)',
                color:empresa.ativo?'#34d399':'#f87171',
                border:`1px solid ${empresa.ativo?'rgba(52,211,153,0.3)':'rgba(248,113,113,0.3)'}`,
                borderRadius:6,padding:'2px 8px',fontSize:'0.7rem',fontWeight:600}}>
                {empresa.ativo?'● Ativa':'● Inativa'}
              </span>
              <span style={{background:'rgba(240,180,41,0.1)',color:'#f0b429',
                border:'1px solid rgba(240,180,41,0.2)',borderRadius:6,
                padding:'2px 8px',fontSize:'0.7rem',fontWeight:600}}>
                📦 Produto Agregado
              </span>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10}}>
          {sucesso&&<span style={{color:'#34d399',fontSize:'0.85rem',alignSelf:'center'}}>✅ Salvo!</span>}
          {editando ? (
            <>
              <button style={s.btnSec} onClick={()=>setEditando(false)}>Cancelar</button>
              <button style={s.btnPri} onClick={salvar} disabled={salvando}>
                {salvando?'Salvando...':'💾 Salvar'}
              </button>
            </>
          ) : (
            <button style={s.btnPri} onClick={()=>setEditando(true)}>✏️ Editar</button>
          )}
        </div>
      </div>

      {/* KPIs financeiros */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:24}}>
        {[
          {label:'Boleto Acum.',  val:fmt(totalBoleto), cor:'#34d399'},
          {label:'Custo Acum.',   val:fmt(totalCusto),  cor:'#f87171'},
          {label:'Lucro Acum.',   val:fmt(totalLucro),  cor:totalLucro>=0?'#34d399':'#f87171'},
          {label:'Meses',         val:mesesArray.length, cor:'#60a5fa'},
          {label:'Contratos',     val:contratos.length,  cor:'#a78bfa'},
        ].map(k=>(
          <div key={k.label} style={{background:'#161a26',border:`1px solid ${k.cor}22`,borderRadius:14,padding:'16px 20px'}}>
            <div style={{color:'#6b7280',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:'1.2rem',fontWeight:800,color:k.cor}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

        {/* Coluna esquerda */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Dados cadastrais */}
          <div style={s.card}>
            <div style={s.cardTitle}>📋 Dados Cadastrais</div>
            <div style={{marginTop:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={s.fieldLabel}>Nome da Empresa</div>
                {editando
                  ? <input style={s.input} value={form.nome} onChange={e=>setF('nome',e.target.value)}/>
                  : <div style={s.fieldVal}>{empresa.nome}</div>}
              </div>
              <div>
                <div style={s.fieldLabel}>CNPJ</div>
                <div style={s.fieldVal}>{empresa.cnpj||'—'}</div>
              </div>
              <div>
                <div style={s.fieldLabel}>Data de Cadastro</div>
                <div style={s.fieldVal}>{fmtDate(empresa.data_cadastro)}</div>
              </div>
              <div>
                <div style={s.fieldLabel}>Status</div>
                {editando
                  ? <select style={s.select} value={String(form.ativo)} onChange={e=>setF('ativo',e.target.value==='true')}>
                      <option value="true">✅ Ativa</option>
                      <option value="false">❌ Inativa</option>
                    </select>
                  : <span style={{background:empresa.ativo?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)',
                      color:empresa.ativo?'#34d399':'#f87171',borderRadius:6,padding:'3px 10px',fontSize:'0.8rem',fontWeight:600}}>
                      {empresa.ativo?'Ativa':'Inativa'}
                    </span>}
              </div>
              <div>
                <div style={s.fieldLabel}>Consultor Principal</div>
                {editando
                  ? <select style={s.select} value={form.consultor_principal_id} onChange={e=>setF('consultor_principal_id',e.target.value)}>
                      <option value="">— Selecionar —</option>
                      {consultores.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  : <div style={s.fieldVal}>{empresa.consultor_principal?.nome||'—'}</div>}
              </div>
              <div>
                <div style={s.fieldLabel}>Consultor Agregado</div>
                {editando
                  ? <select style={s.select} value={form.consultor_agregado_id} onChange={e=>setF('consultor_agregado_id',e.target.value)}>
                      <option value="">— Nenhum —</option>
                      {consultores.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  : <div style={s.fieldVal}>{empresa.consultor_agregado?.nome||'—'}</div>}
              </div>
            </div>
          </div>

          {/* Contratos / Acordo Comercial */}
          <div style={s.card}>
            <div style={s.cardTitle}>🤝 Acordo Comercial</div>
            {contratos.length === 0
              ? <div style={{color:'#4b5563',fontSize:'0.85rem',marginTop:12}}>Nenhum contrato cadastrado</div>
              : contratos.map((c,ci) => {
                const prods = [c.produto_1,c.produto_2,c.produto_3].filter(Boolean);
                const totalVidas = c.titulares + c.dependentes;

                // Custo calculado
                let custoCalc = 0;
                prods.forEach(p => {
                  const nomeLower = p.nome?.toLowerCase()||'';
                  const vidas = totalVidas;
                  if (nomeLower.includes('wellhub')||nomeLower.includes('gympass')) {
                    const temDep = c.dependentes>0;
                    const tabela = temDep
                      ? [[20,11.99],[100,9.99],[250,8.99],[500,7.99],[999999,6.99]]
                      : [[20,9.99],[100,7.99],[250,6.99],[500,5.99],[999999,4.99]];
                    const pepm = tabela.find(([lim])=>vidas<=lim)?.[1]||4.99;
                    custoCalc += Math.max(100, vidas * pepm);
                  } else if (nomeLower.includes('total pass')) {
                    custoCalc += Math.max(200, vidas * 5.85);
                  } else {
                    custoCalc += vidas * (p.custo||0);
                  }
                });

                const valorBoleto = (c.valor_cobrado_titular_p1||0)*c.titulares
                  + (c.valor_cobrado_dependente_p1||0)*c.dependentes;
                const lucroContrato = valorBoleto - custoCalc;
                const grupoContrato = valorBoleto===0?'retencao':lucroContrato<0?'subsidio':'lucrativo';
                const corC = COR_GRUPO[grupoContrato];

                return (
                  <div key={c.id} style={{marginTop:ci===0?16:12,background:'rgba(255,255,255,0.03)',
                    border:`1px solid ${corC}25`,borderRadius:12,padding:'16px 20px'}}>
                    {/* Header contrato */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontWeight:700,fontSize:'0.9rem'}}>
                          {c.is_combo?'🔗 Combo':('📦 '+prods[0]?.nome)}
                        </span>
                        {c.combo_nome&&<span style={{color:'#6b7280',fontSize:'0.8rem'}}>{c.combo_nome}</span>}
                      </div>
                      <span style={{background:`${corC}18`,color:corC,border:`1px solid ${corC}30`,
                        borderRadius:6,padding:'2px 8px',fontSize:'0.7rem',fontWeight:700}}>
                        {EMOJI_GRUPO[grupoContrato]} {LABEL_GRUPO[grupoContrato]}
                      </span>
                    </div>

                    {/* Produtos do combo */}
                    {prods.length>1&&(
                      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                        {prods.map((p,pi)=>(
                          <span key={pi} style={{background:'rgba(240,180,41,0.08)',color:'#f0b429',
                            border:'1px solid rgba(240,180,41,0.2)',borderRadius:6,
                            padding:'2px 10px',fontSize:'0.75rem',fontWeight:600}}>
                            {p.nome}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Grid de valores */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:14}}>
                      {[
                        {label:'Titulares',        val:c.titulares,            cor:'#e8eaf0'},
                        {label:'Dependentes',      val:c.dependentes,          cor:'#e8eaf0'},
                        {label:'Total Vidas',      val:totalVidas,             cor:'#60a5fa'},
                        {label:'Vl. Cobrado/Tit.', val:fmt(c.valor_cobrado_titular_p1||0),   cor:'#34d399'},
                        {label:'Vl. Cobrado/Dep.', val:fmt(c.valor_cobrado_dependente_p1||0),cor:'#34d399'},
                        {label:'Boleto Estimado',  val:fmt(valorBoleto),       cor:'#34d399'},
                        ...prods.map(p=>({
                          label:`Custo/vida (${p.nome?.split(' ')[0]})`,
                          val: p.nome?.toLowerCase().includes('wellhub')||p.nome?.toLowerCase().includes('gympass')
                            ? 'Tabela PEPM' : fmt(p.custo||0),
                          cor:'#f87171',
                        })),
                        {label:'Custo Total Est.', val:fmt(custoCalc),         cor:'#f87171'},
                        {label:'Lucro Estimado',   val:fmt(lucroContrato),     cor:lucroContrato>=0?'#34d399':'#f87171'},
                      ].map(({label,val,cor})=>(
                        <div key={label}>
                          <div style={{color:'#4b5563',fontSize:'0.62rem',textTransform:'uppercase',
                            letterSpacing:0.8,marginBottom:3}}>{label}</div>
                          <div style={{fontWeight:700,fontSize:'0.85rem',color:cor}}>{val}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{color:'#4b5563',fontSize:'0.7rem',borderTop:'1px solid rgba(255,255,255,0.05)',
                      paddingTop:8,marginTop:4}}>
                      Início: {fmtDate(c.data_inicio)} · Contrato ID: {c.id?.substring(0,8)}...
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Coluna direita */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Fechamentos mensais */}
          <div style={s.card}>
            <div style={s.cardTitle}>📊 Histórico de Fechamentos</div>
            {mesesArray.length === 0
              ? <div style={{color:'#4b5563',fontSize:'0.85rem',marginTop:12}}>Nenhum fechamento importado ainda</div>
              : (
                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:10}}>
                  {mesesArray.map(([mes, dados])=>{
                    const cor = COR_GRUPO[dados.grupo];
                    const margem = dados.boleto>0?(dados.lucro/dados.boleto)*100:0;
                    return (
                      <div key={mes} style={{background:'rgba(255,255,255,0.03)',
                        border:`1px solid ${cor}25`,borderRadius:10,padding:'12px 16px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                          <span style={{fontWeight:700,color:'#e8eaf0'}}>{fmtMes(mes+'-01')}</span>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <span style={{color:'#4b5563',fontSize:'0.72rem'}}>{dados.vidas} vidas</span>
                            <span style={{background:`${cor}18`,color:cor,borderRadius:5,
                              padding:'1px 8px',fontSize:'0.68rem',fontWeight:700}}>
                              {EMOJI_GRUPO[dados.grupo]} {LABEL_GRUPO[dados.grupo]}
                            </span>
                          </div>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                          {[
                            {l:'Boleto',v:fmt(dados.boleto),c:'#34d399'},
                            {l:'Custo',v:fmt(dados.custo),c:'#f87171'},
                            {l:'Lucro',v:fmt(dados.lucro),c:dados.lucro>=0?'#34d399':'#f87171'},
                            {l:'Margem',v:`${margem.toFixed(1)}%`,c:margem>0?'#34d399':margem<0?'#f87171':'#6b7280'},
                          ].map(({l,v,c})=>(
                            <div key={l}>
                              <div style={{color:'#4b5563',fontSize:'0.6rem',textTransform:'uppercase',letterSpacing:0.8,marginBottom:2}}>{l}</div>
                              <div style={{fontWeight:700,fontSize:'0.82rem',color:c}}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {/* Barra de margem */}
                        <div style={{marginTop:10,background:'rgba(255,255,255,0.05)',borderRadius:4,height:5,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${Math.min(Math.max(margem,0),100)}%`,
                            background:cor,borderRadius:4,transition:'width 0.5s'}}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>

          {/* Histórico / Gestão */}
          <div style={s.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={s.cardTitle}>📝 Gestão & Histórico</div>
              <button style={s.btnPri} onClick={()=>setAdicionando(v=>!v)}>
                {adicionando?'✕ Cancelar':'+ Registrar'}
              </button>
            </div>

            {/* Form nova ocorrência */}
            {adicionando&&(
              <div style={{background:'rgba(240,180,41,0.05)',border:'1px solid rgba(240,180,41,0.15)',
                borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <div style={s.fieldLabel}>Tipo</div>
                    <select style={s.select} value={novaOco.tipo} onChange={e=>setNovaOco(o=>({...o,tipo:e.target.value}))}>
                      {Object.entries(TIPO_CONFIG).map(([k,v])=>(
                        <option key={k} value={k}>{v.icon} {v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={s.fieldLabel}>Título *</div>
                    <input style={s.input} placeholder="Resumo do registro"
                      value={novaOco.titulo} onChange={e=>setNovaOco(o=>({...o,titulo:e.target.value}))}/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={s.fieldLabel}>Detalhes</div>
                  <textarea style={{...s.input,height:72,resize:'vertical'}}
                    placeholder="Informações adicionais..."
                    value={novaOco.descricao} onChange={e=>setNovaOco(o=>({...o,descricao:e.target.value}))}/>
                </div>
                <button style={s.btnPri} onClick={salvarOcorrencia} disabled={salvandoOco||!novaOco.titulo.trim()}>
                  {salvandoOco?'Salvando...':'💾 Salvar Registro'}
                </button>
              </div>
            )}

            {/* Lista de ocorrências */}
            <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
              {historico.length===0
                ? <div style={{color:'#4b5563',fontSize:'0.85rem',textAlign:'center',padding:24}}>
                    Nenhum registro ainda. Clique em "+ Registrar" para adicionar.
                  </div>
                : historico.map(h=>{
                  const tp = TIPO_CONFIG[h.tipo]||TIPO_CONFIG.outro;
                  const dt = new Date(h.criado_em);
                  const dtStr = `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
                  return (
                    <div key={h.id} style={{background:'rgba(255,255,255,0.02)',
                      border:`1px solid ${tp.cor}20`,borderRadius:10,padding:'12px 14px',
                      display:'flex',gap:12,alignItems:'flex-start'}}>
                      <span style={{fontSize:'1.1rem',marginTop:1}}>{tp.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                          <div>
                            <span style={{fontWeight:600,fontSize:'0.85rem'}}>{h.titulo}</span>
                            <span style={{background:`${tp.cor}18`,color:tp.cor,borderRadius:4,
                              padding:'1px 6px',fontSize:'0.65rem',fontWeight:600,marginLeft:8}}>
                              {tp.label}
                            </span>
                          </div>
                          <button onClick={()=>deletarOcorrencia(h.id)}
                            style={{background:'none',border:'none',color:'#374151',cursor:'pointer',
                              fontSize:'0.8rem',padding:'0 4px',flexShrink:0}}>✕</button>
                        </div>
                        {h.descricao&&<div style={{color:'#6b7280',fontSize:'0.8rem',marginTop:4,lineHeight:1.5}}>{h.descricao}</div>}
                        <div style={{color:'#374151',fontSize:'0.7rem',marginTop:5}}>{dtStr}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:       {maxWidth:1300,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:     {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:16},
  tag:        {color:'#f0b429',fontWeight:800,fontSize:'0.85rem',letterSpacing:2,marginBottom:6,textTransform:'uppercase'},
  title:      {fontSize:'1.6rem',fontWeight:700,margin:'0 0 4px'},
  btnBack:    {background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'8px 14px',color:'#9ca3af',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit'},
  btnPri:     {background:'#f0b429',color:'#000',border:'none',borderRadius:10,padding:'9px 20px',fontWeight:700,cursor:'pointer',fontSize:'0.85rem',fontFamily:'inherit'},
  btnSec:     {background:'rgba(255,255,255,0.07)',color:'#e8eaf0',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'9px 20px',fontWeight:600,cursor:'pointer',fontSize:'0.85rem',fontFamily:'inherit'},
  card:       {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:24},
  cardTitle:  {fontSize:'0.95rem',fontWeight:700},
  fieldLabel: {color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:5},
  fieldVal:   {fontSize:'0.9rem',fontWeight:500,color:'#e8eaf0'},
  input:      {background:'#1e2235',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',width:'100%',outline:'none',boxSizing:'border-box'},
  select:     {background:'#1e2235',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'8px 12px',color:'#e8eaf0',fontSize:'0.85rem',fontFamily:'inherit',width:'100%',outline:'none'},
  spin:       {width:36,height:36,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 16px',animation:'spin 0.8s linear infinite'},
};
