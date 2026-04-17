'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth, PERFIS } from '../context/AuthContext';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const COR_PERFIL = {
  gestor_master:        { bg:'#1a1d2e', text:'#f0b429',  border:'#f0b42940' },
  diretoria:            { bg:'#eff6ff', text:'#2563eb',  border:'#bfdbfe'   },
  gestor_comercial:     { bg:'#f0fdf4', text:'#16a34a',  border:'#86efac'   },
  supervisor_comercial: { bg:'#f5f3ff', text:'#7c3aed',  border:'#ddd6fe'   },
  supervisor_adm:       { bg:'#fff7ed', text:'#ea580c',  border:'#fed7aa'   },
  administrativo:       { bg:'#ecfeff', text:'#0891b2',  border:'#a5f3fc'   },
  vendedor:             { bg:'#f9fafb', text:'#4a5068',  border:'#e4e7ef'   },
};

export default function PaginaUsuarios() {
  const { profile: myProfile } = useAuth();
  const [usuarios,    setUsuarios]    = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [salvando,    setSalvando]    = useState(false);
  const [erro,        setErro]        = useState('');
  const [sucesso,     setSucesso]     = useState('');
  const [modalNovo,   setModalNovo]   = useState(false);
  const [editando,    setEditando]    = useState(null);

  const formVazio = { nome:'', email:'', senha:'', perfil:'vendedor', consultor_id:'' };
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
    setUsuarios(users || []);
    setConsultores(cons || []);
    setLoading(false);
  }

  async function criarUsuario() {
    if (!form.nome.trim())  { setErro('Informe o nome');  return; }
    if (!form.email.trim()) { setErro('Informe o e-mail'); return; }
    if (!form.senha || form.senha.length < 6) { setErro('Senha deve ter no mínimo 6 caracteres'); return; }

    setSalvando(true); setErro('');
    // Cria usuário no Supabase Auth via Admin API não disponível no client
    // Usamos signUp — o trigger cria o perfil automaticamente
    const { data, error } = await supabase.auth.admin
      ? supabase.auth.admin.createUser({
          email: form.email.trim(),
          password: form.senha,
          email_confirm: true,
          user_metadata: { nome: form.nome.trim(), perfil: form.perfil },
        })
      : { data: null, error: { message: 'Use o Supabase Dashboard para criar usuários ou configure o service_role key' } };

    if (error) {
      // Fallback: instrui usar o dashboard
      setErro('Para criar usuários, acesse: Supabase Dashboard → Authentication → Users → Add User. Depois defina o perfil aqui.');
    } else {
      // Atualiza o perfil com os dados extras
      if (data?.user?.id) {
        await supabase.from('user_profiles').upsert({
          id:           data.user.id,
          nome:         form.nome.trim(),
          email:        form.email.trim(),
          perfil:       form.perfil,
          consultor_id: form.consultor_id || null,
        });
      }
      setSucesso('Usuário criado!');
      setModalNovo(false);
      setForm(formVazio);
      await carregar();
      setTimeout(() => setSucesso(''), 3000);
    }
    setSalvando(false);
  }

  async function salvarEdicao() {
    if (!editando?.nome?.trim()) { setErro('Informe o nome'); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('user_profiles').update({
      nome:         editando.nome.trim(),
      perfil:       editando.perfil,
      consultor_id: editando.consultor_id || null,
      ativo:        editando.ativo,
    }).eq('id', editando.id);
    if (error) { setErro('Erro: ' + error.message); }
    else { setSucesso('Salvo!'); setEditando(null); await carregar(); setTimeout(() => setSucesso(''), 3000); }
    setSalvando(false);
  }

  async function toggleAtivo(u) {
    await supabase.from('user_profiles').update({ ativo: !u.ativo }).eq('id', u.id);
    await carregar();
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEditando(e => ({ ...e, [k]: v }));

  const BadgePerfil = ({ perfil }) => {
    const cor = COR_PERFIL[perfil] || COR_PERFIL.vendedor;
    return (
      <span style={{ background:cor.bg, color:cor.text, border:`1px solid ${cor.border}`,
        borderRadius:6, padding:'2px 10px', fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap' }}>
        {PERFIS[perfil] || perfil}
      </span>
    );
  };

  const FormUsuario = ({ val, onChange, onSalvar, onCancelar, titulo, novo }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#1a1d2e', marginBottom:4 }}>{titulo}</div>
      {erro && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
        padding:'8px 14px', color:'#dc2626', fontSize:'0.82rem' }}>{erro}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ gridColumn:'span 2' }}>
          <label style={sL}>Nome completo *</label>
          <input style={sI} value={val.nome||''} onChange={e=>onChange('nome',e.target.value)} placeholder="Nome do usuário"/>
        </div>
        <div>
          <label style={sL}>E-mail *</label>
          <input style={sI} type='email' value={val.email||''} onChange={e=>onChange('email',e.target.value)}
            placeholder="email@vegascard.com.br" disabled={!novo}
            style={{ ...sI, opacity: novo ? 1 : 0.6, cursor: novo ? 'text' : 'not-allowed' }}/>
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
          <label style={sL}>Perfil de Acesso *</label>
          <select style={sI} value={val.perfil||'vendedor'} onChange={e=>onChange('perfil',e.target.value)}>
            {Object.entries(PERFIS).map(([k,v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={sL}>Vincular ao Vendedor</label>
          <select style={sI} value={val.consultor_id||''} onChange={e=>onChange('consultor_id',e.target.value)}>
            <option value=''>— Nenhum —</option>
            {consultores.map(c => (
              <option key={c.id} value={c.id}>{c.nome}{c.equipe ? ` (${c.equipe})` : ''}</option>
            ))}
          </select>
          <span style={{ color:'#8b92b0', fontSize:'0.7rem' }}>Necessário para perfil Vendedor</span>
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

      {/* Preview do perfil */}
      <div style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:8, padding:'12px 14px' }}>
        <div style={{ fontSize:'0.72rem', color:'#8b92b0', marginBottom:8, fontWeight:600, textTransform:'uppercase', letterSpacing:1 }}>
          Permissões do perfil selecionado
        </div>
        <PermissoesPreview perfil={val.perfil||'vendedor'} />
      </div>

      <div style={{ display:'flex', gap:10, paddingTop:4 }}>
        <button style={sBtnPri} onClick={onSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : '💾 Salvar'}
        </button>
        <button style={sBtnSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );

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
              onCancelar={() => { setModalNovo(false); setErro(''); }} titulo="➕ Novo Usuário" novo />
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
              titulo={`✏️ Editar — ${editando.nome}`} />
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
                {['Nome','E-mail','Perfil','Vendedor Vinculado','Status','Ações'].map(h => (
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
                      <button onClick={() => { setEditando({...u, consultor_id: u.consultor_id||''}); setErro(''); }}
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

const sL      = { display:'block', color:'#8b92b0', fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:1, marginBottom:5, fontWeight:600 };
const sI      = { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:8, padding:'8px 12px', color:'#1a1d2e', fontSize:'0.85rem', fontFamily:'inherit', width:'100%', boxSizing:'border-box' };
const sBtnPri = { background:'#f0b429', color:'#000', border:'none', borderRadius:8, padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' };
const sBtnSec = { background:'#f5f6fa', color:'#4a5068', border:'1px solid #e4e7ef', borderRadius:8, padding:'9px 16px', fontWeight:600, cursor:'pointer', fontSize:'0.85rem', fontFamily:'inherit' };

