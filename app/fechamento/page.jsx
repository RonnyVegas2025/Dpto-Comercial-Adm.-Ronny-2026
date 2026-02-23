'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function norm(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
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
  let s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').trim();
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function cleanDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-01`;
  }
  // Formato "01/01/2026" ou "2026-01-01"
  const s = String(v).trim();
  if (s.match(/^\d{4}-\d{2}/)) return s.substring(0,7) + '-01';
  const parts = s.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-01`;
  return null;
}

function parseRow(row) {
  // Busca Mês Ref por qualquer variação (com ou sem acento)
  const mesRef = findKeyContains(row, 'mes');
  return {
    produto_id:  parseInt(findKey(row, 'Produto Id')) || null,
    empresa:     String(findKey(row, 'Empresa') || ''),
    vendas:      cleanNum(findKey(row, 'Vendas')),
    taxa:        cleanNum(findKey(row, 'Taxa')),
    competencia: cleanDate(mesRef),
  };
}

const fmt = (v) => Number(v||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y,m] = d.split('-');
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[parseInt(m)-1]}/${y}`;
};

export default function ImportarFechamento() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState([]);
  const [status, setStatus]     = useState('idle');
  const [result, setResult]     = useState({ inserted:0, errors:[] });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(mod => setXlsxLib(mod)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'' });
        console.log('Primeira linha:', raw[0]);
        console.log('Keys:', Object.keys(raw[0]||{}));
        const parsed = raw.map(parseRow).filter(r => r.produto_id && r.competencia);
        console.log('Parsed:', parsed);
        setPreview(parsed);
        setStatus('confirming');
      } catch (err) {
        setStatus('error');
        setResult(r => ({...r, errors:['Erro: '+err.message]}));
      }
    };
    reader.readAsArrayBuffer(f);
  }, [xlsxLib]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx')||f.name.endsWith('.xls'))) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    setStatus('importing');
    try {
      const ids = preview.map(r => r.produto_id);
      const { data: empresas } = await supabase
        .from('empresas').select('id, produto_id').in('produto_id', ids);
      const empresaMap = Object.fromEntries((empresas||[]).map(e => [e.produto_id, e.id]));

      const rows = preview.map(r => ({
        empresa_id:            empresaMap[r.produto_id] || null,
        competencia:           r.competencia,
        valor_movimentacao:    r.vendas,
        receita_taxa_positiva: r.taxa,
        receita_total:         r.taxa,
      })).filter(r => r.empresa_id);

      const errors = []; let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i+50);
        const { data, error } = await supabase
          .from('movimentacoes')
          .upsert(batch, { onConflict:'empresa_id,competencia' })
          .select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length || 0;
      }
      setResult({ inserted, errors }); setStatus('done');
    } catch (err) {
      setResult({ inserted:0, errors:[err.message] }); setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPreview([]); setFile(null); setResult({inserted:0,errors:[]}); };

  const totalVendas = preview.reduce((s,r) => s+r.vendas, 0);
  const totalTaxa   = preview.reduce((s,r) => s+r.taxa, 0);
  const mesRef      = preview[0]?.competencia;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Fechamento Mensal</h1>
        <p style={s.sub}>Importe a planilha de fechamento com vendas e taxas por empresa</p>
      </div>

      {(status==='idle'||status==='parsing') && (
        <div
          style={{...s.dropzone,...(isDragging?s.dropzoneOn:{})}}
          onDragOver={(e)=>{e.preventDefault();setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)}
          onDrop={onDrop}
          onClick={()=>document.getElementById('fi2').click()}
        >
          <div style={{fontSize:'3rem',marginBottom:16}}>📊</div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>
            {status==='parsing'?'Lendo arquivo...':(xlsxLib?'Arraste o Excel de fechamento aqui':'Carregando...')}
          </div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Colunas: Produto Id, Vendas, Taxa, Mês Ref.</div>
          <input id="fi2" type="file" accept=".xlsx,.xls" style={{display:'none'}}
            onChange={(e)=>handleFile(e.target.files[0])} />
        </div>
      )}

      {status==='confirming' && (
        <div style={s.card}>
          <div style={s.resumo}>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Competência</span>
              <span style={s.resumoVal}>{fmtMes(mesRef)}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Empresas</span>
              <span style={s.resumoVal}>{preview.length}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Total Vendas</span>
              <span style={{...s.resumoVal,color:'#34d399'}}>{fmt(totalVendas)}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Total Taxa</span>
              <span style={{...s.resumoVal,color:'#f0b429'}}>{fmt(totalTaxa)}</span>
            </div>
          </div>
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ {preview.length} registros encontrados</div>
              <div style={{color:'#6b7280',fontSize:'0.8rem'}}>Arquivo: {file?.name}</div>
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar fechamento →</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.table}>
              <thead><tr>{['ID','Empresa','Mês Ref.','Vendas','Taxa'].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.slice(0,15).map((r,i)=>(
                  <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                    <td style={s.td}>{r.produto_id}</td>
                    <td style={{...s.td,fontWeight:600}}>{r.empresa}</td>
                    <td style={s.td}>{fmtMes(r.competencia)}</td>
                    <td style={{...s.td,color:r.vendas>0?'#34d399':'#6b7280'}}>{fmt(r.vendas)}</td>
                    <td style={{...s.td,color:r.taxa>0?'#f0b429':'#6b7280'}}>{fmt(r.taxa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status==='importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>Importando fechamento...</div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Aguarde alguns segundos</div>
        </div>
      )}

      {status==='done' && (
        <div style={{...s.card,textAlign:'center'}}>
          <div style={{fontSize:'3rem',marginBottom:12}}>✅</div>
          <div style={s.cardTitle}>Fechamento importado!</div>
          <div style={{display:'flex',justifyContent:'center',gap:40,margin:'20px 0'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:'2rem',fontWeight:700,color:'#34d399'}}>{result.inserted}</span>
              <span style={{color:'#6b7280',fontSize:'0.8rem',textTransform:'uppercase'}}>registros salvos</span>
            </div>
          </div>
          {result.errors.length>0 && (
            <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:16,marginBottom:20,color:'#f87171',fontSize:'0.82rem',textAlign:'left'}}>
              {result.errors.map((e,i)=><div key={i}>• {e}</div>)}
            </div>
          )}
          <button style={s.btnPri} onClick={reset}>Importar outro mês</button>
        </div>
      )}

      {status==='error' && (
        <div style={{...s.stCard,borderColor:'#f87171'}}>
          <div style={{fontSize:'2.5rem',marginBottom:12}}>❌</div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>Erro na importação</div>
          {result.errors.map((e,i)=><div key={i} style={{color:'#f87171',fontSize:'0.85rem'}}>{e}</div>)}
          <button style={{...s.btnSec,marginTop:20}} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      <div style={s.info}>
        <div style={{fontWeight:700,marginBottom:14,color:'#f0b429'}}>📋 Como usar</div>
        <ol style={{paddingLeft:20,color:'#9ca3af',fontSize:'0.87rem',lineHeight:2}}>
          <li>Exporte a planilha de fechamento do mês do seu sistema</li>
          <li>Arraste aqui ou clique para selecionar</li>
          <li>Confira o resumo: competência, total de vendas e taxas</li>
          <li>Clique em "Importar fechamento" — registros existentes são atualizados</li>
        </ol>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:       { maxWidth:1100, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans', sans-serif", color:'#e8eaf0', background:'#0a0c10', minHeight:'100vh' },
  header:     { marginBottom:32 },
  tag:        { color:'#f0b429', fontWeight:800, fontSize:'0.9rem', letterSpacing:2, marginBottom:12, textTransform:'uppercase' },
  title:      { fontSize:'1.8rem', fontWeight:700, margin:'0 0 8px' },
  sub:        { color:'#6b7280', fontSize:'0.9rem' },
  dropzone:   { border:'2px dashed rgba(240,180,41,0.3)', borderRadius:16, padding:'56px 32px', textAlign:'center', cursor:'pointer', background:'rgba(240,180,41,0.03)', transition:'all 0.2s', marginBottom:24 },
  dropzoneOn: { borderColor:'#f0b429', background:'rgba(240,180,41,0.08)' },
  card:       { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:28, marginBottom:24 },
  cardHead:   { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 },
  cardTitle:  { fontSize:'1.1rem', fontWeight:700, marginBottom:4 },
  resumo:     { display:'flex', gap:16, marginBottom:24, flexWrap:'wrap' },
  resumoItem: { background:'rgba(255,255,255,0.04)', borderRadius:12, padding:'16px 24px', flex:1, minWidth:140 },
  resumoLabel:{ display:'block', color:'#6b7280', fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:1, marginBottom:6 },
  resumoVal:  { display:'block', fontSize:'1.3rem', fontWeight:700 },
  btnPri:     { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'10px 22px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  btnSec:     { background:'rgba(255,255,255,0.07)', color:'#e8eaf0', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 22px', fontWeight:600, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  table:      { width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' },
  th:         { padding:'8px 12px', textAlign:'left', color:'#6b7280', fontWeight:500, borderBottom:'1px solid rgba(255,255,255,0.07)', whiteSpace:'nowrap', textTransform:'uppercase', fontSize:'0.7rem', letterSpacing:0.5 },
  td:         { padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', whiteSpace:'nowrap' },
  stCard:     { background:'#161a26', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:48, textAlign:'center', marginBottom:24 },
  spin:       { width:40, height:40, border:'3px solid rgba(255,255,255,0.1)', borderTop:'3px solid #f0b429', borderRadius:'50%', margin:'0 auto 20px', animation:'spin 0.8s linear infinite' },
  info:       { background:'rgba(240,180,41,0.05)', border:'1px solid rgba(240,180,41,0.15)', borderRadius:14, padding:24 },
};
