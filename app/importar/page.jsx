'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function norm(s) {
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function findKey(obj, target) {
  if (obj[target] !== undefined) return obj[target];
  const t = norm(target);
  for (const key of Object.keys(obj)) {
    if (norm(key) === t) return obj[key];
  }
  return undefined;
}
function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return (s === '-' || s === '') ? null : s;
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
  if (v instanceof Date) return v.toISOString().split('T')[0];
  const parts = String(v).split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  return null;
}
function parseRow(row) {
  return {
    produto_id:           parseInt(findKey(row,'Produto Id')) || null,
    nome:                 clean(findKey(row,'Empresa')),
    cnpj:                 clean(findKey(row,'CNPJ')),
    data_cadastro:        cleanDate(findKey(row,'Data de Cadastro')),
    categoria:            clean(findKey(row,'Categoria')),
    produto_contratado:   clean(findKey(row,'Produto Contratado')),
    cidade:               clean(findKey(row,'Cidade')),
    estado:               clean(findKey(row,'Estado')),
    cartoes_emitidos:     parseInt(cleanNum(findKey(row,'Cartoes Emitidos') ?? findKey(row,'Cartões Emitidos'))) || 0,
    potencial_movimentacao: cleanNum(findKey(row,'Potencial de Movimentacao') ?? findKey(row,'Potencial de Movimentação')),
    tipo_boleto:          clean(findKey(row,'Tipo do Boleto')),
    confeccao_cartao:     cleanNum(findKey(row,'Confeccao de Cartao') ?? findKey(row,'Confecção de Cartão')),
    taxa_negativa:        cleanNum(findKey(row,'Taxa Negativa')),
    taxa_positiva:        cleanNum(findKey(row,'Taxa Positiva')),
    dias_prazo:           parseInt(cleanNum(findKey(row,'Dias de Prazo'))) || 0,
    _consultor_principal: clean(findKey(row,'Consultor Principal')),
    _consultor_agregado:  clean(findKey(row,'Consultor Agregado')),
    _parceiro:            clean(findKey(row,'Parceiro Comercial')),
  };
}

async function resolveIds(rows) {
  // Busca produtos, consultores e parceiros do banco novo
  const { data: produtos }    = await supabase.from('produtos').select('id, nome, peso');
  const { data: consultores } = await supabase.from('consultores').select('id, nome');
  const { data: parceiros }   = await supabase.from('parceiros').select('id, nome');

  const prodMap    = Object.fromEntries((produtos||[]).map(p => [norm(p.nome), { id: p.id, peso: p.peso }]));
  const consultMap = Object.fromEntries((consultores||[]).map(c => [norm(c.nome), c.id]));
  const parcMap    = Object.fromEntries((parceiros||[]).map(p => [norm(p.nome), p.id]));

  // Cria consultores/parceiros que não existem
  const novosConsult = new Set();
  const novosParceiros = new Set();
  rows.forEach(r => {
    if (r._consultor_principal && !consultMap[norm(r._consultor_principal)]) novosConsult.add(r._consultor_principal);
    if (r._consultor_agregado  && !consultMap[norm(r._consultor_agregado)])  novosConsult.add(r._consultor_agregado);
    if (r._parceiro            && !parcMap[norm(r._parceiro)])               novosParceiros.add(r._parceiro);
  });

  if (novosConsult.size > 0) {
    const { data: criados } = await supabase.from('consultores')
      .insert([...novosConsult].map(nome => ({ nome, tipo:'interno' }))).select('id, nome');
    (criados||[]).forEach(c => { consultMap[norm(c.nome)] = c.id; });
  }
  if (novosParceiros.size > 0) {
    const { data: criados } = await supabase.from('parceiros')
      .insert([...novosParceiros].map(nome => ({ nome }))).select('id, nome');
    (criados||[]).forEach(p => { parcMap[norm(p.nome)] = p.id; });
  }

  return rows.map(r => {
    const prod = prodMap[norm(r.produto_contratado||'')];
    const { _consultor_principal, _consultor_agregado, _parceiro, ...rest } = r;
    return {
      ...rest,
      produto_id_ref:         prod?.id || null,
      peso_categoria:         prod?.peso ?? 1.0,
      consultor_principal_id: _consultor_principal ? consultMap[norm(_consultor_principal)] || null : null,
      consultor_agregado_id:  _consultor_agregado  ? consultMap[norm(_consultor_agregado)]  || null : null,
      parceiro_id:            _parceiro            ? parcMap[norm(_parceiro)]                || null : null,
    };
  });
}

export default function ImportarEmpresas() {
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
        const parsed = raw.map(parseRow).filter(r => r.nome && r.produto_id);
        setPreview(parsed);
        setStatus('confirming');
      } catch (err) {
        setStatus('error');
        setResult(r => ({...r, errors:['Erro ao ler arquivo: '+err.message]}));
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
      const rows = await resolveIds(preview);
      const errors = []; let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i+50);
        const { data, error } = await supabase.from('empresas')
          .upsert(batch, { onConflict:'produto_id' }).select('id');
        if (error) errors.push(`Lote ${Math.floor(i/50)+1}: ${error.message}`);
        else inserted += data?.length || 0;
      }
      setResult({ inserted, errors }); setStatus('done');
    } catch (err) {
      setResult({ inserted:0, errors:[err.message] }); setStatus('error');
    }
  };

  const reset = () => { setStatus('idle'); setPreview([]); setFile(null); setResult({inserted:0,errors:[]}); };
  const fmt = (v) => v ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : 'R$ 0,00';

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.tag}>♠ Vegas Card</div>
        <h1 style={s.title}>Importar Empresas</h1>
        <p style={s.sub}>Carregue o Excel exportado do seu sistema para atualizar o banco de dados</p>
      </div>

      {(status==='idle'||status==='parsing') && (
        <div style={{...s.dropzone,...(isDragging?s.dropzoneOn:{})}}
          onDragOver={(e)=>{e.preventDefault();setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)} onDrop={onDrop}
          onClick={()=>document.getElementById('fi').click()}>
          <div style={{fontSize:'3rem',marginBottom:16}}>📂</div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>
            {status==='parsing'?'Lendo arquivo...':(xlsxLib?'Arraste o Excel aqui ou clique para selecionar':'Carregando...')}
          </div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>.xlsx ou .xls — exportado do sistema</div>
          <input id="fi" type="file" accept=".xlsx,.xls" style={{display:'none'}}
            onChange={(e)=>handleFile(e.target.files[0])} />
        </div>
      )}

      {status==='confirming' && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>✅ {preview.length} empresas encontradas</div>
              <div style={{color:'#6b7280',fontSize:'0.8rem'}}>Arquivo: {file?.name}</div>
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <button style={s.btnSec} onClick={reset}>Cancelar</button>
              <button style={s.btnPri} onClick={handleImport}>Importar {preview.length} empresas →</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={s.table}>
              <thead><tr>{['ID','Empresa','CNPJ','Produto','Categoria','Cidade/UF','Potencial','Consultor','Parceiro'].map(h=>
                <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.slice(0,20).map((r,i)=>(
                  <tr key={i} style={i%2===0?{background:'rgba(255,255,255,0.02)'}:{}}>
                    <td style={s.td}>{r.produto_id}</td>
                    <td style={{...s.td,fontWeight:600}}>{r.nome}</td>
                    <td style={{...s.td,fontFamily:'monospace',color:'#9ca3af',fontSize:'0.75rem'}}>{r.cnpj}</td>
                    <td style={s.td}>{r.produto_contratado}</td>
                    <td style={{...s.td,color:'#9ca3af'}}>{r.categoria}</td>
                    <td style={s.td}>{r.cidade} / {r.estado}</td>
                    <td style={{...s.td,color:r.potencial_movimentacao>0?'#34d399':'#6b7280'}}>{fmt(r.potencial_movimentacao)}</td>
                    <td style={s.td}>{r._consultor_principal||'—'}</td>
                    <td style={s.td}>{r._parceiro||'—'}</td>
                  </tr>
                ))}
                {preview.length>20&&<tr><td colSpan={9} style={{...s.td,textAlign:'center',color:'#6b7280'}}>... e mais {preview.length-20} empresas</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status==='importing' && (
        <div style={s.stCard}>
          <div style={s.spin}></div>
          <div style={{fontSize:'1.1rem',fontWeight:600,marginBottom:8}}>Importando {preview.length} empresas...</div>
          <div style={{color:'#6b7280',fontSize:'0.85rem'}}>Aguarde alguns segundos</div>
        </div>
      )}

      {status==='done' && (
        <div style={{...s.card,textAlign:'center'}}>
          <div style={{fontSize:'3rem',marginBottom:12}}>✅</div>
          <div style={s.cardTitle}>Importação concluída!</div>
          <div style={{display:'flex',justifyContent:'center',gap:40,margin:'20px 0'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:'2rem',fontWeight:700,color:'#34d399'}}>{result.inserted}</span>
              <span style={{color:'#6b7280',fontSize:'0.8rem',textTransform:'uppercase'}}>processadas</span>
            </div>
          </div>
          {result.errors.length>0&&(
            <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:16,marginBottom:20,color:'#f87171',fontSize:'0.82rem',textAlign:'left'}}>
              {result.errors.map((e,i)=><div key={i}>• {e}</div>)}
            </div>
          )}
          <button style={s.btnPri} onClick={reset}>Importar outro arquivo</button>
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
          <li>Exporte a planilha do seu sistema normalmente (.xlsx)</li>
          <li>Arraste o arquivo aqui ou clique para selecionar</li>
          <li>Confira o preview e clique em Importar</li>
          <li>Empresas já existentes são atualizadas automaticamente</li>
        </ol>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s = {
  page:      {maxWidth:1100,margin:'0 auto',padding:'32px 24px',fontFamily:"'DM Sans', sans-serif",color:'#e8eaf0',background:'#0a0c10',minHeight:'100vh'},
  header:    {marginBottom:32},
  tag:       {color:'#f0b429',fontWeight:800,fontSize:'0.9rem',letterSpacing:2,marginBottom:12,textTransform:'uppercase'},
  title:     {fontSize:'1.8rem',fontWeight:700,margin:'0 0 8px'},
  sub:       {color:'#6b7280',fontSize:'0.9rem'},
  dropzone:  {border:'2px dashed rgba(240,180,41,0.3)',borderRadius:16,padding:'56px 32px',textAlign:'center',cursor:'pointer',background:'rgba(240,180,41,0.03)',transition:'all 0.2s',marginBottom:24},
  dropzoneOn:{borderColor:'#f0b429',background:'rgba(240,180,41,0.08)'},
  card:      {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:28,marginBottom:24},
  cardHead:  {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12},
  cardTitle: {fontSize:'1.1rem',fontWeight:700,marginBottom:4},
  btnPri:    {background:'#f0b429',color:'#000',border:'none',borderRadius:10,padding:'10px 22px',fontWeight:700,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'},
  btnSec:    {background:'rgba(255,255,255,0.07)',color:'#e8eaf0',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:'10px 22px',fontWeight:600,cursor:'pointer',fontSize:'0.9rem',fontFamily:'inherit'},
  table:     {width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'},
  th:        {padding:'8px 12px',textAlign:'left',color:'#6b7280',fontWeight:500,borderBottom:'1px solid rgba(255,255,255,0.07)',whiteSpace:'nowrap',textTransform:'uppercase',fontSize:'0.7rem',letterSpacing:0.5},
  td:        {padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)',whiteSpace:'nowrap'},
  stCard:    {background:'#161a26',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16,padding:48,textAlign:'center',marginBottom:24},
  spin:      {width:40,height:40,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #f0b429',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite'},
  info:      {background:'rgba(240,180,41,0.05)',border:'1px solid rgba(240,180,41,0.15)',borderRadius:14,padding:24},
};
