'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Helpers ────────────────────────────────────────────────────────────────
function norm(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }

function cleanNum(v) {
  if (v === null || v === undefined || v === '-' || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).replace(/R\$\s*/g,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function cleanDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const d = new Date(v.getTime() - v.getTimezoneOffset()*60000);
    return d.toISOString().split('T')[0];
  }
  const s = String(v).trim();
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  }
  if (s.match(/^\d{4}-\d{2}/)) return s.substring(0,10);
  return null;
}

function cleanStr(v) {
  if (!v) return null;
  const s = String(v).trim();
  return (s === '-' || s === '' || s === 'None') ? null : s;
}

function colIdx(headers, ...frags) {
  for (const frag of frags) {
    for (let i = 0; i < headers.length; i++) {
      if (norm(headers[i]).includes(norm(frag))) return i;
    }
  }
  return null;
}

function parseSheet(rawRows, sheetName) {
  if (!rawRows || rawRows.length === 0) return [];
  const headers = Object.keys(rawRows[0]);
  const hasDesc = headers.some(h => norm(h).includes('descri'));

  return rawRows.map(row => {
    const get = (...frags) => {
      const i = colIdx(headers, ...frags);
      return i !== null ? row[headers[i]] : undefined;
    };

    const produtoId   = parseInt(String(get('produto id','produto_id') || 0));
    const nome        = cleanStr(get('empresa'));
    if (!produtoId || !nome) return null;

    return {
      _sheet:               sheetName,
      produto_id:           produtoId,
      nome,
      cnpj:                 cleanStr(get('cnpj')),
      data_cadastro:        cleanDate(get('data de cadastro','data cadastro')),
      produto_contratado:   cleanStr(get('produto contratado','produto')),
      categoria:            cleanStr(get('categoria')),
      cidade:               cleanStr(get('cidade')),
      estado:               cleanStr(get('uf','estado')),
      cartoes_emitidos:     parseInt(cleanNum(get('cartoes','cartões'))) || 0,
      potencial_movimentacao: cleanNum(get('potencial')),
      taxa_negativa:        cleanNum(get('taxa negativa')),
      taxa_positiva:        cleanNum(get('taxa positiva','taxa positva')),
      dias_prazo:           parseInt(cleanNum(get('dias de prazo'))) || 0,
      confeccao_cartao:     cleanNum(get('cobrança','confec')),
      tipo_boleto:          cleanStr(get('tipo do boleto')),
      _consultor_principal: cleanStr(get('consultor principal')),
      _consultor_agregado1: cleanStr(get('consultor agregado 1','consultor agregado')),
      _consultor_agregado2: cleanStr(get('consultor agregado 2')),
      _parceiro:            cleanStr(get('parceiro')),
    };
  }).filter(Boolean);
}

const fmt = (v) => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

// ══════════════════════════════════════════════════════════════════════════
export default function ImportarBase() {
  const [xlsxLib,    setXlsxLib]    = useState(null);
  const [file,       setFile]       = useState(null);
  const [abas,       setAbas]       = useState([]);   // { nome, rows[] }
  const [status,     setStatus]     = useState('idle');
  const [progresso,  setProgresso]  = useState({ etapa:'', pct:0, detalhe:'' });
  const [resultado,  setResultado]  = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { import('xlsx').then(m => setXlsxLib(m)); }, []);

  // ── Leitura do arquivo ─────────────────────────────────────────────────
  const handleFile = useCallback((f) => {
    if (!f || !xlsxLib) return;
    setFile(f); setStatus('parsing');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = xlsxLib.read(e.target.result, { type:'array', cellDates:true });
        const parsed = wb.SheetNames.map(name => {
          const ws   = wb.Sheets[name];
          const raw  = xlsxLib.utils.sheet_to_json(ws, { raw:true, defval:'' });
          const rows = parseSheet(raw, name);
          return { nome: name, rows, raw };
        }).filter(a => a.rows.length > 0);
        setAbas(parsed);
        setStatus('confirming');
      } catch(err) {
        setStatus('error');
        setResultado({ errors: ['Erro ao ler arquivo: ' + err.message] });
      }
    };
    reader.readAsArrayBuffer(f);
  }, [xlsxLib]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx')||f.name.endsWith('.xls'))) handleFile(f);
  }, [handleFile]);

  // ── Importação ─────────────────────────────────────────────────────────
  async function importar() {
    setStatus('importing');
    const errors = [];
    let inserted = 0;

    try {
      // 1. Busca produtos, consultores e parceiros existentes
      setProgresso({ etapa:'Carregando dados de referência...', pct:5, detalhe:'' });
      const [{ data: produtos }, { data: consultores }, { data: parceiros }] = await Promise.all([
        supabase.from('produtos').select('id, nome, peso'),
        supabase.from('consultores').select('id, nome'),
        supabase.from('parceiros').select('id, nome'),
      ]);

      const prodMap  = Object.fromEntries((produtos||[]).map(p => [norm(p.nome), { id:p.id, peso:p.peso }]));
      const consMap  = Object.fromEntries((consultores||[]).map(c => [norm(c.nome), c.id]));
      const parcMap  = Object.fromEntries((parceiros||[]).map(p => [norm(p.nome), p.id]));

      // 2. Coleta todos os nomes únicos de consultores e parceiros
      const allRows = abas.flatMap(a => a.rows);
      const novosConsultores = new Set();
      const novosParceiros   = new Set();

      allRows.forEach(r => {
        [r._consultor_principal, r._consultor_agregado1, r._consultor_agregado2].forEach(c => {
          if (c && !consMap[norm(c)]) novosConsultores.add(c);
        });
        if (r._parceiro && !parcMap[norm(r._parceiro)]) novosParceiros.add(r._parceiro);
      });

      // 3. Cria consultores novos
      if (novosConsultores.size > 0) {
        setProgresso({ etapa:`Criando ${novosConsultores.size} consultores novos...`, pct:15, detalhe:'' });
        const { data: novos, error } = await supabase
          .from('consultores')
          .insert([...novosConsultores].map(nome => ({ nome, ativo:true })))
          .select('id, nome');
        if (error) errors.push('Consultores: ' + error.message);
        (novos||[]).forEach(c => { consMap[norm(c.nome)] = c.id; });
      }

      // 4. Cria parceiros novos
      if (novosParceiros.size > 0) {
        setProgresso({ etapa:`Criando ${novosParceiros.size} parceiros novos...`, pct:20, detalhe:'' });
        const { data: novos, error } = await supabase
          .from('parceiros')
          .insert([...novosParceiros].map(nome => ({ nome })))
          .select('id, nome');
        if (error) errors.push('Parceiros: ' + error.message);
        (novos||[]).forEach(p => { parcMap[norm(p.nome)] = p.id; });
      }

      // 5. Importa aba por aba
      let abaNum = 0;
      for (const aba of abas) {
        abaNum++;
        const pctBase = 25 + (abaNum / abas.length) * 70;
        setProgresso({ etapa:`Importando ${aba.nome}...`, pct: Math.round(pctBase), detalhe:`${aba.rows.length} empresas` });

        // Monta payload
        const rows = aba.rows.map(r => {
          const prod = prodMap[norm(r.produto_contratado||'')] || {};
          return {
            produto_id:             r.produto_id,
            nome:                   r.nome,
            cnpj:                   r.cnpj,
            data_cadastro:          r.data_cadastro,
            produto_contratado:     r.produto_contratado,
            categoria:              r.categoria,
            cidade:                 r.cidade,
            estado:                 r.estado,
            cartoes_emitidos:       r.cartoes_emitidos,
            potencial_movimentacao: r.potencial_movimentacao,
            peso_categoria:         prod.peso ?? 1.0,
            produto_id_ref:         prod.id || null,
            taxa_negativa:          r.taxa_negativa,
            taxa_positiva:          r.taxa_positiva,
            dias_prazo:             r.dias_prazo,
            confeccao_cartao:       r.confeccao_cartao,
            tipo_boleto:            r.tipo_boleto,
            consultor_principal_id: r._consultor_principal ? (consMap[norm(r._consultor_principal)] || null) : null,
            consultor_agregado_id:  r._consultor_agregado1 ? (consMap[norm(r._consultor_agregado1)] || null) : null,
            parceiro_id:            r._parceiro ? (parcMap[norm(r._parceiro)] || null) : null,
            ativo:                  true,
          };
        });

        // Upsert em lotes de 50
        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          const { data, error } = await supabase
            .from('empresas')
            .upsert(batch, { onConflict:'produto_id' })
            .select('id');
          if (error) errors.push(`${aba.nome} lote ${Math.floor(i/50)+1}: ${error.message}`);
          else inserted += data?.length || 0;
        }

        // Trata consultor_agregado2 — atualiza campo extra se existir
        const comCA2 = aba.rows.filter(r => r._consultor_agregado2);
        // Por ora loga no console — a tabela não tem campo para 3° consultor nativamente
        if (comCA2.length > 0) {
          console.log(`${aba.nome}: ${comCA2.length} empresas com 2 consultores agregados (CA2 não persistido)`);
        }
      }

      setProgresso({ etapa:'Concluído!', pct:100, detalhe:'' });
      setResultado({ inserted, errors, abasSummary: abas.map(a => ({ nome:a.nome, total:a.rows.length })) });
      setStatus('done');

    } catch(err) {
      setResultado({ inserted:0, errors:[err.message] });
      setStatus('error');
    }
  }

  const reset = () => { setStatus('idle'); setAbas([]); setFile(null); setResultado(null); setProgresso({ etapa:'', pct:0, detalhe:'' }); };
  const totalEmpresas = abas.reduce((s,a) => s+a.rows.length, 0);

  return (
    <div style={s.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes prog{from{width:0%}}`}</style>

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <div style={{ color:'#b45309', fontWeight:700, fontSize:'0.7rem', letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Vegas Card · Importações</div>
        <h1 style={{ fontSize:'1.4rem', fontWeight:700, color:'#1a1d2e', margin:'0 0 6px' }}>📂 Importar Base de Empresas</h1>
        <p style={{ color:'#8b92b0', fontSize:'0.875rem', margin:0 }}>
          Importa planilha com múltiplas abas — Carteira 2025, Jan/26, Fev/26, Mar/26 e seguintes
        </p>
      </div>

      {/* Aviso de limpeza */}
      <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:'0.82rem', color:'#dc2626' }}>
        ⚠️ <strong>Antes de importar:</strong> Execute o SQL <code>zerar_tudo.sql</code> no Supabase para limpar os dados anteriores.
      </div>

      {/* Dropzone */}
      {(status === 'idle' || status === 'parsing') && (
        <div
          style={{ border:`2px dashed ${isDragging?'#f0b429':'rgba(240,180,41,0.4)'}`, borderRadius:14,
            padding:'48px 32px', textAlign:'center', cursor:'pointer',
            background: isDragging?'rgba(240,180,41,0.05)':'#ffffff',
            transition:'all 0.2s', marginBottom:20 }}
          onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
          onDragLeave={()=>setIsDragging(false)}
          onDrop={onDrop}
          onClick={()=>document.getElementById('fi-base').click()}
        >
          <div style={{ fontSize:'2.5rem', marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:600, fontSize:'1rem', color:'#1a1d2e', marginBottom:6 }}>
            {status==='parsing' ? 'Lendo arquivo...' : 'Arraste a planilha aqui ou clique para selecionar'}
          </div>
          <div style={{ color:'#8b92b0', fontSize:'0.82rem' }}>
            Planilha com abas: Carteira 2025, Jan-26, Fev-26, Mar-26...
          </div>
          <input id="fi-base" type="file" accept=".xlsx,.xls" style={{ display:'none' }}
            onChange={e=>handleFile(e.target.files[0])}/>
        </div>
      )}

      {/* Preview */}
      {status === 'confirming' && (
        <div>
          {/* Resumo por aba */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:12, marginBottom:20 }}>
            {abas.map(aba => {
              const totalPot = aba.rows.reduce((s,r) => s+(r.potencial_movimentacao||0), 0);
              const comConsultor = aba.rows.filter(r=>r._consultor_principal).length;
              return (
                <div key={aba.nome} style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#1a1d2e', marginBottom:8 }}>{aba.nome}</div>
                  <div style={{ fontSize:'1.6rem', fontWeight:800, color:'#f0b429', marginBottom:4 }}>{aba.rows.length}</div>
                  <div style={{ color:'#8b92b0', fontSize:'0.72rem', marginBottom:4 }}>empresas</div>
                  <div style={{ color:'#4a5068', fontSize:'0.75rem' }}>Pot: {fmt(totalPot)}</div>
                  <div style={{ color:'#8b92b0', fontSize:'0.72rem' }}>{comConsultor} com consultor</div>
                </div>
              );
            })}
            <div style={{ background:'#fff8e6', border:'1px solid #f0b429', borderRadius:12, padding:'16px 18px' }}>
              <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#b45309', marginBottom:8 }}>TOTAL</div>
              <div style={{ fontSize:'1.6rem', fontWeight:800, color:'#b45309', marginBottom:4 }}>{totalEmpresas}</div>
              <div style={{ color:'#b45309', fontSize:'0.72rem', marginBottom:4 }}>empresas</div>
              <div style={{ color:'#b45309', fontSize:'0.75rem' }}>
                {fmt(abas.flatMap(a=>a.rows).reduce((s,r)=>s+(r.potencial_movimentacao||0),0))}
              </div>
              <div style={{ color:'#b45309', fontSize:'0.72rem' }}>{abas.length} abas</div>
            </div>
          </div>

          {/* Preview de cada aba */}
          {abas.map(aba => (
            <div key={aba.nome} style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:'0.88rem', color:'#1a1d2e', marginBottom:12 }}>
                📋 {aba.nome} — {aba.rows.length} empresas
              </div>
              <div style={{ overflowX:'auto', maxHeight:240, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                  <thead>
                    <tr style={{ background:'#f9fafb' }}>
                      {['ID','Empresa','Produto','Categoria','Potencial','Consultor','Parceiro'].map(h =>
                        <th key={h} style={{ padding:'6px 10px', textAlign:'left', color:'#8b92b0',
                          fontWeight:600, borderBottom:'1px solid #e4e7ef', whiteSpace:'nowrap',
                          fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:0.5 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {aba.rows.slice(0,20).map((r,i) => (
                      <tr key={i} style={{ background: i%2===0?'#f9fafb':'#ffffff' }}>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', color:'#8b92b0' }}>{r.produto_id}</td>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', fontWeight:600, color:'#1a1d2e', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.nome}</td>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', color:'#4a5068' }}>{r.produto_contratado||'—'}</td>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', color:'#8b92b0' }}>{r.categoria||'—'}</td>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', color:'#f0b429', fontWeight:600 }}>{fmt(r.potencial_movimentacao)}</td>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', color:'#4a5068', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r._consultor_principal||'—'}</td>
                        <td style={{ padding:'6px 10px', borderBottom:'1px solid #f0f2f8', color:'#8b92b0' }}>{r._parceiro||'—'}</td>
                      </tr>
                    ))}
                    {aba.rows.length > 20 && (
                      <tr><td colSpan={7} style={{ padding:'8px 10px', textAlign:'center', color:'#8b92b0', fontSize:'0.72rem' }}>
                        ... e mais {aba.rows.length-20} empresas
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Botões */}
          <div style={{ display:'flex', gap:12 }}>
            <button style={s.btnSec} onClick={reset}>← Cancelar</button>
            <button style={s.btnPri} onClick={importar}>
              🚀 Importar {totalEmpresas} empresas →
            </button>
          </div>
        </div>
      )}

      {/* Importando */}
      {status === 'importing' && (
        <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:40, textAlign:'center' }}>
          <div style={{ width:48, height:48, border:'4px solid #e4e7ef', borderTop:'4px solid #f0b429',
            borderRadius:'50%', margin:'0 auto 20px', animation:'spin 0.8s linear infinite' }}></div>
          <div style={{ fontWeight:700, fontSize:'1rem', color:'#1a1d2e', marginBottom:8 }}>{progresso.etapa}</div>
          {progresso.detalhe && <div style={{ color:'#8b92b0', fontSize:'0.82rem', marginBottom:16 }}>{progresso.detalhe}</div>}
          {/* Barra de progresso */}
          <div style={{ background:'#f0f2f8', borderRadius:8, height:10, overflow:'hidden', maxWidth:400, margin:'0 auto' }}>
            <div style={{ height:'100%', width:`${progresso.pct}%`, background:'#f0b429',
              borderRadius:8, transition:'width 0.5s' }}></div>
          </div>
          <div style={{ color:'#8b92b0', fontSize:'0.72rem', marginTop:8 }}>{progresso.pct}%</div>
        </div>
      )}

      {/* Concluído */}
      {status === 'done' && resultado && (
        <div style={{ background:'#ffffff', border:'1px solid #e4e7ef', borderRadius:12, padding:32, textAlign:'center' }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:'1.1rem', color:'#1a1d2e', marginBottom:16 }}>
            Base importada com sucesso!
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12, marginBottom:20, textAlign:'left' }}>
            {resultado.abasSummary?.map(a => (
              <div key={a.nome} style={{ background:'#f9fafb', border:'1px solid #e4e7ef', borderRadius:10, padding:'12px 16px' }}>
                <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#1a1d2e' }}>{a.nome}</div>
                <div style={{ fontSize:'1.2rem', fontWeight:800, color:'#16a34a' }}>{a.total}</div>
                <div style={{ color:'#8b92b0', fontSize:'0.7rem' }}>empresas</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:'1.5rem', fontWeight:800, color:'#16a34a', marginBottom:4 }}>
            {resultado.inserted} registros salvos
          </div>
          {resultado.errors?.length > 0 && (
            <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
              padding:14, marginBottom:16, color:'#dc2626', fontSize:'0.82rem', textAlign:'left' }}>
              {resultado.errors.map((e,i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <button style={s.btnPri} onClick={reset}>Importar outro arquivo</button>
        </div>
      )}

      {/* Erro */}
      {status === 'error' && (
        <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:12, padding:32, textAlign:'center' }}>
          <div style={{ fontSize:'2.5rem', marginBottom:12 }}>❌</div>
          <div style={{ fontWeight:600, color:'#dc2626', marginBottom:12 }}>Erro na importação</div>
          {resultado?.errors?.map((e,i) => <div key={i} style={{ color:'#dc2626', fontSize:'0.82rem' }}>{e}</div>)}
          <button style={{ ...s.btnSec, marginTop:20 }} onClick={reset}>Tentar novamente</button>
        </div>
      )}
    </div>
  );
}

const s = {
  page:   { maxWidth:1100, margin:'0 auto', padding:'32px 24px', fontFamily:"'DM Sans',sans-serif", color:'#1a1d2e', background:'#f5f6fa', minHeight:'100vh' },
  btnPri: { background:'#f0b429', color:'#000', border:'none', borderRadius:10, padding:'12px 28px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
  btnSec: { background:'#f5f6fa', color:'#4a5068', border:'1px solid #e4e7ef', borderRadius:10, padding:'12px 24px', fontWeight:600, cursor:'pointer', fontSize:'0.9rem', fontFamily:'inherit' },
};

