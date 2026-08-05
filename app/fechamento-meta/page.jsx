'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = String(d).split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};
const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS = {
  apurando:       { label: 'Apurando',        cor: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
  em_conferencia: { label: 'Em Conferência',  cor: '#f0b429', bg: 'rgba(240,180,41,0.12)', border: 'rgba(240,180,41,0.3)' },
  conferido:      { label: 'Conferido',       cor: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)' },
  aprovado:       { label: 'Aprovado ✓',      cor: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
  rejeitado:      { label: 'Rejeitado',       cor: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
};

function BadgeStatus({ status }) {
  const st = STATUS[status] || STATUS.apurando;
  return (
    <span style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.cor, borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {st.label}
    </span>
  );
}

function ModalDetalhe({ fechamento, onClose, onAcaoFechamento, perfil, nomeUser }) {
  const [empresas, setEmpresas]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [salvando, setSalvando]           = useState({});
  const [obsModal, setObsModal]           = useState({ id: null, texto: '' });
  const [obsFechamento, setObsFechamento] = useState('');
  const [salvandoFech, setSalvandoFech]   = useState(false);
  const [filtro, setFiltro]               = useState('todos'); // todos | pendentes | conferidos | questionamentos

  useEffect(() => { carregarEmpresas(); }, [fechamento.id]);

  async function carregarEmpresas() {
    setLoading(true);
    const { data } = await supabase
      .from('fechamento_meta_empresas')
      .select('*')
      .eq('fechamento_id', fechamento.id)
      .order('empresa_nome');
    setEmpresas(data || []);
    setLoading(false);
  }

  async function conferirEmpresa(emp, campo) {
    setSalvando(prev => ({ ...prev, [emp.id]: true }));
    const updates = {};
    if (campo === 'adm') {
      updates.conferido_adm = !emp.conferido_adm;
      updates.conferido_adm_por = !emp.conferido_adm ? nomeUser : null;
      updates.conferido_adm_em  = !emp.conferido_adm ? new Date().toISOString() : null;
    } else if (campo === 'marina') {
      updates.conferido_marina = !emp.conferido_marina;
      updates.conferido_marina_por = !emp.conferido_marina ? nomeUser : null;
      updates.conferido_marina_em  = !emp.conferido_marina ? new Date().toISOString() : null;
    }
    await supabase.from('fechamento_meta_empresas').update(updates).eq('id', emp.id);
    setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, ...updates } : e));
    setSalvando(prev => ({ ...prev, [emp.id]: false }));
  }

  async function conferirTudo(campo) {
    setSalvandoFech(true);
    const updates = {};
    if (campo === 'adm') {
      updates.conferido_adm = true;
      updates.conferido_adm_por = nomeUser;
      updates.conferido_adm_em  = new Date().toISOString();
    } else {
      updates.conferido_marina = true;
      updates.conferido_marina_por = nomeUser;
      updates.conferido_marina_em  = new Date().toISOString();
    }
    await supabase.from('fechamento_meta_empresas').update(updates).eq('fechamento_id', fechamento.id);
    await carregarEmpresas();
    setSalvandoFech(false);
  }

  async function salvarQuestionamento(emp) {
    if (!obsModal.texto.trim()) return;
    setSalvando(prev => ({ ...prev, [emp.id]: true }));
    await supabase.from('fechamento_meta_empresas').update({
      questionamento:     obsModal.texto,
      questionamento_por: nomeUser,
      questionamento_em:  new Date().toISOString(),
      questionamento_resolvido: false,
    }).eq('id', emp.id);
    setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, questionamento: obsModal.texto, questionamento_por: nomeUser } : e));
    setObsModal({ id: null, texto: '' });
    setSalvando(prev => ({ ...prev, [emp.id]: false }));
  }

  async function resolverQuestionamento(emp) {
    await supabase.from('fechamento_meta_empresas').update({ questionamento_resolvido: true }).eq('id', emp.id);
    setEmpresas(prev => prev.map(e => e.id === emp.id ? { ...e, questionamento_resolvido: true } : e));
  }

  async function executarAcaoFechamento(acao) {
    setSalvandoFech(true);
    await onAcaoFechamento(fechamento, acao, obsFechamento);
    setSalvandoFech(false);
    onClose();
  }

  const podeConferir  = perfil === 'administrativo' && fechamento.status === 'em_conferencia';
  const podeAprovar   = (perfil === 'gestor_master' || perfil === 'supervisor_comercial') && fechamento.status === 'conferido';

  const totalApurado     = empresas.reduce((s, e) => s + (e.valor_meta || 0), 0);
  const confADM          = empresas.filter(e => e.conferido_adm).length;
  const confMarina       = empresas.filter(e => e.conferido_marina).length;
  const comQuestao       = empresas.filter(e => e.questionamento && !e.questionamento_resolvido).length;
  const todasConferidas  = confADM === empresas.length && confMarina === empresas.length;

  const empresasFiltradas = useMemo(() => {
    if (filtro === 'pendentes')      return empresas.filter(e => !e.conferido_adm || !e.conferido_marina);
    if (filtro === 'conferidos')     return empresas.filter(e => e.conferido_adm && e.conferido_marina);
    if (filtro === 'questionamentos') return empresas.filter(e => e.questionamento && !e.questionamento_resolvido);
    return empresas;
  }, [empresas, filtro]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: 0 }}>
      <div style={{ background: '#0f1218', width: '100%', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', maxHeight: '100vh' }}>
        
        {/* Header fixo */}
        <div style={{ background: '#161a26', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '20px 28px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ color: '#f0b429', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Fechamento de Meta</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>👔 {fechamento.gestor_nome}</span>
                <BadgeStatus status={fechamento.status} />
                <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{fmtMes(fechamento.competencia)}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 16px', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem' }}>
              ✕ Fechar
            </button>
          </div>

          {/* KPIs */}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '10px 18px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Total Apurado</div>
              <div style={{ color: '#34d399', fontSize: '1.2rem', fontWeight: 700 }}>{fmt(totalApurado)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 18px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Empresas</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{empresas.length}</div>
            </div>
            <div style={{ background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.2)', borderRadius: 10, padding: '10px 18px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>✓ ADM</div>
              <div style={{ color: '#f0b429', fontSize: '1.2rem', fontWeight: 700 }}>{confADM}/{empresas.length}</div>
            </div>
            <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, padding: '10px 18px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>✓ Conferência</div>
              <div style={{ color: '#60a5fa', fontSize: '1.2rem', fontWeight: 700 }}>{confMarina}/{empresas.length}</div>
            </div>
            {comQuestao > 0 && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 18px' }}>
                <div style={{ color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>⚠️ Questionamentos</div>
                <div style={{ color: '#f87171', fontSize: '1.2rem', fontWeight: 700 }}>{comQuestao}</div>
              </div>
            )}
          </div>

          {/* Botões conferir tudo + filtros */}
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {podeConferir && (
                <>
                  <button onClick={() => conferirTudo('adm')} disabled={salvandoFech}
                    style={{ background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.3)', borderRadius: 8, padding: '7px 14px', color: '#f0b429', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                    ✓ Conferir tudo — ADM
                  </button>
                  <button onClick={() => conferirTudo('marina')} disabled={salvandoFech}
                    style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8, padding: '7px 14px', color: '#60a5fa', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                    ✓ Conferir tudo — Conferência
                  </button>
                </>
              )}
            </div>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[['todos','Todos'],['pendentes','Pendentes'],['conferidos','Conferidos'],['questionamentos','⚠️ Questões']].map(([k,l]) => (
                <button key={k} onClick={() => setFiltro(k)}
                  style={{ background: filtro === k ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${filtro === k ? 'rgba(240,180,41,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, padding: '5px 12px', color: filtro === k ? '#f0b429' : '#6b7280', cursor: 'pointer', fontSize: '0.75rem', fontWeight: filtro === k ? 700 : 400, fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela scrollável */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>Carregando empresas...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
                <tr style={{ background: '#0f1218' }}>
                  {['Empresa','Produto','Vendedor','Regra','Mês Meta','Valor Meta','✓ ADM','✓ Conferência','Questionamento'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h.includes('✓') || h === 'Questionamento' ? 'center' : 'left', color: '#4b5563', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresasFiltradas.map((emp, i) => {
                  const temQuestao = emp.questionamento && !emp.questionamento_resolvido;
                  const rowBg = temQuestao ? 'rgba(248,113,113,0.04)' : emp.conferido_adm && emp.conferido_marina ? 'rgba(52,211,153,0.03)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                  return (
                    <>
                      <tr key={emp.id} style={{ background: rowBg }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.empresa_nome}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#a78bfa', whiteSpace: 'nowrap' }}>{emp.produto}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{emp.consultor_nome}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {emp.regra === 'beneficio' ? '1ª Recarga' : emp.regra === 'convenio' ? '3º Mês' : emp.regra === 'upsell' ? '📈 Upsell' : 'Manual'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#60a5fa', whiteSpace: 'nowrap' }}>{fmtMes(emp.competencia_meta)}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#34d399', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(emp.valor_meta)}</td>

                        {/* ✓ ADM */}
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                          <button
                            onClick={() => podeConferir && conferirEmpresa(emp, 'adm')}
                            disabled={salvando[emp.id] || !podeConferir}
                            title={emp.conferido_adm ? `${emp.conferido_adm_por} · ${fmtDate(emp.conferido_adm_em)}` : 'Marcar como conferido — ADM'}
                            style={{ background: emp.conferido_adm ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${emp.conferido_adm ? 'rgba(240,180,41,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: emp.conferido_adm ? '#f0b429' : '#4b5563', cursor: podeConferir ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', minWidth: 36 }}>
                            {emp.conferido_adm ? '✓' : '○'}
                          </button>
                        </td>

                        {/* ✓ Conferência (Marina) */}
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                          <button
                            onClick={() => podeConferir && conferirEmpresa(emp, 'marina')}
                            disabled={salvando[emp.id] || !podeConferir}
                            title={emp.conferido_marina ? `${emp.conferido_marina_por} · ${fmtDate(emp.conferido_marina_em)}` : 'Marcar como conferido — Conferência'}
                            style={{ background: emp.conferido_marina ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${emp.conferido_marina ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: emp.conferido_marina ? '#60a5fa' : '#4b5563', cursor: podeConferir ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', minWidth: 36 }}>
                            {emp.conferido_marina ? '✓' : '○'}
                          </button>
                        </td>

                        {/* Questionamento */}
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                          <button
                            onClick={() => setObsModal({ id: emp.id, texto: emp.questionamento || '' })}
                            title={emp.questionamento || 'Adicionar questionamento'}
                            style={{ background: temQuestao ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${temQuestao ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: temQuestao ? '#f87171' : '#4b5563', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                            {temQuestao ? '⚠️' : '💬'}
                          </button>
                        </td>
                      </tr>

                      {/* Linha de questionamento expandida */}
                      {obsModal.id === emp.id && (
                        <tr key={emp.id + '-obs'} style={{ background: 'rgba(248,113,113,0.04)' }}>
                          <td colSpan={9} style={{ padding: '8px 12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                              <div style={{ flex: 1 }}>
                                {emp.questionamento && (
                                  <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginBottom: 4 }}>
                                    ⚠️ Questionamento atual: <span style={{ color: '#f87171' }}>{emp.questionamento}</span>
                                    {emp.questionamento_por && <span style={{ color: '#4b5563' }}> — {emp.questionamento_por}</span>}
                                  </div>
                                )}
                                <input
                                  value={obsModal.texto}
                                  onChange={e => setObsModal(prev => ({ ...prev, texto: e.target.value }))}
                                  placeholder="Descreva o questionamento..."
                                  style={{ width: '100%', background: '#1a1f2e', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '7px 12px', color: '#e8eaf0', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                                />
                              </div>
                              <button onClick={() => salvarQuestionamento(emp)} disabled={!obsModal.texto.trim()}
                                style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: !obsModal.texto.trim() ? 0.5 : 1 }}>
                                ⚠️ Salvar
                              </button>
                              {emp.questionamento && !emp.questionamento_resolvido && (
                                <button onClick={() => resolverQuestionamento(emp)}
                                  style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                  ✓ Resolver
                                </button>
                              )}
                              <button onClick={() => setObsModal({ id: null, texto: '' })}
                                style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(240,180,41,0.05)', borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                  <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 700, color: '#f0b429', fontSize: '0.82rem' }}>
                    TOTAL ({empresasFiltradas.length} empresas)
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#34d399', textAlign: 'right' }}>
                    {fmt(empresasFiltradas.reduce((s, e) => s + (e.valor_meta || 0), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer com ações do fechamento */}
        {(podeConferir || podeAprovar) && (
          <div style={{ background: '#161a26', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 28px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{ display: 'block', color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
                  {podeConferir ? 'Observação da conferência' : 'Observação da aprovação'}
                </label>
                <input
                  value={obsFechamento}
                  onChange={e => setObsFechamento(e.target.value)}
                  placeholder="Opcional..."
                  style={{ width: '100%', background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              {podeConferir && (
                <button onClick={() => executarAcaoFechamento('conferido')} disabled={salvandoFech || !todasConferidas}
                  style={{ background: todasConferidas ? '#2563eb' : 'rgba(37,99,235,0.3)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: todasConferidas ? 'pointer' : 'not-allowed', fontSize: '0.9rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  title={!todasConferidas ? 'Confira todas as empresas antes de avançar' : ''}>
                  {salvandoFech ? 'Salvando...' : `📋 Enviar para Aprovação ${!todasConferidas ? `(${empresas.length - Math.min(confADM, confMarina)} pendentes)` : ''}`}
                </button>
              )}
              {podeAprovar && (
                <>
                  <button onClick={() => executarAcaoFechamento('aprovado')} disabled={salvandoFech}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {salvandoFech ? 'Salvando...' : '✅ Aprovar Fechamento'}
                  </button>
                  <button onClick={() => executarAcaoFechamento('rejeitado')} disabled={salvandoFech}
                    style={{ background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {salvandoFech ? 'Salvando...' : '✕ Rejeitar'}
                  </button>
                </>
              )}
            </div>
            {podeConferir && !todasConferidas && (
              <div style={{ marginTop: 8, color: '#f0b429', fontSize: '0.72rem' }}>
                ⚠️ Para enviar para aprovação, todas as empresas precisam estar conferidas (ADM + Conferência).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RelatorioFechamento() {
  const [loading, setLoading]         = useState(true);
  const [xlsxLib, setXlsxLib]         = useState(null);
  const [fechamentos, setFechamentos] = useState([]);
  const [perfil, setPerfil]           = useState('');
  const [nomeUser, setNomeUser]       = useState('');
  const [gestorUser, setGestorUser]   = useState('');
  const [mesSel, setMesSel]           = useState('2026-07');
  const [mesesDisp, setMesesDisp]     = useState([]);
  const [modalFech, setModalFech]     = useState(null);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m.default || m)); }, []);
  useEffect(() => { carregar(); }, [mesSel]);

  async function carregar() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('user_profiles').select('perfil, nome, gestor').eq('id', user.id).single();
        if (prof) { setPerfil(prof.perfil); setNomeUser(prof.nome); setGestorUser(prof.gestor || ''); }
      }
      const { data: meses } = await supabase.from('fechamento_meta').select('competencia').order('competencia', { ascending: false });
      const unicos = [...new Set((meses || []).map(m => String(m.competencia).substring(0, 7)))];
      setMesesDisp(unicos);
      const { data: fechs } = await supabase.from('fechamento_meta').select('*').eq('competencia', mesSel + '-01').order('gestor_nome');
      setFechamentos(fechs || []);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  async function executarAcaoFechamento(fechamento, acao, obs) {
    const updates = { status: acao };
    if (acao === 'conferido') { updates.conferido_por = nomeUser; updates.conferido_em = new Date().toISOString(); updates.obs_conferencia = obs || null; }
    else if (acao === 'aprovado' || acao === 'rejeitado') { updates.aprovado_por = nomeUser; updates.aprovado_em = new Date().toISOString(); updates.obs_aprovacao = obs || null; }
    await supabase.from('fechamento_meta').update(updates).eq('id', fechamento.id);
    await carregar();
  }

  async function exportarExcel(fechamento) {
    if (!xlsxLib) return;
    const { data: emps } = await supabase.from('fechamento_meta_empresas').select('*').eq('fechamento_id', fechamento.id).order('empresa_nome');
    const headers = ['Empresa','Produto','Vendedor','Regra','Mês Meta','Valor Meta','Conf. ADM','Conf. ADM Por','Conf. Conferência','Conf. Conf. Por','Questionamento'];
    const rows = (emps || []).map(e => [
      e.empresa_nome, e.produto, e.consultor_nome,
      e.regra === 'beneficio' ? '1ª Recarga' : e.regra === 'convenio' ? '3º Mês' : e.regra === 'upsell' ? 'Upsell' : 'Manual',
      fmtMes(e.competencia_meta), e.valor_meta,
      e.conferido_adm ? 'Sim' : 'Não', e.conferido_adm_por || '',
      e.conferido_marina ? 'Sim' : 'Não', e.conferido_marina_por || '',
      e.questionamento || '',
    ]);
    const totalRow = ['TOTAL','','','','', (emps||[]).reduce((s,e)=>s+(e.valor_meta||0),0),'','','','',''];
    const ws = xlsxLib.utils.aoa_to_sheet([headers, ...rows, totalRow]);
    ws['!cols'] = [{ wch:35},{wch:20},{wch:28},{wch:14},{wch:12},{wch:16},{wch:12},{wch:25},{wch:16},{wch:25},{wch:40}];
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'Fechamento');
    xlsxLib.writeFile(wb, `fechamento-${fechamento.gestor_nome.replace(/\s/g,'-')}-${mesSel}.xlsx`);
  }

  const fechamentosFiltrados = useMemo(() => {
    if (perfil === 'gestor_master' || perfil === 'administrativo' || perfil === 'supervisor_comercial') return fechamentos;
    return fechamentos.filter(f => f.gestor_nome === gestorUser || f.gestor_nome?.includes(gestorUser?.split(' ')[0]));
  }, [fechamentos, perfil, gestorUser]);

  const totalGeral   = fechamentosFiltrados.reduce((s, f) => s + (f.valor_total_meta || 0), 0);
  const totalAprov   = fechamentosFiltrados.filter(f => f.status === 'aprovado').length;
  const totalConfer  = fechamentosFiltrados.filter(f => f.status === 'conferido').length;
  const totalPending = fechamentosFiltrados.filter(f => ['apurando','em_conferencia'].includes(f.status)).length;

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><div style={s.spin}/><div style={{ color: '#6b7280' }}>Carregando...</div></div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#f0b429', fontWeight: 800, fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>♠ Vegas Card</div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 6px' }}>Fechamento de Meta</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Conferência e aprovação por equipe</p>
        </div>
        <select value={mesSel} onChange={e => setMesSel(e.target.value)}
          style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
          {mesesDisp.map(m => <option key={m} value={m}>{fmtMes(m + '-01')}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={s.kpi}><span style={s.kpiLabel}>Total Apurado</span><span style={{ ...s.kpiVal, color: '#34d399' }}>{fmt(totalGeral)}</span><span style={s.kpiSub}>{fechamentosFiltrados.length} equipes</span></div>
        <div style={{ ...s.kpi, borderColor: 'rgba(52,211,153,0.3)' }}><span style={s.kpiLabel}>✅ Aprovados</span><span style={{ ...s.kpiVal, color: '#34d399' }}>{totalAprov}</span><span style={s.kpiSub}>equipes aprovadas</span></div>
        <div style={{ ...s.kpi, borderColor: 'rgba(96,165,250,0.3)' }}><span style={s.kpiLabel}>📋 Conferidos</span><span style={{ ...s.kpiVal, color: '#60a5fa' }}>{totalConfer}</span><span style={s.kpiSub}>aguardando aprovação</span></div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.3)' }}><span style={s.kpiLabel}>⏳ Pendentes</span><span style={{ ...s.kpiVal, color: '#f0b429' }}>{totalPending}</span><span style={s.kpiSub}>em conferência</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {fechamentosFiltrados.map(fech => {
          const st = STATUS[fech.status] || STATUS.apurando;
          return (
            <div key={fech.id} style={{ background: '#161a26', border: `1px solid ${st.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>👔 {fech.gestor_nome}</div>
                  <BadgeStatus status={fech.status} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34d399' }}>{fmt(fech.valor_total_meta)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['apurando','em_conferencia','conferido','aprovado'].map((st2, i) => {
                  const ativo = ['apurando','em_conferencia','conferido','aprovado'].indexOf(fech.status) >= i;
                  return <div key={st2} style={{ flex: 1, height: 4, background: ativo ? STATUS[st2].cor : '#1f2937', borderRadius: 2 }} />;
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {fech.apurado_por && <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Apurado: <span style={{ color: '#9ca3af' }}>{fech.apurado_por}</span></div>}
                {fech.conferido_por && <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Conferido: <span style={{ color: '#60a5fa' }}>{fech.conferido_por}</span></div>}
                {fech.aprovado_por && <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Aprovado: <span style={{ color: '#34d399' }}>{fech.aprovado_por}</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalFech(fech)} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', color: '#e8eaf0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit' }}>
                  🔍 Ver / Conferir
                </button>
                <button onClick={() => exportarExcel(fech)} disabled={!xlsxLib} style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '8px 14px', color: '#34d399', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', opacity: !xlsxLib ? 0.5 : 1 }}>
                  📥 Excel
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modalFech && (
        <ModalDetalhe
          fechamento={modalFech}
          onClose={() => { setModalFech(null); carregar(); }}
          onAcaoFechamento={executarAcaoFechamento}
          perfil={perfil}
          nomeUser={nomeUser}
        />
      )}
    </div>
  );
}

const s = {
  page:    { maxWidth: 1300, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh', boxSizing: 'border-box' },
  kpi:     { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel:{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  kpiVal:  { fontSize: '1.4rem', fontWeight: 700 },
  kpiSub:  { color: '#4b5563', fontSize: '0.72rem' },
  spin:    { width: 36, height: 36, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' },
};
