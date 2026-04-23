'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Mapeia nomes de abas para datas de competência
const ABA_COMPETENCIA = {
  'jan-26': '2026-01-01', 'jan/26': '2026-01-01',
  'fev-26': '2026-02-01', 'fev/26': '2026-02-01',
  'mar-26': '2026-03-01', 'mar/26': '2026-03-01',
  'abr-26': '2026-04-01', 'abr/26': '2026-04-01',
  'mai-26': '2026-05-01', 'mai/26': '2026-05-01',
  'jun-26': '2026-06-01', 'jun/26': '2026-06-01',
  'jul-26': '2026-07-01', 'jul/26': '2026-07-01',
  'ago-26': '2026-08-01', 'ago/26': '2026-08-01',
  'set-26': '2026-09-01', 'set/26': '2026-09-01',
  'out-26': '2026-10-01', 'out/26': '2026-10-01',
  'nov-26': '2026-11-01', 'nov/26': '2026-11-01',
  'dez-26': '2026-12-01', 'dez/26': '2026-12-01',
};

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function findCol(obj, targets) {
  for (const t of targets) {
    if (obj[t] !== undefined) return obj[t];
    const tn = norm(t);
    for (const k of Object.keys(obj)) {
      if (norm(k) === tn) return obj[k];
    }
  }
  return undefined;
}

function cleanNum(v) {
  if (v === null || v === undefined || v === '-' || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/R\$\s*/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Parseia uma aba e retorna registros já somados por empresa/mês
function parseAba(rows, competencia) {
  const map = {}; // key: produto_id
  for (const row of rows) {
    const prodId = parseInt(findCol(row, ['Produto ID', 'Produto Id', 'produto_id']));
    if (!prodId) continue;
    const nome   = String(findCol(row, ['Empresa', 'empresa']) || '').trim();
    const valor  = cleanNum(findCol(row, ['Total Liberado', 'total_liberado', 'Valor']));
    if (!nome) continue;

    if (!map[prodId]) {
      map[prodId] = { produto_id: prodId, empresa_nome: nome, competencia, total_liberado: 0, creditos: 0 };
    }
    map[prodId].total_liberado += valor;
    map[prodId].creditos += 1;
  }
  return Object.values(map);
}

const fmt   = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};

export default function ImportarLiberacoes() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [file, setFile]         = useState(null);
  const [meses, setMeses]       = useState([]); // [{ competencia, registros[] }]
  const [status, setStatus]     = useState('idle');
  const [result, setResult]     = useState({ inserted: 0, errors: [] });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = xlsxLib.read(e.target.result, { type: 'array', cellDates: true });
        const resultado = [];

        for (const sheetName of wb.SheetNames) {
          const competencia = ABA_COMPETENCIA[norm(sheetName)];
          if (!competencia) {
            console.warn('Aba ignorada (sem mapeamento):', sheetName);
            continue;
          }
          const ws   = wb.Sheets[sheetName];
          const raw  = xlsxLib.utils.sheet_to_json(ws, { raw: true, defval: '' });
          const regs = parseAba(raw, competencia);
          if (regs.length > 0) resultado.push({ sheetName, competencia, registros: regs });
        }

        if (resultado.length === 0) {
          setStatus('error');
          setResult({ inserted: 0, errors: ['Nenhuma aba reconhecida. Use nomes como "Jan-26", "Fev-26".'] });
          return;
        }

        setMeses(resultado);
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
      // Busca todas as empresas para fazer o link empresa_id
      const { data: empresas } = await supabase
        .from('empresas').select('id, produto_id');
      const empresaMap = Object.fromEntries((empresas || []).map(e => [e.produto_id, e.id]));

      const allRows = meses.flatMap(m =>
        m.registros.map(r => ({
          produto_id:     r.produto_id,
          empresa_id:     empresaMap[r.produto_id] || null,
          empresa_nome:   r.empresa_nome,
          competencia:    r.competencia,
          total_liberado: r.total_liberado,
        }))
      );

      let inserted = 0;
      const errors = [];

      for (let i = 0; i < allRows.length; i += 50) {
        const batch = allRows.slice(i, i + 50);
        const { data, error } = await supabase
          .from('liberacoes')
          .upsert(batch, { onConflict: 'produto_id,competencia' })
          .select('id');
        if (error) errors.push(`Lote ${Math.floor(i / 50) + 1}: ${error.message}`);
        else inserted += data?.length || 0;
      }

      setResult({ inserted, errors });
      setStatus('done');
    } catch (err) {
      setResult({ inserted: 0, errors: [err.message] });
      setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setMeses([]); setFile(null); setResult({ inserted: 0, errors: [] }); };

  const totalEmpresas = meses.reduce((s, m) => s + m.registros.length, 0);
  const totalValor    = meses.reduce((s, m) => s + m.registros.reduce((ss, r) => ss + r.total_liberado, 0), 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Importar Liberações de Crédito</h1>
        <p style={s.sub}>Carregue a planilha com abas por mês — múltiplos créditos da mesma empresa são somados automaticamente</p>
      </div>

      {(status === 'idle' || status === 'parsing') && (
        <div
          style={{ ...s.dropzone, ...(isDragging ? s.dropzoneOn : {}) }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById('fi-lib').click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>💳</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>
            {status === 'parsing' ? 'Lendo planilha...' : (xlsxLib ? 'Arraste a planilha de liberações aqui' : 'Carregando...')}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 6 }}>
            .xlsx com abas Jan-26, Fev-26, Mar-26...
          </div>
          <div style={{ color: '#4b5563', fontSize: '0.78rem' }}>
            Colunas esperadas: <strong style={{ color: '#9ca3af' }}>Produto ID · Empresa · Total Liberado</strong>
          </div>
          <input id="fi-lib" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])} />
        </div>
      )}

      {status === 'confirming' && (
        <div style={s.card}>
          {/* Resumo geral */}
          <div style={s.resumo}>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Abas Detectadas</span>
              <span style={s.resumoVal}>{meses.length}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Registros Únicos</span>
              <span style={s.resumoVal}>{totalEmpresas}</span>
            </div>
            <div style={{ ...s.resumoItem, borderColor: 'rgba(52,211,153,0.3)' }}>
              <span style={s.resumoLabel}>Total Creditado</span>
              <span style={{ ...s.resumoVal, color: '#34d399' }}>{fmt(totalValor)}</span>
            </div>
          </div>

          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ Planilha lida com sucesso — {file?.name}</div>
              <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 4 }}>
                Múltiplos créditos do mesmo mês já foram somados por empresa
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar {totalEmpresas} registros →</button>
            </div>
          </div>

          {/* Preview por mês */}
          {meses.map((m) => {
            const totalMes     = m.registros.reduce((s, r) => s + r.total_liberado, 0);
            const comMultiplos = m.registros.filter(r => r.creditos > 1).length;
            return (
              <div key={m.competencia} style={{ marginBottom: 28 }}>
                <div style={s.mesHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={s.mesBadge}>{fmtMes(m.competencia)}</span>
                    <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>
                      {m.registros.length} empresas · {fmt(totalMes)}
                    </span>
                    {comMultiplos > 0 && (
                      <span style={s.multiBadge}>
                        {comMultiplos} com múltiplos créditos somados
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {['ID', 'Empresa', 'Créditos no Mês', 'Total Liberado'].map(h =>
                          <th key={h} style={s.th}>{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {m.registros.slice(0, 8).map((r, i) => (
                        <tr key={i} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                          <td style={{ ...s.td, color: '#6b7280' }}>{r.produto_id}</td>
                          <td style={{ ...s.td, fontWeight: 600 }}>{r.empresa_nome}</td>
                          <td style={{ ...s.td, textAlign: 'center' }}>
                            {r.creditos > 1
                              ? <span style={{ background: 'rgba(240,180,41,0.15)', color: '#f0b429', borderRadius: 6, padding: '2px 8px', fontSize: '0.78rem' }}>{r.creditos}x</span>
                              : <span style={{ color: '#4b5563' }}>1x</span>
                            }
                          </td>
                          <td style={{ ...s.td, color: r.total_liberado > 0 ? '#34d399' : '#6b7280', fontWeight: 600 }}>
                            {fmt(r.total_liberado)}
                          </td>
                        </tr>
                      ))}
                      {m.registros.length > 8 && (
                        <tr>
                          <td colSpan={4} style={{ ...s.td, textAlign: 'center', color: '#6b7280' }}>
                            ... e mais {m.registros.length - 8} empresas
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {status === 'importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>
            Importando {totalEmpresas} registros em {meses.length} meses...
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Aguarde alguns segundos</div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <div style={s.cardTitle}>Liberações importadas com sucesso!</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, margin: '20px 0', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: '#34d399' }}>{result.inserted}</span>
              <span style={{ color: '#6b7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>registros salvos</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: '#f0b429' }}>{fmt(totalValor)}</span>
              <span style={{ color: '#6b7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>total creditado</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div style={s.errBox}>
              {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button style={s.btnPri} onClick={reset}>Importar outro arquivo</button>
            <a href="/evolucao" style={{ ...s.btnSec, textDecoration: 'none', display: 'inline-block' }}>
              📈 Ver Evolução →
            </a>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ ...s.stCard, borderColor: '#f87171' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Erro na importação</div>
          {result.errors.map((e, i) => <div key={i} style={{ color: '#f87171', fontSize: '0.85rem' }}>{e}</div>)}
          <button style={{ ...s.btnSec, marginTop: 20 }} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      <div style={s.info}>
        <div style={{ fontWeight: 700, marginBottom: 14, color: '#f0b429' }}>📋 Como usar</div>
        <ol style={{ paddingLeft: 20, color: '#9ca3af', fontSize: '0.87rem', lineHeight: 2 }}>
          <li>Exporte a planilha de liberações com abas por mês (Jan-26, Fev-26, Mar-26...)</li>
          <li>Colunas necessárias: <strong style={{ color: '#d1d5db' }}>Produto ID · Empresa · Total Liberado</strong></li>
          <li>Arraste o arquivo ou clique para selecionar</li>
          <li>Se a empresa fez 2 créditos no mesmo mês, os valores são somados automaticamente</li>
          <li>Registros já importados são atualizados (não duplicados)</li>
        </ol>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:       { maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:     { marginBottom: 32 },
  tag:        { color: '#f0b429', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  title:      { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px' },
  sub:        { color: '#6b7280', fontSize: '0.9rem' },
  dropzone:   { border: '2px dashed rgba(52,211,153,0.3)', borderRadius: 16, padding: '56px 32px', textAlign: 'center', cursor: 'pointer', background: 'rgba(52,211,153,0.03)', transition: 'all 0.2s', marginBottom: 24 },
  dropzoneOn: { borderColor: '#34d399', background: 'rgba(52,211,153,0.08)' },
  card:       { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  cardTitle:  { fontSize: '1.05rem', fontWeight: 700, marginBottom: 4 },
  resumo:     { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  resumoItem: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 24px', flex: 1, minWidth: 140 },
  resumoLabel:{ display: 'block', color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  resumoVal:  { display: 'block', fontSize: '1.3rem', fontWeight: 700 },
  mesHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  mesBadge:   { background: 'rgba(240,180,41,0.12)', border: '1px solid rgba(240,180,41,0.3)', color: '#f0b429', borderRadius: 8, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 700 },
  multiBadge: { background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399', borderRadius: 6, padding: '2px 10px', fontSize: '0.75rem' },
  btnPri:     { background: '#f0b429', color: '#000', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  btnSec:     { background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 22px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  th:         { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 },
  td:         { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  stCard:     { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 48, textAlign: 'center', marginBottom: 24 },
  spin:       { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #34d399', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
  errBox:     { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 16, marginBottom: 20, color: '#f87171', fontSize: '0.82rem', textAlign: 'left' },
  info:       { background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)', borderRadius: 14, padding: 24 },
};

