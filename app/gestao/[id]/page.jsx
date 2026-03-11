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

const TIPO_CONFIG = {
  contato:    { icon:'📞', label:'Contato',     cor:'#60a5fa' },
  prazo:      { icon:'⏳', label:'Prazo Extra',  cor:'#f0b429' },
  juros:      { icon:'💸', label:'Juros/Boleto', cor:'#a78bfa' },
  reclamacao: { icon:'⚠️', label:'Reclamação',  cor:'#f87171' },
  negociacao: { icon:'🤝', label:'Negociação',  cor:'#34d399' },
  outro:      { icon:'📌', label:'Outro',        cor:'#9ca3af' },
};

export default function GestaoEmpresaDetalhe({ params }) {
  const router = useRouter();
  const id     = params?.id;

  const [empresa, setEmpresa]         = useState(null);
  const [form, setForm]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [salvando, setSalvando]       = useState(false);
  const [sucesso, setSucesso]         = useState(false);
  const [erro, setErro]               = useState('');
  const [editando, setEditando]       = useState(false);

  const [historico, setHistorico]     = useState([]);
  const [novaOco, setNovaOco]         = useState({ tipo:'contato', titulo:'', descricao:'' });
  const [adicionando, setAdicionando] = useState(false);
  const [salvandoOco, setSalvandoOco] = useState(false);

  const [consultores, setConsultores] = useState([]);
  const [parceiros, setParceiros]     = useState([]);
  const [produtos, setProdutos]       = useState([]);

  useEffect(() => { if (id) carregarTudo(); }, [id]);

  async function carregarTudo() {
    setLoading(true);
    const [{ data: emp }, { data: cons }, { data: parc }, { data: prods }, { data: hist }] = await Promise.all([
      supabase.from('empresas').select(`
        *,
        consultor_principal:consultor_principal_id (id, nome),
        consultor_agregado:consultor_agregado_id (id, nome),
        parceiro:parceiro_id (id, nome)
      `).eq('id', id).single(),
      supabase.from('consultores').select('id, nome, gestor').eq('ativo', true).order('nome'),
      supabase.from('parceiros').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome, peso').order('nome'),
      supabase.from('historico_empresa').select('*').eq('empresa_id', id).order('criado_em', { ascending: false }),
    ]);

    setEmpresa(emp);
    setConsultores(cons || []);
    setParceiros(parc || []);
    setProdutos(prods || []);
    setHistorico(hist || []);

    if (emp) {
      setForm({
        potencial_movimentacao: emp.potencial_movimentacao || 0,
        categoria:              emp.categoria || '',
        produto_contratado:     emp.produto_contratado || '',
        peso_categoria:         emp.peso_categoria || 1,
        taxa_negativa:          emp.taxa_negativa || 0,
        taxa_positiva:          emp.taxa_positiva || 0,
        consultor_principal_id: emp.consultor_principal_id || '',
        consultor_agregado_id:  emp.consultor_agregado_id || '',
        parceiro_id:            emp.parceiro_id || '',
        ativo:                  emp.ativo ?? true,
      });
    }
    setLoading(false);
  }

  async function salvar() {
    setSalvando(true); setErro(''); setSucesso(false);
    try {
      const payload = {
        potencial_movimentacao: parseFloat(form.potencial_movimentacao) || 0,
        categoria:              form.categoria,
        produto_contratado:     form.produto_contratado,
        peso_categoria:         parseFloat(form.peso_categoria) || 1,
        taxa_negativa:          parseFloat(form.taxa_negativa) || 0,
        taxa_positiva:          parseFloat(form.taxa_positiva) || 0,
        consultor_principal_id: form.consultor_principal_id || null,
        consultor_agregado_id:  form.consultor_agregado_id  || null,
        parceiro_id:            form.parceiro_id             || null,
        ativo:                  form.ativo,
      };
      const { error } = await supabase.from('empresas').update(payload).eq('id', id);
      if (error) throw error;
      setSucesso(true);
      setEditando(false);
      await carregarTudo();
      setTimeout(() => setSucesso(false), 3000);
    } catch(err) { setErro(err.message); }
    setSalvando(false);
  }

  async function salvarOcorrencia() {
    if (!novaOco.titulo.trim()) return;
    setSalvandoOco(true);
    const { error } = await supabase.from('historico_empresa').insert({
      empresa_id: id,
      tipo:       novaOco.tipo,
      titulo:     novaOco.titulo.trim(),
      descricao:  novaOco.descricao.trim() || null,
    });
    if (!error) {
      setNovaOco({ tipo:'contato', titulo:'', descricao:'' });
      setAdicionando(false);
      const { data } = await supabase.from('historico_empresa').select('*').eq('empresa_id', id).order('criado_em', { ascending: false });
      setHistorico(data || []);
    }
    setSalvandoOco(false);
  }

  async function deletarOcorrencia(ocId) {
    if (!confirm('Remover este registro do histórico?')) return;
    await supabase.from('historico_empresa').delete().eq('id', ocId);
    setHistorico(h => h.filter(x => x.id !== ocId));
  }

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  function onProdutoChange(nomeProd) {
    set('produto_contratado', nomeProd);
    const prod = produtos.find(p => p.nome === nomeProd);
    if (prod?.peso) set('peso_categoria', prod.peso);
  }

  if (loading) return (
    <div style={{ ...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}><div style={s.spin}></div><div style={{ color:'#6b7280' }}>Carregando...</div></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!empresa) return (
    <div style={{ ...s.page, textAlign:'center', paddingTop:80 }}>
      <div style={{ fontSize:'2rem', marginBottom:12 }}>❌</div>
      <div style={{ color:'#f87171' }}>Empresa não encontrada</div>
      <button style={{ ...s.btnSec, marginTop:20 }} onClick={() => router.push('/gestao')}>← Voltar</button>
    </div>
  );

  const COR_CAT = { 'Benefícios':'#60a5fa', 'Bônus':'#a78bfa', 'Convênio':'#34d399', 'Taxa Negativa':'#f87171' };
  const corCat  = COR_CAT[empresa.categoria] || '#9ca3af';
  const CATEGORIAS = ['Benefícios', 'Bônus', 'Convênio', 'Taxa Negativa'];

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input:focus,select:focus,textarea:focus{border-color:rgba(240,180,41,0.5)!important;outline:none;}`}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <button style={s.btnBack} onClick={() => router.push('/gestao')}>← Voltar</button>
          <div>
            <div style={s.tag}>♠ Vegas Card · Gestão</div>
            <h1 style={s.title}>{empresa.nome}</h1>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:4 }}>
              <span style={{ color:'#6b7280', fontSize:'0.82rem' }}>ID {empresa.produto_id}</span>
              <span style={{ color:'#374151' }}>·</span>
              <span style={{ background:`${corCat}18`, color:corCat, border:`1px solid ${corCat}30`, borderRadius:6, padding:'2px 8px', fontSize:'0.7rem', fontWeight:600 }}>{empresa.categoria}</span>
              <span style={{ background: empresa.ativo?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.1)', color:empresa.ativo?'#34d399':'#f87171', border:`1px solid ${empresa.ativo?'rgba(52,211,153,0.3)':'rgba(248,113,113,0.3)'}`, borderRadius:6, padding:'2px 8px', fontSize:'0.7rem', fontWeight:600 }}>
                {empresa.ativo ? '● Ativa' : '● Inativa'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {sucesso && <span style={{ color:'#34d399', fontSize:'0.85rem', fontWeight:600 }}>✅ Salvo com sucesso!</span>}
          {!editando
            ? <button style={s.btnPri} onClick={() => setEditando(true)}>✏️ Editar</button>
            : <>
                <button style={s.btnSec} onClick={() => { setEditando(false); setErro(''); }}>Cancelar</button>
                <button style={s.btnPri} onClick={salvar} disabled={salvando}>
                  {salvando ? '⏳ Salvando...' : '💾 Salvar Alterações'}
                </button>
              </>
          }
        </div>
      </div>

      {erro && <div style={s.erroBox}>❌ {erro}</div>}

      <div style={s.grid}>

        {/* BLOCO 1: Informações fixas */}
        <div style={s.card}>
          <div style={s.cardTitle}>📋 Informações Cadastrais</div>
          <div style={s.infoGrid}>
            <InfoItem label="CNPJ"             value={empresa.cnpj || '—'} />
            <InfoItem label="Data Cadastro"    value={fmtDate(empresa.data_cadastro)} />
            <InfoItem label="Cidade"           value={empresa.cidade || '—'} />
            <InfoItem label="Estado"           value={empresa.estado || '—'} />
            <InfoItem label="Cartões Emitidos" value={empresa.cartoes_emitidos || 0} />
            <InfoItem label="Dias de Prazo"    value={empresa.dias_prazo || '—'} />
          </div>
        </div>

        {/* BLOCO 2: Produto & Financeiro */}
        <div style={s.card}>
          <div style={s.cardTitle}>💰 Produto & Financeiro</div>
          <div style={s.formGrid}>
            <FormField label="Categoria" editando={editando}>
              {editando
                ? <select style={s.select} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                : <span style={{ color:corCat, fontWeight:600 }}>{empresa.categoria}</span>}
            </FormField>
            <FormField label="Produto Contratado" editando={editando}>
              {editando
                ? <select style={s.select} value={form.produto_contratado} onChange={e => onProdutoChange(e.target.value)}>
                    <option value="">— Selecione —</option>
                    {produtos.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                  </select>
                : <span>{empresa.produto_contratado || '—'}</span>}
            </FormField>
            <FormField label="Peso (%)" editando={editando}>
              {editando
                ? <input style={s.input} type="number" step="0.01" min="0" max="5" value={form.peso_categoria} onChange={e => set('peso_categoria', e.target.value)} />
                : <span style={{ color:'#f0b429', fontWeight:600 }}>{((empresa.peso_categoria||1)*100).toFixed(0)}%</span>}
            </FormField>
            <FormField label="Potencial de Movimentação" editando={editando}>
              {editando
                ? <input style={s.input} type="number" step="0.01" min="0" value={form.potencial_movimentacao} onChange={e => set('potencial_movimentacao', e.target.value)} />
                : <span style={{ color:'#34d399', fontWeight:700, fontSize:'1.1rem' }}>{fmt(empresa.potencial_movimentacao)}</span>}
            </FormField>
            <FormField label="Taxa Positiva (%)" editando={editando}>
              {editando
                ? <input style={s.input} type="number" step="0.001" min="0" value={form.taxa_positiva} onChange={e => set('taxa_positiva', e.target.value)} />
                : <span style={{ color:'#34d399' }}>{empresa.taxa_positiva > 0 ? `${(empresa.taxa_positiva*100).toFixed(2)}%` : '—'}</span>}
            </FormField>
            <FormField label="Taxa Negativa (%)" editando={editando}>
              {editando
                ? <input style={s.input} type="number" step="0.001" min="0" value={form.taxa_negativa} onChange={e => set('taxa_negativa', e.target.value)} />
                : <span style={{ color: empresa.taxa_negativa > 0 ? '#f87171':'#374151' }}>
                    {empresa.taxa_negativa > 0 ? `${(empresa.taxa_negativa*100).toFixed(2)}%` : '—'}
                  </span>}
            </FormField>
          </div>
        </div>

        {/* BLOCO 3: Equipe Comercial */}
        <div style={s.card}>
          <div style={s.cardTitle}>👥 Equipe Comercial</div>
          <div style={s.formGrid}>
            <FormField label="Consultor Principal" editando={editando}>
              {editando
                ? <select style={s.select} value={form.consultor_principal_id} onChange={e => set('consultor_principal_id', e.target.value)}>
                    <option value="">— Sem consultor —</option>
                    {consultores.map(c => <option key={c.id} value={c.id}>{c.nome}{c.gestor ? ` (${c.gestor})` : ''}</option>)}
                  </select>
                : <span style={{ fontWeight:600 }}>{empresa.consultor_principal?.nome || '—'}</span>}
            </FormField>
            <FormField label="Consultor Agregado" editando={editando}>
              {editando
                ? <select style={s.select} value={form.consultor_agregado_id} onChange={e => set('consultor_agregado_id', e.target.value)}>
                    <option value="">— Nenhum —</option>
                    {consultores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                : <span style={{ color:'#9ca3af' }}>{empresa.consultor_agregado?.nome || '—'}</span>}
            </FormField>
            <FormField label="Parceiro Comercial" editando={editando}>
              {editando
                ? <select style={s.select} value={form.parceiro_id} onChange={e => set('parceiro_id', e.target.value)}>
                    <option value="">— Nenhum —</option>
                    {parceiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                : <span style={{ color:'#9ca3af' }}>{empresa.parceiro?.nome || '—'}</span>}
            </FormField>
          </div>
        </div>

        {/* BLOCO 4: Status */}
        <div style={s.card}>
          <div style={s.cardTitle}>⚙️ Status da Empresa</div>
          <div style={{ marginTop:16 }}>
            {editando ? (
              <div style={{ display:'flex', gap:12 }}>
                <button onClick={() => set('ativo', true)} style={{ ...s.statusBtn, ...(form.ativo ? s.statusBtnAtivo : {}) }}>✅ Ativa</button>
                <button onClick={() => set('ativo', false)} style={{ ...s.statusBtn, ...(!form.ativo ? s.statusBtnInativo : {}) }}>❌ Inativa</button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 0' }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background: empresa.ativo?'#34d399':'#f87171' }}></div>
                <span style={{ fontWeight:600, fontSize:'1rem', color: empresa.ativo?'#34d399':'#f87171' }}>
                  {empresa.ativo ? 'Empresa Ativa' : 'Empresa Inativa'}
                </span>
              </div>
            )}
            <p style={{ color:'#4b5563', fontSize:'0.78rem', marginTop:12, lineHeight:1.6 }}>
              {empresa.ativo ? 'Esta empresa aparece em todos os relatórios e dashboards.' : 'Esta empresa está oculta dos relatórios e dashboards ativos.'}
            </p>
          </div>
        </div>

        {/* BLOCO 5: Histórico CRM — largura total */}
        <div style={{ ...s.card, gridColumn:'1 / -1' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <div style={s.cardTitle}>📝 Histórico & CRM</div>
              <div style={{ color:'#4b5563', fontSize:'0.78rem', marginTop:2 }}>
                {historico.length} {historico.length === 1 ? 'ocorrência registrada' : 'ocorrências registradas'}
              </div>
            </div>
            <button style={s.btnPri} onClick={() => setAdicionando(a => !a)}>
              {adicionando ? '✕ Cancelar' : '+ Nova Ocorrência'}
            </button>
          </div>

          {adicionando && (
            <div style={{ background:'rgba(240,180,41,0.04)', border:'1px solid rgba(240,180,41,0.15)', borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ color:'#6b7280', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Tipo</div>
                  <select style={s.select} value={novaOco.tipo} onChange={e => setNovaOco(n => ({...n, tipo: e.target.value}))}>
                    <option value="contato">📞 Contato</option>
                    <option value="prazo">⏳ Prazo Extra</option>
                    <option value="juros">💸 Juros / Boleto</option>
                    <option value="reclamacao">⚠️ Reclamação</option>
                    <option value="negociacao">🤝 Negociação</option>
                    <option value="outro">📌 Outro</option>
                  </select>
                </div>
                <div>
                  <div style={{ color:'#6b7280', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Título *</div>
                  <input style={s.input} placeholder="Ex: Cliente solicitou 15 dias a mais para pagamento"
                    value={novaOco.titulo} onChange={e => setNovaOco(n => ({...n, titulo: e.target.value}))} />
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ color:'#6b7280', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Descrição / Detalhes</div>
                <textarea style={{ ...s.input, height:90, resize:'vertical', lineHeight:1.6 }}
                  placeholder="Detalhes adicionais, valores, datas, responsável..."
                  value={novaOco.descricao} onChange={e => setNovaOco(n => ({...n, descricao: e.target.value}))} />
              </div>
              <button style={{ ...s.btnPri, opacity: !novaOco.titulo.trim() ? 0.5 : 1 }}
                onClick={salvarOcorrencia} disabled={salvandoOco || !novaOco.titulo.trim()}>
                {salvandoOco ? '⏳ Salvando...' : '💾 Salvar Ocorrência'}
              </button>
            </div>
          )}

          {historico.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'#374151', fontSize:'0.85rem' }}>
              📭 Nenhuma ocorrência registrada ainda — clique em "+ Nova Ocorrência" para começar
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {historico.map((h) => {
                const cfg   = TIPO_CONFIG[h.tipo] || TIPO_CONFIG.outro;
                const dt    = new Date(h.criado_em);
                const dtFmt = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
                return (
                  <div key={h.id} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderLeft:`3px solid ${cfg.cor}`, borderRadius:10, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
                    <span style={{ fontSize:'1.3rem', flexShrink:0, marginTop:1 }}>{cfg.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span style={{ fontWeight:700, fontSize:'0.9rem' }}>{h.titulo}</span>
                          <span style={{ background:`${cfg.cor}18`, color:cfg.cor, border:`1px solid ${cfg.cor}30`, borderRadius:5, padding:'1px 8px', fontSize:'0.65rem', fontWeight:600, textTransform:'uppercase' }}>{cfg.label}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                          <span style={{ color:'#4b5563', fontSize:'0.72rem', whiteSpace:'nowrap' }}>{dtFmt}</span>
                          <button onClick={() => deletarOcorrencia(h.id)} title="Remover"
                            style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:6, padding:'3px 9px', color:'#f87171', cursor:'pointer', fontSize:'0.7rem', fontFamily:'inherit' }}>✕</button>
                        </div>
                      </div>
                      {h.descricao && <p style={{ color:'#9ca3af', fontSize:'0.83rem', margin:'0 0 4px', lineHeight:1.6 }}>{h.descricao}</p>}
                      <span style={{ color:'#374151', fontSize:'0.7rem' }}>por {h.criado_por}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <span style={{ color:'#4b5563', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1 }}>{label}</span>
      <span style={{ fontWeight:500, fontSize:'0.88rem' }}>{value}</span>
    </div>
  );
}

function FormField({ label, editando, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <span style={{ color: editando?'#9ca3af':'#4b5563', fontSize:'0.68rem', textTransform:'uppercase', letterSpacing:1 }}>{label}</span>
      <div style={{ fontSize:'0.9rem' }}>{children}</div>
    </div>
  );
}

const s = {
  page:            { maxWidth:1200, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh' },
  header:          { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:16 },
  tag:             { color:'#f0b429', fontWeight:800, fontSize:'0.8rem', letterSpacing:2, marginBottom:6, textTransform:'uppercase' },
  title:           { fontSize:'1.6rem', fontWeight:700, margin:0 },
  btnBack:         { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 14px', color:'#9ca3af', cursor:'pointer', fontSize:'0.82rem', fontFamily:'inherit' },
  btnPri:          { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'10px 22px', fontWeight:700, cursor:'pointer', fontSize:'0.88rem', fontFamily:'inherit' },
  btnSec:          { background:'rgba(255,255,255,0.07)', color:'#e8eaf0', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 18px', fontWeight:600, cursor:'pointer', fontSize:'0.88rem', fontFamily:'inherit' },
  erroBox:         { background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:'12px 16px', marginBottom:20, color:'#f87171', fontSize:'0.85rem' },
  grid:            { display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 },
  card:            { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 },
  cardTitle:       { fontSize:'0.72rem', fontWeight:700, marginBottom:16, color:'#6b7280', textTransform:'uppercase', letterSpacing:1 },
  infoGrid:        { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  formGrid:        { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  input:           { background:'#1e2235', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'9px 12px', color:'#e8eaf0', fontSize:'0.88rem', fontFamily:'inherit', width:'100%', boxSizing:'border-box' },
  select:          { background:'#1e2235', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'9px 12px', color:'#e8eaf0', fontSize:'0.88rem', fontFamily:'inherit', width:'100%', cursor:'pointer', boxSizing:'border-box' },
  statusBtn:       { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'12px 24px', color:'#6b7280', cursor:'pointer', fontWeight:600, fontSize:'0.88rem', fontFamily:'inherit', flex:1 },
  statusBtnAtivo:  { background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.3)', color:'#34d399' },
  statusBtnInativo:{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', color:'#f87171' },
  spin:            { width:36, height:36, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
};
