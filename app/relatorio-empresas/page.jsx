'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt     = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct  = (v) => v != null ? `${Number(v * 100).toFixed(2)}%` : '—';
const fmtDate = (d) => { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; };

// ─── Definição de todas as colunas disponíveis ─────────────────────────────
const TODAS_COLUNAS = [
  // Identificação
  { key: 'produto_id',          grupo: 'Identificação',   label: 'ID Produto',           render: e => e.produto_id || '—' },
  { key: 'nome',                grupo: 'Identificação',   label: 'Empresa',              render: e => e.nome || '—' },
  { key: 'cnpj',                grupo: 'Identificação',   label: 'CNPJ',                 render: e => e.cnpj || '—' },
  { key: 'data_cadastro',       grupo: 'Identificação',   label: 'Data Cadastro',        render: e => fmtDate(e.data_cadastro) },
  { key: 'ativo',               grupo: 'Identificação',   label: 'Ativo',                render: e => e.ativo ? 'Sim' : 'Não' },

  // Produto & Categoria
  { key: 'produto_contratado',  grupo: 'Produto',         label: 'Produto Contratado',   render: e => e.produto_contratado || '—' },
  { key: 'categoria',           grupo: 'Produto',         label: 'Categoria',            render: e => e.categoria || '—' },
  { key: 'peso_categoria',      grupo: 'Produto',         label: 'Peso (%)',             render: e => e.peso_categoria != null ? `${(e.peso_categoria * 100).toFixed(0)}%` : '—' },
  { key: 'tipo_boleto',         grupo: 'Produto',         label: 'Tipo Boleto',          render: e => e.tipo_boleto || '—' },
  { key: 'cartoes_emitidos',    grupo: 'Produto',         label: 'Cartões Emitidos',     render: e => e.cartoes_emitidos ?? 0 },
  { key: 'dias_prazo',          grupo: 'Produto',         label: 'Dias Prazo',           render: e => e.dias_prazo ?? '—' },
  { key: 'confeccao_cartao',    grupo: 'Produto',         label: 'Confecção Cartão',     render: e => e.confeccao_cartao != null ? fmt(e.confeccao_cartao) : '—' },

  // Localização
  { key: 'cidade',              grupo: 'Localização',     label: 'Cidade',               render: e => e.cidade || '—' },
  { key: 'estado',              grupo: 'Localização',     label: 'Estado',               render: e => e.estado || '—' },

  // Financeiro
  { key: 'potencial_movimentacao', grupo: 'Financeiro',   label: 'Potencial Mensal',     render: e => fmt(e.potencial_movimentacao) },
  { key: 'resultado_esperado',  grupo: 'Financeiro',      label: 'Resultado Esperado',   render: e => fmt((e.potencial_movimentacao||0)*(e.peso_categoria||1)) },
  { key: 'taxa_positiva',       grupo: 'Financeiro',      label: 'Taxa Positiva',        render: e => fmtPct(e.taxa_positiva) },
  { key: 'taxa_negativa',       grupo: 'Financeiro',      label: 'Taxa Negativa',        render: e => fmtPct(e.taxa_negativa) },

  // Comercial
  { key: 'consultor_principal', grupo: 'Comercial',       label: 'Consultor Principal',  render: e => e.consultor_principal?.nome || '—' },
  { key: 'gestor',              grupo: 'Comercial',       label: 'Gestor',               render: e => e.consultor_principal?.gestor || '—' },
  { key: 'consultor_agregado',  grupo: 'Comercial',       label: 'Consultor Agregado',   render: e => e.consultor_agregado?.nome || '—' },
  { key: 'parceiro',            grupo: 'Comercial',       label: 'Parceiro Comercial',   render: e => e.parceiro?.nome || '—' },
];

const COLUNAS_PADRAO = [
  'produto_id','nome','cnpj','data_cadastro','produto_contratado','categoria',
  'cidade','estado','potencial_movimentacao','taxa_positiva','taxa_negativa',
  'consultor_principal','parceiro',
];

const GRUPOS = [...new Set(TODAS_COLUNAS.map(c => c.grupo))];

export default function RelatorioEmpresas() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading]   = useState(true);

  // Filtros de linha
  const [busca,            setBusca]           = useState('');
  const [filtroCategoria,  setFiltroCategoria] = useState('');
  const [filtroGestor,     setFiltroGestor]    = useState('');
  const [filtroConsultor,  setFiltroConsultor] = useState('');
  const [filtroParceiro,   setFiltroParceiro]  = useState('');
  const [filtroProduto,    setFiltroProduto]   = useState('');
  const [filtroAtivo,      setFiltroAtivo]     = useState('');

  // Seleção de colunas
  const [colsSelecionadas, setColsSelecionadas] = useState(new Set(COLUNAS_PADRAO));
  const [painelCols, setPainelCols]             = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); carregarEmpresas(); }, []);

  async function carregarEmpresas() {
    setLoading(true);
    const { data } = await supabase
      .from('empresas')
      .select(`
        id, produto_id, nome, cnpj, produto_contratado, categoria,
        cidade, estado, potencial_movimentacao, peso_categoria,
        cartoes_emitidos, data_cadastro, taxa_positiva, taxa_negativa,
        tipo_boleto, confeccao_cartao, dias_prazo, ativo,
        consultor_principal:consultor_principal_id (id, nome, gestor),
        consultor_agregado:consultor_agregado_id (id, nome),
        parceiro:parceiro_id (nome)
      `)
      .order('nome');
    setEmpresas(data || []);
    setLoading(false);
  }

  // Opções únicas para filtros
  const opts = useMemo(() => ({
    categorias:  [...new Set(empresas.map(e => e.categoria).filter(Boolean))].sort(),
    gestores:    [...new Set(empresas.map(e => e.consultor_principal?.gestor).filter(Boolean))].sort(),
    consultores: [...new Set(empresas.map(e => e.consultor_principal?.nome).filter(Boolean))].sort(),
    parceiros:   [...new Set(empresas.map(e => e.parceiro?.nome).filter(Boolean))].sort(),
    produtos:    [...new Set(empresas.map(e => e.produto_contratado).filter(Boolean))].sort(),
  }), [empresas]);

  // Empresas filtradas
  const lista = useMemo(() => empresas.filter(e => {
    if (busca) {
      const q = busca.toLowerCase();
      if (!e.nome?.toLowerCase().includes(q) &&
          !e.cnpj?.includes(q) &&
          !String(e.produto_id||'').includes(q)) return false;
    }
    if (filtroCategoria && e.categoria !== filtroCategoria) return false;
    if (filtroGestor    && e.consultor_principal?.gestor !== filtroGestor) return false;
    if (filtroConsultor && e.consultor_principal?.nome !== filtroConsultor) return false;
    if (filtroParceiro  && e.parceiro?.nome !== filtroParceiro) return false;
    if (filtroProduto   && e.produto_contratado !== filtroProduto) return false;
    if (filtroAtivo === 'sim' && !e.ativo) return false;
    if (filtroAtivo === 'nao' && e.ativo)  return false;
    return true;
  }), [empresas, busca, filtroCategoria, filtroGestor, filtroConsultor, filtroParceiro, filtroProduto, filtroAtivo]);

  // Colunas visíveis na ordem definida
  const colunas = TODAS_COLUNAS.filter(c => colsSelecionadas.has(c.key));

  // Toggle coluna individual
  const toggleCol = (key) => {
    setColsSelecionadas(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Toggle grupo inteiro
  const toggleGrupo = (grupo) => {
    const keys = TODAS_COLUNAS.filter(c => c.grupo === grupo).map(c => c.key);
    const todosAtivos = keys.every(k => colsSelecionadas.has(k));
    setColsSelecionadas(prev => {
      const next = new Set(prev);
      keys.forEach(k => todosAtivos ? next.delete(k) : next.add(k));
      return next;
    });
  };

  const selecionarTodas = () => setColsSelecionadas(new Set(TODAS_COLUNAS.map(c => c.key)));
  const limparTodas     = () => setColsSelecionadas(new Set(['nome']));
  const resetarPadrao   = () => setColsSelecionadas(new Set(COLUNAS_PADRAO));

  const temFiltro = busca || filtroCategoria || filtroGestor || filtroConsultor || filtroParceiro || filtroProduto || filtroAtivo;
  const limparFiltros = () => {
    setBusca(''); setFiltroCategoria(''); setFiltroGestor('');
    setFiltroConsultor(''); setFiltroParceiro(''); setFiltroProduto(''); setFiltroAtivo('');
  };

  async function exportar() {
    if (!xlsxLib) return;
    const headers = colunas.map(c => c.label);
    const rows = lista.map(e => colunas.map(c => {
      const raw = c.render(e);
      return raw === '—' ? '' : raw;
    }));
    const ws = xlsxLib.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length, ...rows.map(r => String(r[i]||'').length), 10)
    }));
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'Empresas');
    xlsxLib.writeFile(wb, `relatorio-empresas-${new Date().toISOString().substring(0,10)}.xlsx`);
  }

  return (
    <div style={s.page}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Relatório de Empresas</h1>
          <p style={s.sub}>Escolha filtros e colunas para montar seu relatório</p>
        </div>
        <button onClick={exportar} disabled={!xlsxLib || lista.length === 0} style={{
          ...s.btnPri,
          opacity: (!xlsxLib || lista.length === 0) ? 0.5 : 1,
          cursor: (!xlsxLib || lista.length === 0) ? 'not-allowed' : 'pointer',
        }}>
          📥 Exportar Excel ({lista.length})
        </button>
      </div>

      {/* ── Filtros de linha ────────────────────────────────────────── */}
      <div style={s.filtrosBox}>
        <div style={{ color:'#f0b429', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>
          🔽 Filtrar registros
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <input
            placeholder="🔍 Nome, CNPJ ou ID..."
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...s.input, minWidth:200, flex:2 }}
          />
          {[
            { val: filtroProduto,    set: setFiltroProduto,    opts: opts.produtos,    ph: 'Produto'    },
            { val: filtroCategoria,  set: setFiltroCategoria,  opts: opts.categorias,  ph: 'Categoria'  },
            { val: filtroGestor,     set: setFiltroGestor,     opts: opts.gestores,    ph: 'Gestor'     },
            { val: filtroConsultor,  set: setFiltroConsultor,  opts: opts.consultores, ph: 'Consultor'  },
            { val: filtroParceiro,   set: setFiltroParceiro,   opts: opts.parceiros,   ph: 'Parceiro'   },
          ].map(({ val, set, opts: o, ph }) => (
            <select key={ph} value={val} onChange={e => set(e.target.value)} style={{ ...s.input, minWidth:140 }}>
              <option value=''>{ph} — Todos</option>
              {o.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          ))}
          <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={{ ...s.input, minWidth:110 }}>
            <option value=''>Ativos — Todos</option>
            <option value='sim'>✅ Ativos</option>
            <option value='nao'>❌ Inativos</option>
          </select>
          {temFiltro && (
            <button onClick={limparFiltros} style={s.btnClear}>✕ Limpar filtros</button>
          )}
        </div>
      </div>

      {/* ── Seletor de colunas ──────────────────────────────────────── */}
      <div style={s.colsBar}>
        <button
          onClick={() => setPainelCols(v => !v)}
          style={{ ...s.btnCols, ...(painelCols ? s.btnColsAtivo : {}) }}
        >
          ⚙️ Colunas selecionadas: {colsSelecionadas.size} de {TODAS_COLUNAS.length}
          <span style={{ marginLeft:6, fontSize:'0.7rem' }}>{painelCols ? '▲' : '▼'}</span>
        </button>
        <button onClick={selecionarTodas} style={s.btnMini}>Todas</button>
        <button onClick={resetarPadrao}   style={s.btnMini}>Padrão</button>
        <button onClick={limparTodas}     style={s.btnMini}>Mínimo</button>
        <span style={{ color:'#8b92b0', fontSize:'0.75rem', marginLeft:8 }}>
          {lista.length} empresa{lista.length !== 1 ? 's' : ''} · {colunas.length} coluna{colunas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Painel de checkboxes ─────────────────────────────────────── */}
      {painelCols && (
        <div style={s.painelCols}>
          {GRUPOS.map(grupo => {
            const cols = TODAS_COLUNAS.filter(c => c.grupo === grupo);
            const nAtivos = cols.filter(c => colsSelecionadas.has(c.key)).length;
            const todosAtivos = nAtivos === cols.length;
            return (
              <div key={grupo} style={s.grupoBox}>
                {/* Header do grupo — clica para toggle */}
                <div style={s.grupoHeader} onClick={() => toggleGrupo(grupo)}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{
                      width:14, height:14, borderRadius:4, border:`2px solid ${todosAtivos ? '#f0b429' : '#4b5563'}`,
                      background: todosAtivos ? '#f0b429' : 'transparent',
                      display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem',
                    }}>
                      {todosAtivos ? '✓' : nAtivos > 0 ? '–' : ''}
                    </span>
                    <span style={{ fontWeight:700, fontSize:'0.82rem', color: nAtivos > 0 ? '#e8eaf0' : '#6b7280' }}>{grupo}</span>
                  </div>
                  <span style={{ fontSize:'0.68rem', color:'#8b92b0' }}>{nAtivos}/{cols.length}</span>
                </div>
                {/* Itens */}
                <div style={s.grupoItens}>
                  {cols.map(c => {
                    const ativo = colsSelecionadas.has(c.key);
                    return (
                      <label key={c.key} style={{ ...s.checkLabel, opacity: ativo ? 1 : 0.55 }}>
                        <input
                          type="checkbox"
                          checked={ativo}
                          onChange={() => toggleCol(c.key)}
                          style={{ accentColor:'#f0b429', width:13, height:13 }}
                        />
                        <span style={{ color: ativo ? '#e8eaf0' : '#6b7280', fontSize:'0.8rem' }}>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tabela ──────────────────────────────────────────────────── */}
      <div style={s.card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:48 }}>
            <div style={s.spin}></div>
            <div style={{ color:'#8b92b0', marginTop:12 }}>Carregando empresas...</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'62vh', borderRadius:8, border:'1px solid #f0f2f8' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width:36, textAlign:'center' }}>#</th>
                  {colunas.map(c => <th key={c.key} style={s.th}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((e, i) => (
                  <tr key={e.id} className="row-hover" style={i%2===0?{background:'#f9fafb'}:{}}>
                    <td style={{ ...s.td, color:'#8b92b0', textAlign:'center', fontSize:'0.7rem' }}>{i+1}</td>
                    {colunas.map(c => (
                      <td key={c.key} style={{
                        ...s.td,
                        fontWeight: c.key === 'nome' ? 600 : 400,
                        color:
                          c.key === 'potencial_movimentacao' || c.key === 'resultado_esperado' ? '#34d399' :
                          c.key === 'taxa_positiva'  ? '#f0b429' :
                          c.key === 'taxa_negativa'  ? '#f87171' :
                          c.key === 'ativo'          ? (e.ativo ? '#34d399' : '#f87171') :
                          undefined,
                      }}>
                        {c.render(e)}
                      </td>
                    ))}
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr>
                    <td colSpan={colunas.length + 1} style={{ ...s.td, textAlign:'center', color:'#8b92b0', padding:48 }}>
                      Nenhuma empresa encontrada com os filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .row-hover:hover { background: rgba(240,180,41,0.05) !important; }
        select option { background: #1e2330; color: #e8eaf0; }
      `}</style>
    </div>
  );
}

const s = {
  page:        { maxWidth:1400, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans', sans-serif", color:'#1a1d2e', background:'#f5f6fa', minHeight:'100vh' },
  header:      { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:16 },
  tag:         { color:'#b45309', fontWeight:700, fontSize:'0.9rem', letterSpacing:2, marginBottom:8, textTransform:'uppercase' },
  title:       { fontSize:'1.8rem', fontWeight:700, margin:'0 0 6px' },
  sub:         { color:'#8b92b0', fontSize:'0.9rem' },
  btnPri:      { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'11px 24px', fontWeight:700, fontSize:'0.9rem', fontFamily:'inherit', whiteSpace:'nowrap' },
  filtrosBox:  { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:14, padding:'16px 20px', marginBottom:14 },
  input:       { background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:8, padding:'7px 11px', color:'#1a1d2e', fontSize:'0.82rem', fontFamily:'inherit', outline:'none' },
  btnClear:    { background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, padding:'7px 14px', color:'#f87171', fontSize:'0.8rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' },
  colsBar:     { display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' },
  btnCols:     { background:'#f0f2f8', border:'1px solid #e4e7ef', borderRadius:8, padding:'8px 16px', color:'#4a5068', fontSize:'0.82rem', cursor:'pointer', fontFamily:'inherit', fontWeight:600, display:'flex', alignItems:'center', gap:4 },
  btnColsAtivo:{ background:'rgba(240,180,41,0.12)', border:'1px solid rgba(240,180,41,0.3)', color:'#f0b429' },
  btnMini:     { background:'#f5f6fa', border:'1px solid #e4e7ef', borderRadius:7, padding:'6px 13px', color:'#8b92b0', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit' },
  painelCols:  { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:14, padding:20, marginBottom:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))', gap:16 },
  grupoBox:    { display:'flex', flexDirection:'column', gap:8 },
  grupoHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', paddingBottom:8, borderBottom:'1px solid #e4e7ef' },
  grupoItens:  { display:'flex', flexDirection:'column', gap:6, paddingLeft:4 },
  checkLabel:  { display:'flex', alignItems:'center', gap:7, cursor:'pointer', userSelect:'none' },
  card:        { background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:16, padding:20 },
  table:       { width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' },
  th:          { padding:'8px 12px', textAlign:'left', color:'#8b92b0', fontWeight:500, borderBottom:'1px solid #e4e7ef', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.67rem', letterSpacing:0.5, position:'sticky', top:0, background:'#f9fafb', zIndex:2 },
  td:          { padding:'9px 12px', borderBottom:'1px solid #f0f2f8', whiteSpace:'nowrap' },
  spin:        { width:36, height:36, border:'3px solid #e4e7ef', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto', animation:'spin 0.8s linear infinite', display:'block' },
};
