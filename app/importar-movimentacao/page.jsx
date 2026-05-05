'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtMes = (d) => { if(!d) return '—'; const [y,m]=String(d).substring(0,7).split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y}`; };

// Converte qualquer valor de coluna para string "YYYY-MM" ou null
function toYYYYMM(val) {
  if (!val && val !== 0) return null;
  // Date object do JS (quando xlsx lê células do tipo data)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }
  // Número serial do Excel (ex: 45245 = dez/2025)
  if (typeof val === 'number') {
    // Serial do Excel: 1 = 1900-01-01
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth()+1).padStart(2,'0');
      if (y > 1990 && y < 2100) return `${y}-${m}`;
    }
    return null;
  }
  // String: "2025-12-01", "2025-12", "01/12/2025", "dez/25", "dezembro 2025"
  const s = String(val).trim();
  // YYYY-MM-DD ou YYYY-MM
  const m1 = s.match(/^(\d{4})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}`;
  // DD/MM/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}`;
  // "dez/25" ou "dez/2025"
  const meses = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12,
                 jan2:1,feb:2,mar2:3,apr:4,may:5,jun2:6,jul2:7,aug:8,sep:9,oct:10,nov2:11,dec:12};
  const m3 = s.toLowerCase().match(/^([a-z]{3})[\/./-](\d{2,4})/);
  if (m3) {
    const mes = m3[1].substring(0,3);
    const mn  = Object.entries(meses).find(([k]) => k.startsWith(mes))?.[1];
    if (mn) {
      const ano = m3[2].length === 2 ? `20${m3[2]}` : m3[2];
      return `${ano}-${String(mn).padStart(2,'0')}`;
    }
  }
  return null;
}

function cleanNum(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').trim();
  const n = s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function norm(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }

// Detecta colunas de mês nas chaves de uma linha
// Aceita: Date objects, números seriais, strings de data
function detectarColunasMes(row) {
  return Object.entries(row)
    .map(([k, v]) => {
      const mesKey = toYYYYMM(k);  // chave pode ser Date ou string
      if (mesKey) return { key: k, mes: mesKey };
      // Às vezes a chave é "__EMPTY_N" e o valor seria a data — ignorar
      return null;
    })
    .filter(Boolean)
    .sort((a,b) => a.mes.localeCompare(b.mes));
}

function norm2(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function findKey(obj, targets) {
  for (const t of targets) {
    const tn = norm2(t);
    for (const k of Object.keys(obj)) {
      if (norm2(k) === tn) return obj[k];
    }
  }
  return undefined;
}

function parseRows(raw) {
  if (!raw.length) return { rows: [], meses: [] };

  // Detecta colunas de mês na primeira linha
  const colunasMes = detectarColunasMes(raw[0]);

  if (!colunasMes.length) {
    // Tenta mostrar as chaves para debug
    const chaves = Object.keys(raw[0]).slice(0, 10);
    throw new Error(`Nenhuma coluna de mês detectada.\nColunas encontradas: ${chaves.join(' | ')}\nFormatos aceitos: 2025-12-01, 01/12/2025, dez/25, ou célula do tipo Data.`);
  }

  const meses = [...new Set(colunasMes.map(c => c.mes))].sort();

  const rows = raw.map(row => {
    const prodId = parseInt(findKey(row, ['ID Produto','Produto Id','produto_id']));
    if (!prodId) return null;
    const nome = findKey(row, ['Empresa','Nome','nome']) || '';
    const movPorMes = {};
    for (const { key, mes } of colunasMes) {
      const val = cleanNum(row[key]);
      if (val > 0) movPorMes[mes] = (movPorMes[mes] || 0) + val;
    }
    return { prodId, nome: String(nome), movPorMes };
  }).filter(r => r && r.prodId);

  return { rows, meses };
}

export default function ImportarMovimentacao() {
  const [xlsxLib,    setXlsxLib]    = useState(null);
  const [file,       setFile]       = useState(null);
  const [preview,    setPreview]    = useState(null); // { rows, meses }
  const [status,     setStatus]     = useState('idle');
  const [result,     setResult]     = useState({ inserted: 0, errors: [] });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m.default || m)); }, []);

  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // cellDates:true faz o xlsx.js converter seriais de data em Date objects
        const wb  = xlsxLib.read(e.target.result, { type:'array', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        // raw:false converte valores conforme tipo da célula (datas viram Date objects)
        const raw = xlsxLib.utils.sheet_to_json(ws, { raw: false, defval: '' });
        console.log('[importar] raw[0]:', raw[0]);
        console.log('[importar] keys:', Object.keys(raw[0]||{}));

        const parsed = parseRows(raw);
        setPreview(parsed);
        setStatus('confirming');
      } catch(err) {
        setStatus('error');
        setResult({ inserted: 0, errors: [err.message] });
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
    if (!preview) return;
    setStatus('importing');
    const { rows, meses } = preview;
    try {
      // Busca empresas pelos produto_ids
      const prodIds = [...new Set(rows.map(r => r.prodId))];
      const { data: empresas } = await supabase
        .from('empresas').select('id, produto_id').in('produto_id', prodIds);
      const empMap = Object.fromEntries((empresas||[]).map(e => [e.produto_id, e.id]));

      // Monta registros para liberacoes
      const records = [];
      for (const row of rows) {
        const empId = empMap[row.prodId];
        if (!empId) continue;
        for (const [mes, val] of Object.entries(row.movPorMes)) {
          if (val > 0) records.push({
            empresa_id:    empId,
            produto_id:    row.prodId,
            competencia:   `${mes}-01`,
            total_liberado: val,
          });
        }
      }

      let inserted = 0;
      const errors = [];

      // Agrupa por competência para fazer delete+insert por mês
      const porCompetencia = {};
      for (const r of records) {
        if (!porCompetencia[r.competencia]) porCompetencia[r.competencia] = [];
        porCompetencia[r.competencia].push(r);
      }

      for (const [comp, batch] of Object.entries(porCompetencia)) {
        const empIds = batch.map(r => r.empresa_id);
        // Remove registros existentes desses empresa_ids nessa competência
        const { error: delErr } = await supabase
          .from('liberacoes')
          .delete()
          .eq('competencia', comp)
          .in('empresa_id', empIds);
        if (delErr) { errors.push('Delete ' + comp + ': ' + delErr.message); continue; }
        // Insere em fatias de 50
        for (let i = 0; i < batch.length; i += 50) {
          const slice = batch.slice(i, i+50);
          const { data, error } = await supabase
            .from('liberacoes')
            .insert(slice)
            .select('empresa_id');
          if (error) errors.push('Insert ' + comp + ' lote ' + (Math.floor(i/50)+1) + ': ' + error.message);
          else inserted += data?.length || 0;
        }
      }
      setResult({ inserted, errors });
      setStatus('done');
    } catch(err) {
      setResult({ inserted: 0, errors: [err.message] });
      setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPreview(null); setFile(null); setResult({ inserted:0, errors:[] }); };

  const totalEmpresas = preview?.rows?.length || 0;
  const totalMeses    = preview?.meses?.length || 0;
  const totalRegistros = preview?.rows?.reduce((s,r) => s + Object.keys(r.movPorMes).length, 0) || 0;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Importar Movimentação</h1>
        <p style={s.sub}>Convênio, Mobilidade e outras categorias — planilha com colunas de meses</p>
      </div>

      {(status==='idle'||status==='parsing') && (
        <div style={{...s.dropzone,...(isDragging?s.dropzoneOn:{})}}
          onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)}
          onDrop={onDrop}
          onClick={()=>document.getElementById('fi-mov').click()}>
          <div style={{fontSize:'3rem',marginBottom:16}}>📊</div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>
            {status==='parsing'?'Lendo arquivo...':(xlsxLib?'Arraste o Excel aqui ou clique para selecionar':'Carregando...')}
          </div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>
            Formato esperado: coluna ID Produto · coluna Empresa · colunas com datas dos meses
          </div>
          <input id="fi-mov" type="file" accept=".xlsx,.xls" style={{display:'none'}}
            onChange={e=>handleFile(e.target.files[0])} />
        </div>
      )}

      {status==='confirming' && preview && (
        <div style={s.card}>
          {/* Resumo */}
          <div style={s.resumo}>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Empresas</span>
              <span style={s.resumoVal}>{totalEmpresas}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Meses detectados</span>
              <span style={s.resumoVal}>{totalMeses}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Registros c/ valor</span>
              <span style={{...s.resumoVal,color:'#34d399'}}>{totalRegistros}</span>
            </div>
            <div style={s.resumoItem}>
              <span style={s.resumoLabel}>Período</span>
              <span style={{...s.resumoVal,fontSize:'1rem'}}>
                {preview.meses.length ? `${fmtMes(preview.meses[0]+'-01')} → ${fmtMes(preview.meses[preview.meses.length-1]+'-01')}` : '—'}
              </span>
            </div>
          </div>

          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ {totalEmpresas} empresas · {totalMeses} meses</div>
              <div style={{color:'#6b7280',fontSize:'0.8rem'}}>Arquivo: {file?.name}</div>
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>
                Importar {totalRegistros} registros →
              </button>
            </div>
          </div>

          {/* Meses detectados */}
          <div style={{marginBottom:16}}>
            <div style={{color:'#6b7280',fontSize:'0.72rem',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
              Meses detectados na planilha:
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {preview.meses.map(m => (
                <span key={m} style={{background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.2)',borderRadius:6,padding:'3px 10px',color:'#34d399',fontSize:'0.78rem',fontWeight:600}}>
                  {fmtMes(m+'-01')}
                </span>
              ))}
            </div>
          </div>

          {/* Preview tabela */}
          <div style={{overflowX:'auto'}}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>ID</th>
                  <th style={s.th}>Empresa</th>
                  {preview.meses.map(m => (
                    <th key={m} style={s.th}>{fmtMes(m+'-01')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0,20).map((r,i) => (
                  <tr key={i} style={{background:i%2===0?'rgba(255,255,255,0.02)':'transparent'}}>
                    <td style={{...s.td,color:'#6b7280'}}>{r.prodId}</td>
                    <td style={{...s.td,fontWeight:600}}>{r.nome}</td>
                    {preview.meses.map(m => (
                      <td key={m} style={{...s.td,textAlign:'right',color:r.movPorMes[m]>0?'#34d399':'#374151'}}>
                        {r.movPorMes[m]>0 ? fmt(r.movPorMes[m]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {preview.rows.length > 20 && (
                  <tr><td colSpan={2+preview.meses.length} style={{...s.td,textAlign:'center',color:'#6b7280'}}>
                    ... e mais {preview.rows.length-20} empresas
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status==='importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>Importando movimentações...</div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Aguarde alguns segundos</div>
        </div>
      )}

      {status==='done' && (
        <div style={{...s.card,textAlign:'center',padding:48}}>
          <div style={{fontSize:'3rem',marginBottom:12}}>✅</div>
          <div style={s.cardTitle}>Movimentações importadas!</div>
          <div style={{display:'flex',justifyContent:'center',gap:40,margin:'20px 0'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:'2rem',fontWeight:700,color:'#34d399'}}>{result.inserted}</span>
              <span style={{color:'#6b7280',fontSize:'0.8rem',textTransform:'uppercase'}}>registros salvos</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:16,marginBottom:20,color:'#f87171',fontSize:'0.82rem',textAlign:'left',maxWidth:500,margin:'0 auto 20px'}}>
              {result.errors.map((e,i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <button style={s.btnPri} onClick={reset}>Importar outro arquivo</button>
        </div>
      )}

      {status==='error' && (
        <div style={{...s.stCard,border:'1px solid rgba(248,113,113,0.3)'}}>
          <div style={{fontSize:'2.5rem',marginBottom:12}}>❌</div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:12}}>Erro na importação</div>
          {result.errors.map((e,i) => (
            <div key={i} style={{color:'#f87171',fontSize:'0.85rem',marginBottom:6,maxWidth:600,textAlign:'left',whiteSpace:'pre-wrap'}}>{e}</div>
          ))}
          <button style={{...s.btnSec,marginTop:20}} onClick={reset}>Tentar novamente</button>
        </div>
      )}

      <div style={s.info}>
        <div style={{fontWeight:700,marginBottom:14,color:'#f0b429'}}>📋 Formatos aceitos para as colunas de mês</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>
          {[
            ['Célula Data Excel','(mais comum)','✅'],
            ['2025-12-01','formato ISO','✅'],
            ['01/12/2025','DD/MM/YYYY','✅'],
            ['dez/25 ou dez/2025','texto','✅'],
          ].map(([fmt,sub,ok]) => (
            <div key={fmt} style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'10px 14px'}}>
              <div style={{color:'#e8eaf0',fontWeight:600,fontSize:'0.85rem'}}>{ok} {fmt}</div>
              <div style={{color:'#6b7280',fontSize:'0.72rem',marginTop:3}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:       {maxWidth:1100,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans', sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:     {marginBottom:32},
  tag:        {color:'#f0b429',fontWeight:800,fontSize:'0.9rem',letterSpacing:2,marginBottom:12,textTransform:'uppercase'},
  title:      {fontSize:'1.8rem',fontWeight:700,margin:'0 0 8px'},
  sub:        {color:'#6b7280',fontSize:'0.9rem'},
  dropzone:   {border:'2px dashed rgba(240,180,41,0.3)',borderRadius:16,padding:'56px 32px',textAlign:'center',cursor:'pointer',background:'rgba(240,180,41,0.03)',transition:'all 0.2s',marginBottom:24},
  dropzoneOn: {borderColor:'#f0b429',background:'rgba(240,180,41,0.08)'},
  card:       {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:28,marginBottom:24},
  cardHead:   {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12},
  cardTitle:  {fontSize:'1.1rem',fontWeight:700,marginBottom:4},
  resumo:     {display:'flex',gap:16,marginBottom:24,flexWrap:'wrap'},
  resumoItem: {background:'rgba(255,255,255,0.04)',borderRadius:12,padding:'16px 24px',flex:1,minWidth:130},
  resumoLabel:{display:'block',color:'#6b7280',fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:1,marginBottom:6},
  resumoVal:  {display:'block',fontSize:'1.3rem',fontWeight:700},
  btnPri:     {background:'#f0b429',color:'#000',border:'none',borderRadius:10,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'},
  btnSec:     {background:'rgba(255,255,255,0.07)',color:'#e8eaf0',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'10px 22px',fontWeight:600,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'},
  table:      {width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'},
  th:         {padding:'8px 12px',textAlign:'left',color:'#6b7280',fontWeight:500,borderBottom:'1px solid rgba(255,255,255,0.07)',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.7rem',letterSpacing:0.5},
  td:         {padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'},
  stCard:     {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:48,textAlign:'center',marginBottom:24},
  spin:       {width:40,height:40,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite'},
  info:       {background:'rgba(240,180,41,0.05)',border:'1px solid rgba(240,180,41,0.15)',borderRadius:14,padding:24},
};
