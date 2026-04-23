'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Gestores() {
  const [gestores, setGestores]     = useState([]);
  const [diretores, setDiretores]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [nome, setNome]             = useState('');
  const [email, setEmail]           = useState('');
  const [diretorId, setDiretorId]   = useState('');
  const [editando, setEditando]     = useState(null);
  const [filtroDiretor, setFiltroDiretor] = useState('todos');
  const [salvando, setSalvando]     = useState(false);
  const [msg, setMsg]               = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const [{ data: gs }, { data: ds }] = await Promise.all([
      supabase.from('gestores').select('*, diretor:diretor_id(id, nome)').order('nome'),
      supabase.from('diretores').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setGestores(gs || []);
    setDiretores(ds || []);
    setLoading(false);
  }

  function iniciarEdicao(g) {
    setEditando(g.id);
    setNome(g.nome);
    setEmail(g.email || '');
    setDiretorId(g.diretor_id || '');
  }

  function cancelar() {
    setEditando(null);
    setNome(''); setEmail(''); setDiretorId('');
  }

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    setMsg(null);
    try {
      const payload = { nome: nome.trim(), email: email.trim() || null, diretor_id: diretorId || null };
      if (editando) {
        await supabase.from('gestores').update(payload).eq('id', editando);
        setMsg({ tipo: 'ok', texto: 'Gestor atualizado!' });
      } else {
        const { error } = await supabase.from('gestores').insert(payload);
        if (error) throw error;
        setMsg({ tipo: 'ok', texto: 'Gestor criado!' });
      }
      cancelar();
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    }
    setSalvando(false);
    setTimeout(() => setMsg(null), 3000);
  }

  async function alternarAtivo(g) {
    await supabase.from('gestores').update({ ativo: !g.ativo }).eq('id', g.id);
    carregar();
  }

  async function remover(id) {
    if (!confirm('Remover gestor? Os vendedores vinculados perderão o vínculo.')) return;
    await supabase.from('gestores').delete().eq('id', id);
    carregar();
  }

  const listaFiltrada = filtroDiretor === 'todos'
    ? gestores
    : gestores.filter(g => g.diretor_id === filtroDiretor);

  // Agrupa por diretor para exibição
  const grupos = diretores.map(d => ({
    diretor: d,
    gestores: listaFiltrada.filter(g => g.diretor_id === d.id),
  })).filter(gr => filtroDiretor === 'todos' ? true : gr.diretor.id === filtroDiretor);

  const semDiretor = listaFiltrada.filter(g => !g.diretor_id);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card · Adm Comercial</div>
          <h1 style={s.title}>Cadastro de Gestores</h1>
          <p style={s.sub}>Gerencie os gestores vinculados a cada diretor</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/adm-comercial/diretores" style={s.linkBtn}>👔 Diretores</a>
          <a href="/adm-comercial" style={s.linkBtnSec}>← Voltar</a>
        </div>
      </div>

      {/* Formulário */}
      <div style={s.card}>
        <div style={s.cardTitle}>{editando ? '✏️ Editar Gestor' : '+ Novo Gestor'}</div>
        <div style={s.formRow}>
          <div style={s.formGroup}>
            <label style={s.label}>Nome *</label>
            <input style={s.input} value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Marcos Rossi" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Diretor responsável</label>
            <select style={s.select} value={diretorId} onChange={e => setDiretorId(e.target.value)}>
              <option value="">Sem diretor vinculado</option>
              {diretores.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>E-mail</label>
            <input style={s.input} value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@exemplo.com" type="email" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <button style={s.btnPri} onClick={salvar} disabled={salvando || !nome.trim()}>
              {salvando ? 'Salvando...' : editando ? 'Salvar' : '+ Criar Gestor'}
            </button>
            {editando && <button style={s.btnSec} onClick={cancelar}>Cancelar</button>}
          </div>
        </div>
        {msg && <div style={{ ...s.msg, ...(msg.tipo === 'ok' ? s.msgOk : s.msgErro) }}>{msg.texto}</div>}
      </div>

      {/* Filtro */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#6b7280', fontSize: '0.82rem' }}>Filtrar por Diretor:</span>
        <select style={{ ...s.select, flex: 'none', minWidth: 220 }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
          <option value="todos">Todos os diretores</option>
          {diretores.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <span style={{ color: '#4b5563', fontSize: '0.78rem' }}>{listaFiltrada.length} gestores</span>
      </div>

      {/* Lista agrupada por diretor */}
      {loading ? <div style={{ color: '#6b7280' }}>Carregando...</div> : (
        <>
          {grupos.map(({ diretor, gestores: gs }) => gs.length > 0 && (
            <div key={diretor.id} style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 3, height: 20, background: '#f0b429', borderRadius: 2 }} />
                <div style={{ fontWeight: 700, color: '#f0b429', fontSize: '0.9rem' }}>
                  👔 {diretor.nome}
                </div>
                <div style={{ color: '#4b5563', fontSize: '0.78rem' }}>{gs.length} gestor(es)</div>
              </div>
              {gs.map(g => (
                <div key={g.id} style={{ ...s.itemRow, opacity: g.ativo ? 1 : 0.5 }}>
                  <div style={s.itemDot(g.ativo ? '#60a5fa' : '#4b5563')} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{g.nome}</div>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      {g.email || 'Sem e-mail'} · {g.ativo ? 'Ativo' : 'Inativo'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={s.btnEdit} onClick={() => iniciarEdicao(g)}>✏️ Editar</button>
                    <button style={{ ...s.btnEdit, color: g.ativo ? '#f87171' : '#34d399', borderColor: g.ativo ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)' }}
                      onClick={() => alternarAtivo(g)}>{g.ativo ? 'Inativar' : 'Ativar'}</button>
                    <button style={{ ...s.btnEdit, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                      onClick={() => remover(g.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {semDiretor.length > 0 && (
            <div style={s.card}>
              <div style={{ fontWeight: 700, color: '#6b7280', marginBottom: 14, fontSize: '0.9rem' }}>Sem Diretor Vinculado</div>
              {semDiretor.map(g => (
                <div key={g.id} style={{ ...s.itemRow, opacity: g.ativo ? 1 : 0.5 }}>
                  <div style={s.itemDot('#4b5563')} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{g.nome}</div>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{g.email || 'Sem e-mail'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={s.btnEdit} onClick={() => iniciarEdicao(g)}>✏️ Editar</button>
                    <button style={{ ...s.btnEdit, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }} onClick={() => remover(g.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {listaFiltrada.length === 0 && (
            <div style={{ color: '#6b7280', fontSize: '0.9rem', padding: 20, textAlign: 'center' }}>
              Nenhum gestor cadastrado ainda.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  page:       { maxWidth: 900, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 },
  tag:        { color: '#f0b429', fontWeight: 800, fontSize: '0.85rem', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
  title:      { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 6px' },
  sub:        { color: '#6b7280', fontSize: '0.9rem' },
  linkBtn:    { background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.2)', borderRadius: 10, padding: '10px 18px', color: '#f0b429', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  linkBtnSec: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 18px', color: '#9ca3af', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  card:       { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, marginBottom: 16 },
  cardTitle:  { fontSize: '1rem', fontWeight: 700, marginBottom: 16 },
  formRow:    { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' },
  formGroup:  { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 180px' },
  label:      { color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  input:      { background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#e8eaf0', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none' },
  select:     { background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#e8eaf0', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  btnPri:     { background: '#f0b429', color: '#000', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnSec:     { background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 18px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  btnEdit:    { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' },
  itemRow:    { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  itemDot:    (cor) => ({ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }),
  msg:        { marginTop: 12, borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem', fontWeight: 600 },
  msgOk:      { background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' },
  msgErro:    { background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' },
};

