'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Helpers ────────────────────────────────────────────────────────────────────
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function findKey(obj, target) {
  if (obj[target] !== undefined) return obj[target];
  const t = norm(target);
  for (const key of Object.keys(obj)) {
    if (norm(key) === t) return obj[key];
  }
  return undefined;
}
function findKeyContains(obj, fragment) {
  const f = norm(fragment);
  for (const key of Object.keys(obj)) {
    if (norm(key).includes(f)) return obj[key];
  }
  return undefined;
}
function cleanNum(v) {
  if (v === null || v === undefined || v === '-' || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).replace(/R\$\s*/g, '').replace(/\s/g, '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function cleanDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const s = String(v).trim();
  if (s.match(/^\d{4}-\d{2}/)) return s.substring(0, 7) + '-01';
  const parts = s.split('/');
  if (parts.length >= 2) {
    // "01/2026" ou "01/01/2026"
    if (parts.length === 2) return `${parts[1]}-${parts[0].padStart(2, '0')}-01`;
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-01`;
  }
  return null;
}

// Detecta se é Benefício ou Convênio pelo nome do produto
function tipoProduto(produto) {
  const p = norm(produto || '');
  if (p.includes('convenio') || p.includes('convenios') || p.includes('convenção')) return 'convenio';
  if (p.includes('beneficio') || p.includes('beneficios') || p.includes('benefit')) return 'beneficio';
  return 'outro';
}

function parseRow(row) {
  const produto_id = parseInt(findKey(row, 'Produto Id')) || null;
  const empresa    = String(findKey(row, 'Empresa') || findKeyContains(row, 'empresa') || '');
  const produto    = String(findKey(row, 'Produto') || findKey(row, 'Produto Contratado') || findKeyContains(row, 'produto') || '');
  const mesRef     = findKeyContains(row, 'mes') || findKeyContains(row, 'refer') || findKeyContains(row, 'compet');
  const recarga    = cleanNum(findKeyContains(row, 'recarga') || findKeyContains(row, 'credito') || findKeyContains(row, 'creditado'));
  const movimentou = cleanNum(findKeyContains(row, 'moviment') || findKeyContains(row, 'utiliz') || findKeyContains(row, 'consumo'));

  const tipo = tipoProduto(produto);
  // Lógica central: Benefício = recarga / Convênio = movimentação utilizada
  const valor_meta = tipo === 'beneficio' ? recarga
                   : tipo === 'convenio'  ? movimentou
                   : (recarga || movimentou); // fallback: o que tiver

  return {
    produto_id,
    empresa,
    produto,
    tipo,
    competencia: cleanDate(mesRef),
    recarga,
    movimentou,
    valor_meta,
  };
}

const fmt    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[parseInt(m) - 1]}/${y}`;
};

const COR_TIPO = {
  beneficio: { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)', text: '#60a5fa', label: 'Benefício · Recarga' },
  convenio:  { bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', text: '#34d399', label: 'Convênio · Utilização' },
  outro:     { bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.2)', text: '#9ca3af', label: 'Outro' },
};

export default function ImportarMovimentacoes() {
  const [xlsxLib, setXlsxLib]       = useState(null);
  const [file, setFile]             = useState(null);
  const [preview, setPreview]       = useState([]);
  const [status, setStatus]         = useState('idle');
  const [result, setResult]         = useState({ inserted: 0, errors: [] });
  const [isDragging, setIsDragging] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  useEffect(() => { import('xlsx').then(mod => setXlsxLib(mod)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = xlsxLib.read(e.target.result, { type: 'array', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw: true, defval: '' });
        console.log('Colunas detectadas:', Object.keys(raw[0] || {}));
        const parsed = raw.map(parseRow).filter(r => r.produto_id && r.competencia);
        setPreview(parsed);
        setStatus('confirming');
      } catch (err) {
        setStatus('error');
        setResult({ inserted: 0, errors: ['Erro ao ler arquivo: ' + err.message] });
      }
    };
    reader.readAsArrayBuffer(f);
  }, [xlsxLib]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    setStatus('importing');
    try {
      const ids = [...new Set(preview.map(r => r.produto_id))];
      const { data: empresas } = await supabase
        .from('empresas')
        .select('id, produto_id, produto_contratado')
        .in('produto_id', ids);

      const empresaMap = Object.fromEntries((empresas || []).map(e => [e.produto_id, e]));

      const rows = preview
        .map(r => {
          const emp = empresaMap[r.produto_id];
          if (!emp) return null;

          // Re-detecta tipo pelo produto real do banco (mais confiável)
          const tipoBanco = tipoProduto(emp.produto_contratado || r.produto);
          const valor_movimentacao = tipoBanco === 'beneficio' ? r.recarga
                                   : tipoBanco === 'convenio'  ? r.movimentou
                                   : r.valor_meta;

          return {
            empresa_id:              emp.id,
            competencia:             r.competencia,
            valor_movimentacao,
            receita_taxa_positiva:   0, // movimentação real não tem taxa
            tipo_movimentacao:       tipoBanco,
          };
        })
        .filter(Boolean)
        .filter(r => r.empresa_id && r.competencia);

      const errors = []; let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { data, error } = await supabase
          .from('movimentacoes')
          .upsert(batch, { onConflict: 'empresa_id,competencia' })
          .select('id');
        if (error) errors.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
        else inserted += data?.length || 0;
      }
      setResult({ inserted, errors }); setStatus('done');
    } catch (err) {
      setResult({ inserted: 0, errors: [err.message] }); setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPreview([]); setFile(null); setResult({ inserted: 0, errors: [] }); };

  // Resumo por tipo
  const resumo = preview.reduce((acc, r) => {
    if (!acc[r.tipo]) acc[r.tipo] = { qtd: 0, total: 0 };
    acc[r.tipo].qtd++;
    acc[r.tipo].total += r.valor_meta;
    return acc;
  }, {});

  const semMatch = preview.filter(r => !r.produto_id).length;
  const previewFiltrado = filtroTipo === 'todos' ? preview : preview.filter(r => r.tipo === filtroTipo);
  const mesRef = preview[0]?.competencia;

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Movimentações Reais</h1>
        <p style={s.sub}>Importe os valores reais do mês — Benefícios (recarga) e Convênios (utilização)</p>
      </div>

      {/* Legenda de lógica */}
      <div style={s.legendaBox}>
        <div style={s.legendaItem}>
          <span style={{ ...s.badge, background: COR_TIPO.beneficio.bg, color: COR_TIPO.beneficio.text, border: `1px solid ${COR_TIPO.beneficio.border}` }}>Benefício</span>
          <span style={s.legendaText}>Usa o valor de <strong>recarga/crédito</strong> como resultado para a meta</span>
        </div>
        <div style={s.legendaItem}>
          <span style={{ ...s.badge, background: COR_TIPO.convenio.bg, color: COR_TIPO.convenio.text, border: `1px solid ${COR_TIPO.convenio.border}` }}>Convênio</span>
          <span style={s.legendaText}>Usa o valor <strong>utilizado/movimentado</strong> como resultado para a meta</span>
        </div>
      </div>

      {/* Dropzone */}
      {(status === 'idle' || status === 'parsing') && (
        <div
          style={{ ...s.dropzone, ...(isDragging ? s.dropzoneOn : {}) }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById('fi-mov').click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>
            {status === 'parsing' ? 'Lendo arquivo...' : (xlsxLib ? 'Arraste a planilha de movimentações aqui' : 'Carregando...')}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            Colunas esperadas: <strong style={{ color: '#9ca3af' }}>Produto Id · Empresa · Produto · Mês Ref · Recarga · Movimentação</strong>
          </div>
          <input id="fi-mov" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Confirmar */}
      {status === 'confirming' && (
        <div style={s.card}>
          {/* Resumo cards */}
          <div style={s.resumoGrid}>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Competência</span>
              <span style={s.resumoVal}>{fmtMes(mesRef)}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Total registros</span>
              <span style={s.resumoVal}>{preview.length}</span>
            </div>
            {Object.entries(resumo).map(([tipo, v]) => (
              <div key={tipo} style={{ ...s.resumoItem, borderColor: COR_TIPO[tipo]?.border || 'rgba(255,255,255,0.07)' }}>
                <span style={s.resumoLabel}>{COR_TIPO[tipo]?.label || tipo}</span>
                <span style={{ ...s.resumoVal, color: COR_TIPO[tipo]?.text || '#e8eaf0' }}>{fmt(v.total)}</span>
                <span style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 4 }}>{v.qtd} empresas</span>
              </div>
            ))}
            {semMatch > 0 && (
              <div style={{ ...s.resumoItem, borderColor: 'rgba(248,113,113,0.3)' }}>
                <span style={s.resumoLabel}>Sem match</span>
                <span style={{ ...s.resumoVal, color: '#f87171' }}>{semMatch}</span>
                <span style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 4 }}>não importados</span>
              </div>
            )}
          </div>

          {/* Cabeçalho ações */}
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ {preview.length} registros encontrados</div>
              <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>Arquivo: {file?.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar movimentações →</button>
            </div>
          </div>

          {/* Filtro por tipo */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['todos', 'beneficio', 'convenio', 'outro'].map(t => (
              <button key={t}
                style={{ ...s.filtroBtn, ...(filtroTipo === t ? s.filtroBtnAtivo : {}) }}
                onClick={() => setFiltroTipo(t)}>
                {t === 'todos' ? `Todos (${preview.length})` : `${COR_TIPO[t]?.label} (${preview.filter(r => r.tipo === t).length})`}
              </button>
            ))}
          </div>

          {/* Tabela preview */}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['ID', 'Empresa', 'Produto', 'Tipo', 'Mês Ref.', 'Recarga', 'Utilizado', 'Valor p/ Meta'].map(h =>
                    <th key={h} style={s.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewFiltrado.slice(0, 20).map((r, i) => {
                  const cor = COR_TIPO[r.tipo] || COR_TIPO.outro;
                  return (
                    <tr key={i} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                      <td style={s.td}>{r.produto_id}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{r.empresa}</td>
                      <td style={{ ...s.td, color: '#9ca3af' }}>{r.produto || '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: cor.bg, color: cor.text, border: `1px solid ${cor.border}` }}>
                          {cor.label}
                        </span>
                      </td>
                      <td style={s.td}>{fmtMes(r.competencia)}</td>
                      <td style={{ ...s.td, color: r.recarga > 0 ? '#60a5fa' : '#4b5563' }}>{fmt(r.recarga)}</td>
                      <td style={{ ...s.td, color: r.movimentou > 0 ? '#34d399' : '#4b5563' }}>{fmt(r.movimentou)}</td>
                      <td style={{ ...s.td, color: '#f0b429', fontWeight: 700 }}>{fmt(r.valor_meta)}</td>
                    </tr>
                  );
                })}
                {previewFiltrado.length > 20 && (
                  <tr><td colSpan={8} style={{ ...s.td, textAlign: 'center', color: '#6b7280' }}>
                    ... e mais {previewFiltrado.length - 20} registros
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Importando */}
      {status === 'importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Importando movimentações...</div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Aguarde alguns segundos</div>
        </div>
      )}

      {/* Sucesso */}
      {status === 'done' && (
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <div style={s.cardTitle}>Movimentações importadas!</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, margin: '20px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: '#34d399' }}>{result.inserted}</span>
              <span style={{ color: '#6b7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>registros salvos</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 16, marginBottom: 20, color: '#f87171', fontSize: '0.82rem', textAlign: 'left' }}>
              {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <button style={s.btnPri} onClick={reset}>Importar outro mês</button>
        </div>
      )}

      {/* Erro */}
      {status === 'error' && (
        <div style={{ ...s.stCard, borderColor: '#f87171' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Erro na importação</div>
          {result.errors.map((e, i) => <div key={i} style={{ color: '#f87171', fontSize: '0.85rem' }}>{e}</div>)}
          <button style={{ ...s.btnSec, marginTop: 20 }} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      {/* Como usar */}
      <div style={s.info}>
        <div style={{ fontWeight: 700, marginBottom: 14, color: '#f0b429' }}>📋 Como preparar a planilha</div>
        <ol style={{ paddingLeft: 20, color: '#9ca3af', fontSize: '0.87rem', lineHeight: 2.2 }}>
          <li>Exporte a base do sistema com <strong style={{ color: '#e8eaf0' }}>Produto Id</strong> e <strong style={{ color: '#e8eaf0' }}>Nome da Empresa</strong></li>
          <li>Faça o PROCV e adicione a coluna <strong style={{ color: '#60a5fa' }}>Recarga</strong> (para Benefícios) e/ou <strong style={{ color: '#34d399' }}>Movimentação</strong> (para Convênios)</li>
          <li>Adicione a coluna <strong style={{ color: '#e8eaf0' }}>Mês Ref.</strong> no formato MM/AAAA</li>
          <li>Importe aqui — o sistema detecta o tipo automaticamente e usa o valor correto para cada produto</li>
        </ol>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, padding: '10px 16px', fontSize: '0.8rem', color: '#60a5fa' }}>
            💙 <strong>Benefício</strong> → coluna "Recarga" ou "Crédito"
          </div>
          <div style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '10px 16px', fontSize: '0.8rem', color: '#34d399' }}>
            💚 <strong>Convênio</strong> → coluna "Movimentação" ou "Utilizado"
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:        { maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:      { marginBottom: 24 },
  tag:         { color: '#f0b429', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  title:       { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px', fontFamily: "'Syne', sans-serif" },
  sub:         { color: '#6b7280', fontSize: '0.9rem' },
  legendaBox:  { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  legendaItem: { display: 'flex', alignItems: 'center', gap: 10, background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 260 },
  legendaText: { fontSize: '0.83rem', color: '#9ca3af' },
  badge:       { borderRadius: 6, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' },
  dropzone:    { border: '2px dashed rgba(240,180,41,0.3)', borderRadius: 16, padding: '56px 32px', textAlign: 'center', cursor: 'pointer', background: 'rgba(240,180,41,0.03)', transition: 'all 0.2s', marginBottom: 24 },
  dropzoneOn:  { borderColor: '#f0b429', background: 'rgba(240,180,41,0.08)' },
  card:        { background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardHead:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  cardTitle:   { fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 },
  resumoGrid:  { display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' },
  resumoItem:  { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column' },
  resumoLabel: { color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  resumoVal:   { fontSize: '1.25rem', fontWeight: 700 },
  filtroBtn:   { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 14px', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' },
  filtroBtnAtivo: { background: 'rgba(240,180,41,0.1)', border: '1px solid rgba(240,180,41,0.3)', color: '#f0b429', fontWeight: 600 },
  btnPri:      { background: '#f0b429', color: '#000', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  btnSec:      { background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 22px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:          { padding: '8px 12px', textAlign: 'left', color: '#4b5563', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: 0.5 },
  td:          { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  stCard:      { background: '#111420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 48, textAlign: 'center', marginBottom: 24 },
  spin:        { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
  info:        { background: 'rgba(240,180,41,0.04)', border: '1px solid rgba(240,180,41,0.12)', borderRadius: 14, padding: 24 },
};

