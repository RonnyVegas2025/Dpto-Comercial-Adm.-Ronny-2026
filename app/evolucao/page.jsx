'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const fmt    = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMes = (d) => {
  if (!d) return '—';
  const [y, m] = d.split('-');
  const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${ms[parseInt(m) - 1]}/${y}`;
};
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const norm   = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function tendencia(vals) {
  const ativos = vals.filter(v => v > 0);
  if (ativos.length === 0) return 'none';
  if (ativos.length === 1) return 'new';
  const ultimo = vals[vals.length - 1];
  const penult = vals.slice(0, -1).reverse().find(v => v > 0) || 0;
  if (ultimo > penult * 1.05) return 'up';
  if (ultimo < penult * 0.95) return 'down';
  return 'flat';
}

const TEND = {
  up:   { color: '#16a34a', label: '↑ Crescendo' },
  down: { color: '#dc2626', label: '↓ Caindo' },
  flat: { color: '#6b7280', label: '→ Estável' },
  new:  { color: '#2563eb', label: '✦ Nova' },
  none: { color: '#4b5563', label: '— Sem movimentação' },
};

const POR_PAGINA = 12;

// ─── LÓGICA DE META ──────────────────────────────────────────────────────────
// Regra de peso: APENAS Vegas Benefícios aplica peso na meta (30%)
// Todos os outros produtos: peso é só para previsão, meta usa 100% da movimentação
function calcularMeta(empresa, libsTodasMap, ajusteMap, pct) {
  const catLower  = (empresa.categoria || '').toLowerCase();
  const prodNorm  = (empresa.produto_contratado || '').toLowerCase().trim();
  const isBenef   = catLower.includes('benefi') || catLower.includes('bonus') || catLower.includes('bônus');
  const isConv    = catLower.includes('conv')   || catLower.includes('mobil');
  if (!isBenef && !isConv) return { elegivel: false, regra: null };

  const libsOrdenadas = (libsTodasMap[empresa.produto_id] || [])
    .filter(l => l.val > 0)
    .sort((a, b) => a.comp.localeCompare(b.comp));

  const totalMesesComMov = libsOrdenadas.length;

  // Peso só entra na meta se for Vegas Benefícios
  const isVB   = prodNorm === 'vegas benefícios' || prodNorm === 'vegas beneficios';
  const peso   = isVB ? (empresa.peso_categoria ?? 1) : 1;

  function calcValorMeta(valorConsid) {
    return Math.round(valorConsid * peso * (pct / 100) * 100) / 100;
  }

  if (isBenef) {
    if (totalMesesComMov === 0) return { elegivel: false, regra: 'beneficio', progresso: 0, precisam: 1 };
    const mesAlvo     = libsOrdenadas[0].comp;
    const ajuste      = ajusteMap[`${empresa.id}__${mesAlvo}`];
    const valorBruto  = libsOrdenadas[0].val;
    const valorConsid = ajuste !== undefined ? ajuste : valorBruto;
    const valorMeta   = calcValorMeta(valorConsid);
    return { elegivel: true, regra: 'beneficio', mesAlvo, valorMeta, valorBruto, valorConsid, peso, progresso: 1, precisam: 1 };
  }

  if (isConv) {
    if (totalMesesComMov < 3) return { elegivel: false, regra: 'convenio', progresso: totalMesesComMov, precisam: 3 };
    const mesAlvo     = libsOrdenadas[2].comp;
    const ajuste      = ajusteMap[`${empresa.id}__${mesAlvo}`];
    const valorBruto  = libsOrdenadas[2].val;
    const valorConsid = ajuste !== undefined ? ajuste : valorBruto;
    const valorMeta   = calcValorMeta(valorConsid);
    return { elegivel: true, regra: 'convenio', mesAlvo, valorMeta, valorBruto, valorConsid, peso, progresso: totalMesesComMov, precisam: 3 };
  }

  return { elegivel: false, regra: null };
}

// Badge de meta para exibição na tabela
function BadgeMeta({ meta, pct }) {
  if (!meta || meta.regra === null) {
    return <span style={{ color: '#374151', fontSize: '0.72rem' }}>—</span>;
  }

  if (meta.elegivel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', borderRadius: 5, padding: '2px 7px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          ✅ {meta.regra === 'beneficio' ? '1ª rec.' : '3º mês'} · {fmtMes(meta.mesAlvo)}
        </span>
        <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 700 }}>{fmt(meta.valorMeta)}</span>
        {pct < 100 && <span style={{ color: '#f0b429', fontSize: '0.62rem' }}>{pct}% de {fmt(meta.valorBruto)}</span>}
      </div>
    );
  }

  // Não elegível ainda — mostra progresso
  const barW = (meta.progresso / meta.precisam) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 90 }}>
      <span style={{ color: '#6b7280', fontSize: '0.7rem', fontWeight: 600 }}>
        {meta.regra === 'beneficio' ? 'Aguardando 1ª rec.' : `${meta.progresso}/${meta.precisam} meses`}
      </span>
      {meta.regra === 'convenio' && (
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 4, width: 80, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barW}%`, background: meta.progresso >= 2 ? '#f0b429' : '#4b5563', borderRadius: 3 }} />
        </div>
      )}
    </div>
  );
}

function Paginacao({ pagina, total, onChange }) {
  if (total <= 1) return null;
  const start = Math.max(1, pagina - 2);
  const end   = Math.min(total, pagina + 2);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button style={{ ...ps.btn, ...(pagina === 1 ? ps.disabled : {}) }} onClick={() => onChange(pagina - 1)} disabled={pagina === 1}>‹</button>
      {start > 1 && <><button style={ps.btn} onClick={() => onChange(1)}>1</button><span style={ps.dots}>…</span></>}
      {pages.map(p => <button key={p} style={{ ...ps.btn, ...(p === pagina ? ps.ativo : {}) }} onClick={() => onChange(p)}>{p}</button>)}
      {end < total && <><span style={ps.dots}>…</span><button style={ps.btn} onClick={() => onChange(total)}>{total}</button></>}
      <button style={{ ...ps.btn, ...(pagina === total ? ps.disabled : {}) }} onClick={() => onChange(pagina + 1)} disabled={pagina === total}>›</button>
      <span style={{ color: '#4b5563', fontSize: '0.75rem', marginLeft: 4 }}>de {total}</span>
    </div>
  );
}

function BannerFiltros({ filtros, onLimpar }) {
  const tags = [];
  if (filtros.diretor   !== 'todos') tags.push({ label: `Diretor: ${filtros.diretor}`,       cor: '#a78bfa' });
  if (filtros.gestor    !== 'todos') tags.push({ label: `Gestor: ${filtros.gestor}`,          cor: '#60a5fa' });
  if (filtros.produto   !== 'todos') tags.push({ label: `Produto: ${filtros.produto}`,        cor: '#a78bfa' });
  if (filtros.depto     !== 'todos') tags.push({ label: `Equipe: ${filtros.depto}`,           cor: '#f97316' });
  if (filtros.vendedor  !== 'todos') tags.push({ label: `Vendedor: ${filtros.vendedor}`,      cor: '#34d399' });
  if (filtros.categoria !== 'todos') tags.push({ label: `Cat.: ${filtros.categoria}`,         cor: '#f0b429' });
  if (filtros.status    !== 'todos') tags.push({ label: filtros.status === 'creditou' ? '✅ Movimentaram' : '❌ Sem movimentação', cor: filtros.status === 'creditou' ? '#16a34a' : '#dc2626' });
  if (filtros.tend      !== 'todos') tags.push({ label: `Tend.: ${TEND[filtros.tend]?.label}`, cor: TEND[filtros.tend]?.color });
  if (filtros.metaStatus !== 'todos') tags.push({ label: filtros.metaStatus === 'na_meta' ? '✅ Na meta' : filtros.metaStatus === 'pendente' ? '⏳ Pendente meta' : '— Fora da meta', cor: filtros.metaStatus === 'na_meta' ? '#34d399' : filtros.metaStatus === 'pendente' ? '#f0b429' : '#6b7280' });
  if (filtros.mesMeta !== 'todos') tags.push({ label: `🎯 Meta de: ${fmtMes(filtros.mesMeta+'-01')}`, cor: '#34d399' });
  if (filtros.busca.trim()) tags.push({ label: `Busca: "${filtros.busca}"`, cor: '#e8eaf0' });
  if (tags.length === 0) return null;

  return (
    <div style={bb.wrap}>
      <span style={bb.icone}>🔍</span>
      <span style={bb.label}>Analisando:</span>
      <div style={bb.tags}>
        {tags.map((t, i) => (
          <span key={i} style={{ ...bb.tag, borderColor: t.cor + '55', color: t.cor, background: t.cor + '15' }}>
            {t.label}
          </span>
        ))}
      </div>
      <button style={bb.limpar} onClick={onLimpar}>✕ Limpar</button>
    </div>
  );
}

const bb = {
  wrap:   { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap' },
  icone:  { fontSize: '0.9rem' },
  label:  { color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' },
  tags:   { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
  tag:    { border: '1px solid', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' },
  limpar: { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '4px 12px', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
};

function TabelaEvolucao({ lista, meses, libMap, colunas, porPagina = 12,
  metasGravadas = {}, modalMeta, setModalMeta,
  metaForm, setMetaForm, salvandoMeta, erroMeta,
  salvarMetaInline, removerMetaInline, abrirModalMeta,
}) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [lista.length, porPagina]);
  const totalPaginas = Math.ceil(lista.length / porPagina);
  const listaPagina  = lista.slice((pagina - 1) * porPagina, pagina * porPagina);
  const totaisMes    = meses.map((m, mi) => lista.reduce((s, e) => s + (e.vals?.[mi] ?? (libMap[`${e.produto_id}__${m}`] || 0)), 0));
  const totalGeral   = lista.reduce((s, e) => s + e.totalCreditado, 0);
  const totalMetaApurado = lista.reduce((s, e) => {
    const chave   = `${e.id}__${e._meta?.mesAlvo?.substring(0,10)}`;
    const gravado = metasGravadas[chave];
    const valor   = gravado?.valor_meta ?? (e._meta?.elegivel ? e._meta.valorMeta : 0);
    return s + (valor || 0);
  }, 0);
  const naMeta = lista.filter(e => {
    const chave = `${e.id}__${e._meta?.mesAlvo?.substring(0,10)}`;
    return metasGravadas[chave] || e._meta?.elegivel;
  }).length;

  const col = (k) => !colunas || colunas.has(k); // helper

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>
          Exibindo <strong style={{ color: '#e8eaf0' }}>{listaPagina.length}</strong> de <strong style={{ color: '#e8eaf0' }}>{lista.length}</strong> empresas
          {totalMetaApurado > 0 && (
            <span style={{ marginLeft: 12, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 6, padding: '2px 10px', color: '#34d399', fontSize: '0.72rem', fontWeight: 600 }}>
              ✅ {naMeta} na meta · {fmt(totalMetaApurado)} apurado
            </span>
          )}
        </div>
        <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Empresa</th>
              {col('categoria') && <th style={s.th}>Categoria</th>}
              {col('produto')   && <th style={s.th}>Produto</th>}
              {col('vendedor')  && <th style={s.th}>Vendedor</th>}
              {col('gestor')    && <th style={s.th}>Gestor</th>}
              {col('diretor')   && <th style={s.th}>Diretor</th>}
              {col('meses') && meses.map(m => <th key={m} style={{ ...s.th, textAlign: 'right' }}>{fmtMes(m)}</th>)}
              {col('total')    && <th style={{ ...s.th, textAlign: 'right' }}>Movimentado</th>}
              {col('status')   && <th style={{ ...s.th, textAlign: 'center' }}>Status</th>}
              {col('tendencia')&& <th style={{ ...s.th, textAlign: 'center' }}>Tendência</th>}
              {col('meta')     && <th style={{ ...s.th, textAlign: 'center', borderLeft: '2px solid rgba(52,211,153,0.2)', color: '#34d399', minWidth: 120 }}>🎯 Meta</th>}
            </tr>
          </thead>
          <tbody>
            {listaPagina.map((e, i) => {
              const ts   = TEND[e.tend];
              const meta = e._meta;
              // Verifica se tem meta gravada localmente (prioridade sobre _meta calculada)
              const _metaChave = `${e.id}__${e._meta?.mesAlvo?.substring(0,10)}`;
              const metaLocal = metasGravadas[_metaChave];
              const temMetaGravada = !!metaLocal;
              const isModalAberto  = modalMeta?._key === e._key;
              const rowBg = (meta?.elegivel || temMetaGravada)
                ? (i % 2 === 0 ? 'rgba(52,211,153,0.04)' : 'rgba(52,211,153,0.02)')
                : (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent');
              return (
                <React.Fragment key={e._key}>
                <tr style={{ background: rowBg, opacity: !e.creditou ? 0.6 : 1 }}>
                  <td style={s.td}>
                    {/* Link para gestão + botão de meta lado a lado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div>
                        <a href={`/gestao/${e.id}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontWeight: 600, color: '#e8eaf0', textDecoration: 'none', cursor: 'pointer', fontSize: '0.82rem' }}
                          onMouseEnter={ev => ev.currentTarget.style.color='#34d399'}
                          onMouseLeave={ev => ev.currentTarget.style.color='#e8eaf0'}>
                          {e.nome} ↗
                        </a>
                        <div style={{ color: '#4b5563', fontSize: '0.68rem' }}>ID {e.produto_id}</div>
                      </div>
                    </div>
                  </td>
                  {col('categoria') && <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.categoria}</td>}
                  {col('produto')   && <td style={{ ...s.td, color: '#a78bfa', fontSize: '0.78rem' }}>{e.produto}</td>}
                  {col('vendedor')  && <td style={{ ...s.td, fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {e.vendedor}
                      {e._pct < 100 && <span style={{ background: 'rgba(240,180,41,0.12)', color: '#f0b429', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>{e._pct}%</span>}
                    </div>
                  </td>}
                  {col('gestor')   && <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.gestor}</td>}
                  {col('diretor')  && <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.diretor||'—'}</td>}
                  {col('meses') && meses.map(m => {
                    const mi = meses.indexOf(m);
                    const v  = e.vals?.[mi] ?? (libMap[`${e.produto_id}__${m}`] || 0);
                    const isMesAlvo = meta?.elegivel && meta?.mesAlvo === m;
                    return (
                      <td key={m} style={{ ...s.td, textAlign: 'right', background: isMesAlvo ? 'rgba(52,211,153,0.08)' : undefined }}>
                        {v > 0
                          ? <span style={{ color: isMesAlvo ? '#34d399' : '#34d399', fontWeight: isMesAlvo ? 700 : 500 }}>
                              {fmt(v)}
                              {isMesAlvo && <span style={{ fontSize: '0.6rem', marginLeft: 3 }}>✅</span>}
                            </span>
                          : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                    );
                  })}
                  {col('total') && <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>
                    {e.totalCreditado > 0 ? fmt(e.totalCreditado) : <span style={{ color: '#374151' }}>—</span>}
                  </td>}
                  {col('status') && <td style={{ ...s.td, textAlign: 'center' }}>
                    {e.creditou
                      ? <span style={s.badgeGreen}>✅ Movimentou</span>
                      : <span style={s.badgeRed}>❌ Sem movimentação</span>}
                  </td>}
                  {col('tendencia') && <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{ color: ts.color, fontSize: '0.78rem', fontWeight: 600 }}>{ts.label}</span>
                  </td>}
                  {/* ── COLUNA META — clicável ── */}
                  {col('meta') && <td style={{ ...s.td, textAlign: 'center', borderLeft: '2px solid rgba(52,211,153,0.1)', cursor: meta?.elegivel || meta?.regra ? 'pointer' : 'default' }}
                    onClick={() => (meta?.elegivel || meta?.regra) && abrirModalMeta(e)}>
                    {temMetaGravada ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                        <span style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399', borderRadius: 5, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
                          ✅ Gravado · {fmtMes(metaLocal.competencia_meta)}
                        </span>
                        <span style={{ color: '#34d399', fontSize: '0.78rem', fontWeight: 700 }}>{fmt(metaLocal.valor_meta)}</span>
                        <span style={{ color: '#4b5563', fontSize: '0.6rem' }}>clique para editar</span>
                      </div>
                    ) : (
                      <BadgeMeta meta={meta} pct={e._pct} onClick={() => meta?.elegivel && abrirModalMeta(e)} />
                    )}
                    {(meta?.elegivel && !temMetaGravada) && (
                      <button onClick={(ev) => { ev.stopPropagation(); abrirModalMeta(e); }}
                        style={{ marginTop: 4, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 5, padding: '2px 10px', color: '#34d399', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit', fontWeight: 700, display: 'block', width: '100%' }}>
                        + Marcar meta
                      </button>
                    )}
                  </td>}
                </tr>

                {/* ── LINHA EXPANDIDA: Modal de meta inline ── */}
                {isModalAberto && col('meta') && (
                  <tr key={e._key + '-modal'} style={{ background: 'rgba(52,211,153,0.03)' }}>
                    <td colSpan={99} style={{ padding: '0 12px 12px' }}>
                      <div style={{ background: '#0f1923', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 12, padding: '16px 20px', animation: 'fadeIn 0.2s ease' }}>
                        {/* Cabeçalho do modal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.88rem', marginBottom: 3 }}>
                              🎯 {temMetaGravada ? 'Editar meta' : 'Marcar na meta'} — {e.nome}
                            </div>
                            <div style={{ color: '#4b5563', fontSize: '0.72rem' }}>
                              {meta?.regra === 'beneficio' ? '1ª recarga' : '3º mês'} · {fmtMes(meta?.mesAlvo)}
                              {' '}· Valor bruto: <strong style={{ color: '#e8eaf0' }}>{fmt(meta?.valorBruto)}</strong>
                              {' '}· Consultor: <strong style={{ color: '#e8eaf0' }}>{e.vendedor}</strong> ({e._pct}%)
                              {' '}· Sugerido: <strong style={{ color: '#34d399' }}>{fmt(meta?.valorMeta)}</strong>
                            </div>
                          </div>
                          <button onClick={() => setModalMeta(null)}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: '#6b7280', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            ✕ Fechar
                          </button>
                        </div>

                        {erroMeta && <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#f87171', fontSize: '0.78rem' }}>{erroMeta}</div>}

                        {/* Campos */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 200 }}>
                            <label style={{ display: 'block', color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Valor que entra na meta *</label>
                            <input type="number" step="0.01" value={metaForm.valor}
                              onChange={ev => setMetaForm(f => ({ ...f, valor: ev.target.value }))}
                              style={{ width: '100%', background: '#1a2332', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', fontWeight: 700 }}
                              placeholder="Ex: 4398.00" autoFocus />
                            {/* Atalhos */}
                            <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                              {[
                                { label: 'Sugerido', val: meta?.valorMeta },
                                { label: 'Bruto',    val: meta?.valorBruto },
                                { label: 'Consid.',  val: meta?.valorConsid },
                              ].filter(o => o.val > 0).filter((o,i,a) => a.findIndex(x=>x.val===o.val)===i).map(o => (
                                <button key={o.label} onClick={() => setMetaForm(f => ({ ...f, valor: o.val }))}
                                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 5, padding: '2px 8px', color: '#34d399', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit', fontWeight: 600 }}>
                                  {o.label}: {fmt(o.val)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ minWidth: 200 }}>
                            <label style={{ display: 'block', color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Regra</label>
                            <select value={metaForm.regra} onChange={ev => setMetaForm(f => ({ ...f, regra: ev.target.value }))}
                              style={{ width: '100%', background: '#1a2332', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, padding: '8px 12px', color: '#e8eaf0', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>
                              <option value="beneficio">✅ 1ª Recarga (Benefícios/Bônus)</option>
                              <option value="convenio">📅 3º Mês (Convênio/Mobilidade)</option>
                              <option value="manual">✏️ Inclusão Manual</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={salvarMetaInline} disabled={salvandoMeta || !metaForm.valor}
                              style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', fontFamily: 'inherit', opacity: !metaForm.valor ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                              {salvandoMeta ? 'Salvando...' : temMetaGravada ? '💾 Atualizar' : '🎯 Confirmar'}
                            </button>
                            {temMetaGravada && (
                              <button onClick={() => { removerMetaInline(e); setModalMeta(null); }}
                                style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 16px', color: '#f87171', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                🗑 Remover
                              </button>
                            )}
                            <a href={`/gestao/${e.id}`} target="_blank"
                              style={{ color: '#6b7280', fontSize: '0.72rem', textDecoration: 'none', whiteSpace: 'nowrap' }}
                              onMouseEnter={ev => ev.currentTarget.style.color='#34d399'}
                              onMouseLeave={ev => ev.currentTarget.style.color='#6b7280'}>
                              ↗ Abrir ficha completa
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)', background: 'rgba(240,180,41,0.05)' }}>
              <td colSpan={
                1 +
                (col('categoria')?1:0) +
                (col('produto')?1:0) +
                (col('vendedor')?1:0) +
                (col('gestor')?1:0) +
                (col('diretor')?1:0)
              } style={{ ...s.td, fontWeight: 700, color: '#f0b429', fontSize: '0.82rem', paddingTop: 14 }}>
                TOTAL ({lista.length} empresas)
              </td>
              {col('meses') && totaisMes.map((t, i) => (
                <td key={i} style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#f0b429', paddingTop: 14 }}>
                  {t > 0 ? fmt(t) : <span style={{ color: '#374151' }}>—</span>}
                </td>
              ))}
              {col('total') && <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#f0b429', paddingTop: 14 }}>{fmt(totalGeral)}</td>}
              {(col('status') || col('tendencia')) && <td colSpan={(col('status')?1:0)+(col('tendencia')?1:0)} style={{ ...s.td, paddingTop: 14 }} />}
              {col('meta') && (
                <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: '#34d399', paddingTop: 14, borderLeft: '2px solid rgba(52,211,153,0.1)' }}>
                  {totalMetaApurado > 0 ? fmt(totalMetaApurado) : '—'}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      {totalPaginas > 1 && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}><Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} /></div>}
    </>
  );
}

function TabelaCruzamento({ lista, meses }) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [lista.length]);
  const listaSorted  = [...lista].filter(e => e.potencial_movimentacao > 0).sort((a, b) => (b.pctPot || 0) - (a.pctPot || 0));
  const totalPaginas = Math.ceil(listaSorted.length / POR_PAGINA);
  const listaPagina  = listaSorted.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totPot  = listaSorted.reduce((s, e) => s + (e.potencial_movimentacao || 0), 0);
  const totEsp  = listaSorted.reduce((s, e) => s + ((e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * meses.length), 0);
  const totCred = listaSorted.reduce((s, e) => s + e.totalCreditado, 0);
  const pctGeral = totEsp > 0 ? (totCred / totEsp) * 100 : 0;
  const corGeral = pctGeral >= 80 ? '#16a34a' : pctGeral >= 40 ? '#f0b429' : '#dc2626';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}><strong style={{ color: '#e8eaf0' }}>{listaSorted.length}</strong> empresas com potencial cadastrado</div>
        <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>{['Empresa','Cat.','Vendedor','Gestor','Diretor','Potencial/mês','Esperado Total','Movimentado Total','% Realizado','Barra','Status'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {listaPagina.map((e, i) => {
              const pct = e.pctPot || 0;
              const cor = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f0b429' : '#dc2626';
              const stLabel = pct >= 80 ? '✅ Atingindo' : pct >= 40 ? '⚡ Parcial' : e.totalCreditado === 0 ? '❌ Sem crédito' : '⚠️ Abaixo';
              return (
                <tr key={e._key} style={i % 2 === 0 ? { background: 'rgba(255,255,255,0.02)' } : {}}>
                  <td style={s.td}>
                    <a href={`/gestao/${e.id}`} style={{ fontWeight: 600, color: '#e8eaf0', textDecoration: 'none', cursor: 'pointer' }}
                      onMouseEnter={ev => ev.currentTarget.style.color='#34d399'}
                      onMouseLeave={ev => ev.currentTarget.style.color='#e8eaf0'}>
                      {e.nome}
                    </a>
                    <div style={{ color: '#4b5563', fontSize: '0.7rem' }}>ID {e.produto_id}</div>
                  </td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.categoria}</td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {e.vendedor}
                      {e._pct < 100 && <span style={{ background: 'rgba(240,180,41,0.12)', color: '#f0b429', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>{e._pct}%</span>}
                    </div>
                  </td>
                  <td style={{ ...s.td, color: '#9ca3af', fontSize: '0.78rem' }}>{e.gestor}</td>
                  <td style={{ ...s.td, color: '#a78bfa', fontSize: '0.78rem' }}>{e.diretor}</td>
                  <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                  <td style={{ ...s.td, color: '#f0b429' }}>{fmt((e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * meses.length)}</td>
                  <td style={{ ...s.td, color: '#34d399', fontWeight: 600 }}>{fmt(e.totalCreditado)}</td>
                  <td style={{ ...s.td, color: cor, fontWeight: 700 }}>{fmtPct(pct)}</td>
                  <td style={{ ...s.td, minWidth: 100 }}>
                    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ background: cor, height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4 }} />
                    </div>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>{stLabel}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(255,255,255,0.12)', background: 'rgba(240,180,41,0.05)' }}>
              <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: '#f0b429', fontSize: '0.82rem', paddingTop: 14 }}>TOTAL ({listaSorted.length} empresas)</td>
              <td style={{ ...s.td, fontWeight: 700, color: '#f0b429', paddingTop: 14 }}>{fmt(totPot)}</td>
              <td style={{ ...s.td, color: '#f0b429', fontWeight: 700, paddingTop: 14 }}>{fmt(totEsp)}</td>
              <td style={{ ...s.td, color: '#34d399', fontWeight: 700, paddingTop: 14 }}>{fmt(totCred)}</td>
              <td style={{ ...s.td, fontWeight: 700, color: corGeral, paddingTop: 14 }}>{fmtPct(pctGeral)}</td>
              <td colSpan={2} style={{ ...s.td, paddingTop: 14 }} />
            </tr>
          </tfoot>
        </table>
      </div>
      {totalPaginas > 1 && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}><Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} /></div>}
    </>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Evolucao() {
  const [loading, setLoading]   = useState(true);
  const [xlsxLib, setXlsxLib]   = useState(null);
  const [ajustes, setAjustes]   = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [libs, setLibs]         = useState([]);
  const [libsTodas, setLibsTodas] = useState([]); // todas as libs sem filtro de mês
  const [meses, setMeses]       = useState([]);
  const [aba, setAba]           = useState('evolucao');

  const [busca, setBusca]                     = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todos');
  const [filtroDiretor, setFiltroDiretor]     = useState('todos');
  const [filtroGestor, setFiltroGestor]       = useState('todos');
  const [filtroDepto, setFiltroDepto]         = useState('todos');
  const [filtroVendedor, setFiltroVendedor]   = useState('todos');
  const [filtroProduto, setFiltroProduto]     = useState('todos');
  const [filtroStatus, setFiltroStatus]       = useState('todos');
  const [filtroTend, setFiltroTend]           = useState('todos');
  const [filtroMeta, setFiltroMeta]           = useState('todos'); // filtro por status de meta
  const [filtroMesMeta, setFiltroMesMeta]     = useState('todos'); // NOVO: filtro por mês da meta
  const [ordenar, setOrdenar]                 = useState('ultimo');
  const [porPagina, setPorPagina]             = useState(12);

  // ── Modal de meta inline ──────────────────────────────────────────────────
  const [modalMeta, setModalMeta]     = useState(null); // { empresa, meta } ou null
  const [metaForm, setMetaForm]       = useState({ valor: '', regra: 'beneficio' });
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [erroMeta, setErroMeta]       = useState('');
  // Mapa de metas gravadas: empresa_id__consultor_id → valor_meta
  const [metasGravadas, setMetasGravadas] = useState({}); // NOVO: itens por página

  // ── Configuração de colunas ──────────────────────────────────────────────
  const COLUNAS_DEF = [
    { key:'categoria',  label:'Categoria',    grupo:'Identificação' },
    { key:'produto',    label:'Produto',      grupo:'Identificação' },
    { key:'vendedor',   label:'Vendedor',     grupo:'Comercial'     },
    { key:'gestor',     label:'Gestor',       grupo:'Comercial'     },
    { key:'diretor',    label:'Diretor',      grupo:'Comercial'     },
    { key:'meses',      label:'Meses (mov.)', grupo:'Movimentação'  },
    { key:'total',      label:'Total Mov.',   grupo:'Movimentação'  },
    { key:'status',     label:'Status',       grupo:'Movimentação'  },
    { key:'tendencia',  label:'Tendência',    grupo:'Movimentação'  },
    { key:'meta',       label:'🎯 Meta',      grupo:'Meta'          },
  ];
  const PRESETS = {
    padrao:  ['categoria','produto','vendedor','gestor','meses','total','status','meta'],
    minimo:  ['produto','vendedor','meses','total','meta'],
    todas:   COLUNAS_DEF.map(c=>c.key),
  };
  const [colunasVisiveis, setColunasVisiveis] = useState(new Set(PRESETS.padrao));
  const [painelColunas,   setPainelColunas]   = useState(false);

  useEffect(() => { carregar(); }, []);
  useEffect(() => { import('xlsx').then(m => setXlsxLib(m.default || m)); }, []);
  useEffect(() => { setFiltroGestor('todos'); setFiltroVendedor('todos'); }, [filtroDiretor]);
  useEffect(() => { setFiltroVendedor('todos'); }, [filtroGestor]);

  async function carregar() {
    setLoading(true);
    const [{ data: emps }, { data: libsData }, { data: ajustesData }, { data: libsTodasData }] = await Promise.all([
      supabase
        .from('empresas')
        .select(`id, produto_id, nome, categoria, produto_contratado, potencial_movimentacao, peso_categoria,
          pct_principal, pct_agregado_1, pct_agregado_2,
          consultor_principal:consultor_principal_id (id, nome, setor, equipe, gestor, tipo),
          consultor_agregado:consultor_agregado_id (id, nome, setor, equipe, gestor),
          consultor_agregado_2:consultor_agregado_2_id (id, nome, setor, equipe, gestor)`)
        .eq('ativo', true)
        .in('categoria', ['Beneficios', 'Benefícios', 'Bonus', 'Bônus', 'Convênio', 'Convenio', 'Mobilidade'])
        .not('produto_contratado', 'ilike', '%desconto condicional%')
        .not('categoria', 'eq', 'Taxa Negativa'),
      supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia'),
      supabase.from('ajustes_movimentacao').select('empresa_id, competencia, valor_considerado').order('competencia'),
      // NOVO: todas as liberações para calcular sequência de meta
      supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia'),
    ]);
    setMeses([...new Set((libsData || []).map(l => l.competencia))].sort());
    setEmpresas(emps || []);
    setLibs(libsData || []);
    setAjustes(ajustesData || []);
    setLibsTodas(libsTodasData || []);

    // Carrega metas gravadas para o mapa local
    const { data: vmetas } = await supabase
      .from('valor_meta_empresa')
      .select('empresa_id,consultor_id,competencia_meta,valor_meta,regra');
    if (vmetas) {
      const map = {};
      for (const v of vmetas) {
        // Normaliza: pega só os primeiros 10 chars (YYYY-MM-DD) da competencia_meta
        const comp = v.competencia_meta ? String(v.competencia_meta).substring(0,10) : null;
        if (!comp) continue;
        const key = `${v.empresa_id}__${comp}`;
        map[key] = { valor_meta: v.valor_meta, regra: v.regra, competencia_meta: comp };
      }
      setMetasGravadas(map);
    }

    setLoading(false);
  }

  // ── Funções do modal de meta inline ─────────────────────────────────────
  function abrirModalMeta(empresa) {
    const meta = empresa._meta;
    const valorSugerido = meta?.elegivel ? meta.valorMeta : (meta?.valorConsid || 0);
    const chave = `${empresa.id}__${meta?.mesAlvo?.substring(0,10)}`;
    setMetaForm({
      valor: metasGravadas[chave]?.valor_meta ?? valorSugerido,
      regra: metasGravadas[chave]?.regra ?? meta?.regra ?? 'beneficio',
    });
    setErroMeta('');
    setModalMeta(empresa);
  }

  async function salvarMetaInline() {
    if (!modalMeta || !metaForm.valor) return;
    setSalvandoMeta(true);
    setErroMeta('');
    const e   = modalMeta;
    const comp = e._meta?.mesAlvo || null;
    if (!comp) { setErroMeta('Mês da meta não identificado'); setSalvandoMeta(false); return; }

    // Delete → Insert para garantir funcionamento sem constraint única
    await supabase.from('valor_meta_empresa')
      .delete().eq('empresa_id', e.id).eq('competencia_meta', comp);

    const { error } = await supabase.from('valor_meta_empresa').insert({
      empresa_id:        e.id,
      produto_id:        e.produto_id,
      consultor_id:      e._cons?.id || null,
      competencia_meta:  comp,
      valor_bruto:       e._meta?.valorBruto || 0,
      valor_considerado: e._meta?.valorConsid || 0,
      valor_meta:        parseFloat(metaForm.valor),
      pct_consultor:     e._pct ?? 100,
      regra:             metaForm.regra,
      mes_sequencia:     metaForm.regra === 'beneficio' ? 1 : metaForm.regra === 'convenio' ? 3 : 0,
    });

    if (error) {
      setErroMeta('Erro: ' + error.message);
    } else {
      // Atualiza o mapa local de metas gravadas sem recarregar a página
      const metaKey = `${e.id}__${comp}`;
      setMetasGravadas(prev => ({
        ...prev,
        [metaKey]: { valor_meta: parseFloat(metaForm.valor), regra: metaForm.regra, competencia_meta: comp },
      }));
      setModalMeta(null);
    }
    setSalvandoMeta(false);
  }

  async function removerMetaInline(empresa) {
    if (!confirm('Remover da meta?')) return;
    const comp = empresa._meta?.mesAlvo;
    if (!comp) return;
    await supabase.from('valor_meta_empresa')
      .delete().eq('empresa_id', empresa.id).eq('competencia_meta', comp);
    const delKey = `${empresa.id}__${comp?.substring(0,10)}`;
    setMetasGravadas(prev => {
      const next = { ...prev };
      delete next[delKey];
      return next;
    });
  }

  const libMap = useMemo(() => {
    const m = {};
    for (const l of libs) { const k = `${l.produto_id}__${l.competencia}`; m[k] = (m[k] || 0) + l.total_liberado; }
    return m;
  }, [libs]);

  const ajusteMap = useMemo(() => {
    const m = {};
    for (const a of ajustes) {
      const comp = a.competencia?.substring(0, 10);
      m[`${a.empresa_id}__${comp}`] = a.valor_considerado;
    }
    return m;
  }, [ajustes]);

  // NOVO: libsTodasMap para cálculo de meta
  const libsTodasMap = useMemo(() => {
    const m = {};
    for (const l of libsTodas) {
      const pid = l.produto_id;
      if (!m[pid]) m[pid] = [];
      m[pid].push({ comp: l.competencia?.substring(0, 10), val: l.total_liberado || 0 });
    }
    return m;
  }, [libsTodas]);

  const listaCompleta = useMemo(() => {
    const baseEmpresas = empresas
      .filter(e => !e.produto_contratado?.toLowerCase().includes('desconto condicional') && e.categoria !== 'Taxa Negativa');

    const expanded = [];
    for (const e of baseEmpresas) {
      const valsBase = meses.map(m => {
        const comp    = m?.substring(0, 10);
        const ajustado = ajusteMap[`${e.id}__${comp}`];
        return ajustado !== undefined ? ajustado : (libMap[`${e.produto_id}__${m}`] || 0);
      });
      const totalBase = valsBase.reduce((s, v) => s + v, 0);
      const tend = tendencia(valsBase);

      const pctP  = e.pct_principal  ?? 100;
      const pctA1 = e.pct_agregado_1 ?? 0;
      const pctA2 = e.pct_agregado_2 ?? 0;

      const consultores = [
        e.consultor_principal  ? { cons: e.consultor_principal,  pct: pctP  } : null,
        e.consultor_agregado   && pctA1 > 0 ? { cons: e.consultor_agregado,   pct: pctA1 } : null,
        e.consultor_agregado_2 && pctA2 > 0 ? { cons: e.consultor_agregado_2, pct: pctA2 } : null,
      ].filter(Boolean);

      for (const { cons, pct } of consultores) {
        const fator = pct / 100;
        const vals  = valsBase.map(v => Math.round(v * fator * 100) / 100);
        const totalCreditado = vals.reduce((s, v) => s + v, 0);

        // NOVO: calcula meta para este par empresa/consultor
        const metaInfo = calcularMeta(e, libsTodasMap, ajusteMap, pct);

        expanded.push({
          ...e,
          _key:   `${e.id}__${cons.id}`,
          _meta:  metaInfo,   // ← objeto com info de meta
          vals, totalCreditado, tend,
          creditou:    totalCreditado > 0,
          pctPot:      e.potencial_movimentacao > 0 ? (totalCreditado / (e.potencial_movimentacao * (e.peso_categoria||1) * meses.length * fator)) * 100 : null,
          ultimoValor: vals[vals.length - 1] || 0,
          depto:       cons.equipe || cons.setor || '—',
          gestor:      cons.gestor || '—',
          diretor:     cons.gestor || '—',
          vendedor:    cons.nome   || '—',
          produto:     e.produto_contratado || '—',
          _pct:        pct,
          _valsBase:   valsBase,
          _totalBase:  totalBase,
        });
      }
    }
    return expanded;
  }, [empresas, meses, libMap, ajusteMap, libsTodasMap]);

  const opcoes = useMemo(() => {
    const categorias = [...new Set(listaCompleta.map(e => e.categoria).filter(Boolean))].sort();
    const diretores  = [...new Set(listaCompleta.map(e => e.diretor).filter(v => v !== '—'))].sort();
    const deptos     = [...new Set(listaCompleta.map(e => e.depto).filter(v => v !== '—'))].sort();
    const produtos   = [...new Set(listaCompleta.map(e => e.produto).filter(v => v !== '—'))].sort();
    const baseGest   = filtroDiretor === 'todos' ? listaCompleta : listaCompleta.filter(e => e.diretor === filtroDiretor);
    const gestores   = [...new Set(baseGest.map(e => e.gestor).filter(v => v !== '—'))].sort();
    const baseVend   = filtroGestor === 'todos' ? baseGest : baseGest.filter(e => e.gestor === filtroGestor);
    const vendedores = [...new Set(baseVend.map(e => e.vendedor).filter(v => v !== '—'))].sort();
    return { categorias, diretores, deptos, gestores, vendedores, produtos };
  }, [listaCompleta, filtroDiretor, filtroGestor]);

  const listaFiltrada = useMemo(() => {
    let arr = [...listaCompleta];
    if (busca.trim())            { const b = norm(busca); arr = arr.filter(e => norm(e.nome).includes(b) || String(e.produto_id).includes(b)); }
    if (filtroCategoria !== 'todos') arr = arr.filter(e => e.categoria === filtroCategoria);
    if (filtroDiretor   !== 'todos') arr = arr.filter(e => e.diretor   === filtroDiretor);
    if (filtroGestor    !== 'todos') arr = arr.filter(e => e.gestor    === filtroGestor);
    if (filtroDepto     !== 'todos') arr = arr.filter(e => e.depto     === filtroDepto);
    if (filtroVendedor  !== 'todos') arr = arr.filter(e => e.vendedor  === filtroVendedor);
    if (filtroProduto   !== 'todos') arr = arr.filter(e => e.produto   === filtroProduto);
    if (filtroStatus === 'creditou')    arr = arr.filter(e =>  e.creditou);
    if (filtroStatus === 'sem_credito') arr = arr.filter(e => !e.creditou);
    if (filtroTend !== 'todos') arr = arr.filter(e => e.tend === filtroTend);
    // NOVO: filtro por status de meta
    if (filtroMeta === 'na_meta')   arr = arr.filter(e => e._meta?.elegivel === true);
    if (filtroMeta === 'pendente')  arr = arr.filter(e => e._meta?.elegivel === false && e._meta?.regra !== null);
    if (filtroMeta === 'fora')      arr = arr.filter(e => !e._meta || e._meta?.regra === null);
    // NOVO: filtro por mês específico da meta
    if (filtroMesMeta !== 'todos')  arr = arr.filter(e => e._meta?.elegivel && e._meta?.mesAlvo?.substring(0,7) === filtroMesMeta);
    if (ordenar === 'ultimo')    arr.sort((a, b) => b.ultimoValor - a.ultimoValor);
    if (ordenar === 'total')     arr.sort((a, b) => b.totalCreditado - a.totalCreditado);
    if (ordenar === 'nome')      arr.sort((a, b) => a.nome.localeCompare(b.nome));
    if (ordenar === 'potencial') arr.sort((a, b) => (b.potencial_movimentacao || 0) - (a.potencial_movimentacao || 0));
    if (ordenar === 'sem')       arr.sort((a, b) => Number(a.creditou) - Number(b.creditou));
    if (ordenar === 'meta')      arr.sort((a, b) => (b._meta?.valorMeta || 0) - (a._meta?.valorMeta || 0));
    return arr;
  }, [listaCompleta, busca, filtroCategoria, filtroDiretor, filtroGestor, filtroDepto, filtroVendedor, filtroProduto, filtroStatus, filtroTend, filtroMeta, filtroMesMeta, ordenar]);

  const kpis = useMemo(() => {
    const total       = listaFiltrada.length;
    const creditaram  = listaFiltrada.filter(e => e.creditou).length;
    const semCredito  = total - creditaram;
    const totalCred   = listaFiltrada.reduce((s, e) => s + e.totalCreditado, 0);
    const crescendo   = listaFiltrada.filter(e => e.tend === 'up').length;
    const pctAtivacao = total > 0 ? (creditaram / total) * 100 : 0;
    // KPIs de meta — usa valor do banco (metasGravadas) quando disponível, senão o calculado
    const naMeta      = listaFiltrada.filter(e => {
      const chave = `${e.id}__${e._meta?.mesAlvo?.substring(0,10)}`;
      return metasGravadas[chave] || e._meta?.elegivel;
    }).length;
    const pendenteMeta = listaFiltrada.filter(e => e._meta?.elegivel === false && e._meta?.regra !== null).length;
    const totalMetaApurado = listaFiltrada.reduce((s, e) => {
      const chave = `${e.id}__${e._meta?.mesAlvo?.substring(0,10)}`;
      const gravado = metasGravadas[chave];
      // Prioriza valor gravado no banco; senão usa o calculado
      const valor = gravado?.valor_meta ?? (e._meta?.elegivel ? e._meta.valorMeta : 0);
      return s + (valor || 0);
    }, 0);
    const porMes = meses.map(m => ({
      mes: m,
      total:    listaFiltrada.reduce((s, e) => { const mi=meses.indexOf(m); return s+(e.vals?.[mi]??(libMap[`${e.produto_id}__${m}`]||0)); }, 0),
      empresas: listaFiltrada.filter(e => { const mi=meses.indexOf(m); return (e.vals?.[mi]??(libMap[`${e.produto_id}__${m}`]||0))>0; }).length,
    }));
    return { total, creditaram, semCredito, totalCred, crescendo, pctAtivacao, porMes, naMeta, pendenteMeta, totalMetaApurado };
  }, [listaFiltrada, meses, libMap, metasGravadas]);

  function limparFiltros() {
    setBusca(''); setFiltroCategoria('todos'); setFiltroDiretor('todos');
    setFiltroGestor('todos'); setFiltroDepto('todos'); setFiltroVendedor('todos');
    setFiltroProduto('todos'); setFiltroStatus('todos'); setFiltroTend('todos');
    setFiltroMeta('todos'); setFiltroMesMeta('todos'); setOrdenar('ultimo');
  }

  const filtrosAtivos = { diretor: filtroDiretor, gestor: filtroGestor, depto: filtroDepto, vendedor: filtroVendedor, categoria: filtroCategoria, produto: filtroProduto, status: filtroStatus, tend: filtroTend, metaStatus: filtroMeta, mesMeta: filtroMesMeta, busca };
  const temFiltro = filtroDiretor !== 'todos' || filtroGestor !== 'todos' || filtroDepto !== 'todos' ||
    filtroVendedor !== 'todos' || filtroCategoria !== 'todos' || filtroProduto !== 'todos' ||
    filtroStatus !== 'todos' || filtroTend !== 'todos' || filtroMeta !== 'todos' ||
    filtroMesMeta !== 'todos' || busca.trim();

  function exportarExcel() {
    if (!xlsxLib) return;
    const headers = ['ID', 'Empresa', 'Categoria', 'Produto', 'Vendedor', 'Gestor', 'Diretor'];
    meses.forEach(m => headers.push(fmtMes(m)));
    headers.push('Total Movimentado', 'Status', 'Meta Regra', 'Meta Mês', 'Meta Valor');

    const rows = listaFiltrada.map(e => {
      const row = [e.produto_id, e.nome, e.categoria, e.produto, e._pct < 100 ? `${e.vendedor} (${e._pct}%)` : e.vendedor, e.gestor, e.diretor];
      let total = 0;
      meses.forEach(m => {
        const mi2 = meses.indexOf(m);
        const v   = e.vals?.[mi2] ?? (libMap[`${e.produto_id}__${m}`] || 0);
        total += v;
        row.push(v > 0 ? v : 0);
      });
      row.push(total);
      row.push(e.creditou ? 'Movimentou' : 'Sem movimentação');
      // Meta no Excel
      row.push(e._meta?.elegivel ? (e._meta.regra === 'beneficio' ? '1ª Recarga' : '3º Mês Conv.') : e._meta?.regra ? 'Pendente' : '—');
      row.push(e._meta?.elegivel ? fmtMes(e._meta.mesAlvo) : '—');
      row.push(e._meta?.elegivel ? e._meta.valorMeta : 0);
      return row;
    });

    const totRow = ['', 'TOTAL', '', '', '', '', ''];
    meses.forEach(m => {
      const t = listaFiltrada.reduce((s, e) => s+(libMap[`${e.produto_id}__${m}`]||0), 0);
      totRow.push(t);
    });
    totRow.push(listaFiltrada.reduce((s,e)=>s+e.totalCreditado,0), '', '', '', listaFiltrada.filter(e=>e._meta?.elegivel).reduce((s,e)=>s+(e._meta?.valorMeta||0),0));
    rows.push(totRow);

    const ws = xlsxLib.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((_, i) => ({ wch: i < 7 ? 20 : 16 }));
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'Evolução');
    xlsxLib.writeFile(wb, `evolucao-novas-empresas-${new Date().toISOString().substring(0,10)}.xlsx`);
  }

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><div style={s.spin}></div><div style={{ color: '#6b7280' }}>Carregando...</div></div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const abas = [
    { key: 'evolucao',   label: '📈 Evolução por Empresa' },
    { key: 'resumo',     label: '🔢 Resumo por Mês' },
    { key: 'cruzamento', label: '🎯 Potencial vs Creditado' },
  ];

  return (
    <div style={s.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        select option { background: #1e2435 !important; color: #e8eaf0 !important; }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>♠ Vegas Card</div>
          <h1 style={s.title}>Evolução de Novas Empresas</h1>
          <p style={s.sub}>Todas as categorias — acompanhe quem movimentou e quem ainda não movimentou</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={exportarExcel} disabled={!xlsxLib || listaFiltrada.length===0}
            style={{ ...s.linkBtnGreen, background:'rgba(52,211,153,0.08)', borderColor:'rgba(52,211,153,0.2)', color:'#34d399', cursor:'pointer', border:'1px solid rgba(52,211,153,0.2)', fontFamily:'inherit', opacity:(!xlsxLib||listaFiltrada.length===0)?0.5:1 }}>
            📥 Exportar Excel ({listaFiltrada.length})
          </button>
          <a href="/importar-movimentacao" style={s.linkBtnGreen}>📊 Importar Movimentação</a>
          <a href="/importar-liberacoes" style={{ ...s.linkBtnGreen, color:'#60a5fa', borderColor:'rgba(96,165,250,0.2)', background:'rgba(96,165,250,0.08)' }}>💳 Importar Liberações</a>
        </div>
      </div>

      {temFiltro && <BannerFiltros filtros={filtrosAtivos} onLimpar={limparFiltros} />}

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}>
          <span style={s.kpiLabel}>Total Empresas</span>
          <span style={s.kpiVal}>{kpis.total}</span>
          <span style={s.kpiSub}>Todas as categorias</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(22,163,74,0.35)' }}>
          <span style={s.kpiLabel}>Movimentaram</span>
          <span style={{ ...s.kpiVal, color: '#16a34a' }}>{kpis.creditaram}</span>
          <span style={s.kpiSub}>{fmtPct(kpis.pctAtivacao)} de ativação</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(220,38,38,0.35)' }}>
          <span style={s.kpiLabel}>Sem Movimentação</span>
          <span style={{ ...s.kpiVal, color: '#dc2626' }}>{kpis.semCredito}</span>
          <span style={s.kpiSub}>ainda não movimentaram</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.35)' }}>
          <span style={s.kpiLabel}>Total Movimentado</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{fmt(kpis.totalCred)}</span>
          <span style={s.kpiSub}>{meses.length} meses · todas as categorias</span>
        </div>
        {/* NOVOS KPIs de meta */}
        <div style={{ ...s.kpi, borderColor: 'rgba(52,211,153,0.35)', cursor: 'pointer' }} onClick={() => { setFiltroMeta('na_meta'); setAba('evolucao'); }}>
          <span style={s.kpiLabel}>✅ Na Meta</span>
          <span style={{ ...s.kpiVal, color: '#34d399' }}>{kpis.naMeta}</span>
          <span style={{ ...s.kpiSub, color: '#34d399' }}>{fmt(kpis.totalMetaApurado)}</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'rgba(240,180,41,0.35)', cursor: 'pointer' }} onClick={() => { setFiltroMeta('pendente'); setAba('evolucao'); }}>
          <span style={s.kpiLabel}>⏳ Pendente Meta</span>
          <span style={{ ...s.kpiVal, color: '#f0b429' }}>{kpis.pendenteMeta}</span>
          <span style={s.kpiSub}>aguardando elegibilidade</span>
        </div>
      </div>

      {/* Abas */}
      <div style={s.tabs}>
        {abas.map(a => (
          <button key={a.key} style={{ ...s.tab, ...(aba === a.key ? s.tabAtiva : {}) }} onClick={() => setAba(a.key)}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ═══ ABA: EVOLUÇÃO ═══ */}
      {aba === 'evolucao' && (
        <div style={s.card}>
          {/* Linha 1 de filtros */}
          <div style={s.filtroRow}>
            <input style={s.busca} placeholder="🔍 Buscar empresa ou ID..." value={busca} onChange={e => setBusca(e.target.value)} />
            <select style={s.sel} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todas as empresas</option>
              <option value="creditou">✅ Creditaram</option>
              <option value="sem_credito">❌ Sem crédito</option>
            </select>
            <select style={s.sel} value={filtroTend} onChange={e => setFiltroTend(e.target.value)}>
              <option value="todos">Todas as tendências</option>
              <option value="up">↑ Crescendo</option>
              <option value="down">↓ Caindo</option>
              <option value="flat">→ Estável</option>
              <option value="new">✦ Nova</option>
              <option value="none">— Sem crédito</option>
            </select>
            <select style={s.sel} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="todos">Todas as categorias</option>
              {opcoes.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroProduto !== 'todos' ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)', color: filtroProduto !== 'todos' ? '#a78bfa' : '#e8eaf0' }}
              value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
              <option value="todos">Todos os produtos</option>
              {opcoes.produtos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {/* NOVO: filtro por meta */}
            <select style={{ ...s.sel, borderColor: filtroMeta !== 'todos' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.12)', color: filtroMeta !== 'todos' ? '#34d399' : '#e8eaf0' }}
              value={filtroMeta} onChange={e => setFiltroMeta(e.target.value)}>
              <option value="todos">🎯 Todas (meta)</option>
              <option value="na_meta">✅ Na meta</option>
              <option value="pendente">⏳ Pendente meta</option>
              <option value="fora">— Fora da meta</option>
            </select>
          </div>
          {/* Linha 2: hierarquia + ordenar */}
          <div style={s.filtroRow}>
            <select style={{ ...s.sel, borderColor: 'rgba(167,139,250,0.4)', color: filtroDiretor !== 'todos' ? '#a78bfa' : '#e8eaf0' }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
              <option value="todos">Todos os diretores</option>
              {opcoes.diretores.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroGestor !== 'todos' ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.12)', color: filtroGestor !== 'todos' ? '#60a5fa' : '#e8eaf0' }} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">{filtroDiretor === 'todos' ? 'Todos os gestores' : `Gestores de ${filtroDiretor}`}</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroDepto !== 'todos' ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.12)', color: filtroDepto !== 'todos' ? '#f97316' : '#e8eaf0' }} value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
              <option value="todos">Todas as equipes</option>
              {opcoes.deptos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroVendedor !== 'todos' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.12)', color: filtroVendedor !== 'todos' ? '#34d399' : '#e8eaf0' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="todos">{filtroGestor === 'todos' ? 'Todos os vendedores' : `Vendedores de ${filtroGestor}`}</option>
              {opcoes.vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select style={s.sel} value={ordenar} onChange={e => setOrdenar(e.target.value)}>
              <option value="ultimo">Ordenar: Último mês</option>
              <option value="total">Ordenar: Total movimentado</option>
              <option value="meta">Ordenar: Maior meta apurada</option>
              <option value="potencial">Ordenar: Potencial</option>
              <option value="sem">Ordenar: Sem crédito primeiro</option>
              <option value="nome">Ordenar: Nome A-Z</option>
            </select>
          </div>

          {/* ── NOVO: Linha 3 — Filtro mês da meta + Seletor de colunas ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {/* Filtro por mês da meta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>🎯 Mês da meta:</span>
              <button
                style={{ ...s.sel, padding: '6px 12px', fontSize: '0.78rem', borderColor: filtroMesMeta === 'todos' ? 'rgba(52,211,153,0.3)' : 'rgba(52,211,153,0.6)', color: '#34d399', background: filtroMesMeta === 'todos' ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.15)', fontWeight: filtroMesMeta === 'todos' ? 500 : 700, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => setFiltroMesMeta('todos')}>
                Todos
              </button>
              {/* Extrai meses únicos de meta da lista completa */}
              {[...new Set(listaCompleta.filter(e => e._meta?.elegivel).map(e => e._meta.mesAlvo?.substring(0,7)).filter(Boolean))].sort().map(m => {
                const totalMes = listaCompleta.filter(e => e._meta?.elegivel && e._meta.mesAlvo?.substring(0,7) === m).reduce((s,e) => s+(e._meta?.valorMeta||0),0);
                const qtd      = listaCompleta.filter(e => e._meta?.elegivel && e._meta.mesAlvo?.substring(0,7) === m).length;
                const ativo    = filtroMesMeta === m;
                return (
                  <button key={m}
                    onClick={() => setFiltroMesMeta(ativo ? 'todos' : m)}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1, background: ativo ? 'rgba(52,211,153,0.18)' : 'rgba(52,211,153,0.05)', border: `1px solid ${ativo ? 'rgba(52,211,153,0.5)' : 'rgba(52,211,153,0.2)'}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ color: ativo ? '#34d399' : '#6b7280', fontWeight: ativo ? 700 : 500, fontSize: '0.78rem' }}>{fmtMes(m+'-01')}</span>
                    <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.7rem' }}>{fmt(totalMes)}</span>
                    <span style={{ color: '#4b5563', fontSize: '0.62rem' }}>{qtd} emp.</span>
                  </button>
                );
              })}
            </div>

            {/* Seletor de colunas + por página */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

              {/* Por página */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#6b7280', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Por página:</span>
                {[12, 24, 50, 100].map(n => (
                  <button key={n} onClick={() => setPorPagina(n)}
                    style={{ background: porPagina === n ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${porPagina === n ? 'rgba(240,180,41,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '5px 10px', color: porPagina === n ? '#f0b429' : '#6b7280', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: porPagina === n ? 700 : 400 }}>
                    {n}
                  </button>
                ))}
              </div>

              {/* Seletor de colunas */}
              <div style={{ position: 'relative' }}>
              <button onClick={() => setPainelColunas(p => !p)}
                style={{ background: painelColunas ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${painelColunas ? 'rgba(240,180,41,0.4)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, padding: '7px 14px', color: painelColunas ? '#f0b429' : '#9ca3af', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚙️ Colunas selecionadas: {colunasVisiveis.size} de {COLUNAS_DEF.length}
                <span style={{ fontSize: '0.65rem' }}>{painelColunas ? '▲' : '▼'}</span>
              </button>

              {painelColunas && (
                <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 100, background: '#161a26', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 16, minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                  {/* Presets */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                    {[['padrao','Padrão'],['minimo','Mínimo'],['todas','Todas']].map(([key,label]) => (
                      <button key={key} onClick={() => setColunasVisiveis(new Set(PRESETS[key]))}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 12px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600 }}>
                        {label}
                      </button>
                    ))}
                    <span style={{ color: '#4b5563', fontSize: '0.7rem', marginLeft: 4, display: 'flex', alignItems: 'center' }}>ou escolha:</span>
                  </div>
                  {/* Checkboxes por grupo */}
                  {['Identificação','Comercial','Movimentação','Meta'].map(grupo => {
                    const cols = COLUNAS_DEF.filter(c => c.grupo === grupo);
                    return (
                      <div key={grupo} style={{ marginBottom: 10 }}>
                        <div style={{ color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>{grupo}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {cols.map(col => {
                            const ativo = colunasVisiveis.has(col.key);
                            return (
                              <button key={col.key}
                                onClick={() => {
                                  const next = new Set(colunasVisiveis);
                                  if (ativo) next.delete(col.key); else next.add(col.key);
                                  setColunasVisiveis(next);
                                }}
                                style={{ background: ativo ? 'rgba(240,180,41,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ativo ? 'rgba(240,180,41,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: '4px 10px', color: ativo ? '#f0b429' : '#6b7280', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: ativo ? 700 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {ativo ? '✓' : '○'} {col.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setPainelColunas(false)}
                    style={{ marginTop: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 14px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', width: '100%' }}>
                    ✕ Fechar
                  </button>
                </div>
              )}
              </div> {/* fecha: div position:relative do seletor colunas */}
            </div> {/* fecha: div flex do wrapper colunas+paginacao */}
          </div> {/* fecha: div justify-content:space-between linha 3 */}

          <TabelaEvolucao
            lista={listaFiltrada} meses={meses} libMap={libMap}
            colunas={colunasVisiveis} porPagina={porPagina}
            metasGravadas={metasGravadas} modalMeta={modalMeta} setModalMeta={setModalMeta}
            metaForm={metaForm} setMetaForm={setMetaForm}
            salvandoMeta={salvandoMeta} erroMeta={erroMeta}
            salvarMetaInline={salvarMetaInline} removerMetaInline={removerMetaInline}
            abrirModalMeta={abrirModalMeta}
          />
        </div>
      )}

      {/* ═══ ABA: RESUMO POR MÊS ═══ */}
      {aba === 'resumo' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🔢 Resumo por Mês</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
            {kpis.porMes.map(m => (
              <div key={m.mes} style={s.mesCard}>
                <div style={s.mesBadge}>{fmtMes(m.mes)}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399', margin: '12px 0 4px' }}>{fmt(m.total)}</div>
                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{m.empresas} empresas creditando</div>
                <div style={{ color: '#4b5563', fontSize: '0.75rem', marginTop: 2 }}>{kpis.total - m.empresas} sem crédito neste mês</div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ background: '#34d399', height: '100%', width: `${kpis.total > 0 ? (m.empresas / kpis.total) * 100 : 0}%` }} />
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.72rem', marginTop: 4 }}>{kpis.total > 0 ? fmtPct((m.empresas / kpis.total) * 100) : '0%'} de ativação</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, color: '#e8eaf0' }}>Distribuição de Tendências</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {['up','down','flat','new','none'].map(t => {
                const count = listaFiltrada.filter(e => e.tend === t).length;
                const ts = TEND[t];
                return (
                  <div key={t} style={{ ...s.mesCard, flex: '0 0 auto', minWidth: 140, cursor: 'pointer' }}
                    onClick={() => { setFiltroTend(t); setAba('evolucao'); }}>
                    <div style={{ color: ts.color, fontWeight: 700, fontSize: '1.6rem' }}>{count}</div>
                    <div style={{ color: ts.color, fontSize: '0.85rem', marginTop: 6 }}>{ts.label}</div>
                    <div style={{ color: '#4b5563', fontSize: '0.72rem', marginTop: 4 }}>clique para filtrar</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ABA: POTENCIAL VS CREDITADO ═══ */}
      {aba === 'cruzamento' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🎯 Potencial vs Creditado</div>
          <div style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 6, marginBottom: 16 }}>
            Empresas com potencial cadastrado · {meses.length} meses de referência
          </div>
          <div style={{ ...s.filtroRow, marginBottom: 16 }}>
            <select style={{ ...s.sel, borderColor: filtroDiretor !== 'todos' ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.12)', color: filtroDiretor !== 'todos' ? '#a78bfa' : '#e8eaf0' }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
              <option value="todos">Todos os diretores</option>
              {opcoes.diretores.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroGestor !== 'todos' ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.12)', color: filtroGestor !== 'todos' ? '#60a5fa' : '#e8eaf0' }} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">{filtroDiretor === 'todos' ? 'Todos os gestores' : `Gestores de ${filtroDiretor}`}</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroDepto !== 'todos' ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.12)', color: filtroDepto !== 'todos' ? '#f97316' : '#e8eaf0' }} value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
              <option value="todos">Todas as equipes</option>
              {opcoes.deptos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroVendedor !== 'todos' ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.12)', color: filtroVendedor !== 'todos' ? '#34d399' : '#e8eaf0' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="todos">{filtroGestor === 'todos' ? 'Todos os vendedores' : `Vendedores de ${filtroGestor}`}</option>
              {opcoes.vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <TabelaCruzamento lista={listaFiltrada} meses={meses} />
        </div>
      )}
    </div>
  );
}

const ps = {
  btn:      { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 32 },
  ativo:    { background: 'rgba(240,180,41,0.2)', borderColor: 'rgba(240,180,41,0.5)', color: '#f0b429', fontWeight: 700 },
  disabled: { opacity: 0.3, cursor: 'default' },
  dots:     { color: '#4b5563', fontSize: '0.82rem', padding: '0 2px' },
};

const s = {
  page:         { maxWidth: 1400, margin: '0 auto', padding: '32px 24px', fontFamily: "'DM Sans', sans-serif", color: '#e8eaf0', background: '#0a0c10', minHeight: '100vh' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 16 },
  tag:          { color: '#34d399', fontWeight: 800, fontSize: '0.9rem', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },
  title:        { fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px' },
  sub:          { color: '#6b7280', fontSize: '0.9rem' },
  linkBtnGreen: { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, padding: '10px 20px', color: '#34d399', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  kpis:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 },
  kpi:          { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4 },
  kpiLabel:     { color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  kpiVal:       { fontSize: '1.4rem', fontWeight: 700 },
  kpiSub:       { color: '#4b5563', fontSize: '0.72rem' },
  tabs:         { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab:          { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 16px', color: '#6b7280', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  tabAtiva:     { background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' },
  card:         { background: '#161a26', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardTitle:    { fontSize: '1rem', fontWeight: 700 },
  filtroRow:    { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  busca:        { flex: '1 1 220px', background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' },
  sel:          { background: '#1e2435', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', color: '#e8eaf0', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:           { padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 },
  td:           { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' },
  badgeGreen:   { background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  badgeRed:     { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  mesCard:      { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 24px', flex: '1 1 180px', minWidth: 180 },
  mesBadge:     { display: 'inline-block', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', borderRadius: 8, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 700 },
  spin:         { width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #34d399', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
};
