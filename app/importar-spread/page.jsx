'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowRight,
} from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtInt = (v) => Number(v||0).toLocaleString('pt-BR');
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).split('-'); const ms=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${ms[parseInt(m)-1]}/${y}`; };

// Retorna o número da célula (incluindo negativos e zero); null se vazia ou não numérica.
function parseValor(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');
  if (s === '' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// HEADER (Date do xlsx com cellDates, ou serial Excel) → competência YYYY-MM-01. null se não for data.
function headerParaCompetencia(h) {
  if (h instanceof Date && !isNaN(h.getTime())) {
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-01`;
  }
  if (typeof h === 'number' && h > 1000) {
    const base = new Date(Math.round((h - 25569) * 86400 * 1000));
    if (!isNaN(base.getTime())) return `${base.getUTCFullYear()}-${String(base.getUTCMonth()+1).padStart(2,'0')}-01`;
  }
  if (typeof h === 'string') {
    const m = h.match(/^(\d{4})-(\d{2})-\d{2}/);
    if (m) return `${m[1]}-${m[2]}-01`;
  }
  return null;
}

// Formato B: ID Produto · Empresa · … · <coluna cujo header é uma data> (competência + spread).
// Usa a ÚLTIMA coluna-data como competência. Retorna null se não houver header de data.
function parseSpread(ws, xlsxLib) {
  const matrix = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'', header:1 });
  if (!matrix.length) return null;
  const header = matrix[0] || [];

  let idxProd = header.findIndex(h => /produto/i.test(String(h)));
  let idxEmp  = header.findIndex(h => /empresa/i.test(String(h)));
  if (idxProd < 0) idxProd = 0;
  if (idxEmp  < 0) idxEmp  = 1;

  let idxData = -1, competencia = null;
  header.forEach((h,i) => { const c = headerParaCompetencia(h); if(c) { idxData = i; competencia = c; } });
  if (idxData < 0) return null;

  let totalLinhas = 0, positivos = 0, negativos = 0, zerados = 0, vazias = 0;
  const registros = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const prodId = parseInt(row[idxProd]);
    if (!prodId) continue;
    totalLinhas++;
    const nome  = String(row[idxEmp] || '').trim();
    const valor = parseValor(row[idxData]);
    if (valor === null) { vazias++; continue; } // só descarta vazio ou não-numérico
    if (valor > 0) positivos++; else if (valor < 0) negativos++; else zerados++;
    registros.push({ produto_id: prodId, empresa_nome: nome, competencia, spread: valor });
  }
  // Ordena por valor ABSOLUTO — negativos grandes aparecem entre os maiores.
  registros.sort((a,b) => Math.abs(b.spread) - Math.abs(a.spread));
  return { competencia, totalLinhas, positivos, negativos, zerados, vazias, registros };
}

export default function ImportarSpread() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [file, setFile]         = useState(null);
  const [prev, setPrev]         = useState(null); // preview
  const [status, setStatus]     = useState('idle'); // idle | parsing | confirming | importing | done | error
  const [result, setResult]     = useState({ inserted:0, deleted:0, errors:[], naoEncontrados:[] });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        let parsed = null;
        for (const sheetName of wb.SheetNames) {
          const p = parseSpread(wb.Sheets[sheetName], xlsxLib);
          if (p && p.competencia) { parsed = p; break; }
        }
        if (!parsed) {
          setStatus('error');
          setResult({ inserted:0, deleted:0, errors:['Nenhuma coluna de competência (data no cabeçalho) encontrada. Verifique o formato do arquivo.'], naoEncontrados:[] });
          return;
        }

        // Consulta em runtime: quantas linhas já existem para o mês + quais produto_id não existem em empresas.
        let jaExistem = 0, naoEncontrados = [];
        try {
          const { count } = await supabase.from('spreads').select('id', { count:'exact', head:true }).eq('competencia', parsed.competencia);
          jaExistem = count || 0;
          const ids = [...new Set(parsed.registros.map(r => r.produto_id))];
          const existentes = new Set();
          for (let i = 0; i < ids.length; i += 300) {
            const { data } = await supabase.from('empresas').select('produto_id').in('produto_id', ids.slice(i, i+300));
            (data || []).forEach(d => existentes.add(d.produto_id));
          }
          naoEncontrados = ids.filter(id => !existentes.has(id));
        } catch (_) { /* preview segue mesmo sem as contagens */ }

        const totalSpread = parsed.registros.reduce((s,r) => s + r.spread, 0);
        setPrev({ ...parsed, comValor: parsed.registros.length, totalSpread, jaExistem, naoEncontrados });
        setStatus('confirming');
      } catch (err) {
        setStatus('error');
        setResult({ inserted:0, deleted:0, errors:['Erro ao ler arquivo: ' + err.message], naoEncontrados:[] });
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
    if (!prev) return;
    setStatus('importing');
    try {
      const comp = prev.competencia;
      // Reimportação: apaga o mês antes de inserir.
      const { error: delErr } = await supabase.from('spreads').delete().eq('competencia', comp);
      if (delErr) { setResult({ inserted:0, deleted:0, errors:['Erro ao limpar o mês: ' + delErr.message], naoEncontrados:prev.naoEncontrados }); setStatus('error'); return; }

      const rows = prev.registros.map(r => ({
        produto_id:      r.produto_id,
        empresa_nome:    r.empresa_nome,
        competencia:     comp,
        spread_planilha: r.spread,
        spread_bandeira: 0,
        spread_negativo: 0,
        // spread_total é GENERATED ALWAYS no Postgres — não pode ser atribuído no insert.
      }));

      let inserted = 0; const errors = [];
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { data, error } = await supabase.from('spreads').insert(batch).select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length || 0;
      }

      setResult({ inserted, deleted: prev.jaExistem, errors, naoEncontrados: prev.naoEncontrados });
      setStatus('done');
    } catch (err) {
      setResult({ inserted:0, deleted:0, errors:[err.message], naoEncontrados: prev?.naoEncontrados || [] });
      setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPrev(null); setFile(null); setResult({ inserted:0, deleted:0, errors:[], naoEncontrados:[] }); };

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ height:3, background:'var(--vg-gradient)', margin:'-32px -24px 24px' }} />

      {/* Cabeçalho */}
      <div style={{ marginBottom:24 }}>
        <div style={{ ...CAPTION, marginBottom:6 }}>Vegas Card / Importações</div>
        <h1 style={{ fontFamily:OUTFIT, fontSize:24, lineHeight:'32px', fontWeight:600, color:'var(--vg-ink)', margin:0 }}>Importar Spread de Comércios</h1>
        <p style={{ color:'var(--vg-ink-secondary)', fontSize:14, lineHeight:'22px', margin:'6px 0 0' }}>Spread pago pelos comércios sobre a movimentação real — um arquivo por mês, competência lida do cabeçalho da coluna</p>
      </div>

      {(status === 'idle' || status === 'parsing') && (
        <div style={{ ...s.dropzone, ...(isDragging ? s.dropzoneOn : {}) }}
          onDragOver={(e)=>{ e.preventDefault(); setIsDragging(true); }}
          onDragLeave={()=>setIsDragging(false)}
          onDrop={onDrop}
          onClick={()=>document.getElementById('fi-spread').click()}>
          {status === 'parsing'
            ? <Loader2 size={40} strokeWidth={1.75} color="var(--vg-brand-500)" style={{ animation:'spin 0.8s linear infinite' }} />
            : <UploadCloud size={40} strokeWidth={1.5} color="var(--vg-brand-500)" />}
          <div style={{ fontFamily:OUTFIT, fontSize:16, fontWeight:600, color:'var(--vg-ink)', marginTop:14 }}>
            {status === 'parsing' ? 'Lendo planilha…' : (xlsxLib ? 'Arraste a planilha de spread aqui' : 'Carregando…')}
          </div>
          <div style={{ ...CAPTION, marginTop:6 }}>.xlsx — a última coluna deve ter a data da competência no cabeçalho</div>
          <div style={{ ...CAPTION, marginTop:4 }}>Colunas: ID Produto · Empresa · CNPJ · … · <strong style={{ color:'var(--vg-ink-secondary)' }}>{'<Data>'}</strong></div>
          <input id="fi-spread" type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={(e)=>handleFile(e.target.files[0])} />
        </div>
      )}

      {status === 'confirming' && prev && (
        <div style={cardStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <FileSpreadsheet size={20} strokeWidth={1.75} color="var(--vg-brand-500)" />
              <div>
                <div style={{ ...H_CARD }}>{file?.name}</div>
                <div style={CAPTION}>Competência detectada: <strong style={{ color:'var(--vg-ink-secondary)' }}>{fmtMes(prev.competencia)}</strong></div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar {fmtInt(prev.comValor)} linhas <ArrowRight size={15} strokeWidth={2} /></button>
            </div>
          </div>

          {/* Resumo */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:14, marginBottom:20 }}>
            <Resumo label="Linhas no arquivo" valor={fmtInt(prev.totalLinhas)} />
            <Resumo label="Positivos" valor={fmtInt(prev.positivos)} cor="var(--vg-success-fg)" />
            <Resumo label="Negativos" valor={fmtInt(prev.negativos)} cor="var(--vg-danger-fg)" />
            <Resumo label="Zerados" valor={fmtInt(prev.zerados)} cor="var(--vg-muted)" />
            <Resumo label="Ignoradas (vazias)" valor={fmtInt(prev.vazias)} cor="var(--vg-muted)" />
            <Resumo label="Total do spread" valor={fmt(prev.totalSpread)} cor={prev.totalSpread<0 ? 'var(--vg-danger-fg)' : 'var(--vg-brand-700)'} />
          </div>

          {/* Avisos */}
          {prev.jaExistem > 0 && (
            <div style={s.avisoAmbar}>
              <AlertTriangle size={17} strokeWidth={2} color="var(--vg-warning-fg)" style={{ flexShrink:0, marginTop:1 }} />
              <span>Já existem <strong className="vg-num">{fmtInt(prev.jaExistem)}</strong> linhas gravadas para {fmtMes(prev.competencia)}. Ao importar, elas serão <strong>apagadas e substituídas</strong> (reimportação do mês).</span>
            </div>
          )}
          {prev.naoEncontrados.length > 0 && (
            <div style={s.avisoAmbar}>
              <AlertTriangle size={17} strokeWidth={2} color="var(--vg-warning-fg)" style={{ flexShrink:0, marginTop:1 }} />
              <span><strong className="vg-num">{fmtInt(prev.naoEncontrados.length)}</strong> produto(s) do arquivo não existem em <em>empresas</em> — serão importados mesmo assim. IDs: <span className="vg-num">{prev.naoEncontrados.slice(0,30).join(', ')}{prev.naoEncontrados.length>30 ? '…' : ''}</span></span>
            </div>
          )}

          {/* 15 maiores por valor absoluto (negativos em vermelho) */}
          <div style={{ ...CAPTION, textTransform:'uppercase', letterSpacing:0.6, margin:'8px 0 8px' }}>15 maiores spreads (por valor absoluto)</div>
          <div style={{ overflowX:'auto', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
              <thead>
                <tr>
                  <th style={{ ...s.th, textAlign:'right' }}>ID</th>
                  <th style={s.th}>Empresa</th>
                  <th style={{ ...s.th, textAlign:'right' }}>Spread</th>
                </tr>
              </thead>
              <tbody>
                {prev.registros.slice(0,15).map((r,i) => (
                  <tr key={i} style={{ borderTop:'1px solid var(--vg-border)' }}>
                    <td style={{ ...s.td, textAlign:'right', color:'var(--vg-muted)' }} className="vg-num">{r.produto_id}</td>
                    <td style={{ ...s.td, fontWeight:500, color:'var(--vg-ink)' }}>{r.empresa_nome || '—'}</td>
                    <td style={{ ...s.td, textAlign:'right', color: r.spread<0 ? 'var(--vg-danger-fg)' : r.spread>0 ? 'var(--vg-success-fg)' : 'var(--vg-muted)', fontWeight:600 }} className="vg-num">{fmt(r.spread)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status === 'importing' && (
        <div style={{ ...cardStyle, textAlign:'center', padding:48 }}>
          <div style={s.spin} />
          <div style={{ ...H_CARD, marginBottom:6 }}>Importando {fmtInt(prev?.comValor||0)} linhas…</div>
          <div style={CAPTION}>Apagando o mês e gravando em lotes de 50</div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ ...cardStyle, textAlign:'center' }}>
          <CheckCircle2 size={44} strokeWidth={1.5} color="var(--vg-success-fg)" style={{ margin:'0 auto 12px', display:'block' }} />
          <div style={{ ...H_CARD, fontSize:18 }}>Spread importado com sucesso</div>
          <div style={{ display:'flex', justifyContent:'center', gap:40, margin:'20px 0', flexWrap:'wrap' }}>
            <div><div className="vg-num" style={{ fontFamily:OUTFIT, fontSize:28, fontWeight:600, color:'var(--vg-success-fg)' }}>{fmtInt(result.inserted)}</div><div style={LABEL}>linhas gravadas</div></div>
            <div><div className="vg-num" style={{ fontFamily:OUTFIT, fontSize:28, fontWeight:600, color:'var(--vg-brand-700)' }}>{fmt(prev?.totalSpread||0)}</div><div style={LABEL}>total do spread</div></div>
            {result.deleted > 0 && <div><div className="vg-num" style={{ fontFamily:OUTFIT, fontSize:28, fontWeight:600, color:'var(--vg-muted)' }}>{fmtInt(result.deleted)}</div><div style={LABEL}>substituídas</div></div>}
          </div>
          {result.naoEncontrados.length > 0 && (
            <div style={{ ...s.avisoAmbar, textAlign:'left' }}>
              <AlertTriangle size={17} strokeWidth={2} color="var(--vg-warning-fg)" style={{ flexShrink:0, marginTop:1 }} />
              <span><strong className="vg-num">{fmtInt(result.naoEncontrados.length)}</strong> produto(s) não encontrados em <em>empresas</em>: <span className="vg-num">{result.naoEncontrados.slice(0,30).join(', ')}{result.naoEncontrados.length>30?'…':''}</span></span>
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={s.errBox}>{result.errors.map((e,i)=><div key={i}>• {e}</div>)}</div>
          )}
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginTop:8 }}>
            <button style={s.btnPri} onClick={reset}>Importar outro arquivo</button>
            <a href="/rentabilidade-nova" style={{ ...s.btnSec, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>Ver Rentabilidade <ArrowRight size={15} strokeWidth={2} /></a>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ ...cardStyle, textAlign:'center', borderColor:'var(--vg-danger-fg)' }}>
          <XCircle size={40} strokeWidth={1.5} color="var(--vg-danger-fg)" style={{ margin:'0 auto 12px', display:'block' }} />
          <div style={{ ...H_CARD, marginBottom:8 }}>Erro na importação</div>
          {result.errors.map((e,i)=><div key={i} style={{ color:'var(--vg-danger-fg)', fontSize:14 }}>{e}</div>)}
          <button style={{ ...s.btnSec, marginTop:20 }} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      {/* Ajuda */}
      <div style={{ ...cardStyle, marginTop:24, background:'var(--vg-surface-muted)' }}>
        <div style={{ ...H_CARD, display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <FileSpreadsheet {...ICON} /> Como funciona
        </div>
        <ul style={{ margin:0, paddingLeft:20, color:'var(--vg-ink-secondary)', fontSize:13, lineHeight:2 }}>
          <li>Um arquivo = um mês. A competência vem da <strong>data no cabeçalho</strong> da última coluna (Formato B).</li>
          <li>Chave de gravação: <strong>produto_id + competência</strong>. Valores negativos e zerados também são importados — <strong>só linhas vazias</strong> são ignoradas.</li>
          <li>Reimportar o mesmo mês <strong>apaga e substitui</strong> as linhas daquela competência.</li>
          <li>Bandeira e taxa negativa <strong>não</strong> são gravadas aqui — a página de Rentabilidade as calcula sobre a recarga.</li>
        </ul>
      </div>
    </div>
  );
}

function Resumo({ label, valor, cor }) {
  return (
    <div style={{ background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)', padding:'14px 16px' }}>
      <div style={LABEL}>{label}</div>
      <div className="vg-num" style={{ fontFamily:OUTFIT, fontWeight:600, fontSize:20, color: cor || 'var(--vg-ink)', marginTop:2, overflowWrap:'anywhere' }}>{valor}</div>
    </div>
  );
}

const OUTFIT  = "'Outfit', sans-serif";
const CAPTION = { fontSize:12, lineHeight:'18px', color:'var(--vg-muted)' };
const LABEL   = { ...CAPTION, textTransform:'uppercase', letterSpacing:0.6 };
const H_CARD  = { fontFamily:OUTFIT, fontSize:16, lineHeight:'24px', fontWeight:600, color:'var(--vg-ink)' };
const ICON    = { size:16, strokeWidth:1.75, color:'var(--vg-ink-secondary)' };
const cardStyle = { background:'var(--vg-surface)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius-lg)', padding:24, boxShadow:'0 1px 2px rgba(28,31,59,0.04)' };

const s = {
  page:       { maxWidth:1100, margin:'0 auto', padding:'32px 24px', fontFamily:"'Inter', sans-serif", color:'var(--vg-ink)', background:'var(--vg-bg)', minHeight:'100vh', boxSizing:'border-box' },
  dropzone:   { border:'2px dashed var(--vg-border-field)', borderRadius:'var(--vg-radius-lg)', padding:'56px 32px', textAlign:'center', cursor:'pointer', background:'var(--vg-surface)', transition:'all 0.2s' },
  dropzoneOn: { borderColor:'var(--vg-brand-500)', background:'var(--vg-brand-50)' },
  btnPri:     { display:'inline-flex', alignItems:'center', gap:7, background:'var(--vg-brand-500)', color:'#fff', border:'none', borderRadius:'var(--vg-radius)', padding:'10px 20px', fontWeight:600, cursor:'pointer', fontSize:14, fontFamily:"'Inter', sans-serif" },
  btnSec:     { background:'var(--vg-surface)', color:'var(--vg-ink-secondary)', border:'1px solid var(--vg-border)', borderRadius:'var(--vg-radius)', padding:'10px 20px', fontWeight:600, cursor:'pointer', fontSize:14, fontFamily:"'Inter', sans-serif" },
  th:         { textAlign:'left', padding:'10px 16px', ...LABEL, background:'var(--vg-surface-muted)', whiteSpace:'nowrap' },
  td:         { padding:'11px 16px', verticalAlign:'middle', whiteSpace:'nowrap' },
  spin:       { width:36, height:36, border:'3px solid var(--vg-border)', borderTop:'3px solid var(--vg-brand-500)', borderRadius:'50%', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' },
  avisoAmbar: { display:'flex', alignItems:'flex-start', gap:10, background:'var(--vg-warning-bg)', border:'1px solid var(--vg-warning-fg)', borderRadius:'var(--vg-radius)', padding:'12px 16px', marginBottom:14, color:'var(--vg-warning-fg)', fontSize:13, lineHeight:'20px' },
  errBox:     { background:'var(--vg-danger-bg)', border:'1px solid var(--vg-danger-fg)', borderRadius:'var(--vg-radius)', padding:14, margin:'12px 0', color:'var(--vg-danger-fg)', fontSize:13, textAlign:'left' },
};
