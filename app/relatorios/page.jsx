'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => `${Number(v || 0).toFixed(2)}%`;
const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export default function RelatorioEmpresas() {
  const [xlsxLib, setXlsxLib]     = useState(null);
  const [empresas, setEmpresas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [exportando, setExportando] = useState(false);

  // Filtros
  const [busca, setBusca]             = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroGestor, setFiltroGestor]       = useState('');
  const [filtroConsultor, setFiltroConsultor] = useState('');
  const [filtroParceiro, setFiltroParceiro]   = useState('');

  // Listas de opções
  const [categorias, setCategorias]   = useState([]);
  const [gestores, setGestores]       = useState([]);
  const [consultores, setConsultores] = useState([]);
  const [parceiros, setParceiros]     = useState([]);

  useEffect(() => { import('xlsx').then(mod => setXlsxLib(mod)); }, []);
  useEffect(() => { carregarEmpresas(); }, []);

  async function carregarEmpresas() {
    setLoading(true);
    const { data } = await supabase
      .from('empresas')
      .select(`
        produto_id, nome, cnpj, categoria, produto_contratado,
        peso_categoria, potencial_movimentacao, taxa_negativa, data_cadastro,
        cidade, estado,
        consultor_principal:consultor_principal_id (nome, gestor),
        consultor_agregado:consultor_agregado_id (nome),
        parceiro:parceiro_id (nome)
      `)
      .eq('ativo', true)
      .order('nome');

    const lista = (data || []).map(e => ({
      produto_id:          e.produto_id,
      nome:                e.nome,
      cnpj:                e.cnpj || '—',
      categoria:           e.categoria || '—',
      produto_contratado:  e.produto_contratado || '—',
      peso:                e.peso_categoria || 1,
      potencial:           e.potencial_movimentacao || 0,
      data_cadastro:       e.data_cadastro || null,
      cidade:              e.cidade || '—',
      estado:              e.estado || '—',
      consultor:           e.consultor_principal?.nome || '—',
      gestor:              e.consultor_principal?.gestor || '—',
      consultor_agregado:  e.consultor_agregado?.nome || '—',
      taxa_negativa:       e.taxa_negativa || 0,
      parceiro:            e.parceiro?.nome || '—',
    }));

    setEmpresas(lista);

    // Monta listas únicas para filtros
    setCategorias([...new Set(lista.map(e => e.categoria).filter(v => v !== '—'))].sort());
    setGestores([...new Set(lista.map(e => e.gestor).filter(v => v !== '—'))].sort());
    setConsultores([...new Set(lista.map(e => e.consultor).filter(v => v !== '—'))].sort());
    setParceiros([...new Set(lista.map(e => e.parceiro).filter(v => v !== '—'))].sort());
    setLoading(false);
  }

  // Filtragem
  const filtradas = empresas.filter(e => {
    const q = busca.toLowerCase();
    const matchBusca = !busca ||
      e.nome.toLowerCase().includes(q) ||
      String(e.produto_id).includes(q) ||
      e.cnpj.includes(q) ||
      e.consultor.toLowerCase().includes(q);
    return matchBusca
      && (!filtroCategoria  || e.categoria  === filtroCategoria)
      && (!filtroGestor     || e.gestor     === filtroGestor)
      && (!filtroConsultor  || e.consultor  === filtroConsultor)
      && (!filtroParceiro   || e.parceiro   === filtroParceiro);
  });

  const totalPotencial = filtradas.reduce((s, e) => s + e.potencial, 0);

  // Exportar Excel
  const exportar = useCallback(async () => {
    if (!xlsxLib) return;
    setExportando(true);
    try {
      const linhas = filtradas.map(e => ({
        'Produto ID':            e.produto_id,
        'Nome da Empresa':       e.nome,
        'CNPJ':                  e.cnpj,
        'Categoria':             e.categoria,
        'Produto Contratado':    e.produto_contratado,
        'Peso (%)':              `${(e.peso * 100).toFixed(0)}%`,
        'Potencial Movimentação':e.potencial,
        'Taxa Negativa (%)':      e.taxa_negativa,
        'Data de Cadastro':      e.data_cadastro || '',
        'Cidade':                e.cidade,
        'UF':                    e.estado,
        'Consultor Principal':   e.consultor,
        'Consultor Agregado':    e.consultor_agregado,
        'Parceiro Comercial':    e.parceiro,
        'Gestor':                e.gestor,
      }));

      const ws = xlsxLib.utils.json_to_sheet(linhas);
      ws['!cols'] = [
        { wch: 12 }, { wch: 45 }, { wch: 20 }, { wch: 16 },
        { wch: 22 }, { wch: 8  }, { wch: 24 }, { wch: 16 },
        { wch: 20 }, { wch: 6  }, { wch: 28 }, { wch: 28 },
        { wch: 28 }, { wch: 28 },
      ];
      const wb = xlsxLib.utils.book_new();
      xlsxLib.utils.book_append_sheet(wb, ws, 'Empresas');
      xlsxLib.writeFile(wb, `relatorio_empresas_${new Date().toISOString().substring(0, 10)}.xlsx`);
    } catch (err) { alert('Erro ao exportar: ' + err.message); }
    setExportando(false);
  }, [xlsxLib, filtradas]);

  const limparFiltros = () => {
    setBusca(''); setFiltroCategoria(''); setFiltroGestor('');
    setFiltroConsultor(''); setFiltroParceiro('');
  };

  const temFiltro = busca || filtroCategoria || filtroGestor || filtroConsultor || filtroParceiro;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Relatório de Empresas</h1>
          <p style={s.sub}>Conferência do cadastro completo de empresas ativas</p>
        </div>
        <button style={s.btnExport} onClick={exportar} disabled={!xlsxLib || exportando || filtradas.length === 0}>
          {exportando ? '⏳ Gerando...' : `📥 Exportar Excel (${filtradas.length})`}
        </button>
      </div>

      {/* KPIs rápidos */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Total Cadastradas</span>
          <span style={s.kpiVal}>{empresas.length}</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Filtradas</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{filtradas.length}</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Potencial Filtrado</span>
          <span style={{ ...s.kpiVal, color: '#34d399', fontSize: '1.1rem' }}>{fmt(totalPotencial)}</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Categorias</span>
          <span style={s.kpiVal}>{categorias.length}</span>
        </div>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Consultores</span>
          <span style={s.kpiVal}>{consultores.length}</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={s.filtrosBox}>
        {/* Busca livre */}
        <div style={{ flex: 3, minWidth: 260 }}>
          <div style={s.filtroLabel}>🔍 Buscar</div>
          <input
            style={s.input}
            placeholder="Nome, ID, CNPJ, consultor..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        {/* Categoria */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={s.filtroLabel}>Categoria</div>
          <select style={s.select} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Gestor */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={s.filtroLabel}>Gestor</div>
          <select style={s.select} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
            <option value="">Todos</option>
            {gestores.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {/* Consultor */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={s.filtroLabel}>Consultor</div>
          <select style={s.select} value={filtroConsultor} onChange={e => setFiltroConsultor(e.target.value)}>
            <option value="">Todos</option>
            {consultores.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Parceiro */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={s.filtroLabel}>Parceiro</div>
          <select style={s.select} value={filtroParceiro} onChange={e => setFiltroParceiro(e.target.value)}>
            <option value="">Todos</option>
            {parceiros.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {/* Limpar */}
        {temFiltro && (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button style={s.btnLimpar} onClick={limparFiltros}>✕ Limpar</button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={s.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={s.spin}></div>
            <div style={{ color: '#6b7280' }}>Carregando empresas...</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                Exibindo <strong style={{ color: '#e8eaf0' }}>{filtradas.length}</strong> de {empresas.length} empresas
              </div>
              {filtradas.length > 100 && (
                <div style={{ color: '#f0b429', fontSize: '0.75rem' }}>
                  ⚠ Mostrando primeiras 100 linhas — use filtros ou exporte para ver todas
                </div>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['ID', 'Empresa', 'CNPJ', 'Categoria', 'Produto', 'Peso', 'Potencial', 'Taxa Neg.', 'Cadastro', 'Cidade/UF', 'Consultor Principal', 'Cons. Agregado', 'Parceiro', 'Gestor'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice(0, 100).map((e, i) => {
                    const corCat = {
                      'Benefícios':   '#60a5fa',
                      'Bônus':        '#a78bfa',
                      'Convênio':     '#34d399',
                      'Taxa Negativa':'#f87171',
                    }[e.categoria] || '#9ca3af';
                    return (
                      <tr key={i} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                        <td style={{ ...s.td, color: '#f0b429', fontWeight: 700 }}>{e.produto_id}</td>
                        <td style={{ ...s.td, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.nome}>{e.nome}</td>
                        <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.75rem' }}>{e.cnpj}</td>
                        <td style={s.td}>
                          <span style={{ background: `${corCat}18`, color: corCat, border: `1px solid ${corCat}30`, borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {e.categoria}
                          </span>
                        </td>
                        <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.produto_contratado}</td>
                        <td style={{ ...s.td, textAlign: 'center', color: '#f0b429' }}>{(e.peso * 100).toFixed(0)}%</td>
                        <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(e.potencial)}</td>
                        <td style={{ ...s.td, color: e.taxa_negativa > 0 ? '#f87171' : '#374151', textAlign: 'center' }}>{e.taxa_negativa > 0 ? `${(Number(e.taxa_negativa) * 100).toFixed(2)}%` : '—'}</td>
                        <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{fmtDate(e.data_cadastro)}</td>
                        <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{e.cidade} / {e.estado}</td>
                        <td style={{ ...s.td, fontWeight: 500 }}>{e.consultor}</td>
                        <td style={{ ...s.td, color: '#6b7280', fontSize: '0.78rem' }}>{e.consultor_agregado !== '—' ? e.consultor_agregado : <span style={{ color: '#374151' }}>—</span>}</td>
                        <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.parceiro !== '—' ? e.parceiro : <span style={{ color: '#374151' }}>—</span>}</td>
                        <td style={{ ...s.td, color: '#6b7280', fontSize: '0.78rem' }}>{e.gestor}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtradas.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#4b5563' }}>
                Nenhuma empresa encontrada com os filtros selecionados
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:       { maxWidth: 1400, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  tag:        { color: '#f0b429', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  title:      { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 6px' },
  sub:        { color: '#6b7280', fontSize: '0.9rem' },
  btnExport:  { background: '#f0b429', color: '#000', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit', opacity: 1 },
  kpis:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 },
  kpi:        { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column' },
  kpiLabel:   { color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  kpiVal:     { fontSize: '1.4rem', fontWeight: 700 },
  filtrosBox: { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' },
  filtroLabel:{ color: '#6b7280', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  input:      { background: '#1e2235', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', width: '100%', outline: 'none' },
  select:     { background: '#1e2235', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', width: '100%', outline: 'none', cursor: 'pointer' },
  btnLimpar:  { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 14px', color: '#f87171', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' },
  card:       { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:         { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: 0.5 },
  td:         { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  spin:       { width: 36, height: 36, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' },
};
