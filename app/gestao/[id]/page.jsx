'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = (d) => { if(!d) return '—'; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; };
const fmtDT   = (d) => {
  if(!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};

const COR_CAT = {
  'Benefícios':  { bg:'#eff6ff', text:'#2563eb', border:'#bfdbfe' },
  'Bônus':       { bg:'#f5f3ff', text:'#7c3aed', border:'#ddd6fe' },
  'Convênio':    { bg:'#f0fdf4', text:'#16a34a', border:'#86efac' },
  'Mobilidade':  { bg:'#fff7ed', text:'#ea580c', border:'#fed7aa' },
  'Taxa Negativa':{ bg:'#fef2f2', text:'#dc2626', border:'#fca5a5' },
};

const TIPO_CRM = {
  contato:    { icon:'📞', label:'Contato',     cor:'#2563eb' },
  prazo:      { icon:'⏳', label:'Prazo Extra',  cor:'#f0b429' },
  juros:      { icon:'💸', label:'Juros/Boleto', cor:'#7c3aed' },
  reclamacao: { icon:'⚠️', label:'Reclamação',  cor:'#dc2626' },
  negociacao: { icon:'🤝', label:'Negociação',  cor:'#16a34a' },
  upsell:     { icon:'📈', label:'Up-sell',      cor:'#0891b2' },
  outro:      { icon:'📌', label:'Outro',        cor:'#6b7280' },
};

export default function GestaoEmpresaDetalhe({ params }) {
  const router = useRouter();
  const id     = params?.id;

  const [empresa,    setEmpresa]    = useState(null);
  const [form,       setForm]       = useState(null);
  const [historico,  setHistorico]  = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [ajustes,    setAjustes]    = useState([]); // ajustes de valor por mês
  const [editandoMes, setEditandoMes] = useState(null); // competencia em edição
  const [ajusteForm, setAjusteForm] = useState({ valor:'', motivo:'upsell', observacao:'' });
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [sucesso,    setSucesso]    = useState(false);
  const [erro,       setErro]       = useState('');
  const [editando,   setEditando]   = useState(false);
  const [abaAtiva,   setAbaAtiva]   = useState('crm');

  const [novaOco,    setNovaOco]    = useState({ tipo:'contato', titulo:'', descricao:'' });
  const [addCRM,     setAddCRM]     = useState(false);
  const [salvandoCRM,setSalvandoCRM]= useState(false);

  const [consultores,setConsultores]= useState([]);
  const [parceiros,  setParceiros]  = useState([]);
  const [produtos,   setProdutos]   = useState([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
    setLoading(true);
    const [
      { data: emp },
      { data: cons },
      { data: parc },
      { data: prods },
      { data: hist },
      { data: movs },
      { data: ajms, error: ajmError },
    ] = await Promise.all([
      supabase.from('empresas').select(`
        *, consultor_principal:consultor_principal_id(id,nome,gestor),
        consultor_agregado:consultor_agregado_id(id,nome),
        consultor_agregado_2:consultor_agregado_2_id(id,nome),
        parceiro:parceiro_id(id,nome)
      `).eq('id', id).single(),
      supabase.from('consultores').select('id,nome,gestor').eq('ativo',true).order('nome'),
      supabase.from('parceiros').select('id,nome').order('nome'),
      supabase.from('produtos').select('id,nome,peso').order('nome'),
      supabase.from('historico_empresa').select('*').eq('empresa_id',id).order('criado_em',{ascending:false}),
      supabase.from('liberacoes').select('competencia,total_liberado').eq('produto_id', emp?.produto_id || 0).order('competencia'),
      supabase.from('ajustes_movimentacao').select('*').eq('empresa_id', id).order('competencia').throwOnError(false),
    ]);

    setEmpresa(emp);
    setConsultores(cons||[]);
    setParceiros(parc||[]);
    setProdutos(prods||[]);
    setHistorico(hist||[]);
    setMovimentos(movs||[]);
    setAjustes(ajmError ? [] : (ajms||[])); // tabela pode não existir ainda

    if(emp) setForm({
      potencial_movimentacao: emp.potencial_movimentacao||0,
      categoria:              emp.categoria||'',
      produto_contratado:     emp.produto_contratado||'',
      peso_categoria:         emp.peso_categoria||1,
      taxa_negativa:          emp.taxa_negativa||0,
      taxa_positiva:          emp.taxa_positiva||0,
      consultor_principal_id: emp.consultor_principal_id||'',
      consultor_agregado_id:  emp.consultor_agregado_id||'',
      consultor_agregado_2_id:emp.consultor_agregado_2_id||'',
      parceiro_id:            emp.parceiro_id||'',
      ativo:                  emp.ativo??true,
    });
    setLoading(false);
  }

  // Recarrega movimentos quando empresa carrega
  useEffect(() => {
    if(empresa?.produto_id) {
      supabase.from('liberacoes').select('competencia,total_liberado')
        .eq('produto_id', empresa.produto_id).order('competencia')
        .then(({data}) => setMovimentos(data||[]));
    }
  }, [empresa?.produto_id]);

  async function salvar() {
    setSalvando(true); setErro(''); setSucesso(false);
    try {
      const payload = {
        potencial_movimentacao:  parseFloat(form.potencial_movimentacao)||0,
        categoria:               form.categoria,
        produto_contratado:      form.produto_contratado,
        peso_categoria:          parseFloat(form.peso_categoria)||1,
        taxa_negativa:           parseFloat(form.taxa_negativa)||0,
        taxa_positiva:           parseFloat(form.taxa_positiva)||0,
        consultor_principal_id:  form.consultor_principal_id||null,
        consultor_agregado_id:   form.consultor_agregado_id||null,
        consultor_agregado_2_id: form.consultor_agregado_2_id||null,
        parceiro_id:             form.parceiro_id||null,
        ativo:                   form.ativo,
      };
      const { error } = await supabase.from('empresas').update(payload).eq('id',id);
      if(error) throw error;
      setSucesso(true); setEditando(false);
      await carregar();
      setTimeout(()=>setSucesso(false),3000);
    } catch(err) { setErro(err.message); }
    setSalvando(false);
  }

  async function salvarCRM() {
    if(!novaOco.titulo.trim()) return;
    setSalvandoCRM(true);
    await supabase.from('historico_empresa').insert({
      empresa_id: id,
      tipo:       novaOco.tipo,
      titulo:     novaOco.titulo.trim(),
      descricao:  novaOco.descricao.trim()||null,
    });
    setNovaOco({tipo:'contato',titulo:'',descricao:''});
    setAddCRM(false);
    const {data} = await supabase.from('historico_empresa').select('*').eq('empresa_id',id).order('criado_em',{ascending:false});
    setHistorico(data||[]);
    setSalvandoCRM(false);
  }

  async function deletarCRM(ocId) {
    if(!confirm('Remover este registro?')) return;
    await supabase.from('historico_empresa').delete().eq('id',ocId);
    setHistorico(h=>h.filter(x=>x.id!==ocId));
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Mapa de ajustes por competencia
  const ajusteMap = Object.fromEntries(ajustes.map(a => [a.competencia?.substring(0,10), a]));

  async function salvarAjuste(competencia, valorOriginal) {
    if (!ajusteForm.valor) return;
    setSalvandoAjuste(true);
    const comp = competencia?.substring(0,10);
    const payload = {
      empresa_id:        id,
      produto_id:        empresa.produto_id,
      competencia:       comp,
      valor_original:    valorOriginal,
      valor_considerado: parseFloat(ajusteForm.valor),
      motivo:            ajusteForm.motivo,
      observacao:        ajusteForm.observacao || null,
    };
    const { error } = await supabase.from('ajustes_movimentacao')
      .upsert(payload, { onConflict:'empresa_id,competencia' });
    if (!error) {
      const { data } = await supabase.from('ajustes_movimentacao').select('*').eq('empresa_id', id).order('competencia');
      setAjustes(data||[]);
      setEditandoMes(null);
      setAjusteForm({ valor:'', motivo:'upsell', observacao:'' });
    }
    setSalvandoAjuste(false);
  }

  async function removerAjuste(competencia) {
    if (!confirm('Remover ajuste? O valor original será considerado novamente.')) return;
    const comp = competencia?.substring(0,10);
    await supabase.from('ajustes_movimentacao').delete().eq('empresa_id', id).eq('competencia', comp);
    setAjustes(a => a.filter(x => x.competencia?.substring(0,10) !== comp));
  }
  const fmtMes = (d) => {
    if(!d) return '—';
    const [y,m] = d.split('-');
    const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${ms[parseInt(m)-1]}/${y}`;
  };

  if(loading) return (
    <div style={{...sp.page,display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}>
      <div style={{textAlign:'center'}}><div style={sp.spin}></div><div style={{color:'#8b92b0'}}>Carregando...</div></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if(!empresa) return (
    <div style={{...sp.page,textAlign:'center',paddingTop:80}}>
      <div style={{fontSize:'2.5rem',marginBottom:12}}>🔍</div>
      <div style={{color:'#f87171',fontWeight:600}}>Empresa não encontrada</div>
      <button style={{...sp.btnSec,marginTop:20}} onClick={()=>router.push('/gestao')}>← Voltar</button>
    </div>
  );

  const cor   = COR_CAT[empresa.categoria] || {bg:'#f9fafb',text:'#6b7280',border:'#e4e7ef'};
  const CATEGORIAS = ['Benefícios','Bônus','Convênio','Mobilidade','Taxa Negativa'];
  const totalMovimentado = movimentos.reduce((s,m)=>s+m.total_liberado,0);
  const mesesAtivos = movimentos.filter(m=>m.total_liberado>0).length;

  const abas = [
    { key:'crm',      label:'📝 CRM', badge: historico.length },
    { key:'dados',    label:'✏️ Dados Cadastrais' },
    { key:'movimentos',label:'📊 Movimentação' },
  ];

  return (
    <div style={sp.page}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        input:focus,select:focus,textarea:focus{border-color:#f0b429!important;outline:none;}
        .crm-item:hover{background:#f0f4ff!important;}
      `}</style>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={sp.header}>
        <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <button style={sp.btnBack} onClick={()=>router.push('/gestao')}>← Gestão</button>
          <div>
            <div style={sp.tag}>♠ Vegas Card · Gestão</div>
            <h1 style={sp.title}>{empresa.nome}</h1>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:6,flexWrap:'wrap'}}>
              <span style={{color:'#8b92b0',fontSize:'0.8rem'}}>ID {empresa.produto_id}</span>
              {empresa.cnpj && <><span style={{color:'#d1d5e8'}}>·</span><span style={{color:'#8b92b0',fontSize:'0.8rem'}}>{empresa.cnpj}</span></>}
              <span style={{background:cor.bg,color:cor.text,border:`1px solid ${cor.border}`,borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>{empresa.categoria}</span>
              <span style={{background:empresa.ativo?'rgba(22,163,74,0.08)':'rgba(220,38,38,0.08)',color:empresa.ativo?'#16a34a':'#dc2626',border:`1px solid ${empresa.ativo?'rgba(22,163,74,0.2)':'rgba(220,38,38,0.2)'}`,borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>
                {empresa.ativo ? '● Ativa' : '● Inativa'}
              </span>
            </div>
          </div>
        </div>

        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          {sucesso && <span style={{color:'#16a34a',fontSize:'0.85rem',fontWeight:600}}>✅ Salvo!</span>}
          {abaAtiva==='dados' && !editando && <button style={sp.btnPri} onClick={()=>setEditando(true)}>✏️ Editar Dados</button>}
          {abaAtiva==='dados' && editando && <>
            <button style={sp.btnSec} onClick={()=>{setEditando(false);setErro('');}}>Cancelar</button>
            <button style={sp.btnPri} onClick={salvar} disabled={salvando}>{salvando?'Salvando...':'💾 Salvar'}</button>
          </>}
        </div>
      </div>

      {erro && <div style={sp.erroBox}>❌ {erro}</div>}

      {/* ── Cards de resumo rápido ─────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Potencial Mensal</span>
          <span style={{...sp.resumoV,color:'#16a34a'}}>{fmt(empresa.potencial_movimentacao)}</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Resultado Esperado</span>
          <span style={{...sp.resumoV,color:'#f0b429'}}>{fmt((empresa.potencial_movimentacao||0)*(empresa.peso_categoria||1))}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>potencial × {((empresa.peso_categoria||1)*100).toFixed(0)}%</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Total Movimentado</span>
          <span style={{...sp.resumoV,color:'#2563eb'}}>{fmt(totalMovimentado)}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{mesesAtivos} meses ativos</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Consultor</span>
          <span style={{...sp.resumoV,fontSize:'0.9rem'}}>{empresa.consultor_principal?.nome||'—'}</span>
          {empresa.consultor_principal?.gestor && <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{empresa.consultor_principal.gestor}</span>}
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Ocorrências CRM</span>
          <span style={{...sp.resumoV,color: historico.length>0?'#2563eb':'#d1d5e8'}}>{historico.length}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{historico.length===0?'sem registros':'registradas'}</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Cidade / UF</span>
          <span style={{...sp.resumoV,fontSize:'0.9rem'}}>{empresa.cidade||'—'}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{empresa.estado||''}</span>
        </div>
      </div>

      {/* ── Abas ──────────────────────────────────────── */}
      <div style={{display:'flex',gap:6,marginBottom:20,borderBottom:'2px solid #e4e7ef',paddingBottom:0}}>
        {abas.map(a => (
          <button key={a.key}
            style={{background:'none',border:'none',borderBottom:`3px solid ${abaAtiva===a.key?'#f0b429':'transparent'}`,padding:'10px 18px',color:abaAtiva===a.key?'#b45309':'#8b92b0',fontWeight:abaAtiva===a.key?700:500,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,marginBottom:'-2px'}}
            onClick={()=>setAbaAtiva(a.key)}>
            {a.label}
            {a.badge > 0 && <span style={{background:'#eff6ff',color:'#2563eb',borderRadius:10,padding:'1px 7px',fontSize:'0.65rem',fontWeight:700}}>{a.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── ABA: CRM ──────────────────────────────────── */}
      {abaAtiva==='crm' && (
        <div style={sp.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div>
              <div style={sp.cardTitle}>📝 Histórico CRM</div>
              <div style={{color:'#8b92b0',fontSize:'0.78rem',marginTop:2}}>{historico.length} ocorrência{historico.length!==1?'s':''} registrada{historico.length!==1?'s':''}</div>
            </div>
            <button style={sp.btnPri} onClick={()=>setAddCRM(a=>!a)}>
              {addCRM ? '✕ Cancelar' : '+ Nova Ocorrência'}
            </button>
          </div>

          {/* Form nova ocorrência */}
          {addCRM && (
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:20,marginBottom:24}}>
              <div style={{display:'grid',gridTemplateColumns:'180px 1fr',gap:12,marginBottom:12}}>
                <div>
                  <label style={sp.label}>Tipo</label>
                  <select style={sp.select} value={novaOco.tipo} onChange={e=>setNovaOco(n=>({...n,tipo:e.target.value}))}>
                    <option value="contato">📞 Contato</option>
                    <option value="upsell">📈 Up-sell</option>
                    <option value="negociacao">🤝 Negociação</option>
                    <option value="prazo">⏳ Prazo Extra</option>
                    <option value="juros">💸 Juros / Boleto</option>
                    <option value="reclamacao">⚠️ Reclamação</option>
                    <option value="outro">📌 Outro</option>
                  </select>
                </div>
                <div>
                  <label style={sp.label}>Título *</label>
                  <input style={sp.input} placeholder="Ex: Identificado oportunidade de up-sell para Refeição"
                    value={novaOco.titulo} onChange={e=>setNovaOco(n=>({...n,titulo:e.target.value}))}
                    onKeyDown={e=>e.key==='Enter' && salvarCRM()} />
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={sp.label}>Detalhes / Observações</label>
                <textarea style={{...sp.input,height:80,resize:'vertical'}}
                  placeholder="Descreva detalhes, valores, próximos passos..."
                  value={novaOco.descricao} onChange={e=>setNovaOco(n=>({...n,descricao:e.target.value}))} />
              </div>
              <button style={{...sp.btnPri,opacity:!novaOco.titulo.trim()?0.5:1}}
                onClick={salvarCRM} disabled={salvandoCRM||!novaOco.titulo.trim()}>
                {salvandoCRM?'Salvando...':'💾 Salvar Ocorrência'}
              </button>
            </div>
          )}

          {/* Timeline */}
          {historico.length===0 ? (
            <div style={{textAlign:'center',padding:'48px 0',color:'#b0b7cc'}}>
              <div style={{fontSize:'2.5rem',marginBottom:12}}>📭</div>
              <div style={{fontWeight:600,marginBottom:4}}>Nenhuma ocorrência ainda</div>
              <div style={{fontSize:'0.82rem'}}>Clique em "+ Nova Ocorrência" para começar o acompanhamento</div>
            </div>
          ) : (
            <div style={{position:'relative',paddingLeft:32}}>
              {/* Linha vertical da timeline */}
              <div style={{position:'absolute',left:11,top:0,bottom:0,width:2,background:'#e4e7ef',borderRadius:2}}></div>

              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {historico.map((h,i) => {
                  const cfg = TIPO_CRM[h.tipo]||TIPO_CRM.outro;
                  return (
                    <div key={h.id} className="crm-item" style={{position:'relative',background:'#ffffff',border:'1px solid #e4e7ef',borderLeft:`3px solid ${cfg.cor}`,borderRadius:10,padding:'14px 18px',transition:'background 0.15s'}}>
                      {/* Ponto na timeline */}
                      <div style={{position:'absolute',left:-27,top:16,width:12,height:12,borderRadius:'50%',background:cfg.cor,border:'2px solid #ffffff',boxShadow:`0 0 0 2px ${cfg.cor}40`}}></div>

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontSize:'1.1rem'}}>{cfg.icon}</span>
                          <span style={{fontWeight:700,fontSize:'0.9rem',color:'#1a1d2e'}}>{h.titulo}</span>
                          <span style={{background:`${cfg.cor}15`,color:cfg.cor,border:`1px solid ${cfg.cor}30`,borderRadius:5,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase'}}>{cfg.label}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                          <span style={{color:'#8b92b0',fontSize:'0.72rem',whiteSpace:'nowrap'}}>{fmtDT(h.criado_em)}</span>
                          <button onClick={()=>deletarCRM(h.id)}
                            style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:6,padding:'3px 8px',color:'#dc2626',cursor:'pointer',fontSize:'0.7rem',fontFamily:'inherit'}}>✕</button>
                        </div>
                      </div>
                      {h.descricao && <p style={{color:'#4a5068',fontSize:'0.83rem',margin:0,lineHeight:1.6,paddingLeft:4}}>{h.descricao}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA: DADOS CADASTRAIS ─────────────────────── */}
      {abaAtiva==='dados' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

          {/* Info fixa */}
          <div style={sp.card}>
            <div style={sp.cardTitle}>📋 Informações Cadastrais</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
              {[
                ['CNPJ',           empresa.cnpj||'—'],
                ['Data Cadastro',  fmtDate(empresa.data_cadastro)],
                ['Cidade',         empresa.cidade||'—'],
                ['Estado',         empresa.estado||'—'],
                ['Cartões Emitidos',empresa.cartoes_emitidos||0],
                ['Dias de Prazo',  empresa.dias_prazo||'—'],
                ['Tipo Boleto',    empresa.tipo_boleto||'—'],
              ].map(([l,v])=>(
                <div key={l}>
                  <div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{l}</div>
                  <div style={{fontWeight:500,fontSize:'0.88rem'}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Produto & Financeiro */}
          <div style={sp.card}>
            <div style={sp.cardTitle}>💰 Produto & Financeiro</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
              {[
                ['Categoria',    editando ? <select style={sp.select} value={form.categoria} onChange={e=>set('categoria',e.target.value)}>{['Benefícios','Bônus','Convênio','Mobilidade','Taxa Negativa'].map(c=><option key={c} value={c}>{c}</option>)}</select> : <span style={{color:cor.text,fontWeight:600}}>{empresa.categoria}</span>],
                ['Produto',      editando ? <select style={sp.select} value={form.produto_contratado} onChange={e=>set('produto_contratado',e.target.value)}><option value="">— Selecione —</option>{produtos.map(p=><option key={p.id} value={p.nome}>{p.nome}</option>)}</select> : empresa.produto_contratado||'—'],
                ['Peso (%)',     editando ? <input style={sp.input} type="number" step="0.01" value={form.peso_categoria} onChange={e=>set('peso_categoria',e.target.value)}/> : <span style={{color:'#f0b429',fontWeight:600}}>{((empresa.peso_categoria||1)*100).toFixed(0)}%</span>],
                ['Potencial',   editando ? <input style={sp.input} type="number" value={form.potencial_movimentacao} onChange={e=>set('potencial_movimentacao',e.target.value)}/> : <span style={{color:'#16a34a',fontWeight:700}}>{fmt(empresa.potencial_movimentacao)}</span>],
                ['Taxa Positiva',editando ? <input style={sp.input} type="number" step="0.001" value={form.taxa_positiva} onChange={e=>set('taxa_positiva',e.target.value)}/> : <span style={{color:'#16a34a'}}>{empresa.taxa_positiva>0?`${(empresa.taxa_positiva*100).toFixed(2)}%`:'—'}</span>],
                ['Taxa Negativa',editando ? <input style={sp.input} type="number" step="0.001" value={form.taxa_negativa} onChange={e=>set('taxa_negativa',e.target.value)}/> : <span style={{color:empresa.taxa_negativa>0?'#dc2626':'#b0b7cc'}}>{empresa.taxa_negativa>0?`${(empresa.taxa_negativa*100).toFixed(2)}%`:'—'}</span>],
              ].map(([l,v])=>(
                <div key={l}>
                  <div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{l}</div>
                  <div style={{fontSize:'0.9rem'}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Equipe Comercial */}
          <div style={sp.card}>
            <div style={sp.cardTitle}>👥 Equipe Comercial</div>
            <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:16}}>
              {[
                ['Consultor Principal', 'consultor_principal_id', empresa.consultor_principal?.nome],
                ['Consultor Agregado 1','consultor_agregado_id',  empresa.consultor_agregado?.nome],
                ['Consultor Agregado 2','consultor_agregado_2_id',empresa.consultor_agregado_2?.nome],
              ].map(([l,k,nome])=>(
                <div key={l}>
                  <div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{l}</div>
                  {editando
                    ? <select style={sp.select} value={form[k]} onChange={e=>set(k,e.target.value)}>
                        <option value="">— Nenhum —</option>
                        {consultores.map(c=><option key={c.id} value={c.id}>{c.nome}{c.gestor?` (${c.gestor})`:''}</option>)}
                      </select>
                    : <span style={{fontWeight:k==='consultor_principal_id'?600:400}}>{nome||'—'}</span>}
                </div>
              ))}
              <div>
                <div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Parceiro Comercial</div>
                {editando
                  ? <select style={sp.select} value={form.parceiro_id} onChange={e=>set('parceiro_id',e.target.value)}>
                      <option value="">— Nenhum —</option>
                      {parceiros.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  : <span>{empresa.parceiro?.nome||'—'}</span>}
              </div>
            </div>
          </div>

          {/* Status */}
          <div style={sp.card}>
            <div style={sp.cardTitle}>⚙️ Status da Empresa</div>
            <div style={{marginTop:16}}>
              {editando ? (
                <div style={{display:'flex',gap:12}}>
                  <button onClick={()=>set('ativo',true)} style={{...sp.statusBtn,...(form.ativo?{background:'rgba(22,163,74,0.1)',border:'1px solid rgba(22,163,74,0.3)',color:'#16a34a'}:{})}}>✅ Ativa</button>
                  <button onClick={()=>set('ativo',false)} style={{...sp.statusBtn,...(!form.ativo?{background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626'}:{})}}>❌ Inativa</button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0'}}>
                  <div style={{width:14,height:14,borderRadius:'50%',background:empresa.ativo?'#16a34a':'#dc2626',boxShadow:`0 0 0 3px ${empresa.ativo?'rgba(22,163,74,0.2)':'rgba(220,38,38,0.2)'}`}}></div>
                  <span style={{fontWeight:700,fontSize:'1rem',color:empresa.ativo?'#16a34a':'#dc2626'}}>
                    {empresa.ativo?'Empresa Ativa':'Empresa Inativa'}
                  </span>
                </div>
              )}
              <p style={{color:'#8b92b0',fontSize:'0.78rem',marginTop:12,lineHeight:1.6}}>
                {empresa.ativo?'Aparece em todos os relatórios e dashboards.':'Oculta dos relatórios e dashboards ativos.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA: MOVIMENTAÇÃO ─────────────────────────── */}
      {abaAtiva==='movimentos' && (
        <div style={sp.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={sp.cardTitle}>📊 Histórico de Movimentação</div>
            <div style={{color:'#8b92b0',fontSize:'0.75rem'}}>Clique em ✏️ para ajustar o valor considerado no resultado</div>
          </div>
          {movimentos.length===0 ? (
            <div style={{textAlign:'center',padding:'48px 0',color:'#b0b7cc'}}>
              <div style={{fontSize:'2.5rem',marginBottom:12}}>📭</div>
              <div style={{fontWeight:600}}>Nenhuma movimentação registrada</div>
              <div style={{fontSize:'0.82rem',marginTop:4}}>Importe dados via Liberações ou Movimentação</div>
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
                {[
                  {label:'Total Bruto', val:fmt(totalMovimentado), bg:'#eff6ff', border:'#bfdbfe', cor:'#2563eb'},
                  {label:'Total Considerado', val:fmt(movimentos.reduce((s,m)=>{const comp=m.competencia?.substring(0,10);const aj=ajusteMap[comp];return s+(aj?aj.valor_considerado:m.total_liberado);},0)), bg:'#f0fdf4', border:'#86efac', cor:'#16a34a'},
                  {label:'Ajustes Ativos', val:ajustes.length, bg:'#fff7ed', border:'#fed7aa', cor:'#ea580c'},
                  {label:'Meses Ativos', val:`${mesesAtivos} de ${movimentos.length}`, bg:'#f5f3ff', border:'#ddd6fe', cor:'#7c3aed'},
                ].map(({label,val,bg,border,cor}) => (
                  <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:'12px 18px',flex:1,minWidth:140}}>
                    <div style={{color:cor,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{label}</div>
                    <div style={{fontWeight:800,fontSize:'1.2rem',color:cor}}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Tabela por mês com ajuste */}
              <div style={{border:'1px solid #e4e7ef',borderRadius:10,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                  <thead>
                    <tr style={{background:'#f9fafb'}}>
                      <th style={{padding:'10px 16px',textAlign:'left',color:'#8b92b0',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:0.5}}>Mês</th>
                      <th style={{padding:'10px 16px',textAlign:'right',color:'#8b92b0',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:0.5}}>Valor Bruto</th>
                      <th style={{padding:'10px 16px',textAlign:'right',color:'#8b92b0',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:0.5}}>Valor Considerado</th>
                      <th style={{padding:'10px 16px',textAlign:'left',color:'#8b92b0',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:0.5}}>Motivo / Obs.</th>
                      <th style={{padding:'10px 16px',textAlign:'center',color:'#8b92b0',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:0.5}}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map((m,i)=>{
                      const comp   = m.competencia?.substring(0,10);
                      const ajuste = ajusteMap[comp];
                      const valConsiderado = ajuste ? ajuste.valor_considerado : m.total_liberado;
                      const temAjuste = !!ajuste;
                      const editando = editandoMes === comp;
                      const MOTIVOS_LABEL = {upsell:'📈 Up-sell',ajuste:'✏️ Ajuste',negociacao:'🤝 Negociação',correcao:'🔧 Correção',outro:'📌 Outro'};

                      return (
                        <>
                          <tr key={comp} style={{borderTop:'1px solid #f0f2f8',background:temAjuste?'#fffbeb':i%2===0?'#ffffff':'#fafafa'}}>
                            <td style={{padding:'12px 16px',fontWeight:600}}>{fmtMes(m.competencia)}</td>
                            <td style={{padding:'12px 16px',textAlign:'right',color:'#6b7280',fontWeight:temAjuste?400:700}}>
                              {m.total_liberado>0?<span style={{textDecoration:temAjuste?'line-through':''}}>{fmt(m.total_liberado)}</span>:'—'}
                            </td>
                            <td style={{padding:'12px 16px',textAlign:'right',fontWeight:700,color:temAjuste?'#f0b429':'#16a34a',fontSize:'1rem'}}>
                              {valConsiderado>0?fmt(valConsiderado):'—'}
                              {temAjuste && <div style={{fontSize:'0.68rem',color:'#f0b429',fontWeight:400}}>ajustado</div>}
                            </td>
                            <td style={{padding:'12px 16px',maxWidth:220}}>
                              {temAjuste && (
                                <div>
                                  <span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:5,padding:'2px 8px',fontSize:'0.7rem',fontWeight:600}}>{MOTIVOS_LABEL[ajuste.motivo]||ajuste.motivo}</span>
                                  {ajuste.observacao && <div style={{color:'#6b7280',fontSize:'0.75rem',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ajuste.observacao}</div>}
                                </div>
                              )}
                            </td>
                            <td style={{padding:'12px 16px',textAlign:'center'}}>
                              <div style={{display:'flex',gap:6,justifyContent:'center'}}>
                                <button onClick={()=>{setEditandoMes(editando?null:comp);setAjusteForm({valor:temAjuste?ajuste.valor_considerado:m.total_liberado,motivo:ajuste?.motivo||'upsell',observacao:ajuste?.observacao||''});}}
                                  style={{background:editando?'rgba(240,180,41,0.15)':'#f5f6fa',border:`1px solid ${editando?'rgba(240,180,41,0.3)':'#e4e7ef'}`,borderRadius:7,padding:'5px 12px',color:editando?'#f0b429':'#4a5068',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                                  {editando?'✕ Cancelar':'✏️ Ajustar'}
                                </button>
                                {temAjuste && !editando && (
                                  <button onClick={()=>removerAjuste(comp)}
                                    style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:7,padding:'5px 10px',color:'#dc2626',cursor:'pointer',fontSize:'0.75rem',fontFamily:'inherit'}}>✕</button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {editando && (
                            <tr key={comp+'-edit'} style={{background:'#fffbeb',borderTop:'none'}}>
                              <td colSpan={5} style={{padding:'16px 20px'}}>
                                <div style={{background:'#ffffff',border:'1px solid #fde68a',borderRadius:10,padding:16}}>
                                  <div style={{fontSize:'0.78rem',fontWeight:700,color:'#b45309',marginBottom:12}}>
                                    ✏️ Ajustando {fmtMes(m.competencia)} — Valor bruto: {fmt(m.total_liberado)}
                                  </div>
                                  <div style={{display:'grid',gridTemplateColumns:'180px 200px 1fr',gap:12,alignItems:'end'}}>
                                    <div>
                                      <label style={{display:'block',color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Valor Considerado *</label>
                                      <input type="number" step="0.01" value={ajusteForm.valor}
                                        onChange={e=>setAjusteForm(f=>({...f,valor:e.target.value}))}
                                        style={{width:'100%',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',fontSize:'0.9rem',fontFamily:'inherit',boxSizing:'border-box',color:'#1a1d2e'}}
                                        placeholder="Ex: 5000.00" />
                                    </div>
                                    <div>
                                      <label style={{display:'block',color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Motivo *</label>
                                      <select value={ajusteForm.motivo} onChange={e=>setAjusteForm(f=>({...f,motivo:e.target.value}))}
                                        style={{width:'100%',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',fontSize:'0.88rem',fontFamily:'inherit',boxSizing:'border-box',color:'#1a1d2e',cursor:'pointer'}}>
                                        <option value="upsell">📈 Up-sell</option>
                                        <option value="ajuste">✏️ Ajuste de valor</option>
                                        <option value="negociacao">🤝 Negociação</option>
                                        <option value="correcao">🔧 Correção</option>
                                        <option value="outro">📌 Outro</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label style={{display:'block',color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Observação</label>
                                      <input value={ajusteForm.observacao} onChange={e=>setAjusteForm(f=>({...f,observacao:e.target.value}))}
                                        style={{width:'100%',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',fontSize:'0.88rem',fontFamily:'inherit',boxSizing:'border-box',color:'#1a1d2e'}}
                                        placeholder="Ex: Up-sell negociado em reunião 15/03 — novo valor R$5k" />
                                    </div>
                                  </div>
                                  <div style={{display:'flex',gap:10,marginTop:14,alignItems:'center'}}>
                                    <button onClick={()=>salvarAjuste(m.competencia,m.total_liberado)} disabled={salvandoAjuste||!ajusteForm.valor}
                                      style={{background:'#f0b429',color:'#000',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit',opacity:!ajusteForm.valor?0.5:1}}>
                                      {salvandoAjuste?'Salvando...':'💾 Salvar Ajuste'}
                                    </button>
                                    <span style={{color:'#8b92b0',fontSize:'0.75rem'}}>
                                      O valor bruto ({fmt(m.total_liberado)}) será mantido no histórico
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const sp = {
  page:       {maxWidth:1200,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#1a1d2e',background:'#f5f6fa',minHeight:'100vh'},
  header:     {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:16},
  tag:        {color:'#b45309',fontWeight:800,fontSize:'0.8rem',letterSpacing:2,marginBottom:6,textTransform:'uppercase'},
  title:      {fontSize:'1.6rem',fontWeight:700,margin:0},
  btnBack:    {background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 14px',color:'#4a5068',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit',whiteSpace:'nowrap'},
  btnPri:     {background:'#f0b429',color:'#000',border:'none',borderRadius:10,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'},
  btnSec:     {background:'#eaecf2',color:'#1a1d2e',border:'1px solid #e4e7ef',borderRadius:10,padding:'10px 18px',fontWeight:600,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'},
  erroBox:    {background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:10,padding:'12px 16px',marginBottom:20,color:'#dc2626',fontSize:'0.85rem'},
  resumoCard: {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',display:'flex',flexDirection:'column',gap:4},
  resumoL:    {color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1},
  resumoV:    {fontSize:'1.1rem',fontWeight:700,color:'#1a1d2e'},
  card:       {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:16,padding:24,marginBottom:0},
  cardTitle:  {fontSize:'0.72rem',fontWeight:700,color:'#8b92b0',textTransform:'uppercase',letterSpacing:1,marginBottom:0},
  label:      {display:'block',color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6,fontWeight:600},
  input:      {background:'#ffffff',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',color:'#1a1d2e',fontSize:'0.88rem',fontFamily:'inherit',width:'100%',boxSizing:'border-box'},
  select:     {background:'#ffffff',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',color:'#1a1d2e',fontSize:'0.88rem',fontFamily:'inherit',width:'100%',cursor:'pointer',boxSizing:'border-box'},
  statusBtn:  {background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:10,padding:'12px 24px',color:'#8b92b0',cursor:'pointer',fontWeight:600,fontSize:'0.88rem',fontFamily:'inherit',flex:1},
  spin:       {width:36,height:36,border:'3px solid #e4e7ef',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 16px',animation:'spin 0.8s linear infinite'},
};
