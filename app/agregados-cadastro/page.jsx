'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmtData = (d) => { if (!d) return '—'; const [y,m,dd] = String(d).substring(0,10).split('-'); return `${dd}/${m}/${y}`; };
const soDigitos = (v) => String(v||'').replace(/\D/g,'');

const FORM_VAZIO = {
  nome: '', cnpj: '', data_cadastro: '',
  produto_id: '', tipo: 'Individual',
  valor_titular: '', valor_dependente: '',
  consultor_principal_id: '', consultor_agregado_id: '',
};

export default function AgregadosCadastro() {
  const [empresas,    setEmpresas]    = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [produtos,    setProdutos]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [busca,       setBusca]       = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [form,        setForm]        = useState(FORM_VAZIO);
  const [salvando,    setSalvando]    = useState(false);
  const [erro,        setErro]        = useState('');
  const [sucesso,     setSucesso]     = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [{ data: emps }, { data: cons }, { data: prods }] = await Promise.all([
        supabase.from('empresas_agregadas').select(`
          id, cnpj, nome, data_cadastro, ativo,
          consultor_principal:consultor_principal_id (id, nome),
          consultor_agregado:consultor_agregado_id (id, nome),
          contratos:contratos_agregados (
            id, is_combo, combo_nome,
            produto_1:produto_1_id (nome),
            produto_2:produto_2_id (nome),
            produto_3:produto_3_id (nome)
          )
        `).order('nome'),
        supabase.from('consultores').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome'),
      ]);
      setEmpresas(emps || []);
      setConsultores(cons || []);
      setProdutos(prods || []);
    } catch (err) {
      console.error('[agregados-cadastro] erro ao carregar:', err);
    }
    setLoading(false);
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function abrirNova() {
    setForm(FORM_VAZIO); setErro(''); setSucesso(''); setModalAberto(true);
  }

  async function salvar() {
    setErro('');
    if (!form.nome.trim())            { setErro('Informe o nome da empresa.'); return; }
    if (!soDigitos(form.cnpj))        { setErro('Informe o CNPJ.'); return; }
    if (!form.produto_id)             { setErro('Selecione o produto.'); return; }
    if (!form.consultor_principal_id) { setErro('Selecione o consultor principal.'); return; }

    setSalvando(true);
    try {
      // 1. Empresa agregada
      const { data: empData, error: empErr } = await supabase
        .from('empresas_agregadas')
        .insert({
          nome: form.nome.trim(),
          cnpj: soDigitos(form.cnpj),
          data_cadastro: form.data_cadastro || null,
          consultor_principal_id: form.consultor_principal_id || null,
          consultor_agregado_id:  form.consultor_agregado_id  || null,
          ativo: true,
        })
        .select('id').single();
      if (empErr) throw new Error('Empresa: ' + empErr.message);

      // 2. Contrato agregado
      const prodNome = produtos.find(p => p.id === form.produto_id)?.nome || null;
      const { error: contErr } = await supabase
        .from('contratos_agregados')
        .insert({
          empresa_agregada_id: empData.id,
          produto_1_id: form.produto_id,
          is_combo: form.tipo === 'Combo',
          combo_nome: form.tipo === 'Combo' ? prodNome : null,
          valor_cobrado_titular_p1:    parseFloat(form.valor_titular)    || 0,
          valor_cobrado_dependente_p1: parseFloat(form.valor_dependente) || 0,
          data_inicio: form.data_cadastro || null,
        });
      if (contErr) throw new Error('Contrato: ' + contErr.message);

      setSucesso('Empresa cadastrada!');
      setModalAberto(false);
      await carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err) {
      setErro('Erro ao salvar: ' + err.message);
    }
    setSalvando(false);
  }

  const produtosDaEmpresa = (e) => {
    const nomes = (e.contratos || []).flatMap(c =>
      c.is_combo && c.combo_nome
        ? [c.combo_nome]
        : [c.produto_1?.nome, c.produto_2?.nome, c.produto_3?.nome].filter(Boolean)
    );
    return [...new Set(nomes)].join(' · ') || '—';
  };

  const empresasFiltradas = empresas.filter(e =>
    !busca ||
    e.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    e.cnpj?.includes(soDigitos(busca)) ||
    e.consultor_principal?.nome?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Cadastro de Empresas Agregadas</h1>
          <p style={s.sub}>Cadastro e listagem de WellHub · Total Pass · Telemedicina · Vidalink</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <Link href="/agregados" style={{ ...s.btnTab, textDecoration:'none' }}>📊 Dashboard</Link>
          {sucesso && <span style={{ color:'#16a34a', fontWeight:600, fontSize:'0.85rem' }}>✅ {sucesso}</span>}
          <button onClick={abrirNova} style={s.btnPri}>+ Nova empresa</button>
        </div>
      </div>

      {/* Busca */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="🔍 Buscar empresa, CNPJ ou consultor..."
          value={busca} onChange={e=>setBusca(e.target.value)}
          style={{ flex:2, minWidth:220, ...s.inputFiltro }} />
        <span style={{ color:'#8b92b0', fontSize:'0.75rem', marginLeft:'auto' }}>
          {empresasFiltradas.length} empresas
        </span>
      </div>

      {/* Listagem */}
      <div style={s.card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:48 }}><div style={s.spin}></div></div>
        ) : empresasFiltradas.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#8b92b0' }}>
            Nenhuma empresa encontrada.
          </div>
        ) : (
          <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'62vh',
            border:'1px solid #f0f2f8', borderRadius:8 }}>
            <table style={s.table}>
              <thead><tr>
                {['Empresa','CNPJ','Produto(s)','Consultor Principal','Consultor Agregado','Data Cadastro','Status'].map(h=>
                  <th key={h} style={{ ...s.th, background:'#f9fafb', position:'sticky', top:0 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {empresasFiltradas.map((e,i) => (
                  <tr key={e.id} style={i%2===0?{background:'#f9fafb'}:{}}>
                    <td style={{ ...s.td, fontWeight:600, minWidth:180 }}>{e.nome}</td>
                    <td style={{ ...s.td, color:'#8b92b0', fontSize:'0.72rem' }}>{e.cnpj||'—'}</td>
                    <td style={{ ...s.td, color:'#a78bfa', fontSize:'0.78rem' }}>{produtosDaEmpresa(e)}</td>
                    <td style={s.td}>{e.consultor_principal?.nome||'—'}</td>
                    <td style={s.td}>{e.consultor_agregado?.nome||'—'}</td>
                    <td style={{ ...s.td, color:'#8b92b0' }}>{fmtData(e.data_cadastro)}</td>
                    <td style={s.td}>
                      <span style={{ background:e.ativo?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)',
                        color:e.ativo?'#34d399':'#f87171',
                        border:`1px solid ${e.ativo?'rgba(52,211,153,0.3)':'rgba(248,113,113,0.3)'}`,
                        borderRadius:6, padding:'2px 10px', fontSize:'0.7rem', fontWeight:600 }}>
                        {e.ativo?'● Ativa':'● Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nova empresa */}
      {modalAberto && (
        <div style={s.overlay} onClick={()=>setModalAberto(false)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={s.cardTitle}>🏢 Nova Empresa Agregada</div>
              <button onClick={()=>setModalAberto(false)} style={s.btnFechar}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1 / -1' }}>
                <label style={s.label}>Nome *</label>
                <input style={s.input} value={form.nome} onChange={e=>setF('nome', e.target.value)} />
              </div>
              <div>
                <label style={s.label}>CNPJ *</label>
                <input style={s.input} value={form.cnpj} onChange={e=>setF('cnpj', e.target.value)} placeholder="Somente números" />
              </div>
              <div>
                <label style={s.label}>Data Implantação</label>
                <input type="date" style={s.input} value={form.data_cadastro} onChange={e=>setF('data_cadastro', e.target.value)} />
              </div>
              <div>
                <label style={s.label}>Produto *</label>
                <select style={s.input} value={form.produto_id} onChange={e=>setF('produto_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Tipo</label>
                <select style={s.input} value={form.tipo} onChange={e=>setF('tipo', e.target.value)}>
                  <option value="Individual">Individual</option>
                  <option value="Combo">Combo</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Valor Titular</label>
                <input style={s.input} type="number" step="0.01" value={form.valor_titular} onChange={e=>setF('valor_titular', e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label style={s.label}>Valor Dependente</label>
                <input style={s.input} type="number" step="0.01" value={form.valor_dependente} onChange={e=>setF('valor_dependente', e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label style={s.label}>Consultor Principal *</label>
                <select style={s.input} value={form.consultor_principal_id} onChange={e=>setF('consultor_principal_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Consultor Agregado</label>
                <select style={s.input} value={form.consultor_agregado_id} onChange={e=>setF('consultor_agregado_id', e.target.value)}>
                  <option value="">— Nenhum —</option>
                  {consultores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            {erro && <div style={{ color:'#dc2626', fontSize:'0.82rem', marginTop:14 }}>{erro}</div>}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:22 }}>
              <button style={s.btnSec} onClick={()=>setModalAberto(false)}>Cancelar</button>
              <button style={s.btnPri} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : '💾 Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:       { maxWidth:1300, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#1a1d2e', background:'#f5f6fa', minHeight:'100vh' },
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:16 },
  tag:        { color:'#b45309', fontWeight:700, fontSize:'0.9rem', letterSpacing:2, marginBottom:8, textTransform:'uppercase' },
  title:      { fontSize:'1.8rem', fontWeight:700, margin:'0 0 6px' },
  sub:        { color:'#8b92b0', fontSize:'0.9rem' },
  btnTab:     { background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:10, padding:'9px 20px', color:'#8b92b0', cursor:'pointer', fontSize:'0.85rem', fontWeight:600, fontFamily:'inherit' },
  card:       { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:16, padding:24, marginBottom:20 },
  cardTitle:  { fontSize:'1rem', fontWeight:700 },
  spin:       { width:36, height:36, border:'3px solid #e4e7ef', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto', animation:'spin 0.8s linear infinite', display:'block' },
  btnPri:     { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'10px 22px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  btnSec:     { background:'#eaecf2', color:'#1a1d2e', border:'1px solid #e4e7ef', borderRadius:10, padding:'10px 22px', fontWeight:600, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  btnFechar:  { background:'transparent', border:'none', color:'#8b92b0', cursor:'pointer', fontSize:'1.1rem', fontFamily:'inherit' },
  table:      { width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' },
  th:         { padding:'8px 12px', textAlign:'left', color:'#8b92b0', fontWeight:500, borderBottom:'1px solid #e4e7ef', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.67rem', letterSpacing:0.5 },
  td:         { padding:'9px 12px', borderBottom:'1px solid #f0f2f8', whiteSpace:'nowrap' },
  inputFiltro:{ background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:8, padding:'7px 11px', color:'#1a1d2e', fontSize:'0.82rem', fontFamily:'inherit', outline:'none' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 },
  modal:      { background:'#ffffff', borderRadius:16, padding:'26px 28px', width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 10px 40px rgba(0,0,0,0.2)' },
  label:      { display:'block', color:'#8b92b0', fontSize:'0.72rem', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 },
  input:      { width:'100%', background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:8, padding:'9px 11px', color:'#1a1d2e', fontSize:'0.85rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box' },
};
