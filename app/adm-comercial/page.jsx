'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

// ── Equipes disponíveis ────────────────────────────────────────────────────
const EQUIPES = [
  'Credenciamento',
  'Pós Vendas',
  'Prospecção',
  'Key Account',
  'Suporte Comercial',
  'Inside',
  'Venda Nova',
  'Parcerias',
  'Outros',
];

const GESTORES = ['Ronny Peterson Izidorio', 'Marcos Rossi'];

const COR_EQUIPE = {
  'Credenciamento':    '#2563eb',
  'Pós Vendas':        '#16a34a',
  'Prospecção':        '#7c3aed',
  'Key Account':       '#ea580c',
  'Suporte Comercial': '#0891b2',
  'Inside':            '#db2777',
  'Venda Nova':        '#059669',
  'Parcerias':         '#d97706',
  'Outros':            '#6b7280',
};

// ── Subpáginas do menu ─────────────────────────────────────────────────────
const SUBS = [
  { key: 'vendedores', icon: '👤', label: 'Cadastro de Vendedores', desc: 'Gerencie a equipe comercial por time' },
  { key: 'parceiros',  icon: '🤝', label: 'Parceiros Comerciais',   desc: 'Cadastro e comissões de parceiros' },
];

// ══════════════════════════════════════════════════════════════════════════
// SUBPÁGINA: Cadastro de Vendedores
// ══════════════════════════════════════════════════════════════════════════
function PaginaVendedores() {
  const [consultores, setConsultores]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState(false);
  const [editando, setEditando]         = useState(null);
  const [adicionando, setAdicionando]   = useState(false);
  const [filtroEquipe, setFiltroEquipe] = useState('');
  const [filtroGestor, setFiltroGestor] = useState('');
  const [busca, setBusca]               = useState('');
  const [erro, setErro]                 = useState('');
  const [sucesso, setSucesso]           = useState('');

  const formVazio = { nome:'', gestor:'', equipe:'', setor:'', meta_mensal:0, telefone:'', email:'', ativo:true };
  const [form, setForm] = useState(formVazio);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from('consultores')
      .select('id, nome, gestor, equipe, setor, meta_mensal, telefone, email, ativo')
      .order('nome');
    setConsultores(data || []);
    setLoading(false);
  }

  async function salvarNovo() {
    if (!form.nome.trim()) { setErro('Informe o nome do vendedor'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('consultores').insert({
      nome:        form.nome.trim(),
      gestor:      form.gestor || null,
      equipe:      form.equipe || null,
      setor:       form.setor  || null,
      meta_mensal: parseFloat(form.meta_mensal) || 0,
      telefone:    form.telefone || null,
      email:       form.email    || null,
      ativo:       form.ativo,
    });
    if (error) { setErro('Erro: ' + error.message); }
    else { setSucesso('Vendedor cadastrado!'); setForm(formVazio); setAdicionando(false); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editando?.nome?.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('consultores').update({
      nome:        editando.nome.trim(),
      gestor:      editando.gestor  || null,
      equipe:      editando.equipe  || null,
      setor:       editando.setor   || null,
      meta_mensal: parseFloat(editando.meta_mensal) || 0,
      telefone:    editando.telefone || null,
      email:       editando.email    || null,
      ativo:       editando.ativo,
    }).eq('id', editando.id);
    if (error) { setErro('Erro: ' + error.message); }
    else { setSucesso('Salvo!'); setEditando(null); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function toggleAtivo(c) {
    await supabase.from('consultores').update({ ativo: !c.ativo }).eq('id', c.id);
    await carregar();
  }

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setE  = (k, v) => setEditando(e => ({ ...e, [k]: v }));

  // Equipes disponíveis para o gestor selecionado
  const equipesDoGestor = filtroGestor
    ? [...new Set(
        consultores
          .filter(c => c.gestor === filtroGestor)
          .map(c => c.equipe || 'Outros')
      )].sort()
    : EQUIPES;

  // Reseta equipe se não existe no gestor selecionado
  const handleGestorChange = (g) => {
    setFiltroGestor(g);
    setFiltroEquipe(''); // limpa equipe ao trocar gestor
  };

  // Agrupa por equipe para exibição
  const filtrados = consultores.filter(c => {
    if (busca && !c.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroEquipe && (c.equipe || 'Outros') !== filtroEquipe) return false;
    if (filtroGestor && c.gestor !== filtroGestor) return false;
    return true;
  });

  const porEquipe = {};
  filtrados.forEach(c => {
    const eq = c.equipe || 'Sem Equipe';
    if (!porEquipe[eq]) porEquipe[eq] = [];
    porEquipe[eq].push(c);
  });

  // KPIs
  const totalAtivos   = consultores.filter(c => c.ativo).length;
  const totalInativos = consultores.filter(c => !c.ativo).length;
  const equipes       = [...new Set(consultores.map(c => c.equipe || 'Sem Equipe').filter(Boolean))];

  const FormVendedor = ({ val, onChange, onSalvar, onCancelar, titulo }) => (
    <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
      padding:24, marginBottom:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>{titulo}</div>
      {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
        padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem', marginBottom:12 }}>{erro}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
        {/* Nome */}
        <div style={{ gridColumn:'span 2' }}>
          <label style={sL}>Nome *</label>
          <input style={sI} value={val.nome||''} onChange={e=>onChange('nome',e.target.value)} placeholder="Nome completo"/>
        </div>

        {/* Gestor */}
        <div>
          <label style={sL}>Gestor</label>
          <select style={sI} value={val.gestor||''} onChange={e=>onChange('gestor',e.target.value)}>
            <option value=''>— Selecionar —</option>
            {GESTORES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Equipe */}
        <div>
          <label style={sL}>Equipe</label>
          <select style={sI} value={val.equipe||''} onChange={e=>onChange('equipe',e.target.value)}>
            <option value=''>— Selecionar —</option>
            {EQUIPES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {/* Setor */}
        <div>
          <label style={sL}>Setor / Cargo</label>
          <input style={sI} value={val.setor||''} onChange={e=>onChange('setor',e.target.value)} placeholder="Ex: Consultor Senior"/>
        </div>

        {/* Meta mensal */}
        <div>
          <label style={sL}>Meta Mensal (R$)</label>
          <input style={sI} type='number' value={val.meta_mensal||0} onChange={e=>onChange('meta_mensal',e.target.value)} placeholder="0,00"/>
        </div>

        {/* Telefone */}
        <div>
          <label style={sL}>Telefone</label>
          <input style={sI} value={val.telefone||''} onChange={e=>onChange('telefone',e.target.value)} placeholder="(11) 99999-9999"/>
        </div>

        {/* Email */}
        <div>
          <label style={sL}>E-mail</label>
          <input style={sI} value={val.email||''} onChange={e=>onChange('email',e.target.value)} placeholder="email@exemplo.com"/>
        </div>

        {/* Status */}
        <div>
          <label style={sL}>Status</label>
          <select style={sI} value={String(val.ativo)} onChange={e=>onChange('ativo',e.target.value==='true')}>
            <option value='true'>✅ Ativo</option>
            <option value='false'>❌ Inativo</option>
          </select>
        </div>
      </div>

      <div style={{ display:'flex', gap:10 }}>
        <button style={sBtnPri} onClick={onSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : '💾 Salvar'}
        </button>
        <button style={sBtnSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Vendedores', val:consultores.length,  cor:'#1a1d2e' },
          { label:'Ativos',           val:totalAtivos,          cor:'#16a34a' },
          { label:'Inativos',         val:totalInativos,        cor:'#dc2626' },
          { label:'Equipes',          val:equipes.length,       cor:'#7c3aed' },
        ].map(k => (
          <div key={k.label} style={{ background:'#ffffff', border:'1px solid #e4e7ef',
            borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase',
              letterSpacing:1, marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:'1.4rem', fontWeight:800, color:k.cor }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Barra de ações */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="🔍 Buscar vendedor..." value={busca}
          onChange={e=>setBusca(e.target.value)}
          style={{ ...sI, flex:2, minWidth:200 }}/>

        {/* Gestor — primeiro filtro */}
        <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:170 }}>
          <span style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:1, fontWeight:600 }}>
            Gestor
          </span>
          <select value={filtroGestor} onChange={e=>handleGestorChange(e.target.value)}
            style={{ ...sI,
              borderColor: filtroGestor ? '#f0b429' : '#e4e7ef',
              background:  filtroGestor ? '#fff8e6' : '#ffffff',
              color:       filtroGestor ? '#b45309' : '#8b92b0',
              fontWeight:  filtroGestor ? 600 : 400,
            }}>
            <option value=''>Todos os gestores</option>
            {GESTORES.map(g => <option key={g} value={g}>{g.split(' ')[0]}</option>)}
          </select>
        </div>

        {/* Equipe — dependente do gestor */}
        <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:170 }}>
          <span style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:1, fontWeight:600 }}>
            Equipe {filtroGestor && <span style={{ color:'#f0b429' }}>· {filtroGestor.split(' ')[0]}</span>}
          </span>
          <select value={filtroEquipe} onChange={e=>setFiltroEquipe(e.target.value)}
            style={{ ...sI,
              borderColor: filtroEquipe ? '#f0b429' : '#e4e7ef',
              background:  filtroEquipe ? '#fff8e6' : '#ffffff',
              color:       filtroEquipe ? '#b45309' : '#8b92b0',
              fontWeight:  filtroEquipe ? 600 : 400,
            }}>
            <option value=''>
              {filtroGestor ? `Todas (${equipesDoGestor.length})` : 'Todas as equipes'}
            </option>
            {equipesDoGestor.map(e => {
              const total = consultores.filter(c =>
                (c.equipe||'Outros') === e && (!filtroGestor || c.gestor === filtroGestor)
              ).length;
              return <option key={e} value={e}>{e} ({total})</option>;
            })}
          </select>
        </div>

        {/* Limpar filtros */}
        {(busca || filtroGestor || filtroEquipe) && (
          <button onClick={() => { setBusca(''); setFiltroGestor(''); setFiltroEquipe(''); }}
            style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
              padding:'8px 14px', color:'#dc2626', fontSize:'0.78rem',
              cursor:'pointer', fontFamily:'inherit', fontWeight:600, alignSelf:'flex-end' }}>
            ✕ Limpar
          </button>
        )}

        {sucesso && <span style={{ color:'#16a34a', fontWeight:600, fontSize:'0.85rem' }}>✅ {sucesso}</span>}
        <button style={{ ...sBtnPri, marginLeft:'auto', alignSelf:'flex-end' }}
          onClick={() => { setAdicionando(true); setEditando(null); setErro(''); }}>
          + Novo Vendedor
        </button>
      </div>

      {/* Form novo */}
      {adicionando && (
        <FormVendedor val={form} onChange={setF} onSalvar={salvarNovo}
          onCancelar={() => { setAdicionando(false); setErro(''); }}
          titulo="➕ Novo Vendedor" />
      )}

      {/* Modal edição */}
      {editando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setEditando(null)}>
          <div style={{ background:'#f5f6fa', borderRadius:16, padding:24,
            width:'100%', maxWidth:760, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <FormVendedor val={editando} onChange={setE} onSalvar={salvarEdicao}
              onCancelar={() => { setEditando(null); setErro(''); }}
              titulo={`✏️ Editar — ${editando.nome}`} />
          </div>
        </div>
      )}

      {/* Lista por equipe */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#8b92b0' }}>Carregando...</div>
      ) : (
        Object.entries(porEquipe)
          .sort(([a],[b]) => a.localeCompare(b))
          .map(([equipe, membros]) => {
            const cor = COR_EQUIPE[equipe] || '#6b7280';
            const ativos = membros.filter(m => m.ativo).length;
            return (
              <div key={equipe} style={{ marginBottom:20 }}>
                {/* Header da equipe */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ background:`${cor}15`, border:`1px solid ${cor}30`,
                    borderRadius:8, padding:'4px 14px', color:cor, fontWeight:700,
                    fontSize:'0.82rem' }}>
                    {equipe}
                  </div>
                  <span style={{ color:'#8b92b0', fontSize:'0.75rem' }}>
                    {membros.length} vendedor{membros.length!==1?'es':''} · {ativos} ativo{ativos!==1?'s':''}
                  </span>
                  <div style={{ flex:1, height:1, background:'#e4e7ef' }}></div>
                </div>

                {/* Cards dos vendedores */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                  {membros.map(c => (
                    <div key={c.id} style={{
                      background:'#ffffff', border:`1px solid ${c.ativo ? '#e4e7ef' : '#fca5a5'}`,
                      borderRadius:12, padding:'16px 18px',
                      boxShadow:'0 1px 3px rgba(0,0,0,0.05)',
                      opacity: c.ativo ? 1 : 0.65,
                    }}>
                      {/* Nome + status */}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e' }}>{c.nome}</div>
                          <div style={{ fontSize:'0.72rem', color:'#8b92b0', marginTop:2 }}>
                            {c.setor || '—'} {c.gestor ? `· ${c.gestor.split(' ')[0]}` : ''}
                          </div>
                        </div>
                        <span style={{
                          background: c.ativo ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                          color: c.ativo ? '#16a34a' : '#dc2626',
                          border: `1px solid ${c.ativo ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`,
                          borderRadius:6, padding:'2px 8px', fontSize:'0.65rem', fontWeight:600,
                        }}>
                          {c.ativo ? '● Ativo' : '● Inativo'}
                        </span>
                      </div>

                      {/* Info */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                        <div>
                          <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Meta Mensal</div>
                          <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#f0b429' }}>
                            {c.meta_mensal > 0 ? fmt(c.meta_mensal) : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Telefone</div>
                          <div style={{ fontSize:'0.78rem', color:'#4a5068' }}>{c.telefone || '—'}</div>
                        </div>
                        {c.email && (
                          <div style={{ gridColumn:'span 2' }}>
                            <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>E-mail</div>
                            <div style={{ fontSize:'0.75rem', color:'#4a5068' }}>{c.email}</div>
                          </div>
                        )}
                      </div>

                      {/* Ações */}
                      <div style={{ display:'flex', gap:8, paddingTop:10, borderTop:'1px solid #f0f2f8' }}>
                        <button style={{ ...sBtnSec, flex:1, fontSize:'0.78rem', padding:'6px 10px' }}
                          onClick={() => { setEditando({...c}); setErro(''); }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => toggleAtivo(c)}
                          style={{ background: c.ativo ? '#fef2f2' : '#f0fdf4',
                            border: `1px solid ${c.ativo ? '#fca5a5' : '#86efac'}`,
                            borderRadius:8, padding:'6px 10px', flex:1,
                            color: c.ativo ? '#dc2626' : '#16a34a',
                            fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                          {c.ativo ? '⏸ Inativar' : '▶ Ativar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
      )}

      {filtrados.length === 0 && !loading && (
        <div style={{ textAlign:'center', padding:48, color:'#8b92b0', background:'#ffffff',
          border:'1px solid #e4e7ef', borderRadius:12 }}>
          Nenhum vendedor encontrado
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUBPÁGINA: Parceiros (placeholder por enquanto)
// ══════════════════════════════════════════════════════════════════════════
function PaginaParceiros() {
  return (
    <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
      padding:48, textAlign:'center', color:'#8b92b0' }}>
      <div style={{ fontSize:'2rem', marginBottom:12 }}>🤝</div>
      <div style={{ fontWeight:600, color:'#1a1d2e', marginBottom:8 }}>Parceiros Comerciais</div>
      <div style={{ fontSize:'0.85rem' }}>Em breve — cadastro completo de parceiros e comissões</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — Adm Comercial
// ══════════════════════════════════════════════════════════════════════════
export default function AdmComercial() {
  const [subPagina, setSubPagina] = useState(null);

  return (
    <div style={sPage}>
      <style>{`input:focus,select:focus,textarea:focus{border-color:#f0b429!important;outline:none;}`}</style>

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ color:'#b45309', fontWeight:700, fontSize:'0.7rem',
          letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>
          Vegas Card
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {subPagina && (
            <button onClick={() => setSubPagina(null)}
              style={{ background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:8,
                padding:'6px 12px', color:'#4a5068', cursor:'pointer',
                fontSize:'0.8rem', fontFamily:'inherit' }}>
              ← Voltar
            </button>
          )}
          <div>
            <h1 style={{ fontSize:'1.4rem', fontWeight:700, color:'#1a1d2e', margin:0 }}>
              {subPagina ? SUBS.find(s=>s.key===subPagina)?.label : 'Adm Comercial'}
            </h1>
            <p style={{ color:'#8b92b0', fontSize:'0.82rem', margin:'4px 0 0' }}>
              {subPagina
                ? SUBS.find(s=>s.key===subPagina)?.desc
                : 'Administração da equipe e parceiros comerciais'}
            </p>
          </div>
        </div>
      </div>

      {/* Menu de subpáginas */}
      {!subPagina && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:16 }}>
          {SUBS.map(s => (
            <button key={s.key} onClick={() => setSubPagina(s.key)}
              style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
                padding:'24px 20px', textAlign:'left', cursor:'pointer',
                boxShadow:'0 1px 3px rgba(0,0,0,0.06)', fontFamily:'inherit',
                transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-1px)';}}
              onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)';e.currentTarget.style.transform='translateY(0)';}}>
              <div style={{ fontSize:'1.5rem', marginBottom:10 }}>{s.icon}</div>
              <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:'0.8rem', color:'#8b92b0', lineHeight:1.4 }}>{s.desc}</div>
              <div style={{ marginTop:16, color:'#f0b429', fontSize:'0.78rem', fontWeight:600 }}>Acessar →</div>
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo da subpágina */}
      {subPagina === 'vendedores' && <PaginaVendedores />}
      {subPagina === 'parceiros'  && <PaginaParceiros />}
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const sPage   = { maxWidth:1200, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#1a1d2e', background:'#f5f6fa', minHeight:'100vh' };
const sL      = { display:'block', color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1, marginBottom:5, fontWeight:600 };
const sI      = { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:8, padding:'8px 12px', color:'#1a1d2e', fontSize:'0.85rem', fontFamily:'inherit', width:'100%', boxSizing:'border-box' };
const sBtnPri = { background:'#f0b429', color:'#000', border:'none', borderRadius:8, padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' };
const sBtnSec = { background:'#f5f6fa', color:'#4a5068', border:'1px solid #e4e7ef', borderRadius:8, padding:'9px 16px', fontWeight:600, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' };
