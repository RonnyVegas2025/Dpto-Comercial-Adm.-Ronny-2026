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
  if (!v || v === '-') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function colToISO(k) {
  if (k instanceof Date) return `${k.getFullYear()}-${String(k.getMonth()+1).padStart(2,'0')}-01`;
  if (typeof k === 'number' && k > 40000 && k < 55000) {
    const d = new Date(Math.round((k - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;
  }
  const s = String(k).trim();
  const m1 = s.match(/^(\d{4})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-01`;
  const MESES = {jan:'01',fev:'02',mar:'03',abr:'04',mai:'05',jun:'06',jul:'07',ago:'08',set:'09',out:'10',nov:'11',dez:'12'};
  const m2 = s.toLowerCase().match(/^([a-z]{3})[\/\-](\d{2,4})$/);
  if (m2 && MESES[m2[1]]) return `${m2[2].length===2?'20'+m2[2]:m2[2]}-${MESES[m2[1]]}-01`;
  return null;
}

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=d.split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };
const fmtPct = (v) => `${Number(v||0).toFixed(2)}%`;

export default function ImportarTaxaNegativa() {
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState([]);
  const [meses, setMeses]       = useState([]);
  const [status, setStatus]     = useState('idle');
  const [result, setResult]     = useState({ inserted:0, errors:[] });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'' });
        if (!raw.length) throw new Error('Planilha vazia');

        const findCol = (obj, targets) => {
          for (const t of targets) {
            if (obj[t] !== undefined) return obj[t];
            const tn = norm(t);
            for (const k of Object.keys(obj)) if (norm(k) === tn) return obj[k];
          }
          return undefined;
        };

        const colsMes = Object.keys(raw[0]).filter(k => colToISO(k) !== null)
          .map(k => ({ col:k, comp:colToISO(k) }))
          .sort((a,b) => a.comp.localeCompare(b.comp));

        if (!colsMes.length) throw new Error('Nenhuma coluna de mês detectada. Use Jan/26, Fev/26 ou 2026-01-01.');
        setMeses(colsMes);

        const parsed = raw.map(row => {
          const prodId = parseInt(findCol(row, ['ID Produto','Produto Id','produto_id']));
          const nome   = String(findCol(row, ['Empresa','empresa']) || '').trim();
          const txNeg  = (() => {
            const v = findCol(row, ['Taxa Negativa','taxa_negativa']);
            if (!v) return 0;
            const s = String(v).replace('%','').trim();
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n > 1 ? n/100 : n;
          })();
          if (!prodId || !nome) return null;

          const movs = colsMes.map(m => ({
            competencia:      m.comp,
            valor_movimentado: cleanNum(row[m.col]),
          }));

          return { produto_id:prodId, empresa_nome:nome, taxa_negativa:txNeg, movs };
        }).filter(Boolean);

        setPreview(parsed);
        setStatus('confirming');
      } catch(err) {
        setStatus('error');
        setResult({ inserted:0, errors:['Erro: '+err.message] });
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
      // Busca empresa_id e taxa_negativa do banco
      const { data: empresas } = await supabase
        .from('empresas').select('id, produto_id, taxa_negativa');
      const empMap = Object.fromEntries((empresas||[]).map(e => [e.produto_id, { id:e.id, taxa:e.taxa_negativa||0 }]));

      const allRows = [];
      for (const e of preview) {
        const emp = empMap[e.produto_id];
        const taxa = emp?.taxa || e.taxa_negativa || 0;
        for (const m of e.movs) {
          if (m.valor_movimentado > 0) {
            allRows.push({
              produto_id:          e.produto_id,
              empresa_id:          emp?.id || null,
              empresa_nome:        e.empresa_nome,
              competencia:         m.competencia,
              valor_movimentado:   m.valor_movimentado,
              desconto_disponivel: Math.round(m.valor_movimentado * taxa * 10000) / 10000,
              desconto_utilizado:  0, // será atualizado conforme uso
            });
          }
        }
      }

      let inserted = 0;
      const errors = [];
      for (let i = 0; i < allRows.length; i += 50) {
        const batch = allRows.slice(i, i+50);
        const { data, error } = await supabase
          .from('taxa_negativa_mov')
          .upsert(batch, { onConflict:'produto_id,competencia' })
          .select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length || 0;
      }
      setResult({ inserted, errors });
      setStatus('done');
    } catch(err) {
      setResult({ inserted:0, errors:[err.message] });
      setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPreview([]); setFile(null); setMeses([]); setResult({inserted:0,errors:[]}); };

  const totalMov = preview.reduce((s,e) => s+e.movs.reduce((ss,m)=>ss+m.valor_movimentado,0), 0);
  const resumoPorMes = meses.map(m => ({
    comp: m.comp,
    total: preview.reduce((s,e) => s+(e.movs.find(x=>x.competencia===m.comp)?.valor_movimentado||0), 0),
    ativas: preview.filter(e => (e.movs.find(x=>x.competencia===m.comp)?.valor_movimentado||0)>0).length,
  }));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Importar Taxa Negativa</h1>
        <p style={s.sub}>Movimentação mensal dos contratos Desconto Condicional</p>
      </div>

      {(status==='idle'||status==='parsing') && (
        <div style={{...s.dropzone,...(isDragging?s.dropzoneOn:{})}}
          onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)} onDrop={onDrop}
          onClick={()=>document.getElementById('fi-tn').click()}>
          <div style={{fontSize:'3rem',marginBottom:16}}>📉</div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>
            {status==='parsing'?'Lendo planilha...':(xlsxLib?'Arraste a planilha de Taxa Negativa aqui':'Carregando...')}
          </div>
          <div style={{color:'#6b7280',fontSize:'0.85rem',marginBottom:6}}>
            Colunas: <strong style={{color:'#9ca3af'}}>ID Produto · Empresa · Taxa Negativa · Jan/26 · Fev/26...</strong>
          </div>
          <div style={{color:'#4b5563',fontSize:'0.78rem'}}>Apenas contratos Desconto Condicional</div>
          <input id="fi-tn" type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])} />
        </div>
      )}

      {status==='confirming' && (
        <div style={s.card}>
          <div style={s.resumo}>
            {resumoPorMes.map(m => (
              <div key={m.comp} style={s.resumoItem}>
                <span style={s.resumoLabel}>{fmtMes(m.comp)}</span>
                <span style={{...s.resumoVal,color:'#f87171'}}>{fmt(m.total)}</span>
                <span style={{color:'#6b7280',fontSize:'0.72rem'}}>{m.ativas} empresas</span>
              </div>
            ))}
            <div style={{...s.resumoItem,borderColor:'rgba(248,113,113,0.4)'}}>
              <span style={s.resumoLabel}>Total Movimentado</span>
              <span style={{...s.resumoVal,color:'#dc2626'}}>{fmt(totalMov)}</span>
              <span style={{color:'#6b7280',fontSize:'0.72rem'}}>{preview.length} contratos</span>
            </div>
          </div>
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ {preview.length} contratos — {file?.name}</div>
              <div style={{color:'#6b7280',fontSize:'0.8rem',marginTop:4}}>Meses: {meses.map(m=>fmtMes(m.comp)).join(', ')}</div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar {preview.length} contratos →</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>ID</th>
                <th style={s.th}>Empresa</th>
                <th style={s.th}>Taxa Neg.</th>
                {meses.map(m=><th key={m.comp} style={{...s.th,textAlign:'right'}}>{fmtMes(m.comp)}</th>)}
                <th style={{...s.th,textAlign:'right'}}>Desconto Disponível</th>
              </tr></thead>
              <tbody>
                {preview.slice(0,10).map((e,i) => {
                  const totalMovE = e.movs.reduce((s,m)=>s+m.valor_movimentado,0);
                  const desconto  = totalMovE * e.taxa_negativa;
                  return (
                    <tr key={e.produto_id} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                      <td style={{...s.td,color:'#6b7280'}}>{e.produto_id}</td>
                      <td style={{...s.td,fontWeight:600}}>{e.empresa_nome}</td>
                      <td style={{...s.td,color:'#f87171',fontWeight:600}}>{fmtPct(e.taxa_negativa*100)}</td>
                      {meses.map(m => {
                        const v = e.movs.find(x=>x.competencia===m.comp)?.valor_movimentado||0;
                        return <td key={m.comp} style={{...s.td,textAlign:'right'}}>
                          {v>0?<span style={{color:'#fca5a5'}}>{fmt(v)}</span>:<span style={{color:'#374151'}}>—</span>}
                        </td>;
                      })}
                      <td style={{...s.td,textAlign:'right',color:'#f87171',fontWeight:700}}>{fmt(desconto)}</td>
                    </tr>
                  );
                })}
                {preview.length>10&&<tr><td colSpan={4+meses.length} style={{...s.td,textAlign:'center',color:'#6b7280'}}>... e mais {preview.length-10} contratos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status==='importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>Importando movimentações...</div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Calculando descontos disponíveis...</div>
        </div>
      )}

      {status==='done' && (
        <div style={{...s.card,textAlign:'center'}}>
          <div style={{fontSize:'3rem',marginBottom:12}}>✅</div>
          <div style={s.cardTitle}>Taxa Negativa importada!</div>
          <div style={{display:'flex',justifyContent:'center',gap:40,margin:'20px 0',flexWrap:'wrap'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:'2rem',fontWeight:700,color:'#f87171'}}>{result.inserted}</span>
              <span style={{color:'#6b7280',fontSize:'0.8rem',textTransform:'uppercase'}}>registros salvos</span>
            </div>
          </div>
          {result.errors.length>0&&<div style={s.errBox}>{result.errors.map((e,i)=><div key={i}>• {e}</div>)}</div>}
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
            <button style={s.btnPri} onClick={reset}>Importar outro arquivo</button>
            <a href="/taxa-negativa" style={{...s.btnSec,textDecoration:'none',display:'inline-block'}}>📉 Ver Acompanhamento →</a>
          </div>
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
        <div style={{fontWeight:700,marginBottom:14,color:'#f87171'}}>📋 Como usar</div>
        <ol style={{paddingLeft:20,color:'#9ca3af',fontSize:'0.87rem',lineHeight:2}}>
          <li>Use a planilha com colunas: <strong style={{color:'#d1d5db'}}>ID Produto · Empresa · Taxa Negativa · Jan/26 · Fev/26...</strong></li>
          <li>Os valores nos meses são a movimentação do período</li>
          <li>O desconto disponível é calculado automaticamente: movimentação × taxa negativa</li>
          <li>Apenas contratos com produto "Desconto Condicional"</li>
        </ol>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const s = {
  page:       {maxWidth:1100,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans',sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:     {marginBottom:32},
  tag:        {color:'#f87171',fontWeight:800,fontSize:'0.9rem',letterSpacing:2,marginBottom:12,textTransform:'uppercase'},
  title:      {fontSize:'1.8rem',fontWeight:700,margin:'0 0 8px'},
  sub:        {color:'#6b7280',fontSize:'0.9rem'},
  dropzone:   {border:'2px dashed rgba(248,113,113,0.3)',borderRadius:16,padding:'56px 32px',textAlign:'center',cursor:'pointer',background:'rgba(248,113,113,0.03)',transition:'all 0.2s',marginBottom:24},
  dropzoneOn: {borderColor:'#f87171',background:'rgba(248,113,113,0.08)'},
  card:       {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:28,marginBottom:24},
  cardHead:   {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12},
  cardTitle:  {fontSize:'1.05rem',fontWeight:700,marginBottom:4},
  resumo:     {display:'flex',gap:14,marginBottom:24,flexWrap:'wrap'},
  resumoItem: {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'14px 20px',flex:1,minWidth:130,display:'flex',flexDirection:'column',gap:4},
  resumoLabel:{color:'#6b7280',fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:1},
  resumoVal:  {fontSize:'1.2rem',fontWeight:700},
  btnPri:     {background:'#f87171',color:'#000',border:'none',borderRadius:10,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'},
  btnSec:     {background:'rgba(255,255,255,0.07)',color:'#e8eaf0',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'10px 22px',fontWeight:600,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'},
  table:      {width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'},
  th:         {padding:'8px 12px',textAlign:'left',color:'#6b7280',fontWeight:500,borderBottom:'1px solid rgba(255,255,255,0.07)',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.7rem',letterSpacing:0.5},
  td:         {padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'},
  stCard:     {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:48,textAlign:'center',marginBottom:24},
  spin:       {width:40,height:40,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #f87171',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite'},
  errBox:     {background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:16,marginBottom:20,color:'#f87171',fontSize:'0.82rem',textAlign:'left'},
  info:       {background:'rgba(248,113,113,0.05)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:14,padding:24},
};

