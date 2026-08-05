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
  apurando:       { label: 'Apurando',        cor: '#6b7280', bg: 'rgba(107,114,128,0.12)',  border: 'rgba(107,114,128,0.3)'  },
  em_conferencia: { label: 'Em Conferência',  cor: '#f0b429', bg: 'rgba(240,180,41,0.12)',  border: 'rgba(240,180,41,0.3)'  },
  conferido:      { label: 'Conferido',       cor: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)'  },
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

function ModalDetalhe({ fechamento, empresas, onClose, onAcao, perfil }) {
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const podeConferir = perfil === 'administrativo' && fechamento.status === 'em_conferencia';
  const podeAprovar  = (perfil === 'gestor_master' || perfil === 'supervisor_comercial') && fechamento.status === 'conferido';

  async function executarAcao(acao) {
    setSalvando(true);
    await onAcao(fechamento, acao, obs);
    setSalvando(false);
    onClose();
  }

  const totalEmpresas = empresas.length;
  const totalApurado  = empresas.reduce((s, e) => s + (e.valor_meta || 0), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#161a26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ color: '#f0b429', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
              Fechamento de Meta
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{fechamento.gestor_nome}</div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>
              {fmtMes(fechamento.competencia)} · <BadgeStatus status={fechamento.status} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>
            ✕ Fechar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Empresas na Meta</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{totalEmpresas}</div>
          </div>
          <div style={{ background: 'rgba(52,211,153,0.06)', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(52,211,153,0.15)' }}>
            <div style={{ color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total Apurado</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399' }}>{fmt(totalApurado)}</div>
          </div>
          {fechamento.apurado_por && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Apurado por</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{fechamento.apurado_por}</div>
              <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>{fmtDate(fechamento.apurado_em)}</div>
            </div>
          )}
          {fechamento.conferido_por && (
            <div style={{ background: 'rgba(96,165,250,0.06)', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(96,165,250,0.15)' }}>
              <div style={{ color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Conferido por</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#60a5fa' }}>{fechamento.conferido_por}</div>
              <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>{fmtDate(fechamento.conferido_em)}</div>
            </div>
          )}
          {fechamento.aprovado_por && (
            <div style={{ background: 'rgba(52,211,153,0.06)', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div style={{ color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Aprovado por</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#34d399' }}>{fechamento.aprovado_por}</div>
              <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>{fmtDate(fechamento.aprovado_em)}</div>
            </div>
          )}
        </div>

        {/* Obs de conferência */}
        {fechamento.obs_conferencia && (
          <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Obs. Conferência</div>
            <div style={{ color: '#e8eaf0', fontSize: '0.85rem' }}>{fechamento.obs_conferencia}</div>
          </div>
        )}

        {/* Obs de aprovação */}
        {fechamento.obs_aprovacao && (
          <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Obs. Aprovação</div>
            <div style={{ color: '#e8eaf0', fontSize: '0.85rem' }}>{fechamento.obs_aprovacao}</div>
          </div>
        )}

        {/* Tabela de empresas */}
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12 }}>Empresas consideradas na meta</div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '35vh', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {['Empresa','Produto','Vendedor','Regra','Mês Meta','Valor Meta'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: 0.5, position: 'sticky', top: 0, background: '#161a26', zIndex: 2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empresas.map((emp, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 600, whiteSpace: 'nowrap' }}>{emp.empresa_nome}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#a78bfa', whiteSpace: 'nowrap' }}>{emp.produto}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>{emp.consultor_nome}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                    {emp.regra === 'beneficio' ? '1ª Recarga' : emp.regra === 'convenio' ? '3º Mês' : emp.regra === 'upsell' ? '📈 Upsell' : 'Manual'}
                  </td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#60a5fa', whiteSpace: 'nowrap' }}>{fmtMes(emp.competencia_meta)}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#34d399', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(emp.valor_meta)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(240,180,41,0.05)' }}>
                <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 700, color: '#f0b429', fontSize: '0.82rem' }}>TOTAL ({empresas.length} empresas)</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#34d399', textAlign: 'right' }}>{fmt(totalApurado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Ações */}
        {(podeConferir || podeAprovar) && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>
              {podeConferir ? '📋 Conferência' : '✅ Aprovação Final'}
            </div>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder={podeConferir ? 'Observações da conferência (opcional)...' : 'Observações da aprovação (opcional)...'}
              style={{ width: '100%', background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              {podeConferir && (
                <button onClick={() => executarAcao('conferido')} disabled={salvando}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', opacity: salvando ? 0.6 : 1 }}>
                  {salvando ? 'Salvando...' : '📋 Marcar como Conferido'}
                </button>
              )}
              {podeAprovar && (
                <>
                  <button onClick={() => executarAcao('aprovado')} disabled={salvando}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', opacity: salvando ? 0.6 : 1 }}>
                    {salvando ? 'Salvando...' : '✅ Aprovar'}
                  </button>
                  <button onClick={() => executarAcao('rejeitado')} disabled={salvando}
                    style={{ background: 'rgba(220,38,38,0.1)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '10px 24px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', opacity: salvando ? 0.6 : 1 }}>
                    {salvando ? 'Salvando...' : '✕ Rejeitar'}
                  </button>
                </>
              )}
            </div>
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
  const [empresasMap, setEmpresasMap] = useState({});
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
      // Perfil do usuário
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('user_profiles').select('perfil, nome, gestor').eq('id', user.id).single();
        if (prof) { setPerfil(prof.perfil); setNomeUser(prof.nome); setGestorUser(prof.gestor || ''); }
      }

      // Meses disponíveis
      const { data: meses } = await supabase.from('fechamento_meta').select('competencia').order('competencia', { ascending: false });
      const unicos = [...new Set((meses || []).map(m => String(m.competencia).substring(0, 7)))];
      setMesesDisp(unicos);

      // Fechamentos do mês selecionado
      const { data: fechs } = await supabase.from('fechamento_meta')
        .select('*')
        .eq('competencia', mesSel + '-01')
        .order('gestor_nome');
      setFechamentos(fechs || []);

      // Empresas na meta do mês
      const { data: vmetas } = await supabase
        .from('valor_meta_empresa')
        .select(`
          empresa_id, consultor_id, competencia_meta, valor_meta, regra,
          empresa:empresa_id (id, nome, produto_contratado, consultor_principal_id,
            consultor_principal:consultor_principal_id (nome, gestor))
        `)
        .eq('competencia_meta', mesSel + '-01');

      // Busca nomes de consultores
      const { data: consults } = await supabase.from('consultores').select('id, nome, gestor');
      const consultMap = Object.fromEntries((consults || []).map(c => [c.id, c]));

      // Agrupa por gestor
      const map = {};
      for (const vm of vmetas || []) {
        const gestor = vm.empresa?.consultor_principal?.gestor || '—';
        if (!map[gestor]) map[gestor] = [];
        const cons = vm.consultor_id ? consultMap[vm.consultor_id] : vm.empresa?.consultor_principal;
        map[gestor].push({
          empresa_nome:    vm.empresa?.nome || '—',
          produto:         vm.empresa?.produto_contratado || '—',
          consultor_nome:  cons?.nome || '—',
          competencia_meta: vm.competencia_meta,
          valor_meta:      vm.valor_meta,
          regra:           vm.regra,
        });
      }
      setEmpresasMap(map);
    } catch(err) { console.error(err); }
    setLoading(false);
  }

  async function executarAcao(fechamento, acao, obs) {
    const updates = { status: acao };
    if (acao === 'conferido') {
      updates.conferido_por = nomeUser;
      updates.conferido_em  = new Date().toISOString();
      updates.obs_conferencia = obs || null;
    } else if (acao === 'aprovado' || acao === 'rejeitado') {
      updates.aprovado_por = nomeUser;
      updates.aprovado_em  = new Date().toISOString();
      updates.obs_aprovacao = obs || null;
    }
    await supabase.from('fechamento_meta').update(updates).eq('id', fechamento.id);
    await carregar();
  }

  function exportarExcel(fechamento) {
    if (!xlsxLib) return;
    const empresas = empresasMap[fechamento.gestor_nome] || [];
    const headers  = ['Empresa', 'Produto', 'Vendedor', 'Regra', 'Mês Meta', 'Valor Meta (R$)'];
    const rows     = empresas.map(e => [
      e.empresa_nome, e.produto, e.consultor_nome,
      e.regra === 'beneficio' ? '1ª Recarga' : e.regra === 'convenio' ? '3º Mês' : e.regra === 'upsell' ? 'Upsell' : 'Manual',
      fmtMes(e.competencia_meta),
      e.valor_meta,
    ]);
    const totalRow = ['TOTAL', '', '', '', '', empresas.reduce((s, e) => s + (e.valor_meta || 0), 0)];
    const ws = xlsxLib.utils.aoa_to_sheet([headers, ...rows, totalRow]);
    ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'Meta');
    xlsxLib.writeFile(wb, `fechamento-meta-${fechamento.gestor_nome.replace(/\s/g,'-')}-${mesSel}.xlsx`);
  }

  // Filtra fechamentos por perfil
  const fechamentosFiltrados = useMemo(() => {
    if (perfil === 'gestor_master' || perfil === 'administrativo' || perfil === 'supervisor_comercial') {
      return fechamentos;
    }
    // Gestor vê só a própria equipe
    return fechamentos.filter(f => f.gestor_nome === gestorUser || f.gestor_nome?.includes(gestorUser?.split(' ')[0]));
  }, [fechamentos, perfil, gestorUser]);

  const totalGeral   = fechamentosFiltrados.reduce((s, f) => s + (f.valor_total_meta || 0), 0);
  const totalAprov   = fechamentosFiltrados.filter(f => f.status === 'aprovado').length;
  const totalConfer  = fechamentosFiltrados.filter(f => f.status === 'conferido').length;
  const totalPending = fechamentosFiltrados.filter(f => ['apurando','em_conferencia'].includes(f.status)).length;

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={s.spin} />
        <div style={{ color: '#6b7280' }}>Carregando fechamentos...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ color: '#f0b429', fontWeight: 800, fontSize: '0.85rem', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>♠ Vegas Card</div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 6px' }}>Fechamento de Meta</h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Conferência e aprovação por equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={mesSel} onChange={e => setMesSel(e.target.value)}
            style={{ background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
            {mesesDisp.map(m => <option key={m} value={m}>{fmtMes(m + '-01')}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Total Apurado</span>
          <span style={{ ...s.kpiVal, color: '#34d399' }}>{fmt(totalGeral)}</span>
          <span style={s.kpiSub}>{fechamentosFiltrados.length} equipes</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(52,211,153,0.3)' }}>
          <span style={s.kpiLabel}>✅ Aprovados</span>
          <span style={{ ...s.kpiVal, color: '#34d399' }}>{totalAprov}</span>
          <span style={s.kpiSub}>equipes aprovadas</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(96,165,250,0.3)' }}>
          <span style={s.kpiLabel}>📋 Conferidos</span>
          <span style={{ ...s.kpiVal, color: '#60a5fa' }}>{totalConfer}</span>
          <span style={s.kpiSub}>aguardando aprovação</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.3)' }}>
          <span style={s.kpiLabel}>⏳ Pendentes</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{totalPending}</span>
          <span style={s.kpiSub}>em apuração/conferência</span>
        </div>
      </div>

      {/* Cards por equipe */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {fechamentosFiltrados.map(fech => {
          const empresas   = empresasMap[fech.gestor_nome] || [];
          const totalEmp   = empresas.length;
          const totalVal   = empresas.reduce((s, e) => s + (e.valor_meta || 0), 0);
          const st         = STATUS[fech.status] || STATUS.apurando;
          const podeVerDetalhe = true;

          return (
            <div key={fech.id} style={{ background: '#161a26', border: `1px solid ${st.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Cabeçalho do card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}>👔 {fech.gestor_nome}</div>
                  <BadgeStatus status={fech.status} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#34d399' }}>{fmt(totalVal)}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>{totalEmp} empresas na meta</div>
                </div>
              </div>

              {/* Timeline de status */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {['apurando','em_conferencia','conferido','aprovado'].map((st2, i) => {
                  const ativo = ['apurando','em_conferencia','conferido','aprovado'].indexOf(fech.status) >= i;
                  const cor   = ativo ? STATUS[st2].cor : '#1f2937';
                  return (
                    <div key={st2} style={{ flex: 1, height: 4, background: cor, borderRadius: 2, transition: 'background 0.3s' }} />
                  );
                })}
              </div>

              {/* Info de quem atuou */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fech.apurado_por && <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Apurado: <span style={{ color: '#9ca3af' }}>{fech.apurado_por}</span></div>}
                {fech.conferido_por && <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Conferido: <span style={{ color: '#60a5fa' }}>{fech.conferido_por}</span></div>}
                {fech.aprovado_por && <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>Aprovado: <span style={{ color: '#34d399' }}>{fech.aprovado_por}</span></div>}
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setModalFech(fech)}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', color: '#e8eaf0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit' }}>
                  🔍 Ver detalhes
                </button>
                <button onClick={() => exportarExcel(fech)} disabled={!xlsxLib}
                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '8px 14px', color: '#34d399', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', opacity: !xlsxLib ? 0.5 : 1 }}>
                  📥 Excel
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {fechamentosFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#4b5563' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum fechamento encontrado</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Selecione outro mês ou aguarde a apuração ser concluída.</div>
        </div>
      )}

      {/* Modal de detalhe */}
      {modalFech && (
        <ModalDetalhe
          fechamento={modalFech}
          empresas={empresasMap[modalFech.gestor_nome] || []}
          onClose={() => setModalFech(null)}
          onAcao={executarAcao}
          perfil={perfil}
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
