'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Diretores() {
  const [diretores, setDiretores] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [nome, setNome]           = useState('');
  const [email, setEmail]         = useState('');
  const [editando, setEditando]   = useState(null);
  const [salvando, setSalvando]   = useState(false);
  const [msg, setMsg]             = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from('diretores')
      .select('*, gestores(id)')
      .order('nome');
    setDiretores(data || []);
    setLoading(false);
  }

  function iniciarEdicao(d) {
    setEditando(d.id);
    setNome(d.nome);
    setEmail(d.email || '');
  }

  function cancelar() {
    setEditando(null);
    setNome('');
    setEmail('');
  }

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    setMsg(null);
    try {
      if (editando) {
        await supabase.from('diretores').update({ nome: nome.trim(), email: email.trim() || null }).eq('id', editando);
        setMsg({ tipo: 'ok', texto: 'Diretor atualizado!' });
      } else {
        const { error } = await supabase.from('diretores').insert({ nome: nome.trim(), email: email.trim() || null });
        if (error) throw error;
        setMsg({ tipo: 'ok', texto: 'Diretor criado!' });
      }
      cancelar();
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    }
    setSalvando(false);
    setTimeout(() => setMsg(null), 3000);
  }

  async function alternarAtivo(d) {
    await supabase.from('diretores').update({ ativo: !d.ativo }).eq('id', d.id);
    carregar();
  }

  async function remover(id) {
    if (!confirm('Remover diretor? Os gestores vinculados perderão o vínculo.')) return;
    await supabase.from('diretores').delete().eq('id', id);
    carregar();
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card · Adm Comercial</div>
          <h1 style={s.title}>Cadastro de Diretores</h1>
          <p style={s.sub}>Gerencie os diretores que serão vinculados aos gestores e vendedores</p>
        </div>
        <a href="/adm-comercial" style={s.linkBtn}>← Voltar</a>
      </div>

      {/* Formulário */}
      <div style={s.card}>
        <div style={s.cardTitle}>{editando ? '✏️ Editar Diretor' : '+ Novo Diretor'}</div>
        <div style={s.formRow}>
          <div style={s.formGroup}>
            <label style={s.label}>Nome *</label>
            <input style={s.input} value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Ronny Peterson Izidorio" onKeyDown={e => e.key === 'Enter' && salvar()} />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>E-mail</label>
            <input style={s.input} value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@exemplo.com" type="email" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <button style={s.btnPri} onClick={salvar} disabled={salvando || !nome.trim()}>
              {salvando ? 'Salvando...' : editando ? 'Salvar' : '+ Criar Diretor'}
            </button>
            {editando && <button style={s.btnSec} onClick={cancelar}>Cancelar</button>}
          </div>
        </div>
        {msg && <div style={{ ...s.msg, ...(msg.tipo === 'ok' ? s.msgOk : s.msgErro) }}>{msg.texto}</div>}
      </div>

      {/* Lista */}
      <div style={s.card}>
        <div style={s.cardTitle}>Diretores Cadastrados ({diretores.length})</div>
        {loading ? <div style={{ color: '#6b7280', padding: 20 }}>Carregando...</div> : (
          <div style={{ marginTop: 16 }}>
            {diretores.length === 0 && <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Nenhum diretor cadastrado ainda.</div>}
            {diretores.map(d => (
              <div key={d.id} style={{ ...s.itemRow, opacity: d.ativo ? 1 : 0.5 }}>
                <div style={s.itemDot(d.ativo ? '#f0b429' : '#4b5563')} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{d.nome}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>
                    {d.email || 'Sem e-mail'} · {d.gestores?.length || 0} gestores vinculados · {d.ativo ? 'Ativo' : 'Inativo'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={s.btnEdit} onClick={() => iniciarEdicao(d)}>✏️ Editar</button>
                  <button style={{ ...s.btnEdit, color: d.ativo ? '#f87171' : '#34d399', borderColor: d.ativo ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)' }}
                    onClick={() => alternarAtivo(d)}>{d.ativo ? 'Inativar' : 'Ativar'}</button>
                  <button style={{ ...s.btnEdit, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                    onClick={() => remover(d.id)}>🗑 Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:     { maxWidth: 900, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 },
  tag:      { color: '#f0b429', fontWeight: 800, fontSize: '0.85rem', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' },
  title:    { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 6px' },
  sub:      { color: '#6b7280', fontSize: '0.9rem' },
  linkBtn:  { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 18px', color: '#9ca3af', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  card:     { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, marginBottom: 20 },
  cardTitle:{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 },
  formRow:  { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' },
  formGroup:{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px' },
  label:    { color: '#9ca3af', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  input:    { background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#e8eaf0', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none' },
  btnPri:   { background: '#f0b429', color: '#000', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnSec:   { background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 18px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  btnEdit:  { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' },
  itemRow:  { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' },
  itemDot:  (cor) => ({ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }),
  msg:      { marginTop: 12, borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem', fontWeight: 600 },
  msgOk:    { background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' },
  msgErro:  { background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' },
};

