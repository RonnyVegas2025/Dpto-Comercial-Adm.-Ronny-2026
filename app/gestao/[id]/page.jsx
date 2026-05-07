'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct  = (v) => `${Number(v||0).toFixed(0)}%`;
const fmtDate = (d) => { if(!d) return '—'; const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; };
const fmtDT   = (d) => {
  if(!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};
const fmtMes  = (d) => {
  if(!d) return '—';
  const [y,m] = String(d).substring(0,7).split('-');
  return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`;
};

const COR_CAT = {
  'Benefícios':   { bg:'#eff6ff', text:'#2563eb', border:'#bfdbfe' },
  'Bônus':        { bg:'#f5f3ff', text:'#7c3aed', border:'#ddd6fe' },
  'Convênio':     { bg:'#f0fdf4', text:'#16a34a', border:'#86efac' },
  'Mobilidade':   { bg:'#fff7ed', text:'#ea580c', border:'#fed7aa' },
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

// ─── Calcula meta automática ───────────────────────────────────────────────
// Regra de peso:
//   Vegas Benefícios → peso do produto aplica na meta (ex: 30% → R$10k vira R$3k)
//   Todos os outros  → peso é só para previsão de faturamento; meta usa 100%
function calcularMetaAutomatica(empresa, movimentos, ajustes) {
  const cat     = (empresa?.categoria        || '').toLowerCase();
  const produto = (empresa?.produto_contratado || '').toLowerCase().trim();
  const isBenef = cat.includes('benefi') || cat.includes('bonus') || cat.includes('bônus');
  const isConv  = cat.includes('conv')   || cat.includes('mobil');
  if (!isBenef && !isConv) return null;

  const ajusteMap = Object.fromEntries(ajustes.map(a => [a.competencia?.substring(0,10), a]));

  // Peso só entra na meta se for especificamente "Vegas Benefícios"
  const isVegasBeneficios = produto === 'vegas benefícios' || produto === 'vegas beneficios';
  const peso = isVegasBeneficios ? (empresa?.peso_categoria ?? 1) : 1;
  const pct  = empresa?.pct_principal ?? 100;

  const comValor = movimentos
    .filter(m => m.total_liberado > 0)
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  if (comValor.length === 0) return null;

  let mesAlvo = null;
  if (isBenef) {
    mesAlvo = comValor[0]; // 1ª recarga
  } else {
    if (comValor.length < 3) return { pendente: true, progresso: comValor.length, precisam: 3, regra: 'convenio' };
    mesAlvo = comValor[2]; // 3ª liberação
  }

  const comp            = mesAlvo.competencia?.substring(0, 10);
  const aj              = ajusteMap[comp];
  const valorBruto      = mesAlvo.total_liberado;
  const valorConsiderado = aj ? aj.valor_considerado : valorBruto;

  // Valor meta = movimentação × peso do produto × % do consultor
  const valorMeta = Math.round(valorConsiderado * peso * (pct / 100) * 100) / 100;

  return {
    pendente:          false,
    comp,
    mesLabel:          fmtMes(comp),
    valorBruto,
    valorConsiderado,
    valorMeta,
    peso,
    pct,
    regra:             isBenef ? 'beneficio' : 'convenio',
    temAjuste:         !!aj,
  };
}

export default function GestaoEmpresaDetalhe({ params }) {
  const router = useRouter();
  const id     = params?.id;

  const [empresa,      setEmpresa]      = useState(null);
  const [form,         setForm]         = useState(null);
  const [historico,    setHistorico]    = useState([]);
  const [movimentos,   setMovimentos]   = useState([]);
  const [ajustes,      setAjustes]      = useState([]);
  const [valorMetas,   setValorMetas]   = useState([]);

  const [editandoMes,    setEditandoMes]    = useState(null);
  const [ajusteForm,     setAjusteForm]     = useState({ valor:'', motivo:'upsell', observacao:'' });
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);

  const [metaMes,      setMetaMes]      = useState(null);
  const [metaForm,     setMetaForm]     = useState({ valor:'', regra:'beneficio' });
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [erroMeta,     setErroMeta]     = useState('');

  const [aplicandoAuto,     setAplicandoAuto]     = useState(false);
  const [mesSelecionado,    setMesSelecionado]    = useState(null);   // troca manual do mês da meta
  const [trocandoMes,       setTrocandoMes]       = useState(false);  // mostra o select de troca
  const [inserindoValor,    setInserindoValor]    = useState(null);
  const [valorInserir,      setValorInserir]      = useState('');
  const [salvandoInserir,   setSalvandoInserir]   = useState(false);
  const [upsellMes,         setUpsellMes]         = useState(null);   // comp do mês em upsell
  const [salvandoUpsell,    setSalvandoUpsell]    = useState(false);
  const [removendoMeta, setRemovendoMeta] = useState(false);

  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [sucesso,   setSucesso]   = useState(false);
  const [erro,      setErro]      = useState('');
  const [editando,  setEditando]  = useState(false);
  const [abaAtiva,  setAbaAtiva]  = useState('crm');

  const [novaOco,    setNovaOco]    = useState({ tipo:'contato', titulo:'', descricao:'' });
  const [addCRM,     setAddCRM]     = useState(false);
  const [salvandoCRM,setSalvandoCRM]= useState(false);

  const [consultores, setConsultores] = useState([]);
  const [parceiros,   setParceiros]   = useState([]);
  const [produtos,    setProdutos]    = useState([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
    setLoading(true);
    const { data: emp } = await supabase.from('empresas').select(`
      *, consultor_principal:consultor_principal_id(id,nome,gestor),
      consultor_agregado:consultor_agregado_id(id,nome),
      consultor_agregado_2:consultor_agregado_2_id(id,nome),
      parceiro:parceiro_id(id,nome)
    `).eq('id', id).single();

    const [
      { data: cons },
      { data: parc },
      { data: prods },
      { data: hist },
      { data: movs },
      { data: ajms },
      { data: vmetas },
    ] = await Promise.all([
      supabase.from('consultores').select('id,nome,gestor').eq('ativo',true).order('nome'),
      supabase.from('parceiros').select('id,nome').order('nome'),
      supabase.from('produtos').select('id,nome,peso').order('nome'),
      supabase.from('historico_empresa').select('*').eq('empresa_id',id).order('criado_em',{ascending:false}),
      supabase.from('liberacoes').select('competencia,total_liberado').eq('produto_id', emp?.produto_id||0).order('competencia'),
      supabase.from('ajustes_movimentacao').select('*').eq('empresa_id', id).order('competencia'),
      // Busca sem campo observacao para evitar erro de schema
      supabase.from('valor_meta_empresa')
        .select('id,empresa_id,produto_id,consultor_id,competencia_meta,valor_bruto,valor_considerado,valor_meta,pct_consultor,regra,mes_sequencia')
        .eq('empresa_id', id).order('competencia_meta'),
    ]);

    setEmpresa(emp);
    setConsultores(cons||[]);
    setParceiros(parc||[]);
    setProdutos(prods||[]);
    setHistorico(hist||[]);
    setMovimentos(movs||[]);
    setAjustes(ajms||[]);
    setValorMetas(vmetas||[]);

    if(emp) setForm({
      potencial_movimentacao:  emp.potencial_movimentacao||0,
      categoria:               emp.categoria||'',
      produto_contratado:      emp.produto_contratado||'',
      peso_categoria:          emp.peso_categoria||1,
      taxa_negativa:           emp.taxa_negativa||0,
      taxa_positiva:           emp.taxa_positiva||0,
      consultor_principal_id:  emp.consultor_principal_id||'',
      consultor_agregado_id:   emp.consultor_agregado_id||'',
      consultor_agregado_2_id: emp.consultor_agregado_2_id||'',
      parceiro_id:             emp.parceiro_id||'',
      ativo:                   emp.ativo??true,
      pct_principal:           emp.pct_principal  ?? 100,
      pct_agregado_1:          emp.pct_agregado_1 ?? 0,
      pct_agregado_2:          emp.pct_agregado_2 ?? 0,
      divisao_manual:          emp.divisao_manual ?? false,
    });
    setLoading(false);
  }

  useEffect(() => {
    if(empresa?.produto_id) {
      supabase.from('liberacoes').select('competencia,total_liberado')
        .eq('produto_id', empresa.produto_id).order('competencia')
        .then(({data}) => setMovimentos(data||[]));
    }
  }, [empresa?.produto_id]);

  const metaAuto = useMemo(
    () => calcularMetaAutomatica(empresa, movimentos, ajustes),
    [empresa, movimentos, ajustes]
  );

  const metaAutoGravada = useMemo(() => {
    if (!metaAuto || metaAuto.pendente) return false;
    return valorMetas.some(v => v.competencia_meta?.substring(0,10) === metaAuto.comp);
  }, [metaAuto, valorMetas]);

  const ajusteMap = Object.fromEntries(ajustes.map(a => [a.competencia?.substring(0,10), a]));
  const metaMap   = Object.fromEntries(valorMetas.map(v => [v.competencia_meta?.substring(0,10), v]));

  // Calcula meses zerados esperados para Convênio/Mobilidade
  // São os 3 meses corridos que deveriam aparecer mas não têm registro
  const mesesZeradosEsperados = useMemo(() => {
    const isConvMob = (empresa?.categoria||'').toLowerCase().match(/conv|mobil/);
    if (!isConvMob) return [];
    const comValor = movimentos.filter(m => m.total_liberado > 0).sort((a,b) => a.competencia.localeCompare(b.competencia));
    if (comValor.length === 0) return [];
    // 3 meses corridos a partir do 1º com valor
    const [y0,m0] = comValor[0].competencia.substring(0,7).split('-').map(Number);
    const compsMov = new Set(movimentos.map(m => m.competencia?.substring(0,7)));
    const zerados = [];
    for (let i = 0; i < 3; i++) {
      const d    = new Date(y0, m0-1+i, 1);
      const comp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!compsMov.has(comp)) {
        // Só mostra se o mês já passou
        const hoje = new Date();
        const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
        if (comp < mesAtual) zerados.push(comp);
      }
    }
    return zerados;
  }, [empresa, movimentos]);
  const totalMetaApurado = valorMetas.reduce((s,v) => s+(v.valor_meta||0), 0);

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
        pct_principal:           form.pct_principal,
        pct_agregado_1:          form.pct_agregado_1,
        pct_agregado_2:          form.pct_agregado_2,
        divisao_manual:          form.divisao_manual,
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
      empresa_id: id, tipo: novaOco.tipo,
      titulo: novaOco.titulo.trim(), descricao: novaOco.descricao.trim()||null,
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

  async function salvarAjuste(competencia, valorOriginal) {
    if (!ajusteForm.valor) return;
    setSalvandoAjuste(true);
    const comp = competencia?.substring(0,10);
    const payload = {
      empresa_id: id, produto_id: empresa.produto_id, competencia: comp,
      valor_original: valorOriginal, valor_considerado: parseFloat(ajusteForm.valor),
      motivo: ajusteForm.motivo, observacao: ajusteForm.observacao||null,
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
    if (!confirm('Remover ajuste?')) return;
    const comp = competencia?.substring(0,10);
    await supabase.from('ajustes_movimentacao').delete().eq('empresa_id', id).eq('competencia', comp);
    setAjustes(a => a.filter(x => x.competencia?.substring(0,10) !== comp));
  }

  // ── Salvar meta: delete → insert (sem campo observacao) ──────────────────
  async function salvarMetaComp(comp, payload) {
    setErroMeta('');
    await supabase.from('valor_meta_empresa')
      .delete().eq('empresa_id', id).eq('competencia_meta', comp);
    const { error } = await supabase.from('valor_meta_empresa').insert(payload);
    if (error) {
      setErroMeta('Erro ao salvar: ' + error.message);
      return false;
    }
    const { data } = await supabase.from('valor_meta_empresa')
      .select('id,empresa_id,produto_id,consultor_id,competencia_meta,valor_bruto,valor_considerado,valor_meta,pct_consultor,regra,mes_sequencia')
      .eq('empresa_id', id).order('competencia_meta');
    setValorMetas(data||[]);
    return true;
  }

  // Payload base — apenas colunas que existem na tabela (sem observacao)
  function montarPayload(comp, valorBruto, valorConsiderado, valorMeta, regra, mesSeq) {
    return {
      empresa_id:        id,
      produto_id:        empresa?.produto_id,
      consultor_id:      empresa?.consultor_principal_id || null,
      competencia_meta:  comp,
      valor_bruto:       valorBruto,
      valor_considerado: valorConsiderado,
      valor_meta:        valorMeta,
      pct_consultor:     empresa?.pct_principal ?? 100,
      regra,
      mes_sequencia:     mesSeq,
    };
  }

  async function aplicarMetaAuto() {
    if (!metaAuto || metaAuto.pendente) return;
    setAplicandoAuto(true);
    const payload = montarPayload(
      metaAuto.comp,
      metaAuto.valorBruto,
      metaAuto.valorConsiderado,
      metaAuto.valorMeta,
      metaAuto.regra,
      metaAuto.regra === 'beneficio' ? 1 : 3
    );
    await salvarMetaComp(metaAuto.comp, payload);
    setAplicandoAuto(false);
  }

  async function salvarMetaManual(comp, valorBruto) {
    if (!metaForm.valor) return;
    setSalvandoMeta(true);
    const payload = montarPayload(
      comp,
      valorBruto,
      valorBruto,
      parseFloat(metaForm.valor),
      metaForm.regra,
      metaForm.regra === 'beneficio' ? 1 : metaForm.regra === 'convenio' ? 3 : 0
    );
    const ok = await salvarMetaComp(comp, payload);
    if (ok) { setMetaMes(null); setMetaForm({ valor:'', regra:'beneficio' }); }
    setSalvandoMeta(false);
  }

  async function removerMeta(comp) {
    if (!confirm('Remover este valor da meta?')) return;
    setRemovendoMeta(true);
    await supabase.from('valor_meta_empresa').delete().eq('empresa_id', id).eq('competencia_meta', comp);
    setValorMetas(v => v.filter(x => x.competencia_meta?.substring(0,10) !== comp));
    setRemovendoMeta(false);
  }

  function abrirMetaManual(comp, valConsiderado) {
    const peso     = empresa?.peso_categoria ?? 1;
    const pct      = empresa?.pct_principal  ?? 100;
    const valMeta  = Math.round(valConsiderado * peso * (pct/100) * 100) / 100;
    const existente = metaMap[comp];
    setMetaForm({
      valor: existente ? existente.valor_meta : valMeta,
      regra: existente?.regra || detectarRegra(),
    });
    setMetaMes(metaMes === comp ? null : comp);
    setEditandoMes(null);
  }

  function detectarRegra() {
    const cat = (empresa?.categoria||'').toLowerCase();
    return (cat.includes('conv') || cat.includes('mobil')) ? 'convenio' : 'beneficio';
  }

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

  const cor = COR_CAT[empresa.categoria] || {bg:'#f9fafb',text:'#6b7280',border:'#e4e7ef'};
  const totalMovimentado = movimentos.reduce((s,m)=>s+m.total_liberado,0);
  const mesesAtivos = movimentos.filter(m=>m.total_liberado>0).length;
  const produtos_list = ['Benefícios','Bônus','Convênio','Mobilidade','Taxa Negativa'];
  const MOTIVOS_LABEL = {upsell:'📈 Up-sell',ajuste:'✏️ Ajuste',negociacao:'🤝 Negociação',correcao:'🔧 Correção',outro:'📌 Outro'};
  const peso      = empresa.peso_categoria ?? 1;
  const pctCons   = empresa.pct_principal  ?? 100;
  const cat       = (empresa.categoria||'').toLowerCase();
  const elegivel  = cat.includes('benefi') || cat.includes('bonus') || cat.includes('bônus') || cat.includes('conv') || cat.includes('mobil');

  const abas = [
    { key:'crm',        label:'📝 CRM',              badge: historico.length },
    { key:'dados',      label:'✏️ Dados Cadastrais' },
    { key:'movimentos', label:'📊 Movimentação' },
  ];

  return (
    <div style={sp.page}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        input:focus,select:focus,textarea:focus{border-color:#f0b429!important;outline:none;}
        .crm-item:hover{background:#f0f4ff!important;}
      `}</style>

      {/* Header */}
      <div style={sp.header}>
        <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
          <button style={sp.btnBack} onClick={()=>router.push('/gestao')}>← Gestão</button>
          <div>
            <div style={sp.tag}>♠ Vegas Card · Gestão</div>
            <h1 style={sp.title}>{empresa.nome}</h1>
            <div style={{display:'flex',gap:8,alignItems:'center',marginTop:6,flexWrap:'wrap'}}>
              <span style={{color:'#8b92b0',fontSize:'0.8rem'}}>ID {empresa.produto_id}</span>
              {empresa.cnpj&&<><span style={{color:'#d1d5e8'}}>·</span><span style={{color:'#8b92b0',fontSize:'0.8rem'}}>{empresa.cnpj}</span></>}
              <span style={{background:cor.bg,color:cor.text,border:`1px solid ${cor.border}`,borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>{empresa.categoria}</span>
              {/* Badge do peso do produto */}
              <span style={{background:'rgba(240,180,41,0.1)',color:'#b45309',border:'1px solid rgba(240,180,41,0.25)',borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>
                ⚖️ Peso: {fmtPct(peso*100)}
              </span>
              <span style={{background:empresa.ativo?'rgba(22,163,74,0.08)':'rgba(220,38,38,0.08)',color:empresa.ativo?'#16a34a':'#dc2626',border:`1px solid ${empresa.ativo?'rgba(22,163,74,0.2)':'rgba(220,38,38,0.2)'}`,borderRadius:6,padding:'3px 10px',fontSize:'0.72rem',fontWeight:700}}>
                {empresa.ativo?'● Ativa':'● Inativa'}
              </span>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          {sucesso&&<span style={{color:'#16a34a',fontSize:'0.85rem',fontWeight:600}}>✅ Salvo!</span>}
          {abaAtiva==='dados'&&!editando&&<button style={sp.btnPri} onClick={()=>setEditando(true)}>✏️ Editar Dados</button>}
          {abaAtiva==='dados'&&editando&&<>
            <button style={sp.btnSec} onClick={()=>{setEditando(false);setErro('');}}>Cancelar</button>
            <button style={sp.btnPri} onClick={salvar} disabled={salvando}>{salvando?'Salvando...':'💾 Salvar'}</button>
          </>}
        </div>
      </div>

      {erro&&<div style={sp.erroBox}>❌ {erro}</div>}

      {/* Cards resumo */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:24}}>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Potencial Mensal</span>
          <span style={{...sp.resumoV,color:'#16a34a'}}>{fmt(empresa.potencial_movimentacao)}</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Resultado Esperado</span>
          <span style={{...sp.resumoV,color:'#f0b429'}}>{fmt((empresa.potencial_movimentacao||0)*peso)}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>potencial × {fmtPct(peso*100)}</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Total Movimentado</span>
          <span style={{...sp.resumoV,color:'#2563eb'}}>{fmt(totalMovimentado)}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{mesesAtivos} meses ativos</span>
        </div>
        <div style={{...sp.resumoCard, border: totalMetaApurado>0?'1px solid rgba(52,211,153,0.3)':'1px solid #e4e7ef', background: totalMetaApurado>0?'rgba(52,211,153,0.03)':'#fff'}}>
          <span style={sp.resumoL}>🎯 Apurado na Meta</span>
          <span style={{...sp.resumoV, color: totalMetaApurado>0?'#16a34a':'#d1d5e8'}}>
            {totalMetaApurado>0?fmt(totalMetaApurado):'—'}
          </span>
          <span style={{color:totalMetaApurado>0?'#6b7280':'#b0b7cc',fontSize:'0.68rem'}}>
            {valorMetas.length>0?`${valorMetas.length} entrada${valorMetas.length>1?'s':''}`:elegivel?'clique Movimentação':'não elegível'}
          </span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Consultor</span>
          <span style={{...sp.resumoV,fontSize:'0.9rem'}}>{empresa.consultor_principal?.nome||'—'}</span>
          {empresa.consultor_principal?.gestor&&<span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{empresa.consultor_principal.gestor}</span>}
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Ocorrências CRM</span>
          <span style={{...sp.resumoV,color:historico.length>0?'#2563eb':'#d1d5e8'}}>{historico.length}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{historico.length===0?'sem registros':'registradas'}</span>
        </div>
        <div style={sp.resumoCard}>
          <span style={sp.resumoL}>Cidade / UF</span>
          <span style={{...sp.resumoV,fontSize:'0.9rem'}}>{empresa.cidade||'—'}</span>
          <span style={{color:'#8b92b0',fontSize:'0.68rem'}}>{empresa.estado||''}</span>
        </div>
      </div>

      {/* Abas */}
      <div style={{display:'flex',gap:6,marginBottom:20,borderBottom:'2px solid #e4e7ef'}}>
        {abas.map(a=>(
          <button key={a.key}
            style={{background:'none',border:'none',borderBottom:`3px solid ${abaAtiva===a.key?'#f0b429':'transparent'}`,padding:'10px 18px',color:abaAtiva===a.key?'#b45309':'#8b92b0',fontWeight:abaAtiva===a.key?700:500,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,marginBottom:'-2px'}}
            onClick={()=>setAbaAtiva(a.key)}>
            {a.label}
            {a.badge>0&&<span style={{background:'#eff6ff',color:'#2563eb',borderRadius:10,padding:'1px 7px',fontSize:'0.65rem',fontWeight:700}}>{a.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── ABA: CRM ── */}
      {abaAtiva==='crm'&&(
        <div style={sp.card}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div><div style={sp.cardTitle}>📝 Histórico CRM</div><div style={{color:'#8b92b0',fontSize:'0.78rem',marginTop:2}}>{historico.length} ocorrência{historico.length!==1?'s':''}</div></div>
            <button style={sp.btnPri} onClick={()=>setAddCRM(a=>!a)}>{addCRM?'✕ Cancelar':'+ Nova Ocorrência'}</button>
          </div>
          {addCRM&&(
            <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:20,marginBottom:24}}>
              <div style={{display:'grid',gridTemplateColumns:'180px 1fr',gap:12,marginBottom:12}}>
                <div><label style={sp.label}>Tipo</label>
                  <select style={sp.select} value={novaOco.tipo} onChange={e=>setNovaOco(n=>({...n,tipo:e.target.value}))}>
                    <option value="contato">📞 Contato</option><option value="upsell">📈 Up-sell</option>
                    <option value="negociacao">🤝 Negociação</option><option value="prazo">⏳ Prazo Extra</option>
                    <option value="juros">💸 Juros / Boleto</option><option value="reclamacao">⚠️ Reclamação</option>
                    <option value="outro">📌 Outro</option>
                  </select>
                </div>
                <div><label style={sp.label}>Título *</label>
                  <input style={sp.input} placeholder="Ex: Identificado oportunidade de up-sell"
                    value={novaOco.titulo} onChange={e=>setNovaOco(n=>({...n,titulo:e.target.value}))}
                    onKeyDown={e=>e.key==='Enter'&&salvarCRM()} />
                </div>
              </div>
              <div style={{marginBottom:14}}><label style={sp.label}>Detalhes / Observações</label>
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
          {historico.length===0?(
            <div style={{textAlign:'center',padding:'48px 0',color:'#b0b7cc'}}>
              <div style={{fontSize:'2.5rem',marginBottom:12}}>📭</div>
              <div style={{fontWeight:600,marginBottom:4}}>Nenhuma ocorrência ainda</div>
              <div style={{fontSize:'0.82rem'}}>Clique em "+ Nova Ocorrência" para começar</div>
            </div>
          ):(
            <div style={{position:'relative',paddingLeft:32}}>
              <div style={{position:'absolute',left:11,top:0,bottom:0,width:2,background:'#e4e7ef',borderRadius:2}}></div>
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {historico.map((h)=>{
                  const cfg=TIPO_CRM[h.tipo]||TIPO_CRM.outro;
                  return(
                    <div key={h.id} className="crm-item" style={{position:'relative',background:'#ffffff',border:'1px solid #e4e7ef',borderLeft:`3px solid ${cfg.cor}`,borderRadius:10,padding:'14px 18px',transition:'background 0.15s'}}>
                      <div style={{position:'absolute',left:-27,top:16,width:12,height:12,borderRadius:'50%',background:cfg.cor,border:'2px solid #ffffff',boxShadow:`0 0 0 2px ${cfg.cor}40`}}></div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontSize:'1.1rem'}}>{cfg.icon}</span>
                          <span style={{fontWeight:700,fontSize:'0.9rem',color:'#1a1d2e'}}>{h.titulo}</span>
                          <span style={{background:`${cfg.cor}15`,color:cfg.cor,border:`1px solid ${cfg.cor}30`,borderRadius:5,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase'}}>{cfg.label}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                          <span style={{color:'#8b92b0',fontSize:'0.72rem',whiteSpace:'nowrap'}}>{fmtDT(h.criado_em)}</span>
                          <button onClick={()=>deletarCRM(h.id)} style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:6,padding:'3px 8px',color:'#dc2626',cursor:'pointer',fontSize:'0.7rem',fontFamily:'inherit'}}>✕</button>
                        </div>
                      </div>
                      {h.descricao&&<p style={{color:'#4a5068',fontSize:'0.83rem',margin:0,lineHeight:1.6,paddingLeft:4}}>{h.descricao}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA: DADOS ── */}
      {abaAtiva==='dados'&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div style={sp.card}>
            <div style={sp.cardTitle}>📋 Informações Cadastrais</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
              {[['CNPJ',empresa.cnpj||'—'],['Data Cadastro',fmtDate(empresa.data_cadastro)],['Cidade',empresa.cidade||'—'],['Estado',empresa.estado||'—'],['Cartões Emitidos',empresa.cartoes_emitidos||0],['Dias de Prazo',empresa.dias_prazo||'—'],['Tipo Boleto',empresa.tipo_boleto||'—']].map(([l,v])=>(
                <div key={l}><div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{l}</div><div style={{fontWeight:500,fontSize:'0.88rem'}}>{v}</div></div>
              ))}
            </div>
          </div>
          <div style={sp.card}>
            <div style={sp.cardTitle}>💰 Produto & Financeiro</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
              {[
                ['Categoria',    editando?<select style={sp.select} value={form.categoria} onChange={e=>set('categoria',e.target.value)}>{produtos_list.map(c=><option key={c} value={c}>{c}</option>)}</select>:<span style={{color:cor.text,fontWeight:600}}>{empresa.categoria}</span>],
                ['Produto',      editando?<select style={sp.select} value={form.produto_contratado} onChange={e=>set('produto_contratado',e.target.value)}><option value="">— Selecione —</option>{produtos.map(p=><option key={p.id} value={p.nome}>{p.nome}</option>)}</select>:empresa.produto_contratado||'—'],
                ['Peso meta (%)', editando?<input style={sp.input} type="number" step="0.01" min="0" max="1" value={form.peso_categoria} onChange={e=>set('peso_categoria',e.target.value)}/>:<span style={{color:'#f0b429',fontWeight:700}}>{fmtPct((empresa.peso_categoria||1)*100)} <span style={{color:'#8b92b0',fontWeight:400,fontSize:'0.78rem'}}>(da mov. vai para meta)</span></span>],
                ['Potencial',   editando?<input style={sp.input} type="number" value={form.potencial_movimentacao} onChange={e=>set('potencial_movimentacao',e.target.value)}/>:<span style={{color:'#16a34a',fontWeight:700}}>{fmt(empresa.potencial_movimentacao)}</span>],
                ['Taxa Positiva',editando?<input style={sp.input} type="number" step="0.001" value={form.taxa_positiva} onChange={e=>set('taxa_positiva',e.target.value)}/>:<span style={{color:'#16a34a'}}>{empresa.taxa_positiva>0?`${(empresa.taxa_positiva*100).toFixed(2)}%`:'—'}</span>],
                ['Taxa Negativa',editando?<input style={sp.input} type="number" step="0.001" value={form.taxa_negativa} onChange={e=>set('taxa_negativa',e.target.value)}/>:<span style={{color:empresa.taxa_negativa>0?'#dc2626':'#b0b7cc'}}>{empresa.taxa_negativa>0?`${(empresa.taxa_negativa*100).toFixed(2)}%`:'—'}</span>],
              ].map(([l,v])=>(
                <div key={l}><div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{l}</div><div style={{fontSize:'0.9rem'}}>{v}</div></div>
              ))}
            </div>
          </div>
          <div style={sp.card}>
            <div style={sp.cardTitle}>👥 Equipe Comercial</div>
            <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:16}}>
              {[['Consultor Principal','consultor_principal_id',empresa.consultor_principal?.nome],['Consultor Agregado 1','consultor_agregado_id',empresa.consultor_agregado?.nome],['Consultor Agregado 2','consultor_agregado_2_id',empresa.consultor_agregado_2?.nome]].map(([l,k,nome])=>(
                <div key={l}><div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{l}</div>
                  {editando?<select style={sp.select} value={form[k]} onChange={e=>set(k,e.target.value)}><option value="">— Nenhum —</option>{consultores.map(c=><option key={c.id} value={c.id}>{c.nome}{c.gestor?` (${c.gestor})`:''}</option>)}</select>:<span style={{fontWeight:k==='consultor_principal_id'?600:400}}>{nome||'—'}</span>}
                </div>
              ))}
              <div><div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Parceiro Comercial</div>
                {editando?<select style={sp.select} value={form.parceiro_id} onChange={e=>set('parceiro_id',e.target.value)}><option value="">— Nenhum —</option>{parceiros.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select>:<span>{empresa.parceiro?.nome||'—'}</span>}
              </div>
              <div style={{borderTop:'1px solid #e4e7ef',paddingTop:16,marginTop:4}}>
                <div style={{color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:10}}>Divisão de Resultado</div>
                {editando?(
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {[{label:'100% Principal',p:100,a1:0,a2:0},{label:'50% / 50%',p:50,a1:50,a2:0},{label:'34% / 33% / 33%',p:34,a1:33,a2:33}].map(opt=>{
                      const ativo=form.pct_principal===opt.p&&form.pct_agregado_1===opt.a1&&form.pct_agregado_2===opt.a2;
                      if(opt.a2>0&&!form.consultor_agregado_2_id)return null;
                      if(opt.a1>0&&!form.consultor_agregado_id)return null;
                      return(<button key={opt.label} onClick={()=>{set('pct_principal',opt.p);set('pct_agregado_1',opt.a1);set('pct_agregado_2',opt.a2);set('divisao_manual',true);}} style={{background:ativo?'rgba(240,180,41,0.15)':'#f5f6fa',border:`1px solid ${ativo?'rgba(240,180,41,0.4)':'#e4e7ef'}`,borderRadius:8,padding:'8px 16px',color:ativo?'#f0b429':'#4a5068',cursor:'pointer',fontWeight:ativo?700:500,fontSize:'0.82rem',fontFamily:'inherit'}}>{opt.label}</button>);
                    })}
                  </div>
                ):(
                  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                    {[{nome:empresa.consultor_principal?.nome,pct:empresa.pct_principal??100,label:'Principal'},empresa.consultor_agregado?.nome&&{nome:empresa.consultor_agregado.nome,pct:empresa.pct_agregado_1??0,label:'Agr. 1'},empresa.consultor_agregado_2?.nome&&{nome:empresa.consultor_agregado_2.nome,pct:empresa.pct_agregado_2??0,label:'Agr. 2'}].filter(Boolean).map((item,i)=>(
                      <div key={i} style={{background:'#f9fafb',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 14px',display:'flex',alignItems:'center',gap:8}}>
                        <span style={{background:'rgba(240,180,41,0.1)',color:'#f0b429',borderRadius:5,padding:'2px 8px',fontSize:'0.72rem',fontWeight:700}}>{item.pct}%</span>
                        <span style={{fontSize:'0.82rem',fontWeight:500}}>{item.nome}</span>
                        <span style={{fontSize:'0.68rem',color:'#8b92b0'}}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={sp.card}>
            <div style={sp.cardTitle}>⚙️ Status da Empresa</div>
            <div style={{marginTop:16}}>
              {editando?(
                <div style={{display:'flex',gap:12}}>
                  <button onClick={()=>set('ativo',true)} style={{...sp.statusBtn,...(form.ativo?{background:'rgba(22,163,74,0.1)',border:'1px solid rgba(22,163,74,0.3)',color:'#16a34a'}:{})}}>✅ Ativa</button>
                  <button onClick={()=>set('ativo',false)} style={{...sp.statusBtn,...(!form.ativo?{background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626'}:{})}}>❌ Inativa</button>
                </div>
              ):(
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0'}}>
                  <div style={{width:14,height:14,borderRadius:'50%',background:empresa.ativo?'#16a34a':'#dc2626',boxShadow:`0 0 0 3px ${empresa.ativo?'rgba(22,163,74,0.2)':'rgba(220,38,38,0.2)'}`}}></div>
                  <span style={{fontWeight:700,fontSize:'1rem',color:empresa.ativo?'#16a34a':'#dc2626'}}>{empresa.ativo?'Empresa Ativa':'Empresa Inativa'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ABA: MOVIMENTAÇÃO ── */}
      {abaAtiva==='movimentos'&&(
        <div style={sp.card}>

          {/* Banner de meta automática */}
          {elegivel&&(
            <div style={{marginBottom:20,animation:'fadeIn 0.3s ease'}}>
              {metaAutoGravada&&metaAuto&&!metaAuto.pendente&&(
                <div style={{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.25)',borderRadius:12,padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <span style={{fontSize:'1.4rem'}}>✅</span>
                    <div>
                      <div style={{fontWeight:700,color:'#16a34a',fontSize:'0.88rem'}}>
                        Meta aplicada — {metaAuto.regra==='beneficio'?'1ª recarga':'3º mês'} · {metaAuto.mesLabel}
                      </div>
                      <div style={{color:'#6b7280',fontSize:'0.75rem',marginTop:2}}>
                        <strong style={{color:'#16a34a'}}>{fmt(metaAuto.valorMeta)}</strong>
                        {' '}= {fmt(metaAuto.valorConsiderado)}
                        {metaAuto.peso < 1 && <> × <span style={{color:'#f0b429',fontWeight:700}}>{fmtPct(metaAuto.peso*100)}% peso VB</span></>}
                        {' '}× {fmtPct(pctCons)} consultor
                        {metaAuto.temAjuste&&<span style={{color:'#f0b429'}}> (valor ajustado)</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>removerMeta(metaAuto.comp)} disabled={removendoMeta}
                    style={{background:'rgba(220,38,38,0.07)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:8,padding:'7px 16px',color:'#dc2626',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit',fontWeight:600}}>
                    {removendoMeta?'Removendo...':'🗑 Desmarcar da meta'}
                  </button>
                </div>
              )}
              {!metaAutoGravada&&metaAuto&&!metaAuto.pendente&&(()=>{
                // Meses disponíveis para troca manual (todos com valor > 0)
                const mesesDisponiveis = movimentos
                  .filter(m => m.total_liberado > 0)
                  .sort((a,b) => a.competencia.localeCompare(b.competencia));
                // Mês efetivo: manual ou automático
                const mesEfetivo = mesSelecionado
                  ? mesesDisponiveis.find(m => m.competencia?.substring(0,10) === mesSelecionado) || mesesDisponiveis[0]
                  : mesesDisponiveis[metaAuto.regra === 'beneficio' ? 0 : 2] || mesesDisponiveis[0];
                const compEfetivo   = mesEfetivo?.competencia?.substring(0,10);
                const ajEfetivo     = ajusteMap[compEfetivo];
                const valorConsidEf = ajEfetivo ? ajEfetivo.valor_considerado : (mesEfetivo?.total_liberado || 0);
                const valorMetaEf   = Math.round(valorConsidEf * metaAuto.peso * (pctCons/100) * 100) / 100;
                const isManual      = !!mesSelecionado;

                return (
                  <div style={{background:'rgba(240,180,41,0.05)',border:'1px solid rgba(240,180,41,0.25)',borderRadius:12,padding:'14px 18px',animation:'fadeIn 0.3s ease'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <span style={{fontSize:'1.4rem'}}>🎯</span>
                        <div>
                          <div style={{fontWeight:700,color:'#b45309',fontSize:'0.88rem',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                            {isManual
                              ? <span style={{background:'rgba(96,165,250,0.12)',color:'#2563eb',borderRadius:4,padding:'1px 7px',fontSize:'0.72rem',fontWeight:700}}>✏️ Mês alterado manualmente</span>
                              : <span>Meta calculada — {metaAuto.regra==='beneficio'?'1ª recarga':'3º mês'}</span>
                            }
                            <span style={{color:'#b45309'}}>· {fmtMes(compEfetivo)}</span>
                          </div>
                          <div style={{color:'#6b7280',fontSize:'0.75rem',marginTop:4,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            <span>{fmt(valorConsidEf)}</span>
                            {metaAuto.peso < 1 && <>
                              <span style={{color:'#d1d5db'}}>×</span>
                              <span style={{background:'rgba(240,180,41,0.12)',color:'#b45309',borderRadius:4,padding:'1px 7px',fontWeight:700}}>{fmtPct(metaAuto.peso*100)} peso VB</span>
                            </>}
                            <span style={{color:'#d1d5db'}}>×</span>
                            <span style={{background:'rgba(96,165,250,0.12)',color:'#2563eb',borderRadius:4,padding:'1px 7px',fontWeight:700}}>{fmtPct(pctCons)} consultor</span>
                            <span style={{color:'#d1d5db'}}>=</span>
                            <strong style={{color:'#f0b429',fontSize:'0.85rem'}}>{fmt(valorMetaEf)}</strong>
                          </div>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                        {/* Botão trocar mês */}
                        <button onClick={()=>setTrocandoMes(t=>!t)}
                          style={{background:trocandoMes?'rgba(96,165,250,0.12)':'rgba(255,255,255,0.06)',border:`1px solid ${trocandoMes?'rgba(96,165,250,0.4)':'rgba(107,114,128,0.2)'}`,borderRadius:7,padding:'6px 14px',color:trocandoMes?'#2563eb':'#6b7280',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                          📅 {trocandoMes ? 'Fechar' : 'Trocar mês'}
                        </button>
                        {isManual && (
                          <button onClick={()=>{setMesSelecionado(null);setTrocandoMes(false);}}
                            style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:7,padding:'6px 12px',color:'#dc2626',cursor:'pointer',fontSize:'0.75rem',fontFamily:'inherit'}}>
                            ✕ Desfazer
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            setAplicandoAuto(true);
                            setErroMeta('');
                            // Se troca de mês: remove TODAS as entradas anteriores desta empresa
                            // para não ficar com dois meses marcados
                            if (isManual) {
                              await supabase.from('valor_meta_empresa')
                                .delete().eq('empresa_id', empresa.id);
                            } else {
                              await supabase.from('valor_meta_empresa')
                                .delete().eq('empresa_id', empresa.id).eq('competencia_meta', compEfetivo);
                            }
                            const { error } = await supabase.from('valor_meta_empresa').insert({
                              empresa_id: empresa.id, produto_id: empresa.produto_id,
                              consultor_id: empresa.consultor_principal_id || null,
                              competencia_meta: compEfetivo,
                              valor_bruto: mesEfetivo?.total_liberado || 0,
                              valor_considerado: valorConsidEf,
                              valor_meta: valorMetaEf,
                              pct_consultor: pctCons,
                              regra: isManual ? 'manual' : metaAuto.regra,
                              mes_sequencia: isManual ? 0 : (metaAuto.regra === 'beneficio' ? 1 : 3),
                            });
                            if (error) { setErroMeta('Erro: ' + error.message); }
                            else { await carregar(); setMesSelecionado(null); setTrocandoMes(false); }
                            setAplicandoAuto(false);
                          }}
                          disabled={aplicandoAuto}
                          style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontWeight:700,cursor:'pointer',fontSize:'0.85rem',fontFamily:'inherit'}}>
                          {aplicandoAuto?'Aplicando...':'✅ Aplicar na meta'}
                        </button>
                      </div>
                    </div>

                    {/* Seletor de mês expandível */}
                    {trocandoMes && (
                      <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid rgba(240,180,41,0.15)'}}>
                        <div style={{color:'#6b7280',fontSize:'0.72rem',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
                          Escolha o mês para considerar na meta:
                        </div>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                          {mesesDisponiveis.map((mv,idx) => {
                            const comp = mv.competencia?.substring(0,10);
                            const aj   = ajusteMap[comp];
                            const val  = aj ? aj.valor_considerado : mv.total_liberado;
                            const metaVal = Math.round(val * metaAuto.peso * (pctCons/100) * 100) / 100;
                            const isAuto   = !mesSelecionado && comp === compEfetivo;
                            const isSelected = mesSelecionado === comp || isAuto;
                            return (
                              <button key={comp} onClick={()=>{setMesSelecionado(comp);setTrocandoMes(false);}}
                                style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,background:isSelected?'rgba(16,163,74,0.12)':'#f9fafb',border:`2px solid ${isSelected?'#16a34a':'#e4e7ef'}`,borderRadius:10,padding:'8px 14px',cursor:'pointer',fontFamily:'inherit',minWidth:110,transition:'all 0.15s'}}>
                                <span style={{fontWeight:700,fontSize:'0.82rem',color:isSelected?'#16a34a':'#1a1d2e'}}>{fmtMes(comp)}</span>
                                <span style={{fontSize:'0.72rem',color:'#4b5563'}}>{fmt(val)}</span>
                                <span style={{fontSize:'0.68rem',color:'#f0b429',fontWeight:700}}>meta: {fmt(metaVal)}</span>
                                {!mesSelecionado && idx === (metaAuto.regra === 'beneficio' ? 0 : 2) && (
                                  <span style={{fontSize:'0.6rem',color:'#16a34a',fontWeight:700,background:'rgba(16,163,74,0.1)',borderRadius:3,padding:'1px 5px'}}>automático</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {metaAuto?.pendente&&(
                <div style={{background:'rgba(107,114,128,0.06)',border:'1px solid rgba(107,114,128,0.15)',borderRadius:12,padding:'12px 18px',display:'flex',alignItems:'center',gap:12}}>
                  <span style={{fontSize:'1.2rem'}}>⏳</span>
                  <div>
                    <div style={{fontWeight:600,color:'#4b5563',fontSize:'0.85rem'}}>Aguardando {metaAuto.precisam}º mês com movimentação</div>
                    <div style={{color:'#6b7280',fontSize:'0.75rem',marginTop:3,display:'flex',alignItems:'center',gap:6}}>
                      {metaAuto.progresso} de {metaAuto.precisam} meses
                      <span style={{display:'inline-flex',gap:3,marginLeft:4}}>
                        {Array.from({length:metaAuto.precisam}).map((_,i)=>(
                          <span key={i} style={{width:10,height:10,borderRadius:'50%',background:i<metaAuto.progresso?'#16a34a':'#e4e7ef',display:'inline-block'}}></span>
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {!metaAuto&&(
                <div style={{background:'rgba(107,114,128,0.04)',border:'1px solid rgba(107,114,128,0.12)',borderRadius:12,padding:'12px 18px',display:'flex',alignItems:'center',gap:10}}>
                  <span>📭</span>
                  <div style={{color:'#6b7280',fontSize:'0.82rem'}}>
                    Nenhuma movimentação ainda — meta calculada automaticamente após a {detectarRegra()==='beneficio'?'1ª recarga':'3ª liberação'}.
                  </div>
                </div>
              )}
            </div>
          )}

          {erroMeta&&<div style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:10,padding:'10px 14px',marginBottom:16,color:'#dc2626',fontSize:'0.82rem'}}>❌ {erroMeta}</div>}

          {/* Header */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
            <div style={sp.cardTitle}>📊 HISTÓRICO DE MOVIMENTAÇÃO</div>
            <div style={{color:'#8b92b0',fontSize:'0.72rem'}}>✏️ ajustar valor · 🎯 entrada manual na meta</div>
          </div>

          {movimentos.length===0?(
            <div style={{textAlign:'center',padding:'48px 0',color:'#b0b7cc'}}>
              <div style={{fontSize:'2.5rem',marginBottom:12}}>📭</div>
              <div style={{fontWeight:600}}>Nenhuma movimentação registrada</div>
            </div>
          ):(
            <>
              {/* Verifica se é Vegas Benefícios para aplicar peso na meta */}
              {(() => {
              const isVegasBeneficios = ((empresa?.produto_contratado||'').toLowerCase().trim()==='vegas benefícios'||
                                        (empresa?.produto_contratado||'').toLowerCase().trim()==='vegas beneficios');
              return (
              <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap'}}>
                {[
                  {label:'Total Bruto',      val:fmt(totalMovimentado),bg:'#eff6ff',border:'#bfdbfe',cor:'#2563eb'},
                  {label:'Total Considerado',val:fmt(movimentos.reduce((s,m)=>{const c=m.competencia?.substring(0,10);const aj=ajusteMap[c];return s+(aj?aj.valor_considerado:m.total_liberado);},0)),bg:'#f0fdf4',border:'#86efac',cor:'#16a34a'},
                  {label:'Ajustes Ativos',   val:ajustes.length,bg:'#fff7ed',border:'#fed7aa',cor:'#ea580c'},
                  {label:'Meses Ativos',     val:`${mesesAtivos} de ${movimentos.length}`,bg:'#f5f3ff',border:'#ddd6fe',cor:'#7c3aed'},
                  {label:isVegasBeneficios?`🎯 Meta (${fmtPct(peso*100)}% peso)`:'🎯 Apurado Meta',val:totalMetaApurado>0?fmt(totalMetaApurado):'—',bg:totalMetaApurado>0?'#f0fdf4':'#f9fafb',border:totalMetaApurado>0?'rgba(52,211,153,0.4)':'#e4e7ef',cor:totalMetaApurado>0?'#16a34a':'#b0b7cc'},
                ].map(({label,val,bg,border,cor})=>(
                  <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:'12px 18px',flex:1,minWidth:130}}>
                    <div style={{color:cor,fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>{label}</div>
                    <div style={{fontWeight:800,fontSize:'1.1rem',color:cor}}>{val}</div>
                  </div>
                ))}
              </div>
              );})()}

              <div style={{border:'1px solid #e4e7ef',borderRadius:10,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                  <thead>
                    <tr style={{background:'#f9fafb'}}>
                      {['Mês','Valor Bruto','Valor Considerado','Motivo / Obs.','Ação'].map(h=>(
                        <th key={h} style={{padding:'10px 16px',textAlign:h==='Valor Bruto'||h==='Valor Considerado'?'right':'left',color:'#8b92b0',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:0.5,whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Meses zerados esperados (Convênio/Mobilidade sem registro) */}
                    {mesesZeradosEsperados.map(comp => {
                      const eInserindo = inserindoValor === comp;
                      const metaGravada = metaMap[comp];
                      return (
                        <React.Fragment key={'zero-'+comp}>
                          <tr style={{borderTop:'1px solid #f0f2f8',background:'rgba(248,113,113,0.03)'}}>
                            <td style={{padding:'12px 16px',fontWeight:600}}>
                              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                                <span style={{color:'#9ca3af'}}>{fmtMes(comp+'-01')}</span>
                                <span style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.2)',color:'#f87171',borderRadius:5,padding:'2px 7px',fontSize:'0.62rem',fontWeight:700}}>
                                  sem registro
                                </span>
                                {metaGravada && (
                                  <span style={{background:'rgba(52,211,153,0.12)',border:'1px solid rgba(52,211,153,0.3)',color:'#16a34a',borderRadius:5,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700}}>
                                    ✅ {fmt(metaGravada.valor_meta)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{padding:'12px 16px',textAlign:'right',color:'#d1d5db'}}>—</td>
                            <td style={{padding:'12px 16px',textAlign:'right',color:'#d1d5db'}}>—</td>
                            <td style={{padding:'12px 16px',color:'#9ca3af',fontSize:'0.75rem',fontStyle:'italic'}}>
                              mês sem movimentação
                            </td>
                            <td style={{padding:'12px 16px'}}>
                              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                {!metaGravada ? (
                                  <button onClick={()=>{setInserindoValor(eInserindo?null:comp);setValorInserir('');}}
                                    style={{background:eInserindo?'rgba(52,211,153,0.12)':'#f5f6fa',border:`1px solid ${eInserindo?'rgba(52,211,153,0.3)':'#e4e7ef'}`,borderRadius:7,padding:'5px 12px',color:eInserindo?'#16a34a':'#4a5068',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                                    {eInserindo?'✕':'🎯 Aplicar meta'}
                                  </button>
                                ) : (
                                  <button onClick={async ()=>{
                                    if(!confirm('Remover a meta deste mês?')) return;
                                    await supabase.from('valor_meta_empresa').delete()
                                      .eq('empresa_id',empresa.id).eq('competencia_meta',comp+'-01');
                                    await carregar();
                                  }}
                                    style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:7,padding:'5px 12px',color:'#dc2626',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                                    ✕ Remover meta
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* Painel: aplicar meta usando mês anterior com valor */}
                          {eInserindo && (()=>{
                            // Acha o último mês com valor dentro dos 3 corridos
                            const comValorOrdenados = movimentos
                              .filter(m => m.total_liberado > 0)
                              .sort((a,b) => a.competencia.localeCompare(b.competencia));
                            const primeiroCom = comValorOrdenados[0];
                            const [y0,m0] = (primeiroCom?.competencia||'').substring(0,7).split('-').map(Number);
                            const tresMeses = [0,1,2].map(i=>{
                              const d = new Date(y0, m0-1+i, 1);
                              const c2 = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                              const lib = movimentos.find(m => m.competencia?.substring(0,7)===c2);
                              const aj  = ajusteMap[c2+'-01'] || ajusteMap[c2];
                              const val = aj ? aj.valor_considerado : (lib?.total_liberado||0);
                              return {comp:c2, val, label:fmtMes(c2+'-01')};
                            });
                            // Usa o 3º se tiver valor; senão o último com valor
                            const mesParaMeta = tresMeses[2].val > 0
                              ? tresMeses[2]
                              : [...tresMeses].reverse().find(m=>m.val>0);
                            const _prodNorm = (empresa?.produto_contratado||'').toLowerCase().trim();
                            const _isVB = _prodNorm==='vegas benefícios'||_prodNorm==='vegas beneficios';
                            const _pesoMeta = _isVB ? peso : 1;
                            const valorMetaCalc = mesParaMeta
                              ? Math.round(mesParaMeta.val * _pesoMeta * (pctCons/100) * 100) / 100
                              : 0;
                            return (
                              <tr style={{background:'rgba(96,165,250,0.04)',borderTop:'1px solid rgba(96,165,250,0.1)'}}>
                                <td colSpan={5} style={{padding:'16px 20px'}}>
                                  <div style={{marginBottom:10}}>
                                    <div style={{color:'#2563eb',fontWeight:700,fontSize:'0.85rem',marginBottom:4}}>
                                      🎯 Aplicar meta para {fmtMes(comp+'-01')} (3º mês corrido zerado)
                                    </div>
                                    <div style={{color:'#6b7280',fontSize:'0.75rem'}}>
                                      Fev/{comp.split('-')[0]} não teve movimentação. O sistema usará o valor de <strong style={{color:'#1a1d2e'}}>{mesParaMeta?.label||'—'}</strong> como base da meta.
                                    </div>
                                  </div>
                                  {mesParaMeta ? (
                                    <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',background:'white',border:'1px solid #e4e7ef',borderRadius:10,padding:'12px 16px'}}>
                                      <div>
                                        <div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>Mês de referência</div>
                                        <div style={{fontWeight:700,color:'#2563eb'}}>{mesParaMeta.label}</div>
                                      </div>
                                      <div>
                                        <div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>Valor movimentado</div>
                                        <div style={{fontWeight:700,color:'#1a1d2e'}}>{fmt(mesParaMeta.val)}</div>
                                      </div>
                                      {_pesoMeta < 1 && <div>
                                        <div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>Peso</div>
                                        <div style={{fontWeight:700,color:'#f0b429'}}>{fmtPct(_pesoMeta*100)}</div>
                                      </div>}
                                      <div>
                                        <div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>% Consultor</div>
                                        <div style={{fontWeight:700,color:'#2563eb'}}>{fmtPct(pctCons)}</div>
                                      </div>
                                      <div style={{borderLeft:'2px solid #e4e7ef',paddingLeft:16}}>
                                        <div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>Valor da meta</div>
                                        <div style={{fontWeight:800,color:'#16a34a',fontSize:'1.1rem'}}>{fmt(valorMetaCalc)}</div>
                                      </div>
                                      <button
                                        disabled={salvandoInserir}
                                        onClick={async () => {
                                          setSalvandoInserir(true);
                                          // Salva direto na valor_meta_empresa com o mês zerado como competencia_meta
                                          // e o valor calculado do mês de referência
                                          await supabase.from('valor_meta_empresa')
                                            .delete().eq('empresa_id', empresa.id);
                                          const { error } = await supabase.from('valor_meta_empresa').insert({
                                            empresa_id:       empresa.id,
                                            produto_id:       empresa.produto_id,
                                            consultor_id:     empresa.consultor_principal_id || null,
                                            competencia_meta: comp+'-01',
                                            valor_bruto:      mesParaMeta.val,
                                            valor_considerado: mesParaMeta.val,
                                            valor_meta:       valorMetaCalc,
                                            pct_consultor:    pctCons,
                                            regra:            'convenio',
                                            mes_sequencia:    3,
                                          });
                                          if (!error) {
                                            await carregar();
                                            setInserindoValor(null);
                                          } else {
                                            alert('Erro: ' + error.message);
                                          }
                                          setSalvandoInserir(false);
                                        }}
                                        style={{background:'#16a34a',color:'white',border:'none',borderRadius:8,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.85rem',fontFamily:'inherit',marginLeft:'auto'}}>
                                        {salvandoInserir?'Aplicando...':'✅ Aplicar meta'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{color:'#f87171',fontSize:'0.82rem'}}>Nenhum mês com valor encontrado dentro dos 3 corridos.</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })()}

                        </React.Fragment>
                      );
                    })}
                    {movimentos.map((m,i)=>{
                      const comp           = m.competencia?.substring(0,10);
                      const ajuste         = ajusteMap[comp];
                      const valConsiderado = ajuste?ajuste.valor_considerado:m.total_liberado;
                      const temAjuste      = !!ajuste;
                      const eEditando      = editandoMes===comp;
                      const eMetaAberta    = metaMes===comp;
                      const metaGravada    = metaMap[comp];
                      const temMeta        = !!metaGravada;
                      const ehMesMetaAuto  = metaAuto&&!metaAuto.pendente&&metaAuto.comp===comp;
                      // Peso só aplica na meta para Vegas Benefícios; demais produtos usam 100%
                      const _prodNorm  = (empresa?.produto_contratado||'').toLowerCase().trim();
                      const _isVB      = _prodNorm==='vegas benefícios'||_prodNorm==='vegas beneficios';
                      const _pesoMeta  = _isVB ? peso : 1;
                      const valorMetaCalc = Math.round(valConsiderado*_pesoMeta*(pctCons/100)*100)/100;

                      return(
                        <>
                          <tr key={comp} style={{borderTop:'1px solid #f0f2f8',
                            background:temMeta?'rgba(52,211,153,0.05)':ehMesMetaAuto?'rgba(240,180,41,0.04)':temAjuste?'#fffbeb':i%2===0?'#ffffff':'#fafafa'}}>
                            <td style={{padding:'12px 16px',fontWeight:600}}>
                              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                                {fmtMes(m.competencia)}
                                {temMeta&&(
                                  <span style={{background:'rgba(52,211,153,0.12)',border:'1px solid rgba(52,211,153,0.3)',color:'#16a34a',borderRadius:5,padding:'2px 8px',fontSize:'0.65rem',fontWeight:700,whiteSpace:'nowrap'}}>
                                    ✅ {fmt(metaGravada.valor_meta)}
                                  </span>
                                )}
                                {ehMesMetaAuto && !temMeta && valorMetas.length === 0 && (
                                  <span style={{background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.25)',color:'#b45309',borderRadius:5,padding:'2px 8px',fontSize:'0.65rem',fontWeight:600,whiteSpace:'nowrap'}}>
                                    🎯 elegível
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{padding:'12px 16px',textAlign:'right',color:'#6b7280',fontWeight:temAjuste?400:700}}>
                              {m.total_liberado>0?<span style={{textDecoration:temAjuste?'line-through':''}}>{fmt(m.total_liberado)}</span>:'—'}
                            </td>
                            <td style={{padding:'12px 16px',textAlign:'right',fontWeight:700,color:temAjuste?'#f0b429':'#16a34a',fontSize:'1rem'}}>
                              {valConsiderado>0?fmt(valConsiderado):'—'}
                              {temAjuste&&<div style={{fontSize:'0.68rem',color:'#f0b429',fontWeight:400}}>ajustado</div>}
                            </td>
                            <td style={{padding:'12px 16px',maxWidth:220}}>
                              {temAjuste&&(
                                <div>
                                  <span style={{background:'rgba(240,180,41,0.12)',color:'#f0b429',borderRadius:5,padding:'2px 8px',fontSize:'0.7rem',fontWeight:600}}>{MOTIVOS_LABEL[ajuste.motivo]||ajuste.motivo}</span>
                                  {ajuste.observacao&&<div style={{color:'#6b7280',fontSize:'0.75rem',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{ajuste.observacao}</div>}
                                </div>
                              )}
                            </td>
                            <td style={{padding:'12px 16px'}}>
                              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                <button onClick={()=>{setEditandoMes(eEditando?null:comp);setAjusteForm({valor:temAjuste?ajuste.valor_considerado:m.total_liberado,motivo:ajuste?.motivo||'upsell',observacao:ajuste?.observacao||''});setMetaMes(null);}}
                                  style={{background:eEditando?'rgba(240,180,41,0.15)':'#f5f6fa',border:`1px solid ${eEditando?'rgba(240,180,41,0.3)':'#e4e7ef'}`,borderRadius:7,padding:'5px 12px',color:eEditando?'#f0b429':'#4a5068',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                                  {eEditando?'✕':'✏️ Ajustar'}
                                </button>
                                {m.total_liberado>0&&(
                                  <button onClick={()=>abrirMetaManual(comp,valConsiderado)}
                                    style={{background:eMetaAberta?'rgba(52,211,153,0.15)':temMeta?'rgba(52,211,153,0.08)':'#f5f6fa',border:`1px solid ${eMetaAberta?'rgba(52,211,153,0.4)':temMeta?'rgba(52,211,153,0.3)':'#e4e7ef'}`,borderRadius:7,padding:'5px 12px',color:eMetaAberta?'#16a34a':temMeta?'#16a34a':'#4a5068',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                                    {eMetaAberta?'✕':temMeta?'✅ Meta':'🎯 Meta'}
                                  </button>
                                )}
                                {temAjuste&&!eEditando&&(
                                  <button onClick={()=>removerAjuste(comp)} style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:7,padding:'5px 10px',color:'#dc2626',cursor:'pointer',fontSize:'0.75rem',fontFamily:'inherit'}}>✕ Aj.</button>
                                )}
                                {temMeta&&!eMetaAberta&&(
                                  <button onClick={()=>removerMeta(comp)} style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:7,padding:'5px 10px',color:'#dc2626',cursor:'pointer',fontSize:'0.75rem',fontFamily:'inherit'}}>✕ Meta</button>
                                )}
                                {/* Upsell: apenas em meses POSTERIORES ao mês da meta, com excedente */}
                                {m.total_liberado > 0 && valorMetas.length > 0 && (() => {
                                  const metaBase    = valorMetas.find(v => v.regra !== 'upsell');
                                  const mesMetaComp = metaBase?.competencia_meta?.substring(0,7) || '';
                                  // Só mostra em meses APÓS o mês da meta
                                  if (comp <= mesMetaComp) return null;
                                  const valorBase   = metaBase?.valor_considerado || 0;
                                  const excedente   = m.total_liberado - valorBase;
                                  const jaTemUpsell = valorMetas.some(v => v.competencia_meta?.substring(0,7) === comp && v.regra === 'upsell');
                                  const eUpsellAberto = upsellMes === comp;
                                  if (excedente <= 0 && !eUpsellAberto && !jaTemUpsell) return null;
                                  return (
                                    <button onClick={()=>setUpsellMes(eUpsellAberto?null:comp)}
                                      style={{background:eUpsellAberto?'rgba(8,145,178,0.15)':jaTemUpsell?'rgba(8,145,178,0.08)':'#f5f6fa',border:`1px solid ${eUpsellAberto?'rgba(8,145,178,0.4)':jaTemUpsell?'rgba(8,145,178,0.3)':'#e4e7ef'}`,borderRadius:7,padding:'5px 12px',color:eUpsellAberto?'#0891b2':jaTemUpsell?'#0891b2':'#4a5068',cursor:'pointer',fontSize:'0.78rem',fontFamily:'inherit',fontWeight:600}}>
                                      {eUpsellAberto?'✕':'📈 Upsell'}
                                    </button>
                                  );
                                })()}
                                {/* Botão remover registro da liberacoes — aparece sempre para permitir desfazer inserções erradas */}
                                <button
                                  onClick={async () => {
                                    if(!confirm(`Remover o registro de ${fmtMes(m.competencia)} da movimentação?\n\nIsso NÃO afeta metas já gravadas.`)) return;
                                    await supabase.from('liberacoes')
                                      .delete()
                                      .eq('empresa_id', empresa.id)
                                      .eq('competencia', m.competencia);
                                    await carregar();
                                  }}
                                  title="Remover este registro de movimentação"
                                  style={{background:'rgba(220,38,38,0.04)',border:'1px solid rgba(220,38,38,0.1)',borderRadius:7,padding:'5px 8px',color:'#dc2626',cursor:'pointer',fontSize:'0.72rem',fontFamily:'inherit',opacity:0.7}}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Painel: Ajuste */}
                          {eEditando&&(
                            <tr key={comp+'-adj'} style={{background:'#fffbeb'}}>
                              <td colSpan={5} style={{padding:'16px 20px'}}>
                                <div style={{background:'#ffffff',border:'1px solid #fde68a',borderRadius:10,padding:16}}>
                                  <div style={{fontSize:'0.78rem',fontWeight:700,color:'#b45309',marginBottom:12}}>✏️ Ajustando {fmtMes(m.competencia)} — Valor bruto: {fmt(m.total_liberado)}</div>
                                  <div style={{display:'grid',gridTemplateColumns:'180px 200px 1fr',gap:12,alignItems:'end'}}>
                                    <div><label style={sp.labelSm}>Valor Considerado *</label>
                                      <input type="number" step="0.01" value={ajusteForm.valor} onChange={e=>setAjusteForm(f=>({...f,valor:e.target.value}))} style={sp.inputInline} placeholder="Ex: 5000.00" />
                                    </div>
                                    <div><label style={sp.labelSm}>Motivo *</label>
                                      <select value={ajusteForm.motivo} onChange={e=>setAjusteForm(f=>({...f,motivo:e.target.value}))} style={sp.selectInline}>
                                        <option value="upsell">📈 Up-sell</option><option value="ajuste">✏️ Ajuste de valor</option>
                                        <option value="negociacao">🤝 Negociação</option><option value="correcao">🔧 Correção</option><option value="outro">📌 Outro</option>
                                      </select>
                                    </div>
                                    <div><label style={sp.labelSm}>Observação</label>
                                      <input value={ajusteForm.observacao} onChange={e=>setAjusteForm(f=>({...f,observacao:e.target.value}))} style={sp.inputInline} placeholder="Ex: Valor negociado em reunião" />
                                    </div>
                                  </div>
                                  <div style={{display:'flex',gap:10,marginTop:14,alignItems:'center'}}>
                                    <button onClick={()=>salvarAjuste(m.competencia,m.total_liberado)} disabled={salvandoAjuste||!ajusteForm.valor}
                                      style={{background:'#f0b429',color:'#000',border:'none',borderRadius:8,padding:'9px 20px',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit',opacity:!ajusteForm.valor?0.5:1}}>
                                      {salvandoAjuste?'Salvando...':'💾 Salvar Ajuste'}
                                    </button>
                                    <span style={{color:'#8b92b0',fontSize:'0.75rem'}}>O valor bruto será mantido no histórico</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Painel: Meta manual */}
                          {eMetaAberta&&(
                            <tr key={comp+'-meta'} style={{background:'rgba(52,211,153,0.02)'}}>
                              <td colSpan={5} style={{padding:'16px 20px'}}>
                                <div style={{background:'#ffffff',border:'1px solid rgba(52,211,153,0.3)',borderRadius:10,padding:20,animation:'fadeIn 0.2s ease'}}>
                                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                                    <div>
                                      <div style={{fontSize:'0.82rem',fontWeight:700,color:'#16a34a',marginBottom:3}}>
                                        🎯 {temMeta?'Editar entrada na meta':'Marcar na meta'} — {fmtMes(m.competencia)}
                                      </div>
                                      <div style={{fontSize:'0.72rem',color:'#6b7280'}}>
                                        Mov.: <strong>{fmt(valConsiderado)}</strong>
                                        {temAjuste&&<span style={{color:'#f0b429'}}> (ajustado)</span>}
                                        {_isVB && <>{' · '}Peso VB: <strong style={{color:'#f0b429'}}>{fmtPct(peso*100)}</strong></>}
                                        {' · '}Consultor: <strong>{empresa.consultor_principal?.nome||'—'}</strong> ({fmtPct(pctCons)})
                                        {' · '}Sugerido: <strong style={{color:'#16a34a'}}>{fmt(valorMetaCalc)}</strong>
                                      </div>
                                    </div>
                                    {temMeta&&<div style={{background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.2)',borderRadius:8,padding:'6px 14px',textAlign:'right'}}>
                                      <div style={{fontSize:'0.6rem',color:'#6b7280',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>Meta atual</div>
                                      <div style={{fontWeight:700,color:'#16a34a'}}>{fmt(metaGravada.valor_meta)}</div>
                                    </div>}
                                  </div>
                                  <div style={{display:'grid',gridTemplateColumns:'220px 220px 1fr',gap:12,alignItems:'end',marginBottom:14}}>
                                    <div>
                                      <label style={sp.labelSm}>Valor que entra na meta *</label>
                                      <input type="number" step="0.01" value={metaForm.valor} onChange={e=>setMetaForm(f=>({...f,valor:e.target.value}))}
                                        style={{...sp.inputInline,border:'1px solid rgba(52,211,153,0.4)',fontWeight:700}} placeholder="Ex: 3000.00" />
                                      {/* Atalhos de cálculo */}
                                      <div style={{display:'flex',gap:5,marginTop:6,flexWrap:'wrap'}}>
                                        {[
                                          // Só mostra atalho de peso se for Vegas Benefícios
                                          ...(_isVB ? [{label:`${fmtPct(peso*100)}% peso`, val: valorMetaCalc}] : []),
                                          {label:'Movimentação', val: valConsiderado},
                                          {label:'Bruto',        val: m.total_liberado},
                                        ].filter((v,i,a)=>a.findIndex(x=>x.val===v.val)===i).map(opt=>(
                                          <button key={opt.label} onClick={()=>setMetaForm(f=>({...f,valor:opt.val}))}
                                            style={{background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.2)',borderRadius:5,padding:'3px 8px',color:'#16a34a',cursor:'pointer',fontSize:'0.65rem',fontFamily:'inherit',fontWeight:600}}>
                                            {opt.label}: {fmt(opt.val)}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label style={sp.labelSm}>Regra aplicada</label>
                                      <select value={metaForm.regra} onChange={e=>setMetaForm(f=>({...f,regra:e.target.value}))}
                                        style={{...sp.selectInline,border:'1px solid rgba(52,211,153,0.3)'}}>
                                        <option value="beneficio">✅ 1ª Recarga (Benefícios/Bônus)</option>
                                        <option value="convenio">📅 3º Mês (Convênio/Mobilidade)</option>
                                        <option value="manual">✏️ Inclusão Manual</option>
                                      </select>
                                    </div>
                                    <div style={{display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                                      <div style={{background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:8,padding:'10px 14px'}}>
                                        <div style={{fontSize:'0.65rem',color:'#6b7280',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Fórmula aplicada</div>
                                        <div style={{fontSize:'0.78rem',color:'#4b5563'}}>
                                          {fmt(valConsiderado)}
                                          {_isVB && <> × <span style={{color:'#f0b429',fontWeight:700}}>{fmtPct(peso*100)} peso</span></>}
                                          {' '}× <span style={{color:'#2563eb',fontWeight:700}}>{fmtPct(pctCons)} cons.</span> = <strong style={{color:'#16a34a'}}>{fmt(valorMetaCalc)}</strong>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{display:'flex',gap:10,alignItems:'center'}}>
                                    <button onClick={()=>salvarMetaManual(comp,valConsiderado)} disabled={salvandoMeta||!metaForm.valor}
                                      style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit',opacity:!metaForm.valor?0.5:1}}>
                                      {salvandoMeta?'Salvando...':temMeta?'💾 Atualizar':'🎯 Confirmar na Meta'}
                                    </button>
                                    <button onClick={()=>setMetaMes(null)} style={{background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'10px 18px',color:'#4a5068',cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'}}>Cancelar</button>
                                    <span style={{color:'#8b92b0',fontSize:'0.72rem'}}>Aparecerá no dashboard como "Apurado na Meta"</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        {/* Painel de Upsell */}
                        {upsellMes === comp && (()=>{
                          const metaBase    = valorMetas.find(v=>v.regra!=='upsell');
                          const mesMetaComp = metaBase?.competencia_meta?.substring(0,7)||'';
                          const valorBase   = metaBase?.valor_considerado||0;
                          const excedente   = Math.max(0, m.total_liberado - valorBase);
                          const _isVB       = (empresa?.produto_contratado||'').toLowerCase().includes('vegas benef');
                          const _pesoUp     = _isVB ? peso : 1;
                          const valorUpsell = Math.round(excedente*_pesoUp*(pctCons/100)*100)/100;
                          const jaTemUpsell = valorMetas.find(v=>v.competencia_meta?.substring(0,7)===comp&&v.regra==='upsell');
                          return (
                            <tr key={comp+'-up'} style={{background:'rgba(8,145,178,0.04)',borderTop:'1px solid rgba(8,145,178,0.12)'}}>
                              <td colSpan={5} style={{padding:'16px 20px'}}>
                                <div style={{marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
                                  <span style={{color:'#0891b2',fontWeight:700,fontSize:'0.88rem'}}>📈 Upsell — {fmtMes(comp+'-01')}</span>
                                  {jaTemUpsell&&<span style={{background:'rgba(8,145,178,0.1)',color:'#0891b2',borderRadius:4,padding:'1px 8px',fontSize:'0.72rem',fontWeight:700}}>já registrado</span>}
                                </div>
                                <div style={{display:'flex',gap:16,flexWrap:'wrap',background:'white',border:'1px solid #e4e7ef',borderRadius:10,padding:'12px 16px',alignItems:'center'}}>
                                  <div><div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',marginBottom:2}}>Movimentação</div><div style={{fontWeight:700}}>{fmt(m.total_liberado)}</div></div>
                                  <span style={{color:'#9ca3af'}}>−</span>
                                  <div><div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',marginBottom:2}}>Base (meta {fmtMes(mesMetaComp+'-01')})</div><div style={{fontWeight:700,color:'#16a34a'}}>{fmt(valorBase)}</div></div>
                                  <span style={{color:'#9ca3af'}}>=</span>
                                  <div><div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',marginBottom:2}}>Excedente</div><div style={{fontWeight:700,color:'#0891b2'}}>{fmt(excedente)}</div></div>
                                  {_pesoUp<1&&<><span style={{color:'#9ca3af'}}>×</span><div><div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',marginBottom:2}}>Peso VB</div><div style={{fontWeight:700,color:'#f0b429'}}>{fmtPct(_pesoUp*100)}</div></div></>}
                                  <span style={{color:'#9ca3af'}}>×</span>
                                  <div><div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',marginBottom:2}}>% Consultor</div><div style={{fontWeight:700,color:'#2563eb'}}>{fmtPct(pctCons)}</div></div>
                                  <div style={{borderLeft:'2px solid #e4e7ef',paddingLeft:16}}>
                                    <div style={{color:'#6b7280',fontSize:'0.68rem',textTransform:'uppercase',marginBottom:2}}>Comissão upsell</div>
                                    <div style={{fontWeight:800,color:'#0891b2',fontSize:'1.1rem'}}>{fmt(valorUpsell)}</div>
                                  </div>
                                  <div style={{marginLeft:'auto',display:'flex',gap:8,flexWrap:'wrap'}}>
                                    {jaTemUpsell&&<button onClick={async()=>{if(!confirm('Remover upsell?'))return;await supabase.from('valor_meta_empresa').delete().eq('empresa_id',empresa.id).eq('competencia_meta',comp+'-01').eq('regra','upsell');await carregar();setUpsellMes(null);}} style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.15)',borderRadius:8,padding:'8px 14px',color:'#dc2626',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit'}}>✕ Remover</button>}
                                    <button disabled={salvandoUpsell||excedente<=0} onClick={async()=>{
                                      setSalvandoUpsell(true);
                                      await supabase.from('valor_meta_empresa').delete().eq('empresa_id',empresa.id).eq('competencia_meta',comp+'-01').eq('regra','upsell');
                                      const {error}=await supabase.from('valor_meta_empresa').insert({empresa_id:empresa.id,produto_id:empresa.produto_id,consultor_id:empresa.consultor_principal_id||null,competencia_meta:comp+'-01',valor_bruto:m.total_liberado,valor_considerado:excedente,valor_meta:valorUpsell,pct_consultor:pctCons,regra:'upsell',mes_sequencia:0});
                                      if(!error){await carregar();setUpsellMes(null);}else alert('Erro: '+error.message);
                                      setSalvandoUpsell(false);
                                    }} style={{background:excedente>0?'#0891b2':'#e5e7eb',color:excedente>0?'white':'#9ca3af',border:'none',borderRadius:8,padding:'8px 22px',fontWeight:700,cursor:excedente>0?'pointer':'default',fontSize:'0.85rem',fontFamily:'inherit'}}>
                                      {salvandoUpsell?'Salvando...':'📈 Aplicar Upsell'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
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
  page:        {maxWidth:1200,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#1a1d2e',background:'#f5f6fa',minHeight:'100vh'},
  header:      {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:16},
  tag:         {color:'#b45309',fontWeight:800,fontSize:'0.8rem',letterSpacing:2,marginBottom:6,textTransform:'uppercase'},
  title:       {fontSize:'1.6rem',fontWeight:700,margin:0},
  btnBack:     {background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:8,padding:'8px 14px',color:'#4a5068',cursor:'pointer',fontSize:'0.82rem',fontFamily:'inherit',whiteSpace:'nowrap'},
  btnPri:      {background:'#f0b429',color:'#000',border:'none',borderRadius:10,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'},
  btnSec:      {background:'#eaecf2',color:'#1a1d2e',border:'1px solid #e4e7ef',borderRadius:10,padding:'10px 18px',fontWeight:600,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'},
  erroBox:     {background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:10,padding:'12px 16px',marginBottom:20,color:'#dc2626',fontSize:'0.85rem'},
  resumoCard:  {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:12,padding:'16px 18px',display:'flex',flexDirection:'column',gap:4},
  resumoL:     {color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1},
  resumoV:     {fontSize:'1.1rem',fontWeight:700,color:'#1a1d2e'},
  card:        {background:'#ffffff',border:'1px solid #e4e7ef',borderRadius:16,padding:24},
  cardTitle:   {fontSize:'0.72rem',fontWeight:700,color:'#8b92b0',textTransform:'uppercase',letterSpacing:1},
  label:       {display:'block',color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6,fontWeight:600},
  labelSm:     {display:'block',color:'#8b92b0',fontSize:'0.68rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6},
  input:       {background:'#ffffff',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',color:'#1a1d2e',fontSize:'0.88rem',fontFamily:'inherit',width:'100%',boxSizing:'border-box'},
  select:      {background:'#ffffff',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',color:'#1a1d2e',fontSize:'0.88rem',fontFamily:'inherit',width:'100%',cursor:'pointer',boxSizing:'border-box'},
  inputInline: {width:'100%',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',fontSize:'0.9rem',fontFamily:'inherit',boxSizing:'border-box',color:'#1a1d2e'},
  selectInline:{width:'100%',border:'1px solid #d1d5e8',borderRadius:8,padding:'9px 12px',fontSize:'0.88rem',fontFamily:'inherit',boxSizing:'border-box',color:'#1a1d2e',cursor:'pointer'},
  statusBtn:   {background:'#f5f6fa',border:'1px solid #e4e7ef',borderRadius:10,padding:'12px 24px',color:'#8b92b0',cursor:'pointer',fontWeight:600,fontSize:'0.88rem',fontFamily:'inherit',flex:1},
  spin:        {width:36,height:36,border:'3px solid #e4e7ef',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 16px',animation:'spin 0.8s linear infinite'},
};
