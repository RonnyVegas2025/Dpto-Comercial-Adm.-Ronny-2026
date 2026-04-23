'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth, PERFIS } from '../context/AuthContext';

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
  { key: 'equipes',    icon: '🏷️', label: 'Gerenciar Equipes',      desc: 'Crie e edite as equipes comerciais' },
  { key: 'diretores',  icon: '👔', label: 'Cadastro de Diretores',  desc: 'Gerencie os diretores da equipe comercial' },
  { key: 'gestores',   icon: '👥', label: 'Cadastro de Gestores',   desc: 'Gerencie os gestores vinculados a cada diretor' },
  { key: 'usuarios',   icon: '🔐', label: 'Usuários & Acessos',     desc: 'Gerencie logins e permissões do sistema' },
  { key: 'parceiros',  icon: '🤝', label: 'Parceiros Comerciais',   desc: 'Cadastro e comissões de parceiros' },
];

// ══════════════════════════════════════════════════════════════════════════
// SUBPÁGINA: Cadastro de Vendedores
// ══════════════════════════════════════════════════════════════════════════
// Gera lista de meses para o seletor de meta_inicio
function getMesesOpcoes() {
  const meses = [];
  const hoje = new Date();
  for (let i = -6; i <= 18; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const label = d.toLocaleDateString('pt-BR',{month:'short',year:'numeric'}).replace(' de ',' ');
    meses.push({ val, label });
  }
  return meses;
}

function FormVendedor({ val, onChange, onSalvar, onCancelar, titulo, erro, salvando, equipesList, diretoresList, gestoresList }) {
  const mesesOpcoes = getMesesOpcoes();

  // Gestores filtrados pelo diretor selecionado
  const gestoresFiltrados = val.diretor_id
    ? (gestoresList || []).filter(g => g.diretor_id === val.diretor_id)
    : (gestoresList || []);

  // Quando muda o diretor, limpa o gestor
  function handleDiretorChange(id) {
    onChange('diretor_id', id);
    onChange('gestor_id', '');
    // Mantém compatibilidade com campo texto
    const dir = (diretoresList || []).find(d => d.id === id);
    onChange('diretor', dir?.nome || '');
    onChange('gestor', '');
  }

  function handleGestorChange(id) {
    onChange('gestor_id', id);
    const gest = (gestoresList || []).find(g => g.id === id);
    onChange('gestor_intermediario', gest?.nome || '');
  }

  return (
    <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
      padding:24, marginBottom:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>{titulo}</div>
      {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
        padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem', marginBottom:12 }}>{erro}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={sL}>Nome *</label>
          <input style={sI} value={val.nome||''} onChange={e=>onChange('nome',e.target.value)} placeholder="Nome completo"/>
        </div>

        {/* Diretor — dropdown do banco */}
        <div>
          <label style={sL}>Diretor</label>
          <select style={sI} value={val.diretor_id||''} onChange={e => handleDiretorChange(e.target.value)}>
            <option value="">— Selecionar —</option>
            {(diretoresList||[]).map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>

        {/* Gestor — dropdown filtrado pelo diretor */}
        <div>
          <label style={sL}>Gestor {val.diretor_id ? <span style={{ color:'#f0b429' }}>· filtrado</span> : ''}</label>
          <select style={sI} value={val.gestor_id||''} onChange={e => handleGestorChange(e.target.value)}>
            <option value="">{val.diretor_id ? (gestoresFiltrados.length === 0 ? 'Sem gestores neste diretor' : '— Selecionar —') : '— Selecionar diretor primeiro —'}</option>
            {gestoresFiltrados.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
          <span style={{ color:'#8b92b0', fontSize:'0.68rem' }}>Deixe vazio se o Diretor é o gestor direto</span>
        </div>

        <div>
          <label style={sL}>Equipe</label>
          <select style={sI} value={val.equipe||''} onChange={e=>onChange('equipe',e.target.value)}>
            <option value=''>— Selecionar —</option>
            {(equipesList||[]).map(e => <option key={e.id} value={e.nome}>{e.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={sL}>Setor / Cargo</label>
          <input style={sI} value={val.setor||''} onChange={e=>onChange('setor',e.target.value)} placeholder="Ex: Consultor Senior"/>
        </div>
        <div>
          <label style={sL}>Meta Mensal (R$)</label>
          <input style={sI} type='number' value={val.meta_mensal||0} onChange={e=>onChange('meta_mensal',e.target.value)} placeholder="0,00"/>
        </div>
        <div>
          <label style={sL}>Meta válida a partir de</label>
          <select style={sI} value={val.meta_inicio||''} onChange={e=>onChange('meta_inicio',e.target.value)}>
            <option value=''>— Desde o início —</option>
            {mesesOpcoes.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
          <span style={{ color:'#8b92b0', fontSize:'0.68rem' }}>A meta só é contabilizada a partir deste mês</span>
        </div>
        <div>
          <label style={sL}>Telefone</label>
          <input style={sI} value={val.telefone||''} onChange={e=>onChange('telefone',e.target.value)} placeholder="(11) 99999-9999"/>
        </div>
        <div>
          <label style={sL}>E-mail</label>
          <input style={sI} value={val.email||''} onChange={e=>onChange('email',e.target.value)} placeholder="email@exemplo.com"/>
        </div>
        <div>
          <label style={sL}>Status</label>
          <select style={sI} value={String(val.ativo)} onChange={e=>onChange('ativo',e.target.value==='true')}>
            <option value='true'>✅ Ativo</option>
            <option value='false'>❌ Inativo</option>
          </select>
        </div>
      </div>

      {/* Preview hierarquia */}
      {(val.diretor_id || val.gestor_id) && (
        <div style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:8,
          padding:'10px 14px', marginBottom:14, fontSize:'0.78rem', color:'#4a5068' }}>
          <span style={{ fontWeight:600 }}>Hierarquia:</span>{' '}
          {val.nome || 'Vendedor'}{' → '}
          {val.gestor_id
            ? <>{(gestoresList||[]).find(g=>g.id===val.gestor_id)?.nome} <span style={{ color:'#8b92b0' }}>(Gestor)</span> → </>
            : null}
          {val.diretor_id
            ? <span style={{ fontWeight:700, color:'#1a1d2e' }}>{(diretoresList||[]).find(d=>d.id===val.diretor_id)?.nome} <span style={{ color:'#8b92b0' }}>(Diretor)</span></span>
            : '—'}
        </div>
      )}

      <div style={{ display:'flex', gap:10 }}>
        <button style={sBtnPri} onClick={onSalvar} disabled={salvando}>{salvando ? 'Salvando...' : '💾 Salvar'}</button>
        <button style={sBtnSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
function PaginaVendedores({ equipesDB = [] }) {
  const [consultores, setConsultores]   = useState([]);
  const [equipesList, setEquipesList]   = useState([]);
  const [diretoresList, setDiretoresList] = useState([]);
  const [gestoresList, setGestoresList] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState(false);
  const [editando, setEditando]         = useState(null);
  const [adicionando, setAdicionando]   = useState(false);
  const [filtroEquipe, setFiltroEquipe] = useState('');
  const [filtroGestor, setFiltroGestor] = useState('');
  const [busca, setBusca]               = useState('');
  const [erro, setErro]                 = useState('');
  const [sucesso, setSucesso]           = useState('');

  const formVazio = { nome:'', diretor:'', diretor_id:'', gestor_intermediario:'', gestor_id:'', equipe:'', setor:'', meta_mensal:0, meta_inicio:'', telefone:'', email:'', ativo:true };
  const [form, setForm] = useState(formVazio);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: cons }, { data: eqs }, { data: dirs }, { data: gests }] = await Promise.all([
      supabase.from('consultores').select('id, nome, gestor, diretor, diretor_id, gestor_id, gestor_intermediario, equipe, setor, meta_mensal, meta_inicio, telefone, email, ativo').order('nome'),
      supabase.from('equipes').select('id, nome, cor').order('nome'),
      supabase.from('diretores').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('gestores').select('id, nome, diretor_id').eq('ativo', true).order('nome'),
    ]);
    setConsultores(cons || []);
    setEquipesList(eqs || []);
    setDiretoresList(dirs || []);
    setGestoresList(gests || []);
    setLoading(false);
  }

  async function salvarNovo() {
    if (!form.nome.trim()) { setErro('Informe o nome do vendedor'); return; }
    setSalvando(true); setErro('');
    const dirNome  = (diretoresList.find(d => d.id === form.diretor_id))?.nome || form.diretor || null;
    const gestNome = (gestoresList.find(g => g.id === form.gestor_id))?.nome || form.gestor_intermediario || null;
    const { error } = await supabase.from('consultores').insert({
      nome:                 form.nome.trim(),
      gestor:               dirNome,
      diretor:              dirNome,
      diretor_id:           form.diretor_id || null,
      gestor_intermediario: gestNome,
      gestor_id:            form.gestor_id || null,
      equipe:               form.equipe || null,
      setor:                form.setor  || null,
      meta_mensal:          parseFloat(form.meta_mensal) || 0,
      meta_inicio:          form.meta_inicio || null,
      telefone:             form.telefone || null,
      email:                form.email    || null,
      ativo:                form.ativo,
    });
    if (error) { setErro('Erro: ' + error.message); }
    else { setSucesso('Vendedor cadastrado!'); setForm(formVazio); setAdicionando(false); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editando?.nome?.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const dirNome  = (diretoresList.find(d => d.id === editando.diretor_id))?.nome || editando.diretor || null;
    const gestNome = (gestoresList.find(g => g.id === editando.gestor_id))?.nome || editando.gestor_intermediario || null;
    const { error } = await supabase.from('consultores').update({
      nome:                 editando.nome.trim(),
      gestor:               dirNome,
      diretor:              dirNome,
      diretor_id:           editando.diretor_id || null,
      gestor_intermediario: gestNome,
      gestor_id:            editando.gestor_id || null,
      equipe:               editando.equipe  || null,
      setor:                editando.setor   || null,
      meta_mensal:          parseFloat(editando.meta_mensal) || 0,
      meta_inicio:          editando.meta_inicio || null,
      telefone:             editando.telefone || null,
      email:                editando.email    || null,
      ativo:                editando.ativo,
    }).eq('id', editando.id);
    if (error) { setErro('Erro: ' + error.message); }
    else { setSucesso('Salvo!'); setEditando(null); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function toggleAtivo(c) {
    await supabase.from('consultores').update({ ativo: !c.ativo }).eq('id', c.id);
    await carregar();
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEditando(e => ({ ...e, [k]: v }));

  // Gestores do diretor filtrado (para filtro da lista)
  const gestoresDoFiltro = filtroGestor
    ? consultores.filter(c => (c.gestor || c.diretor) === filtroGestor).map(c => c.equipe).filter(Boolean)
    : equipesList.map(e => e.nome);

  const handleFiltroGestorChange = (g) => { setFiltroGestor(g); setFiltroEquipe(''); };

  // Lista filtrada
  const filtrados = consultores.filter(c => {
    if (busca && !c.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroEquipe && (c.equipe || 'Outros') !== filtroEquipe) return false;
    if (filtroGestor && (c.gestor || c.diretor) !== filtroGestor) return false;
    return true;
  });

  const porEquipe = {};
  filtrados.forEach(c => {
    const eq = c.equipe || 'Sem Equipe';
    if (!porEquipe[eq]) porEquipe[eq] = [];
    porEquipe[eq].push(c);
  });

  // Diretores únicos para o filtro
  const diretoresUnicos = [...new Set(consultores.map(c => c.gestor || c.diretor).filter(Boolean))].sort();
  const totalAtivos   = consultores.filter(c => c.ativo).length;
  const totalInativos = consultores.filter(c => !c.ativo).length;
  const equipes       = [...new Set(consultores.map(c => c.equipe || 'Sem Equipe').filter(Boolean))];

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Vendedores', val:consultores.length, cor:'#1a1d2e' },
          { label:'Ativos',           val:totalAtivos,         cor:'#16a34a' },
          { label:'Inativos',         val:totalInativos,       cor:'#dc2626' },
          { label:'Equipes',          val:equipes.length,      cor:'#7c3aed' },
        ].map(k => (
          <div key={k.label} style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:'1.4rem', fontWeight:800, color:k.cor }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Barra de ações */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="🔍 Buscar vendedor..." value={busca} onChange={e=>setBusca(e.target.value)} style={{ ...sI, flex:2, minWidth:200 }}/>

        <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:170 }}>
          <span style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:1, fontWeight:600 }}>Diretor</span>
          <select value={filtroGestor} onChange={e=>handleFiltroGestorChange(e.target.value)}
            style={{ ...sI, borderColor: filtroGestor ? '#f0b429' : '#e4e7ef', background: filtroGestor ? '#fff8e6' : '#ffffff', color: filtroGestor ? '#b45309' : '#8b92b0', fontWeight: filtroGestor ? 600 : 400 }}>
            <option value=''>Todos os diretores</option>
            {diretoresUnicos.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:170 }}>
          <span style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:1, fontWeight:600 }}>
            Equipe {filtroGestor && <span style={{ color:'#f0b429' }}>· filtrada</span>}
          </span>
          <select value={filtroEquipe} onChange={e=>setFiltroEquipe(e.target.value)}
            style={{ ...sI, borderColor: filtroEquipe ? '#f0b429' : '#e4e7ef', background: filtroEquipe ? '#fff8e6' : '#ffffff', color: filtroEquipe ? '#b45309' : '#8b92b0', fontWeight: filtroEquipe ? 600 : 400 }}>
            <option value=''>Todas as equipes</option>
            {[...new Set(gestoresDoFiltro)].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {(busca || filtroGestor || filtroEquipe) && (
          <button onClick={() => { setBusca(''); setFiltroGestor(''); setFiltroEquipe(''); }}
            style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 14px', color:'#dc2626', fontSize:'0.78rem', cursor:'pointer', fontFamily:'inherit', fontWeight:600, alignSelf:'flex-end' }}>
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
          titulo="➕ Novo Vendedor"
          erro={erro} salvando={salvando}
          equipesList={equipesList}
          diretoresList={diretoresList}
          gestoresList={gestoresList} />
      )}

      {/* Modal edição */}
      {editando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setEditando(null)}>
          <div style={{ background:'#f5f6fa', borderRadius:16, padding:24, width:'100%', maxWidth:760, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <FormVendedor val={editando} onChange={setE} onSalvar={salvarEdicao}
              onCancelar={() => { setEditando(null); setErro(''); }}
              titulo={`✏️ Editar — ${editando.nome}`}
              erro={erro} salvando={salvando}
              equipesList={equipesList}
              diretoresList={diretoresList}
              gestoresList={gestoresList} />
          </div>
        </div>
      )}

      {/* Lista por equipe */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#8b92b0' }}>Carregando...</div>
      ) : (
        Object.entries(porEquipe).sort(([a],[b]) => a.localeCompare(b)).map(([equipe, membros]) => {
          const eqObj = equipesList.find(e => e.nome === equipe);
          const cor = eqObj?.cor || COR_EQUIPE[equipe] || '#6b7280';
          const ativos = membros.filter(m => m.ativo).length;
          return (
            <div key={equipe} style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ background:`${cor}15`, border:`1px solid ${cor}30`, borderRadius:8, padding:'4px 14px', color:cor, fontWeight:700, fontSize:'0.82rem' }}>{equipe}</div>
                <span style={{ color:'#8b92b0', fontSize:'0.75rem' }}>{membros.length} vendedor{membros.length!==1?'es':''} · {ativos} ativo{ativos!==1?'s':''}</span>
                <div style={{ flex:1, height:1, background:'#e4e7ef' }}></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                {membros.map(c => {
                  const dirNome  = c.diretor || c.gestor || '';
                  const gestNome = c.gestor_intermediario || '';
                  return (
                    <div key={c.id} style={{ background:'#ffffff', border:`1px solid ${c.ativo ? '#e4e7ef' : '#fca5a5'}`, borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)', opacity: c.ativo ? 1 : 0.65 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e' }}>{c.nome}</div>
                          <div style={{ fontSize:'0.72rem', color:'#8b92b0', marginTop:2 }}>
                            {c.setor || '—'}
                            {gestNome ? ` · ${gestNome.split(' ')[0]}` : dirNome ? ` · ${dirNome.split(' ')[0]}` : ''}
                          </div>
                        </div>
                        <span style={{ background: c.ativo ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', color: c.ativo ? '#16a34a' : '#dc2626', border: `1px solid ${c.ativo ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`, borderRadius:6, padding:'2px 8px', fontSize:'0.65rem', fontWeight:600 }}>
                          {c.ativo ? '● Ativo' : '● Inativo'}
                        </span>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                        <div>
                          <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Meta Mensal</div>
                          <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#f0b429' }}>{c.meta_mensal > 0 ? Number(c.meta_mensal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'}</div>
                        </div>
                        <div>
                          <div style={{ color:'#8b92b0', fontSize:'0.62rem', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Telefone</div>
                          <div style={{ fontSize:'0.78rem', color:'#4a5068' }}>{c.telefone || '—'}</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, paddingTop:10, borderTop:'1px solid #f0f2f8' }}>
                        <button style={{ ...sBtnSec, flex:1, fontSize:'0.78rem', padding:'6px 10px' }}
                          onClick={() => { setEditando({...c, diretor_id: c.diretor_id||'', gestor_id: c.gestor_id||'', meta_inicio: c.meta_inicio||''}); setErro(''); }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => toggleAtivo(c)}
                          style={{ background: c.ativo ? '#fef2f2' : '#f0fdf4', border: `1px solid ${c.ativo ? '#fca5a5' : '#86efac'}`, borderRadius:8, padding:'6px 10px', flex:1, color: c.ativo ? '#dc2626' : '#16a34a', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                          {c.ativo ? '⏸ Inativar' : '▶ Ativar'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
      {filtrados.length === 0 && !loading && (
        <div style={{ textAlign:'center', padding:48, color:'#8b92b0', background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12 }}>Nenhum vendedor encontrado</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUBPÁGINA: Gerenciar Equipes
// ══════════════════════════════════════════════════════════════════════════
const CORES_DISPONIVEIS = [
  { label:'Azul',      val:'#2563eb' },
  { label:'Verde',     val:'#16a34a' },
  { label:'Roxo',      val:'#7c3aed' },
  { label:'Laranja',   val:'#ea580c' },
  { label:'Ciano',     val:'#0891b2' },
  { label:'Rosa',      val:'#db2777' },
  { label:'Esmeralda', val:'#059669' },
  { label:'Âmbar',     val:'#d97706' },
  { label:'Vermelho',  val:'#dc2626' },
  { label:'Cinza',     val:'#6b7280' },
];

function PaginaEquipes({ onEquipesChange }) {
  const [equipes,   setEquipes]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [novoNome,  setNovoNome]  = useState('');
  const [novaCor,   setNovaCor]   = useState('#2563eb');
  const [erro,      setErro]      = useState('');
  const [sucesso,   setSucesso]   = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from('equipes')
      .select('*')
      .order('nome');
    setEquipes(data || []);
    if (onEquipesChange) onEquipesChange(data || []);
    setLoading(false);
  }

  async function adicionar() {
    if (!novoNome.trim()) { setErro('Informe o nome da equipe'); return; }
    if (equipes.find(e => e.nome.toLowerCase() === novoNome.trim().toLowerCase())) {
      setErro('Já existe uma equipe com esse nome'); return;
    }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('equipes').insert({ nome: novoNome.trim(), cor: novaCor });
    if (error) setErro('Erro: ' + error.message);
    else { setSucesso('Equipe criada!'); setNovoNome(''); setNovaCor('#2563eb'); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editando?.nome?.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('equipes')
      .update({ nome: editando.nome.trim(), cor: editando.cor })
      .eq('id', editando.id);
    if (error) setErro('Erro: ' + error.message);
    else { setSucesso('Salvo!'); setEditando(null); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function remover(id, nome) {
    // Verifica se tem vendedores nessa equipe
    const { data: vinculados } = await supabase
      .from('consultores').select('id').eq('equipe', nome);
    if (vinculados?.length > 0) {
      setErro(`Não é possível remover — ${vinculados.length} vendedor(es) estão nessa equipe`);
      return;
    }
    if (!confirm(`Remover a equipe "${nome}"?`)) return;
    await supabase.from('equipes').delete().eq('id', id);
    await carregar();
  }

  return (
    <div>
      {/* Form novo */}
      <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
        padding:24, marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>
          ➕ Nova Equipe
        </div>
        {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
          padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem', marginBottom:12 }}>{erro}</div>}
        {sucesso && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8,
          padding:'8px 14px', color:'#16a34a', fontSize:'0.82rem', marginBottom:12 }}>✅ {sucesso}</div>}

        <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:2, minWidth:200 }}>
            <label style={sL}>Nome da Equipe *</label>
            <input style={sI} value={novoNome} onChange={e => setNovoNome(e.target.value)}
              placeholder="Ex: Inside Sales" onKeyDown={e => e.key==='Enter' && adicionar()}/>
          </div>
          <div style={{ minWidth:160 }}>
            <label style={sL}>Cor de Identificação</label>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <select style={{ ...sI, flex:1 }} value={novaCor} onChange={e => setNovaCor(e.target.value)}>
                {CORES_DISPONIVEIS.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
              </select>
              <div style={{ width:32, height:32, borderRadius:8, background:novaCor,
                border:'2px solid rgba(0,0,0,0.1)', flexShrink:0 }}></div>
            </div>
          </div>
          <button style={{ ...sBtnPri, alignSelf:'flex-end', whiteSpace:'nowrap' }}
            onClick={adicionar} disabled={salvando}>
            {salvando ? 'Salvando...' : '+ Criar Equipe'}
          </button>
        </div>
      </div>

      {/* Lista de equipes */}
      <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
        padding:24, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>
          Equipes Cadastradas {!loading && `(${equipes.length})`}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:32, color:'#8b92b0' }}>Carregando...</div>
        ) : equipes.length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'#8b92b0' }}>
            Nenhuma equipe cadastrada ainda
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {equipes.map(eq => (
              <div key={eq.id} style={{ background:'#f9fafb', border:'1px solid #e4e7ef',
                borderRadius:10, padding:'14px 16px',
                display:'flex', alignItems:'center', gap:14 }}>

                {/* Preview da cor */}
                <div style={{ width:10, height:40, borderRadius:4, background:eq.cor||'#6b7280', flexShrink:0 }}></div>

                {editando?.id === eq.id ? (
                  /* Modo edição inline */
                  <div style={{ flex:1, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
                    <div style={{ flex:2, minWidth:160 }}>
                      <label style={sL}>Nome</label>
                      <input style={sI} value={editando.nome}
                        onChange={e => setEditando(v => ({...v, nome:e.target.value}))}
                        onKeyDown={e => e.key==='Enter' && salvarEdicao()}/>
                    </div>
                    <div style={{ minWidth:140 }}>
                      <label style={sL}>Cor</label>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <select style={{ ...sI, flex:1 }} value={editando.cor||'#6b7280'}
                          onChange={e => setEditando(v => ({...v, cor:e.target.value}))}>
                          {CORES_DISPONIVEIS.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                        </select>
                        <div style={{ width:28, height:28, borderRadius:6,
                          background:editando.cor||'#6b7280', border:'2px solid rgba(0,0,0,0.1)', flexShrink:0 }}></div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignSelf:'flex-end' }}>
                      <button style={sBtnPri} onClick={salvarEdicao} disabled={salvando}>
                        {salvando ? '...' : '💾 Salvar'}
                      </button>
                      <button style={sBtnSec} onClick={() => { setEditando(null); setErro(''); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Modo visualização */
                  <>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e' }}>{eq.nome}</span>
                        <span style={{ background:`${eq.cor||'#6b7280'}15`, color:eq.cor||'#6b7280',
                          border:`1px solid ${eq.cor||'#6b7280'}30`, borderRadius:6,
                          padding:'1px 8px', fontSize:'0.68rem', fontWeight:600 }}>
                          Equipe
                        </span>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setEditando({...eq}); setErro(''); }}
                        style={{ ...sBtnSec, fontSize:'0.78rem', padding:'6px 14px' }}>
                        ✏️ Editar
                      </button>
                      <button onClick={() => remover(eq.id, eq.nome)}
                        style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
                          padding:'6px 14px', color:'#dc2626', fontSize:'0.78rem',
                          fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                        🗑 Remover
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COR_PERFIL = {
  gestor_master:        { bg:'#1a1d2e', text:'#f0b429',  border:'#f0b42940' },
  diretoria:            { bg:'#eff6ff', text:'#2563eb',  border:'#bfdbfe'   },
  gestor_comercial:     { bg:'#f0fdf4', text:'#16a34a',  border:'#86efac'   },
  supervisor_comercial: { bg:'#f5f3ff', text:'#7c3aed',  border:'#ddd6fe'   },
  supervisor_adm:       { bg:'#fff7ed', text:'#ea580c',  border:'#fed7aa'   },
  administrativo:       { bg:'#ecfeff', text:'#0891b2',  border:'#a5f3fc'   },
  vendedor:             { bg:'#f9fafb', text:'#4a5068',  border:'#e4e7ef'   },
};

// Páginas disponíveis para configurar permissões
const PAGINAS_CONFIG = [
  { key:'inicio',             label:'🏠 Início',           desc:'Página inicial do sistema' },
  { key:'vendedor',           label:'👤 Vendedor',          desc:'Dashboard de performance e metas' },
  { key:'movimentacoes',      label:'📥 Importações',       desc:'Importar movimentação, meta e empresas' },
  { key:'gestao',             label:'⚙️ Gestão',            desc:'Painel de empresas e contratos' },
  { key:'relatorios',         label:'📋 Relatórios',        desc:'Exportar relatórios e conferências' },
  { key:'relatorio-empresas', label:'📑 Rel. Empresas',     desc:'Relatório customizável de empresas' },
  { key:'agregados',          label:'📦 Agregados',         desc:'WellHub, Total Pass, Telemedicina' },
  { key:'adm-comercial',      label:'🏢 Adm Comercial',     desc:'Usuários, equipes e vendedores' },
];

// Permissões padrão por perfil (base ao selecionar perfil)
const PERMS_PADRAO = {
  gestor_master:        { all: true },
  diretoria:            { inicio:'ver', vendedor:'ver', gestao:'ver', relatorios:'editar', 'relatorio-empresas':'ver', agregados:'ver' },
  gestor_comercial:     { inicio:'ver', vendedor:'editar', movimentacoes:'editar', gestao:'editar', relatorios:'editar', 'relatorio-empresas':'editar', agregados:'editar' },
  supervisor_comercial: { inicio:'ver', vendedor:'ver', gestao:'ver', relatorios:'ver', 'relatorio-empresas':'ver' },
  supervisor_adm:       { inicio:'ver', movimentacoes:'editar', gestao:'editar', relatorios:'editar', 'relatorio-empresas':'editar', agregados:'editar' },
  administrativo:       { inicio:'ver', movimentacoes:'editar', gestao:'ver', relatorios:'ver', 'relatorio-empresas':'ver' },
  vendedor:             { inicio:'ver', vendedor:'ver' },
};

function getPermsIniciais(perfil) {
  if (perfil === 'gestor_master') {
    const p = {};
    PAGINAS_CONFIG.forEach(pg => { p[pg.key] = 'editar'; });
    return p;
  }
  return PERMS_PADRAO[perfil] || {};
}

function BadgePerfil({ perfil }) {
  const cor = COR_PERFIL[perfil] || COR_PERFIL.vendedor;
  return (
    <span style={{ background:cor.bg, color:cor.text, border:`1px solid ${cor.border}`,
      borderRadius:6, padding:'2px 10px', fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap' }}>
      {PERFIS[perfil] || perfil}
    </span>
  );
}

function PainelVisibilidade({ visibilidade, onChange, consultores, isGestorMaster }) {
  const vis = visibilidade || { tipo:'todos', equipes:[], consultor_ids:[] };
  const equipes = [...new Set((consultores||[]).map(c => c.equipe).filter(Boolean))].sort();

  const setTipo = (tipo) => onChange({ ...vis, tipo, equipes:[], consultor_ids:[] });
  const toggleEquipe = (eq) => {
    const lista = vis.equipes || [];
    onChange({ ...vis, equipes: lista.includes(eq) ? lista.filter(e=>e!==eq) : [...lista,eq] });
  };
  const toggleConsultor = (id) => {
    const lista = vis.consultor_ids || [];
    onChange({ ...vis, consultor_ids: lista.includes(id) ? lista.filter(e=>e!==id) : [...lista,id] });
  };

  return (
    <div style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:10, padding:16 }}>
      <div style={{ fontWeight:700, fontSize:'0.85rem', color:'#1a1d2e', marginBottom:4 }}>
        👥 Visibilidade de Vendedores
      </div>
      <div style={{ color:'#8b92b0', fontSize:'0.72rem', marginBottom:12 }}>
        Define quais vendedores este usuário pode ver no dashboard
      </div>

      {/* Tipo de visibilidade */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { key:'todos',      label:'🌐 Todos os vendedores', desc:'Vê toda a equipe' },
          { key:'equipes',    label:'🏷️ Por equipe',          desc:'Filtra por equipe(s)' },
          { key:'especificos',label:'👤 Específicos',         desc:'Escolhe vendedor a vendedor' },
        ].map(op => (
          <button key={op.key} onClick={() => !isGestorMaster && setTipo(op.key)}
            style={{
              background: vis.tipo===op.key ? '#fff8e6' : '#ffffff',
              border: `1px solid ${vis.tipo===op.key ? '#f0b429' : '#e4e7ef'}`,
              borderRadius:8, padding:'8px 14px', cursor: isGestorMaster?'not-allowed':'pointer',
              fontFamily:'inherit', textAlign:'left', opacity: isGestorMaster?0.6:1,
            }}>
            <div style={{ fontWeight:600, fontSize:'0.78rem', color: vis.tipo===op.key?'#b45309':'#1a1d2e' }}>{op.label}</div>
            <div style={{ fontSize:'0.68rem', color:'#8b92b0', marginTop:2 }}>{op.desc}</div>
          </button>
        ))}
      </div>

      {/* Seleção de equipes */}
      {vis.tipo === 'equipes' && (
        <div>
          <div style={{ fontSize:'0.72rem', color:'#4a5068', fontWeight:600, marginBottom:8 }}>
            Selecione as equipes visíveis:
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {equipes.map(eq => {
              const sel = (vis.equipes||[]).includes(eq);
              const cor = COR_EQUIPE[eq] || '#6b7280';
              return (
                <button key={eq} onClick={() => toggleEquipe(eq)}
                  style={{ background: sel?`${cor}15`:'#ffffff',
                    border:`1px solid ${sel?cor:'#e4e7ef'}`,
                    borderRadius:8, padding:'6px 14px', cursor:'pointer',
                    fontFamily:'inherit', fontWeight: sel?700:400,
                    fontSize:'0.8rem', color: sel?cor:'#4a5068', transition:'all 0.12s' }}>
                  {eq} {sel && '✓'}
                </button>
              );
            })}
            {equipes.length === 0 && (
              <span style={{ color:'#8b92b0', fontSize:'0.8rem' }}>
                Nenhuma equipe cadastrada ainda
              </span>
            )}
          </div>
          {(vis.equipes||[]).length > 0 && (
            <div style={{ marginTop:10, color:'#8b92b0', fontSize:'0.72rem' }}>
              Vendedores visíveis: {(consultores||[]).filter(c=>(vis.equipes||[]).includes(c.equipe)).length} de {(consultores||[]).length}
            </div>
          )}
        </div>
      )}

      {/* Seleção individual */}
      {vis.tipo === 'especificos' && (
        <div>
          <div style={{ fontSize:'0.72rem', color:'#4a5068', fontWeight:600, marginBottom:8 }}>
            Selecione os vendedores visíveis: ({(vis.consultor_ids||[]).length} selecionados)
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:220, overflowY:'auto' }}>
            {(consultores||[]).map(c => {
              const sel = (vis.consultor_ids||[]).includes(c.id);
              const cor = COR_EQUIPE[c.equipe] || '#6b7280';
              return (
                <label key={c.id}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                    background: sel?'#f9fafb':'#ffffff', border:`1px solid ${sel?'#e4e7ef':'#f0f2f8'}`,
                    borderRadius:8, cursor:'pointer', transition:'background 0.1s' }}>
                  <input type='checkbox' checked={sel} onChange={() => toggleConsultor(c.id)}
                    style={{ width:14, height:14 }}/>
                  <span style={{ fontWeight: sel?600:400, fontSize:'0.82rem', color:'#1a1d2e', flex:1 }}>
                    {c.nome}
                  </span>
                  {c.equipe && (
                    <span style={{ background:`${cor}15`, color:cor, border:`1px solid ${cor}30`,
                      borderRadius:5, padding:'1px 7px', fontSize:'0.65rem', fontWeight:600 }}>
                      {c.equipe}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Resumo quando tipo = todos */}
      {vis.tipo === 'todos' && (
        <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8,
          padding:'8px 14px', fontSize:'0.78rem', color:'#16a34a', fontWeight:600 }}>
          ✓ Este usuário verá todos os {(consultores||[]).length} vendedores ativos
        </div>
      )}
    </div>
  );
}

function FormUsuario({ val, onChange, onSalvar, onCancelar, titulo, novo, erro, salvando, consultores }) {
  const [perms, setPerms] = useState(() => val.permissoes || getPermsIniciais(val.perfil || 'vendedor'));

  // Quando perfil muda → recarrega permissões padrão
  const handlePerfilChange = (novoPerfil) => {
    onChange('perfil', novoPerfil);
    const novasPerms = getPermsIniciais(novoPerfil);
    setPerms(novasPerms);
    onChange('permissoes', novasPerms);
  };

  const togglePerm = (pagina, nivel) => {
    // nivel: '' = nenhum, 'ver' = só visualizar, 'editar' = visualizar + editar
    const atual = perms[pagina] || '';
    let novo;
    if (nivel === 'ver')    novo = atual === 'ver' ? '' : 'ver';
    if (nivel === 'editar') novo = atual === 'editar' ? 'ver' : 'editar';
    const novasPerms = { ...perms, [pagina]: novo };
    setPerms(novasPerms);
    onChange('permissoes', novasPerms);
  };

  const isGestorMaster = val.perfil === 'gestor_master';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e' }}>{titulo}</div>
      {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
        padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem' }}>{erro}</div>}

      {/* Dados básicos */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={sL}>Nome completo *</label>
          <input style={sI} value={val.nome||''} onChange={e=>onChange('nome',e.target.value)} placeholder="Nome do usuário"/>
        </div>
        <div>
          <label style={sL}>E-mail *</label>
          <input style={{ ...sI, opacity:novo?1:0.6, cursor:novo?'text':'not-allowed' }}
            type='email' value={val.email||''} onChange={e=>onChange('email',e.target.value)}
            placeholder="email@vegascard.com.br" disabled={!novo}/>
          {!novo && <span style={{ color:'#8b92b0', fontSize:'0.7rem' }}>E-mail não pode ser alterado</span>}
        </div>
        {novo && (
          <div>
            <label style={sL}>Senha *</label>
            <input style={sI} type='password' value={val.senha||''} onChange={e=>onChange('senha',e.target.value)}
              placeholder="Mínimo 6 caracteres"/>
          </div>
        )}
        <div>
          <label style={sL}>Perfil Base *</label>
          <select style={sI} value={val.perfil||'vendedor'} onChange={e=>handlePerfilChange(e.target.value)}>
            {Object.entries(PERFIS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span style={{ color:'#8b92b0', fontSize:'0.68rem' }}>Define permissões padrão abaixo</span>
        </div>
        <div>
          <label style={sL}>Vincular ao Vendedor</label>
          <select style={sI} value={val.consultor_id||''} onChange={e=>onChange('consultor_id',e.target.value)}>
            <option value=''>— Nenhum —</option>
            {(consultores||[]).map(c => (
              <option key={c.id} value={c.id}>{c.nome}{c.equipe?` (${c.equipe})`:''}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={sL}>Gestor Vinculado</label>
          <select style={sI} value={val.gestor_vinculado||''} onChange={e=>onChange('gestor_vinculado',e.target.value)}>
            <option value=''>— Todos os gestores —</option>
            {GESTORES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <span style={{ color:'#8b92b0', fontSize:'0.68rem' }}>Filtra dashboard automaticamente ao logar</span>
        </div>
        {!novo && (
          <div>
            <label style={sL}>Status</label>
            <select style={sI} value={String(val.ativo)} onChange={e=>onChange('ativo',e.target.value==='true')}>
              <option value='true'>✅ Ativo</option>
              <option value='false'>❌ Inativo</option>
            </select>
          </div>
        )}
      </div>

      {/* Painel de permissões por página */}
      <div style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:10, padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.85rem', color:'#1a1d2e' }}>🔐 Permissões por Página</div>
            <div style={{ color:'#8b92b0', fontSize:'0.72rem', marginTop:2 }}>
              Customize o acesso independente do perfil base
            </div>
          </div>
          {isGestorMaster && (
            <span style={{ background:'#fff8e6', color:'#b45309', border:'1px solid #f0b429',
              borderRadius:6, padding:'2px 10px', fontSize:'0.7rem', fontWeight:700 }}>
              ✦ Acesso Total
            </span>
          )}
        </div>

        {/* Legenda */}
        <div style={{ display:'flex', gap:12, marginBottom:12, fontSize:'0.72rem', color:'#4a5068' }}>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:14, height:14, background:'#e4e7ef', borderRadius:3, display:'inline-block' }}></span>
            Sem acesso
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:14, height:14, background:'#bfdbfe', borderRadius:3, display:'inline-block' }}></span>
            👁 Visualizar
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:14, height:14, background:'#86efac', borderRadius:3, display:'inline-block' }}></span>
            ✏️ Visualizar + Editar
          </span>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {PAGINAS_CONFIG.map(pg => {
            const nivel = isGestorMaster ? 'editar' : (perms[pg.key] || '');
            const temVer    = nivel === 'ver' || nivel === 'editar';
            const temEditar = nivel === 'editar';
            return (
              <div key={pg.key} style={{
                display:'flex', alignItems:'center', gap:12,
                background:'#ffffff', border:'1px solid #e4e7ef',
                borderRadius:8, padding:'10px 14px',
                opacity: isGestorMaster ? 0.7 : 1,
              }}>
                {/* Nome da página */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:'0.82rem', color:'#1a1d2e' }}>{pg.label}</div>
                  <div style={{ color:'#8b92b0', fontSize:'0.7rem', marginTop:1 }}>{pg.desc}</div>
                </div>

                {/* Toggle Visualizar */}
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor: isGestorMaster?'not-allowed':'pointer',
                  background: temVer?'#eff6ff':'#f5f6fa',
                  border:`1px solid ${temVer?'#bfdbfe':'#e4e7ef'}`,
                  borderRadius:6, padding:'4px 10px', transition:'all 0.15s' }}>
                  <input type='checkbox' checked={temVer}
                    disabled={isGestorMaster}
                    onChange={() => togglePerm(pg.key, 'ver')}
                    style={{ cursor: isGestorMaster?'not-allowed':'pointer' }}/>
                  <span style={{ fontSize:'0.75rem', fontWeight:600, color: temVer?'#2563eb':'#8b92b0' }}>
                    👁 Ver
                  </span>
                </label>

                {/* Toggle Editar */}
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor: isGestorMaster?'not-allowed':'pointer',
                  background: temEditar?'#f0fdf4':'#f5f6fa',
                  border:`1px solid ${temEditar?'#86efac':'#e4e7ef'}`,
                  borderRadius:6, padding:'4px 10px', transition:'all 0.15s' }}>
                  <input type='checkbox' checked={temEditar}
                    disabled={isGestorMaster}
                    onChange={() => togglePerm(pg.key, 'editar')}
                    style={{ cursor: isGestorMaster?'not-allowed':'pointer' }}/>
                  <span style={{ fontSize:'0.75rem', fontWeight:600, color: temEditar?'#16a34a':'#8b92b0' }}>
                    ✏️ Editar
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Painel de visibilidade de vendedores */}
      <PainelVisibilidade
        visibilidade={val.visibilidade || { tipo:'todos', equipes:[], consultor_ids:[] }}
        onChange={v => onChange('visibilidade', v)}
        consultores={consultores}
        isGestorMaster={isGestorMaster}
      />

      <div style={{ display:'flex', gap:10, paddingTop:4 }}>
        <button style={sBtnPri} onClick={onSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : '💾 Salvar'}
        </button>
        <button style={sBtnSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function PaginaUsuarios() {
  const { profile: myProfile } = useAuth();
  const [usuarios,    setUsuarios]    = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [salvando,    setSalvando]    = useState(false);
  const [erro,        setErro]        = useState('');
  const [sucesso,     setSucesso]     = useState('');
  const [modalNovo,   setModalNovo]   = useState(false);
  const [editando,    setEditando]    = useState(null);

  const formVazio = { nome:'', email:'', senha:'', perfil:'vendedor', consultor_id:'', permissoes: getPermsIniciais('vendedor') };
  const [form, setForm] = useState(formVazio);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: users }, { data: cons }] = await Promise.all([
      supabase.from('user_profiles')
        .select('*, consultor:consultor_id(id,nome)')
        .order('nome'),
      supabase.from('consultores')
        .select('id, nome, equipe')
        .eq('ativo', true)
        .order('nome'),
    ]);
    // Para cada usuário, busca permissões e visibilidade customizadas
    const allUsers = users || [];
    if (allUsers.length > 0) {
      const ids = allUsers.map(u => u.id);
      const [{ data: permsData }, { data: visData }] = await Promise.all([
        supabase.from('user_permissoes').select('*').in('user_id', ids),
        supabase.from('user_visibilidade').select('*').in('user_id', ids),
      ]);
      const permsMap = {};
      (permsData || []).forEach(p => {
        if (!permsMap[p.user_id]) permsMap[p.user_id] = {};
        permsMap[p.user_id][p.pagina] = p.pode_editar ? 'editar' : p.pode_ver ? 'ver' : '';
      });
      const visMap = {};
      (visData || []).forEach(v => { visMap[v.user_id] = v; });
      allUsers.forEach(u => {
        u.permissoes = Object.keys(permsMap[u.id]||{}).length > 0
          ? permsMap[u.id] : getPermsIniciais(u.perfil);
        u.visibilidade = visMap[u.id]
          ? { tipo: visMap[u.id].tipo, equipes: visMap[u.id].equipes||[], consultor_ids: visMap[u.id].consultor_ids||[] }
          : { tipo:'todos', equipes:[], consultor_ids:[] };
      });
    }
    setUsuarios(allUsers);
    setConsultores(cons || []);
    setLoading(false);
  }

  async function salvarPermissoes(userId, permissoes) {
    // Deleta permissões antigas e insere as novas
    await supabase.from('user_permissoes').delete().eq('user_id', userId);
    const rows = Object.entries(permissoes)
      .filter(([, nivel]) => nivel === 'ver' || nivel === 'editar')
      .map(([pagina, nivel]) => ({
        user_id:     userId,
        pagina,
        pode_ver:    true,
        pode_editar: nivel === 'editar',
      }));
    if (rows.length > 0) {
      await supabase.from('user_permissoes').insert(rows);
    }
  }

  async function criarUsuario() {
    if (!form.nome.trim())  { setErro('Informe o nome');  return; }
    if (!form.email.trim()) { setErro('Informe o e-mail'); return; }
    if (!form.senha || form.senha.length < 6) { setErro('Senha deve ter no mínimo 6 caracteres'); return; }
    setSalvando(true); setErro('');

    try {
      // Chama API Route que usa service_role para criar o usuário
      const res = await fetch('/api/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:             form.nome.trim(),
          email:            form.email.trim(),
          senha:            form.senha,
          perfil:           form.perfil,
          consultor_id:     form.consultor_id || null,
          gestor_vinculado: form.gestor_vinculado || null,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setErro(data.error || 'Erro ao criar usuário');
        setSalvando(false);
        return;
      }

      // Salva permissões customizadas
      if (data.id && form.permissoes) {
        await salvarPermissoes(data.id, form.permissoes);
      }

      setSucesso('Usuário criado com sucesso!');
      setModalNovo(false);
      setForm(formVazio);
      await carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch(err) {
      setErro('Erro: ' + err.message);
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editando?.nome?.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('user_profiles').update({
      nome:              editando.nome.trim(),
      perfil:            editando.perfil,
      consultor_id:      editando.consultor_id || null,
      gestor_vinculado:  editando.gestor_vinculado || null,
      ativo:             editando.ativo,
    }).eq('id', editando.id);
    if (error) { setErro('Erro: ' + error.message); setSalvando(false); return; }
    // Salva permissões customizadas
    await salvarPermissoes(editando.id, editando.permissoes || getPermsIniciais(editando.perfil));
    // Salva visibilidade
    const vis = editando.visibilidade || { tipo:'todos', equipes:[], consultor_ids:[] };
    await supabase.from('user_visibilidade').upsert({
      user_id:       editando.id,
      tipo:          vis.tipo,
      equipes:       vis.equipes || [],
      consultor_ids: vis.consultor_ids || [],
    }, { onConflict:'user_id' });
    setSucesso('Salvo!'); setEditando(null); await carregar(); setTimeout(() => setSucesso(''), 3000);
    setSalvando(false);
  }

  async function toggleAtivo(u) {
    await supabase.from('user_profiles').update({ ativo: !u.ativo }).eq('id', u.id);
    await carregar();
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEditando(e => ({ ...e, [k]: v }));

  return (
    <div>
      {/* Header + ações */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e' }}>
            👥 Usuários do Sistema
          </div>
          <div style={{ color:'#8b92b0', fontSize:'0.8rem', marginTop:2 }}>
            Gerencie acessos e perfis de cada colaborador
          </div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {sucesso && <span style={{ color:'#16a34a', fontWeight:600, fontSize:'0.85rem' }}>✅ {sucesso}</span>}
          <button style={sBtnPri} onClick={() => { setModalNovo(true); setErro(''); setForm(formVazio); }}>
            + Novo Usuário
          </button>
        </div>
      </div>

      {/* Info box sobre criação de usuários */}
      <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10,
        padding:'12px 16px', marginBottom:20, fontSize:'0.82rem', color:'#2563eb' }}>
        <strong>ℹ️ Como criar usuários:</strong> Acesse o{' '}
        <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
          style={{ color:'#2563eb', fontWeight:700 }}>Supabase Dashboard</a>
        {' '}→ Authentication → Users → Add User. Depois volte aqui para definir o perfil de acesso.
      </div>

      {/* Modal novo usuário */}
      {modalNovo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setModalNovo(false)}>
          <div style={{ background:'#ffffff', borderRadius:16, padding:28, width:'100%',
            maxWidth:600, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <FormUsuario val={form} onChange={setF} onSalvar={criarUsuario}
              onCancelar={() => { setModalNovo(false); setErro(''); }}
              titulo="➕ Novo Usuário" novo
              erro={erro} salvando={salvando} consultores={consultores} />
          </div>
        </div>
      )}

      {/* Modal edição */}
      {editando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setEditando(null)}>
          <div style={{ background:'#ffffff', borderRadius:16, padding:28, width:'100%',
            maxWidth:600, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e=>e.stopPropagation()}>
            <FormUsuario val={editando} onChange={setE} onSalvar={salvarEdicao}
              onCancelar={() => { setEditando(null); setErro(''); }}
              titulo={`✏️ Editar — ${editando.nome}`}
              erro={erro} salvando={salvando} consultores={consultores} />
          </div>
        </div>
      )}

      {/* Tabela de usuários */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'#8b92b0' }}>Carregando...</div>
      ) : (
        <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12,
          overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
            <thead>
              <tr style={{ background:'#f9fafb' }}>
                {['Nome','E-mail','Perfil','Vinculado','Visibilidade','Status','Ações'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#8b92b0',
                    fontWeight:600, fontSize:'0.68rem', textTransform:'uppercase',
                    letterSpacing:0.5, borderBottom:'1px solid #e4e7ef' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => (
                <tr key={u.id} style={{ background: i%2===0 ? '#ffffff' : '#f9fafb',
                  borderBottom:'1px solid #f0f2f8' }}>
                  <td style={{ padding:'12px 16px', fontWeight:600, color:'#1a1d2e' }}>
                    {u.nome}
                    {u.id === myProfile?.id && (
                      <span style={{ background:'#fff8e6', color:'#b45309', borderRadius:4,
                        padding:'1px 6px', fontSize:'0.65rem', fontWeight:700, marginLeft:6 }}>
                        você
                      </span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px', color:'#4a5068', fontSize:'0.78rem' }}>{u.email}</td>
                  <td style={{ padding:'12px 16px' }}><BadgePerfil perfil={u.perfil} /></td>
                  <td style={{ padding:'12px 16px', color:'#4a5068', fontSize:'0.78rem' }}>
                    {u.consultor?.nome || <span style={{ color:'#b0b7cc' }}>—</span>}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    {u.perfil === 'gestor_master' ? (
                      <span style={{ color:'#f0b429', fontSize:'0.75rem', fontWeight:600 }}>✦ Todos</span>
                    ) : u.visibilidade?.tipo === 'equipes' ? (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {(u.visibilidade.equipes||[]).map(eq => {
                          const cor = COR_EQUIPE[eq]||'#6b7280';
                          return <span key={eq} style={{ background:`${cor}15`, color:cor,
                            border:`1px solid ${cor}30`, borderRadius:5,
                            padding:'1px 7px', fontSize:'0.65rem', fontWeight:600 }}>{eq}</span>;
                        })}
                        {(u.visibilidade.equipes||[]).length===0 && <span style={{ color:'#b0b7cc', fontSize:'0.75rem' }}>—</span>}
                      </div>
                    ) : u.visibilidade?.tipo === 'especificos' ? (
                      <span style={{ color:'#4a5068', fontSize:'0.75rem' }}>
                        👤 {(u.visibilidade.consultor_ids||[]).length} vendedor(es)
                      </span>
                    ) : (
                      <span style={{ color:'#16a34a', fontSize:'0.75rem', fontWeight:600 }}>🌐 Todos</span>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{
                      background: u.ativo ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                      color: u.ativo ? '#16a34a' : '#dc2626',
                      border: `1px solid ${u.ativo ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`,
                      borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', fontWeight:600 }}>
                      {u.ativo ? '● Ativo' : '● Inativo'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => { setEditando({...u, consultor_id: u.consultor_id||'', visibilidade: u.visibilidade||{tipo:'todos',equipes:[],consultor_ids:[]}}); setErro(''); }}
                        style={{ ...sBtnSec, fontSize:'0.75rem', padding:'5px 12px' }}>
                        ✏️ Editar
                      </button>
                      {u.id !== myProfile?.id && (
                        <button onClick={() => toggleAtivo(u)}
                          style={{ background: u.ativo?'#fef2f2':'#f0fdf4',
                            border:`1px solid ${u.ativo?'#fca5a5':'#86efac'}`,
                            borderRadius:8, padding:'5px 12px',
                            color: u.ativo?'#dc2626':'#16a34a',
                            fontSize:'0.75rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                          {u.ativo ? 'Inativar' : 'Ativar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usuarios.length === 0 && (
            <div style={{ textAlign:'center', padding:48, color:'#8b92b0' }}>
              Nenhum usuário cadastrado ainda
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Preview das permissões do perfil
function PermissoesPreview({ perfil }) {
  const PAGINAS = [
    { key:'inicio',            label:'Início'         },
    { key:'vendedor',          label:'Vendedor'        },
    { key:'movimentacoes',     label:'Importações'     },
    { key:'gestao',            label:'Gestão'          },
    { key:'relatorios',        label:'Relatórios'      },
    { key:'relatorio-empresas',label:'Rel. Empresas'   },
    { key:'agregados',         label:'Agregados'       },
    { key:'adm-comercial',     label:'Adm Comercial'   },
  ];

  const MAPA = {
    gestor_master:        { all: true },
    diretoria:            { inicio:1, vendedor:1, gestao:1, relatorios:3, 'relatorio-empresas':1 },
    gestor_comercial:     { inicio:1, vendedor:3, movimentacoes:3, gestao:3, relatorios:3, 'relatorio-empresas':3, agregados:3 },
    supervisor_comercial: { inicio:1, vendedor:1, gestao:1, relatorios:1, 'relatorio-empresas':1 },
    supervisor_adm:       { inicio:1, movimentacoes:3, gestao:3, relatorios:3, 'relatorio-empresas':3, agregados:3 },
    administrativo:       { inicio:1, movimentacoes:3, gestao:1, relatorios:1, 'relatorio-empresas':1 },
    vendedor:             { inicio:1, vendedor:1 },
  };

  const perms = MAPA[perfil] || {};

  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
      {PAGINAS.map(p => {
        const nivel = perms.all ? 3 : (perms[p.key] || 0);
        if (nivel === 0) return (
          <span key={p.key} style={{ background:'#f0f2f8', color:'#b0b7cc',
            borderRadius:5, padding:'2px 8px', fontSize:'0.68rem', textDecoration:'line-through' }}>
            {p.label}
          </span>
        );
        return (
          <span key={p.key} style={{
            background: nivel===3 ? '#f0fdf4' : '#eff6ff',
            color:      nivel===3 ? '#16a34a'  : '#2563eb',
            border:`1px solid ${nivel===3 ? '#86efac' : '#bfdbfe'}`,
            borderRadius:5, padding:'2px 8px', fontSize:'0.68rem', fontWeight:600 }}>
            {p.label} {nivel===3 ? '✏️' : '👁'}
          </span>
        );
      })}
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
function PaginaDiretores() {
  const [diretores, setDiretores] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [salvando, setSalvando]   = useState(false);
  const [nome, setNome]           = useState('');
  const [email, setEmail]         = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome]   = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [erro, setErro]           = useState('');
  const [sucesso, setSucesso]     = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase.from('diretores').select('id, nome, email, ativo').order('nome');
    setDiretores(data || []);
    setLoading(false);
  }

  async function adicionar() {
    if (!nome.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('diretores').insert({ nome: nome.trim(), email: email.trim() || null });
    if (error) setErro('Erro: ' + error.message);
    else { setSucesso('Diretor criado!'); setNome(''); setEmail(''); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function salvarEdicao(id) {
    if (!editNome.trim()) return;
    setSalvando(true);
    await supabase.from('diretores').update({ nome: editNome.trim(), email: editEmail.trim() || null }).eq('id', id);
    setEditandoId(null); setSucesso('Salvo!'); await carregar(); setTimeout(() => setSucesso(''), 3000);
    setSalvando(false);
  }

  async function toggleAtivo(d) {
    await supabase.from('diretores').update({ ativo: !d.ativo }).eq('id', d.id);
    carregar();
  }

  async function remover(id) {
    if (!confirm('Remover diretor?')) return;
    await supabase.from('diretores').delete().eq('id', id);
    carregar();
  }

  return (
    <div>
      <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:24, marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>➕ Novo Diretor</div>
        {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem', marginBottom:12 }}>{erro}</div>}
        {sucesso && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'8px 14px', color:'#16a34a', fontSize:'0.82rem', marginBottom:12 }}>✅ {sucesso}</div>}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:2, minWidth:200 }}>
            <label style={sL}>Nome *</label>
            <input style={sI} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Ronny Peterson Izidorio" onKeyDown={e => e.key === 'Enter' && adicionar()} />
          </div>
          <div style={{ flex:1, minWidth:180 }}>
            <label style={sL}>E-mail</label>
            <input style={sI} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
          </div>
          <button style={{ ...sBtnPri, whiteSpace:'nowrap', alignSelf:'flex-end' }} onClick={adicionar} disabled={salvando || !nome.trim()}>
            {salvando ? 'Salvando...' : '+ Criar Diretor'}
          </button>
        </div>
      </div>
      <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:24, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>Diretores Cadastrados {!loading && `(${diretores.length})`}</div>
        {loading ? <div style={{ color:'#8b92b0', padding:20 }}>Carregando...</div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {diretores.length === 0 && <div style={{ color:'#8b92b0', textAlign:'center', padding:32 }}>Nenhum diretor cadastrado ainda.</div>}
            {diretores.map(d => (
              <div key={d.id} style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:10, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, opacity: d.ativo ? 1 : 0.55 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: d.ativo ? '#f0b429' : '#d1d5db', flexShrink:0 }} />
                {editandoId === d.id ? (
                  <div style={{ flex:1, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                    <div style={{ flex:2, minWidth:160 }}><label style={sL}>Nome</label><input style={sI} value={editNome} onChange={e => setEditNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarEdicao(d.id)} /></div>
                    <div style={{ flex:1, minWidth:160 }}><label style={sL}>E-mail</label><input style={sI} value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" /></div>
                    <div style={{ display:'flex', gap:8, alignSelf:'flex-end' }}>
                      <button style={sBtnPri} onClick={() => salvarEdicao(d.id)} disabled={salvando}>{salvando ? '...' : '💾 Salvar'}</button>
                      <button style={sBtnSec} onClick={() => setEditandoId(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e' }}>{d.nome}</div>
                      <div style={{ color:'#8b92b0', fontSize:'0.75rem', marginTop:2 }}>{d.email || 'Sem e-mail'} · {d.ativo ? 'Ativo' : 'Inativo'}</div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button style={{ ...sBtnSec, fontSize:'0.78rem', padding:'6px 12px' }} onClick={() => { setEditandoId(d.id); setEditNome(d.nome); setEditEmail(d.email || ''); }}>✏️ Editar</button>
                      <button onClick={() => toggleAtivo(d)} style={{ background: d.ativo?'#fef2f2':'#f0fdf4', border:`1px solid ${d.ativo?'#fca5a5':'#86efac'}`, borderRadius:8, padding:'6px 12px', color: d.ativo?'#dc2626':'#16a34a', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{d.ativo ? '⏸ Inativar' : '▶ Ativar'}</button>
                      <button onClick={() => remover(d.id)} style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'6px 12px', color:'#dc2626', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>🗑</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaginaGestores() {
  const [gestores, setGestores]   = useState([]);
  const [diretores, setDiretores] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [salvando, setSalvando]   = useState(false);
  const [nome, setNome]           = useState('');
  const [email, setEmail]         = useState('');
  const [diretorId, setDiretorId] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome]   = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDiretorId, setEditDiretorId] = useState('');
  const [filtroDiretor, setFiltroDiretor] = useState('');
  const [erro, setErro]           = useState('');
  const [sucesso, setSucesso]     = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: gs }, { data: ds }] = await Promise.all([
      supabase.from('gestores').select('id, nome, email, ativo, diretor_id, diretor:diretor_id(nome)').order('nome'),
      supabase.from('diretores').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setGestores(gs || []);
    setDiretores(ds || []);
    setLoading(false);
  }

  async function adicionar() {
    if (!nome.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('gestores').insert({ nome: nome.trim(), email: email.trim() || null, diretor_id: diretorId || null });
    if (error) setErro('Erro: ' + error.message);
    else { setSucesso('Gestor criado!'); setNome(''); setEmail(''); setDiretorId(''); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function salvarEdicao(id) {
    if (!editNome.trim()) return;
    setSalvando(true);
    await supabase.from('gestores').update({ nome: editNome.trim(), email: editEmail.trim() || null, diretor_id: editDiretorId || null }).eq('id', id);
    setEditandoId(null); setSucesso('Salvo!'); await carregar(); setTimeout(() => setSucesso(''), 3000);
    setSalvando(false);
  }

  async function toggleAtivo(g) {
    await supabase.from('gestores').update({ ativo: !g.ativo }).eq('id', g.id);
    carregar();
  }

  async function remover(id) {
    if (!confirm('Remover gestor?')) return;
    await supabase.from('gestores').delete().eq('id', id);
    carregar();
  }

  const listaFiltrada = filtroDiretor ? gestores.filter(g => g.diretor_id === filtroDiretor) : gestores;

  return (
    <div>
      <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:24, marginBottom:20, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>➕ Novo Gestor</div>
        {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem', marginBottom:12 }}>{erro}</div>}
        {sucesso && <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'8px 14px', color:'#16a34a', fontSize:'0.82rem', marginBottom:12 }}>✅ {sucesso}</div>}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:2, minWidth:200 }}><label style={sL}>Nome *</label><input style={sI} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Marcos Rossi" /></div>
          <div style={{ flex:1, minWidth:180 }}>
            <label style={sL}>Diretor responsável</label>
            <select style={sI} value={diretorId} onChange={e => setDiretorId(e.target.value)}>
              <option value="">— Selecionar diretor —</option>
              {diretores.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div style={{ flex:1, minWidth:160 }}><label style={sL}>E-mail</label><input style={sI} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" /></div>
          <button style={{ ...sBtnPri, whiteSpace:'nowrap', alignSelf:'flex-end' }} onClick={adicionar} disabled={salvando || !nome.trim()}>{salvando ? 'Salvando...' : '+ Criar Gestor'}</button>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, flexWrap:'wrap' }}>
        <span style={{ color:'#8b92b0', fontSize:'0.78rem', fontWeight:600 }}>Filtrar por Diretor:</span>
        <select style={{ ...sI, width:'auto', minWidth:220 }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
          <option value="">Todos os diretores ({gestores.length})</option>
          {diretores.map(d => { const count = gestores.filter(g => g.diretor_id === d.id).length; return <option key={d.id} value={d.id}>{d.nome} ({count})</option>; })}
        </select>
        {filtroDiretor && <button onClick={() => setFiltroDiretor('')} style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:6, padding:'5px 12px', color:'#dc2626', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>✕ Limpar</button>}
      </div>
      <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:24, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:16 }}>Gestores Cadastrados {!loading && `(${listaFiltrada.length})`}</div>
        {loading ? <div style={{ color:'#8b92b0', padding:20 }}>Carregando...</div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {listaFiltrada.length === 0 && <div style={{ color:'#8b92b0', textAlign:'center', padding:32 }}>Nenhum gestor cadastrado ainda.</div>}
            {listaFiltrada.map(g => (
              <div key={g.id} style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:10, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, opacity: g.ativo ? 1 : 0.55 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background: g.ativo ? '#2563eb' : '#d1d5db', flexShrink:0 }} />
                {editandoId === g.id ? (
                  <div style={{ flex:1, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
                    <div style={{ flex:2, minWidth:160 }}><label style={sL}>Nome</label><input style={sI} value={editNome} onChange={e => setEditNome(e.target.value)} /></div>
                    <div style={{ flex:1, minWidth:160 }}><label style={sL}>Diretor</label><select style={sI} value={editDiretorId} onChange={e => setEditDiretorId(e.target.value)}><option value="">— Sem diretor —</option>{diretores.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></div>
                    <div style={{ flex:1, minWidth:140 }}><label style={sL}>E-mail</label><input style={sI} value={editEmail} onChange={e => setEditEmail(e.target.value)} type="email" /></div>
                    <div style={{ display:'flex', gap:8, alignSelf:'flex-end' }}>
                      <button style={sBtnPri} onClick={() => salvarEdicao(g.id)} disabled={salvando}>{salvando ? '...' : '💾'}</button>
                      <button style={sBtnSec} onClick={() => setEditandoId(null)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e' }}>{g.nome}</span>
                        {g.diretor?.nome && <span style={{ background:'#fff8e6', color:'#b45309', border:'1px solid #f0b42940', borderRadius:5, padding:'1px 8px', fontSize:'0.68rem', fontWeight:600 }}>👔 {g.diretor.nome}</span>}
                      </div>
                      <div style={{ color:'#8b92b0', fontSize:'0.75rem', marginTop:2 }}>{g.email || 'Sem e-mail'} · {g.ativo ? 'Ativo' : 'Inativo'}</div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button style={{ ...sBtnSec, fontSize:'0.78rem', padding:'6px 12px' }} onClick={() => { setEditandoId(g.id); setEditNome(g.nome); setEditEmail(g.email || ''); setEditDiretorId(g.diretor_id || ''); }}>✏️ Editar</button>
                      <button onClick={() => toggleAtivo(g)} style={{ background: g.ativo?'#fef2f2':'#f0fdf4', border:`1px solid ${g.ativo?'#fca5a5':'#86efac'}`, borderRadius:8, padding:'6px 12px', color: g.ativo?'#dc2626':'#16a34a', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>{g.ativo ? '⏸ Inativar' : '▶ Ativar'}</button>
                      <button onClick={() => remover(g.id)} style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'6px 12px', color:'#dc2626', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>🗑</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — Adm Comercial
// ══════════════════════════════════════════════════════════════════════════
export default function AdmComercial() {
  const [subPagina, setSubPagina] = useState(null);
  const [equipesDB, setEquipesDB] = useState([]);

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
      {subPagina === 'vendedores' && <PaginaVendedores equipesDB={equipesDB} />}
      {subPagina === 'equipes'    && <PaginaEquipes onEquipesChange={setEquipesDB} />}
      {subPagina === 'diretores'  && <PaginaDiretores />}
      {subPagina === 'gestores'   && <PaginaGestores />}
      {subPagina === 'usuarios'   && <PaginaUsuarios />}
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
