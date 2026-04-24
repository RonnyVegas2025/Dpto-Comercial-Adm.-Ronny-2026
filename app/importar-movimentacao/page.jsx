'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cleanNum(v) {
  if (v === null || v === undefined || v === '-' || v === '' || v !== v) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/R\$\s*/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function excelDateToISO(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-01`;
  }
  if (typeof v === 'number' && v > 40000 && v < 55000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;
  }
  const s = String(v).trim();
  // "2026-01-01" ou "2026-01-01 00:00:00"
  const matchISO = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchISO) return `${matchISO[1]}-${matchISO[2]}-01`;
  // "01/01/2026"
  const matchBR = s.split('/');
  if (matchBR.length === 3 && matchBR[2].length === 4) {
    return `${matchBR[2]}-${matchBR[1].padStart(2,'0')}-01`;
  }
  // "Jan/26", "Fev/26", "Mar/26" etc
  const MESES = { jan:'01',fev:'02',mar:'03',abr:'04',mai:'05',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12' };
  const matchNome = s.toLowerCase().match(/^([a-z]{3})[\/\-](\d{2,4})$/);
  if (matchNome) {
    const mes = MESES[matchNome[1]];
    const ano = matchNome[2].length === 2 ? `20${matchNome[2]}` : matchNome[2];
    if (mes) return `${ano}-${mes}-01`;
  }
  return null;
}

const fmt    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};

export default function ImportarMovimentacao() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState([]);   // { produto_id, empresa_nome, meses: [{competencia, valor}] }
  const [mesesDetectados, setMesesDetectados] = useState([]);
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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw: true, defval: '' });

        if (raw.length === 0) throw new Error('Planilha vazia');

        // Detecta colunas de mês em qualquer formato
        const primeiraLinha = raw[0];
        const colsMes = Object.keys(primeiraLinha).filter(k => excelDateToISO(k) !== null);

        if (colsMes.length === 0) throw new Error('Nenhuma coluna de mês detectada. Use colunas com datas (ex: 2026-01-01).');

        const mesesISO = colsMes.map(k => ({ col: k, competencia: excelDateToISO(k) }))
          .filter(m => m.competencia)
          .sort((a, b) => a.competencia.localeCompare(b.competencia));

        setMesesDetectados(mesesISO);

        // Detecta coluna de produto_id e empresa
        const findCol = (obj, targets) => {
          for (const t of targets) {
            if (obj[t] !== undefined) return obj[t];
            const tn = norm(t);
            for (const k of Object.keys(obj)) {
              if (norm(k) === tn) return obj[k];
            }
          }
          return undefined;
        };

        // Parseia linhas
        const parsed = [];
        for (const row of raw) {
          const prodId = parseInt(findCol(row, ['ID Produto', 'Produto Id', 'Produto ID', 'produto_id']));
          const nome   = String(findCol(row, ['Empresa', 'empresa']) || '').trim();
          if (!prodId || !nome) continue;

          const meses = mesesISO.map(m => ({
            competencia: m.competencia,
            valor: cleanNum(row[m.col]),
          })).filter(m => m.valor > 0);

          parsed.push({ produto_id: prodId, empresa_nome: nome, meses });
        }

        setPreview(parsed);
        setStatus('confirming');
      } catch (err) {
        setStatus('error');
        setResult({ inserted: 0, errors: ['Erro: ' + err.message] });
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
      // Busca empresas para vincular empresa_id
      const { data: empresas } = await supabase
        .from('empresas').select('id, produto_id');
      const empresaMap = Object.fromEntries((empresas || []).map(e => [e.produto_id, e.id]));

      // Monta linhas para upsert — uma linha por empresa/mês
      const allRows = [];
      for (const e of preview) {
        for (const m of e.meses) {
          allRows.push({
            produto_id:     e.produto_id,
            empresa_id:     empresaMap[e.produto_id] || null,
            empresa_nome:   e.empresa_nome,
            competencia:    m.competencia,
            total_liberado: m.valor,
          });
        }
      }

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

  const reset = () => {
    setStatus('idle'); setPreview([]); setFile(null);
    setMesesDetectados([]); setResult({ inserted: 0, errors: [] });
  };

  // Resumo para preview
  const totalEmpresas  = preview.length;
  const totalRegistros = preview.reduce((s, e) => s + e.meses.length, 0);
  const totalValor     = preview.reduce((s, e) => s + e.meses.reduce((ss, m) => ss + m.valor, 0), 0);
  const resumoPorMes   = mesesDetectados.map(m => ({
    competencia: m.competencia,
    total: preview.reduce((s, e) => s + (e.meses.find(x => x.competencia === m.competencia)?.valor || 0), 0),
    empresas: preview.filter(e => e.meses.some(x => x.competencia === m.competencia)).length,
  }));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Importar Movimentação</h1>
        <p style={s.sub}>Convênio, Mobilidade e outras categorias — planilha com colunas de meses</p>
      </div>

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
            {status === 'parsing' ? 'Lendo planilha...' : (xlsxLib ? 'Arraste a planilha aqui' : 'Carregando...')}
          </div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 6 }}>
            .xlsx com colunas de meses (Jan/Fev/Mar...)
          </div>
          <div style={{ color: '#4b5563', fontSize: '0.78rem' }}>
            Colunas necessárias: <strong style={{ color: '#9ca3af' }}>ID Produto · Empresa · [colunas de mês]</strong>
          </div>
          <input id="fi-mov" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])} />
        </div>
      )}

      {status === 'confirming' && (
        <div style={s.card}>
          {/* Resumo por mês */}
          <div style={s.resumo}>
            {resumoPorMes.map(m => (
              <div key={m.competencia} style={s.resumoItem}>
                <span style={s.resumoLabel}>{fmtMes(m.competencia)}</span>
                <span style={{ ...s.resumoVal, color: '#34d399' }}>{fmt(m.total)}</span>
                <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{m.empresas} empresas</span>
              </div>
            ))}
            <div style={{ ...s.resumoItem, borderColor: 'rgba(240,180,41,0.3)' }}>
              <span style={s.resumoLabel}>Total Geral</span>
              <span style={{ ...s.resumoVal, color: '#f0b429' }}>{fmt(totalValor)}</span>
              <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{totalEmpresas} empresas · {totalRegistros} registros</span>
            </div>
          </div>

          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ {totalEmpresas} empresas encontradas — {file?.name}</div>
              <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 4 }}>
                Meses detectados: {mesesDetectados.map(m => fmtMes(m.competencia)).join(', ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar {totalRegistros} registros →</button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>ID</th>
                  <th style={s.th}>Empresa</th>
                  {mesesDetectados.map(m => <th key={m.competencia} style={{ ...s.th, textAlign: 'right' }}>{fmtMes(m.competencia)}</th>)}
                  <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((e, i) => {
                  const total = e.meses.reduce((s, m) => s + m.valor, 0);
                  return (
                    <tr key={e.produto_id} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                      <td style={{ ...s.td, color: '#6b7280' }}>{e.produto_id}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{e.empresa_nome}</td>
                      {mesesDetectados.map(m => {
                        const v = e.meses.find(x => x.competencia === m.competencia)?.valor || 0;
                        return (
                          <td key={m.competencia} style={{ ...s.td, textAlign: 'right' }}>
                            {v > 0 ? <span style={{ color: '#34d399' }}>{fmt(v)}</span> : <span style={{ color: '#374151' }}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#f0b429' }}>{fmt(total)}</td>
                    </tr>
                  );
                })}
                {preview.length > 10 && (
                  <tr><td colSpan={3 + mesesDetectados.length} style={{ ...s.td, textAlign: 'center', color: '#6b7280' }}>
                    ... e mais {preview.length - 10} empresas
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status === 'importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>Importando {totalRegistros} registros...</div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Aguarde alguns segundos</div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ ...s.card, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
          <div style={s.cardTitle}>Movimentação importada!</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, margin: '20px 0', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: '#34d399' }}>{result.inserted}</span>
              <span style={{ color: '#6b7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>registros salvos</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: '#f0b429' }}>{fmt(totalValor)}</span>
              <span style={{ color: '#6b7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>total importado</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div style={s.errBox}>{result.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>
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
          <li>Use a planilha exportada do sistema com colunas de meses</li>
          <li>Colunas necessárias: <strong style={{ color: '#d1d5db' }}>ID Produto · Empresa</strong> + colunas de data (Jan/Fev/Mar)</li>
          <li>Arraste o arquivo ou clique para selecionar</li>
          <li>Registros já importados são atualizados (não duplicados)</li>
          <li>Funciona para Convênio, Mobilidade, Taxa Negativa e outras categorias</li>
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
  dropzone:   { border: '2px dashed rgba(240,180,41,0.3)', borderRadius: 16, padding: '56px 32px', textAlign: 'center', cursor: 'pointer', background: 'rgba(240,180,41,0.03)', transition: 'all 0.2s', marginBottom: 24 },
  dropzoneOn: { borderColor: '#f0b429', background: 'rgba(240,180,41,0.08)' },
  card:       { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  cardTitle:  { fontSize: '1.05rem', fontWeight: 700, marginBottom: 4 },
  resumo:     { display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' },
  resumoItem: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', gap: 4 },
  resumoLabel:{ color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  resumoVal:  { fontSize: '1.2rem', fontWeight: 700 },
  btnPri:     { background: '#f0b429', color: '#000', border: 'none', borderRadius: 10, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  btnSec:     { background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 22px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' },
  th:         { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 },
  td:         { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  stCard:     { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 48, textAlign: 'center', marginBottom: 24 },
  spin:       { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f0b429', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
  errBox:     { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 16, marginBottom: 20, color: '#f87171', fontSize: '0.82rem', textAlign: 'left' },
  info:       { background: 'rgba(240,180,41,0.05)', border: '1px solid rgba(240,180,41,0.15)', borderRadius: 14, padding: 24 },
};
