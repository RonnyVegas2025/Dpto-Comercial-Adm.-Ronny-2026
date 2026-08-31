'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Pagina os resultados de 1000 em 1000 (Supabase trunca em 1000 por padrão).
// Mesmo padrão usado no app/vendedor/page.jsx.
async function fetchAll(query) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await query.range(from, from+999);
    if (error) { console.error('[fetchAll] ERRO na página from=' + from, error); break; }
    if (!data || !data.length) { console.log('[fetchAll] página from=' + from + ' vazia — fim'); break; }
    all = [...all, ...data];
    console.log('[fetchAll] página from=' + from + ' → ' + data.length + ' linhas (acumulado ' + all.length + ')');
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log('[fetchAll] TOTAL retornado: ' + all.length);
  return all;
}

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
  up:   { color: 'var(--vg-success-fg)', label: '↑ Crescendo' },
  down: { color: 'var(--vg-danger-fg)', label: '↓ Caindo' },
  flat: { color: 'var(--vg-muted)', label: '→ Estável' },
  new:  { color: 'var(--vg-info-fg)', label: '✦ Nova' },
  none: { color: 'var(--vg-muted)', label: '— Sem movimentação' },
};

const POR_PAGINA = 12;

// ─── LÓGICA DE META ──────────────────────────────────────────────────────────
// Regra de peso: APENAS Vegas Benefícios aplica peso na meta (30%)
// Todos os outros produtos: peso é só para previsão, meta usa 100% da movimentação
function calcularMeta(empresa, libsTodasMap, ajusteMap, pct, validaDesdeMes) {
  const catLower  = (empresa.categoria || '').toLowerCase();
  const prodNorm  = (empresa.produto_contratado || '').toLowerCase().trim();
  const isConv    = catLower.includes('conv') || catLower.includes('mobil');
  // Benefícios = tudo que não é Convênio/Mobilidade (Alimentação, Bônus, Aux. Combustível, etc.)
  const isBenef   = !isConv;
  if (!isBenef && !isConv) return { elegivel: false, regra: null };

  const validaMes = validaDesdeMes?.substring(0,7) || '2000-01';

  // Filtra movimentações: apenas a partir do mês válido da meta
  const libsOrdenadas = (libsTodasMap[empresa.produto_id] || [])
    .filter(l => l.val > 0 && l.comp >= validaMes)
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
    // Regra: 3 meses CORRIDOS a partir do 1º mês com movimentação VÁLIDA
    const todosOsMeses = (libsTodasMap[empresa.produto_id] || [])
      .filter(l => l.comp >= validaMes)
      .sort((a, b) => a.comp.localeCompare(b.comp));

    const primeiroCom = todosOsMeses.find(l => l.val > 0);
    if (!primeiroCom) return { elegivel: false, regra: 'convenio', progresso: 0, precisam: 3 };

    // Monta os 3 meses corridos a partir do 1º com movimentação
    const [y0, m0] = primeiroCom.comp.split('-').map(Number);
    const tresMeses = [0, 1, 2].map(i => {
      const d    = new Date(y0, m0 - 1 + i, 1);
      const comp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const lib  = todosOsMeses.find(l => l.comp === comp);
      return { comp, val: lib?.val || 0 };
    });

    const terceiro = tresMeses[2];

    // 3º mês "chegou" se:
    // (a) existe registro no banco, OU
    // (b) a data atual já passou esse mês (mês corrido já fechou)
    const hoje       = new Date();
    const mesAtual   = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const terceiroJaPassou = terceiro.comp < mesAtual; // comparação lexicográfica YYYY-MM funciona
    const temTerceiro = todosOsMeses.some(l => l.comp === terceiro.comp) || terceiroJaPassou;

    if (!temTerceiro) {
      const mesesComMov = tresMeses.filter(m => m.val > 0).length;
      return { elegivel: false, regra: 'convenio', progresso: mesesComMov, precisam: 3 };
    }

    // 3º mês fechou — usa 3º se tem valor, senão usa último com valor dentro dos 3
    let mesAlvoObj = terceiro.val > 0
      ? terceiro
      : [...tresMeses].reverse().find(m => m.val > 0);

    if (!mesAlvoObj) return { elegivel: false, regra: 'convenio', progresso: 0, precisam: 3 };

    const mesAlvo     = mesAlvoObj.comp;
    const ajuste      = ajusteMap[`${empresa.id}__${mesAlvo}`];
    const valorBruto  = mesAlvoObj.val;
    const valorConsid = ajuste !== undefined ? ajuste : valorBruto;
    const valorMeta   = calcValorMeta(valorConsid);
    const mesesComMov = tresMeses.filter(m => m.val > 0).length;
    return { elegivel: true, regra: 'convenio', mesAlvo, valorMeta, valorBruto, valorConsid, peso, progresso: mesesComMov, precisam: 3 };
  }

  return { elegivel: false, regra: null };
}

// Badge de meta para exibição na tabela
// Meta CONFIRMADA = existe linha em valor_meta_empresa para a competência da meta
// calculada (mesAlvo) desta empresa/consultor. Específica por mês (não usa fallback
// por empresa_id, que mascarava metas de outros meses — ex.: upsell — como confirmadas).
function metaGravadaDaEmpresa(e, metasGravadas) {
  const mesAlvoYM = e._meta?.mesAlvo ? e._meta.mesAlvo.substring(0,7) : null;
  if (!mesAlvoYM) return null;
  const entradas = metasGravadas[`all__${e.id}`] || [];
  return entradas.find(v =>
    v.competencia_meta?.substring(0,7) === mesAlvoYM &&
    (!v.consultor_id || v.consultor_id === e._consId)
  ) || null;
}

function BadgeMeta({ meta, pct }) {
  if (!meta || meta.regra === null) {
    return <span style={{ color: 'var(--vg-border)', fontSize: '0.72rem' }}>—</span>;
  }

  if (meta.elegivel) {
    // CALCULADO, aguardando confirmação (ainda sem linha em valor_meta_empresa) → ÂMBAR
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
        <span style={{ background: 'var(--vg-brand-50)', border: '1px solid var(--vg-brand-500)', color: 'var(--vg-brand-500)', borderRadius: 5, padding: '2px 7px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          ⏳ Aguardando confirmação
        </span>
        <span style={{ color: 'var(--vg-brand-500)', fontSize: '0.78rem', fontWeight: 700 }}>{fmt(meta.valorMeta)}</span>
        <span style={{ color: 'var(--vg-ink-secondary)', fontSize: '0.6rem', whiteSpace: 'nowrap' }}>
          {meta.regra === 'beneficio' ? '1ª rec.' : '3º mês'} · {fmtMes(meta.mesAlvo)}{pct < 100 ? ` · ${pct}%` : ''}
        </span>
      </div>
    );
  }

  // Não elegível ainda — mostra progresso
  const barW = (meta.progresso / meta.precisam) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 90 }}>
      <span style={{ color: 'var(--vg-muted)', fontSize: '0.7rem', fontWeight: 600 }}>
        {meta.regra === 'beneficio' ? 'Aguardando 1ª rec.' : `${meta.progresso}/${meta.precisam} meses`}
      </span>
      {meta.regra === 'convenio' && (
        <div style={{ background: 'var(--vg-surface-muted)', borderRadius: 3, height: 4, width: 80, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barW}%`, background: meta.progresso >= 2 ? 'var(--vg-brand-500)' : 'var(--vg-muted)', borderRadius: 3 }} />
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
      <span style={{ color: 'var(--vg-muted)', fontSize: '0.75rem', marginLeft: 4 }}>de {total}</span>
    </div>
  );
}

function BannerFiltros({ filtros, onLimpar }) {
  const tags = [];
  if (filtros.diretor   !== 'todos') tags.push({ label: `Diretor: ${filtros.diretor}`,       cor: 'var(--vg-brand-400)' });
  if (filtros.gestor    !== 'todos') tags.push({ label: `Gestor: ${filtros.gestor}`,          cor: 'var(--vg-info-fg)' });
  if (filtros.produto   !== 'todos') tags.push({ label: `Produto: ${filtros.produto}`,        cor: 'var(--vg-brand-400)' });
  if (filtros.depto     !== 'todos') tags.push({ label: `Equipe: ${filtros.depto}`,           cor: 'var(--vg-brand-500)' });
  if (filtros.vendedor  !== 'todos') tags.push({ label: `Vendedor: ${filtros.vendedor}`,      cor: 'var(--vg-success-fg)' });
  if (filtros.categoria !== 'todos') tags.push({ label: `Cat.: ${filtros.categoria}`,         cor: 'var(--vg-brand-500)' });
  if (filtros.status    !== 'todos') tags.push({ label: filtros.status === 'creditou' ? '✅ Movimentaram' : '❌ Sem movimentação', cor: filtros.status === 'creditou' ? 'var(--vg-success-fg)' : 'var(--vg-danger-fg)' });
  if (filtros.tend      !== 'todos') tags.push({ label: `Tend.: ${TEND[filtros.tend]?.label}`, cor: TEND[filtros.tend]?.color });
  if (filtros.metaStatus !== 'todos') {
    const metaLabels = { na_meta: '✅ Confirmadas na meta', aguardando: '⏳ Aguardando confirmação', pendente: '⏳ Pendente elegibilidade', fora: '— Fora da meta' };
    const metaCores  = { na_meta: 'var(--vg-success-fg)', aguardando: 'var(--vg-brand-500)', pendente: 'var(--vg-brand-500)', fora: 'var(--vg-muted)' };
    tags.push({ label: metaLabels[filtros.metaStatus] || filtros.metaStatus, cor: metaCores[filtros.metaStatus] || 'var(--vg-muted)' });
  }
  if (filtros.mesMeta !== 'todos') tags.push({ label: `🎯 Meta de: ${fmtMes(filtros.mesMeta+'-01')}`, cor: 'var(--vg-success-fg)' });
  if (filtros.upsell) tags.push({ label: '📈 Filtro: Upsell detectado', cor: 'var(--vg-brand-500)' });
  if (filtros.busca.trim()) tags.push({ label: `Busca: "${filtros.busca}"`, cor: 'var(--vg-ink)' });
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
  wrap:   { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, flexWrap: 'wrap' },
  icone:  { fontSize: '0.9rem' },
  label:  { color: 'var(--vg-muted)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' },
  tags:   { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
  tag:    { border: '1px solid', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' },
  limpar: { background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 8, padding: '4px 12px', color: 'var(--vg-danger-fg)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
};

// ID da empresa com destaque + botão copiar (✅ por 1.5s ao copiar)
function IdCopiavel({ id }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--vg-ink)', fontSize: '0.7rem' }}>
      <span>ID {id}</span>
      <span
        title="Copiar ID"
        onClick={(ev) => {
          ev.preventDefault(); ev.stopPropagation();
          try { navigator.clipboard?.writeText(String(id)); } catch (_) {}
          setCopiado(true); setTimeout(() => setCopiado(false), 1500);
        }}
        style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.72rem' }}>
        {copiado ? '✅' : '📋'}
      </span>
    </div>
  );
}

function TabelaEvolucao({ lista, meses, libMap, colunas, porPagina = 12,
  metasGravadas = {}, onSalvarMeta, onRemoverMeta, onConfirmarMeta, onConfirmarLote, filtroMesMeta = 'todos', mesesVisiveis = null,
}) {
  const mostraMes = (m) => !mesesVisiveis || mesesVisiveis.includes(m);
  const [pagina,       setPagina]       = useState(1);
  const [modalMeta,    setModalMeta]    = useState(null);
  const [metaForm,     setMetaForm]     = useState({ valor: '', regra: 'beneficio', mesAlvoOverride: null });
  const [erroMeta,     setErroMeta]     = useState('');

  useEffect(() => { setPagina(1); }, [lista.length, porPagina]);
  const totalPaginas = Math.ceil(lista.length / porPagina);
  const listaPagina  = lista.slice((pagina - 1) * porPagina, pagina * porPagina);
  const totaisMes    = meses.map((m, mi) => lista.reduce((s, e) => s + ((e.vals?.[mi] ?? libMap[`${e.produto_id}__${m}`] ?? 0)), 0));
  const totalGeral   = lista.reduce((s, e) => s + e.totalCreditado, 0);
  const totalMetaApurado = lista.reduce((s, e) => {
    // Soma entradas do banco filtradas pelo mês quando filtroMesMeta está ativo.
    // Filtra pelo consultor da linha (empresa multi-consultor não conta a meta N vezes).
    const todasEntradas = (metasGravadas[`all__${e.id}`] || [])
      .filter(v => !v.consultor_id || v.consultor_id === e._consId);
    if (todasEntradas.length > 0) {
      const filtradas = filtroMesMeta !== 'todos'
        ? todasEntradas.filter(v => v.competencia_meta?.substring(0,7) === filtroMesMeta)
        : todasEntradas;
      return s + filtradas.reduce((sv, v) => sv + (v.valor_meta || 0), 0);
    }
    const valor = e._meta?.elegivel ? e._meta.valorMeta : 0;
    return s + (valor || 0);
  }, 0);
  const naMeta = lista.filter(e => {
    const chaveCalc = e._meta?.mesAlvo ? `${e.id}__${e._meta.mesAlvo.substring(0,10)}` : null;
    const gravado = chaveCalc
      ? metasGravadas[chaveCalc]
      : Object.entries(metasGravadas).filter(([k]) => !k.startsWith('all__')).find(([k]) => k.startsWith(`${e.id}__`))?.[1];
    return gravado || e._meta?.elegivel;
  }).length;

  const col = (k) => !colunas || colunas.has(k);

  // ── Confirmação de meta (calculada → gravada) ──────────────────────────
  const metaGravadaDe = (e) => metaGravadaDaEmpresa(e, metasGravadas);
  const aguardandoDe = (e) => !!(e._meta?.elegivel) && !metaGravadaDe(e);
  const algumAguardando = lista.some(aguardandoDe);

  const [selecionados,    setSelecionados]    = useState(() => new Set()); // e._key
  const [confirmRow,      setConfirmRow]       = useState(null);
  const [confirmValor,    setConfirmValor]     = useState('');
  const [confirmErro,     setConfirmErro]      = useState('');
  const [confirmando,     setConfirmando]      = useState(false);
  const [loteAberto,      setLoteAberto]       = useState(false);
  const [loteProcessando, setLoteProcessando]  = useState(false);
  const [loteResultado,   setLoteResultado]    = useState(null);

  // Ao trocar de filtro (muda o tamanho da lista), limpa a seleção.
  useEffect(() => { setSelecionados(new Set()); }, [lista.length]);

  const paginaAguardando = listaPagina.filter(aguardandoDe);
  const todasPaginaSel   = paginaAguardando.length > 0 && paginaAguardando.every(e => selecionados.has(e._key));
  const selecionadasArr  = lista.filter(e => selecionados.has(e._key) && aguardandoDe(e));
  const totalSelecionado = selecionadasArr.reduce((sv, e) => sv + (e._meta?.valorMeta || 0), 0);

  const toggleSel = (key) => setSelecionados(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleTodasPagina = () => setSelecionados(prev => {
    const n = new Set(prev);
    if (todasPaginaSel) paginaAguardando.forEach(e => n.delete(e._key));
    else paginaAguardando.forEach(e => n.add(e._key));
    return n;
  });

  function abrirConfirm(e) { setConfirmRow(e); setConfirmValor(String(e._meta?.valorMeta ?? '')); setConfirmErro(''); }
  async function executarConfirm() {
    if (!confirmRow || confirmValor === '') return;
    setConfirmando(true); setConfirmErro('');
    const r = await onConfirmarMeta(confirmRow, confirmValor);
    setConfirmando(false);
    if (r?.error) setConfirmErro('Erro: ' + r.error);
    else { setSelecionados(prev => { const n = new Set(prev); n.delete(confirmRow._key); return n; }); setConfirmRow(null); }
  }
  async function executarLote() {
    if (!selecionadasArr.length) return;
    setLoteProcessando(true);
    const r = await onConfirmarLote(selecionadasArr);
    setLoteProcessando(false);
    setLoteResultado(r);
    setSelecionados(new Set());
  }

  // Abre o modal para uma empresa
  function abrirModalMeta(empresa) {
    const meta    = empresa._meta;
    const upsell  = empresa._upsellMes ? { mesAlvo: empresa._upsellMes, valor: empresa._upsellValor } : null;
    const chave   = meta?.mesAlvo ? `${empresa.id}__${meta.mesAlvo.substring(0,10)}` : null;
    const gravado = chave ? metasGravadas[chave] : null;
    setMetaForm({
      valor: upsell?.valor ?? gravado?.valor_meta ?? (meta?.elegivel ? meta.valorMeta : '') ?? '',
      regra: upsell ? 'upsell' : (gravado?.regra ?? meta?.regra ?? 'beneficio'),
      mesAlvoOverride: upsell?.mesAlvo || null,
    });
    setErroMeta('');
    setModalMeta(empresa);
  }

  // Salva meta no banco via callback para o pai
  async function salvarMeta() {
    if (!modalMeta || !metaForm.valor) return;
    setSalvandoMeta(true);
    setErroMeta('');
    const resultado = await onSalvarMeta(modalMeta, metaForm);
    if (resultado?.error) {
      setErroMeta('Erro: ' + resultado.error);
    } else {
      setModalMeta(null);
    }
    setSalvandoMeta(false);
  }

  async function removerMeta(empresa) {
    if (!confirm('Remover da meta?')) return;
    await onRemoverMeta(empresa);
  } // helper

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: 'var(--vg-muted)', fontSize: '0.78rem' }}>
          Exibindo <strong style={{ color: 'var(--vg-ink)' }}>{listaPagina.length}</strong> de <strong style={{ color: 'var(--vg-ink)' }}>{lista.length}</strong> empresas
          {totalMetaApurado > 0 && (
            <span style={{ marginLeft: 12, background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 6, padding: '2px 10px', color: 'var(--vg-success-fg)', fontSize: '0.72rem', fontWeight: 600 }}>
              ✅ {naMeta} na meta · {fmt(totalMetaApurado)} apurado
            </span>
          )}
        </div>
        <Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} />
      </div>
      {selecionadasArr.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--vg-brand-50)', border: '1px solid var(--vg-brand-500)', borderRadius: 10, padding: '10px 16px', marginBottom: 12 }}>
          <span style={{ color: 'var(--vg-brand-500)', fontWeight: 700, fontSize: '0.85rem' }}>
            {selecionadasArr.length} empresa{selecionadasArr.length > 1 ? 's' : ''} selecionada{selecionadasArr.length > 1 ? 's' : ''} · Total {fmt(totalSelecionado)}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSelecionados(new Set())}
            style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '6px 14px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
            Limpar seleção
          </button>
          <button onClick={() => { setLoteResultado(null); setLoteAberto(true); }}
            style={{ background: 'var(--vg-success-fg)', border: 'none', borderRadius: 8, padding: '6px 16px', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            ✓ Confirmar {selecionadasArr.length} selecionada{selecionadasArr.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh', border: '1px solid var(--vg-surface-muted)', borderRadius: 10 }}>
        <table style={s.table}>
          <thead>
            <tr>
              {algumAguardando && (
                <th style={{ ...s.th, width: 34, textAlign: 'center' }}>
                  <input type="checkbox" checked={todasPaginaSel} onChange={toggleTodasPagina}
                    title="Selecionar todas as aguardando desta página"
                    style={{ cursor: 'pointer', accentColor: 'var(--vg-brand-500)' }} disabled={paginaAguardando.length === 0} />
                </th>
              )}
              <th style={s.th}>Empresa</th>
              {col('categoria')    && <th style={s.th}>Categoria</th>}
              {col('produto')      && <th style={s.th}>Produto</th>}
              {col('datacadastro') && <th style={s.th}>Cadastro</th>}
              {col('vendedor')     && <th style={s.th}>Vendedor</th>}
              {col('gestor')       && <th style={s.th}>Gestor</th>}
              {col('diretor')      && <th style={s.th}>Diretor</th>}
              {col('meses')   && meses.map(m => mostraMes(m) ? <th key={m} style={{ ...s.th, textAlign: 'right' }}>{fmtMes(m)}</th> : null)}
              {col('previsto') && <th style={{ ...s.th, textAlign: 'right', color: 'var(--vg-brand-400)' }}>Previsto/mês</th>}
              {col('total')    && <th style={{ ...s.th, textAlign: 'right' }}>Movimentado</th>}
              {col('status')   && <th style={{ ...s.th, textAlign: 'center' }}>Status</th>}
              {col('tendencia')&& <th style={{ ...s.th, textAlign: 'center' }}>Tendência</th>}
              {col('meta')     && <th style={{ ...s.th, textAlign: 'center', borderLeft: '2px solid var(--vg-success-fg)', color: 'var(--vg-success-fg)', minWidth: 120 }}>🎯 Meta</th>}
              {col('upsell')   && <th style={{ ...s.th, textAlign: 'center', borderLeft: '2px solid var(--vg-warning-fg)', color: 'var(--vg-brand-500)', minWidth: 130 }}>📈 Upsell</th>}
            </tr>
          </thead>
          <tbody>
            {listaPagina.map((e, i) => {
              const ts   = TEND[e.tend];
              const meta = e._meta;

              // Busca meta gravada: tenta pela chave calculada, depois varre o mapa por empresa_id
              const _metaChaveCalc = meta?.mesAlvo ? `${e.id}__${meta.mesAlvo.substring(0,10)}` : null;
              const metaLocal = _metaChaveCalc
                ? metasGravadas[_metaChaveCalc]
                // fallback: varre o mapa buscando qualquer entrada para esta empresa
                : Object.entries(metasGravadas).filter(([k]) => !k.startsWith('all__')).find(([k]) => k.startsWith(`${e.id}__`))?.[1];

              // Também tenta encontrar mesmo sem mesAlvo calculado
              const metaLocalFallback = !metaLocal
                ? Object.entries(metasGravadas).filter(([k]) => !k.startsWith('all__')).find(([k]) => k.startsWith(`${e.id}__`))?.[1]
                : null;

              const metaFinal      = metaLocal || metaLocalFallback;
              // Confirmada = há linha para a competência da meta calculada (específica por mês).
              const temMetaGravada = !!metaGravadaDe(e);
              const isModalAberto  = modalMeta?._key === e._key;
              const rowBg = (meta?.elegivel || temMetaGravada)
                ? (i % 2 === 0 ? 'var(--vg-success-bg)' : 'var(--vg-success-bg)')
                : (i % 2 === 0 ? 'var(--vg-surface-muted)' : 'transparent');
              return (
                <React.Fragment key={e._key}>
                <tr style={{ background: rowBg, opacity: !e.creditou ? 0.6 : 1 }}>
                  {algumAguardando && (
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      {aguardandoDe(e) && (
                        <input type="checkbox" checked={selecionados.has(e._key)} onChange={() => toggleSel(e._key)}
                          style={{ cursor: 'pointer', accentColor: 'var(--vg-brand-500)' }} />
                      )}
                    </td>
                  )}
                  <td style={s.td}>
                    {/* Link para gestão + botão de meta lado a lado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div>
                        <a href={`/gestao/${e.id}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontWeight: 600, color: 'var(--vg-ink)', textDecoration: 'none', cursor: 'pointer', fontSize: '0.82rem' }}
                          onMouseEnter={ev => ev.currentTarget.style.color='var(--vg-success-fg)'}
                          onMouseLeave={ev => ev.currentTarget.style.color='var(--vg-ink)'}>
                          {e.nome} ↗
                        </a>
                        <IdCopiavel id={e.produto_id} />
                      </div>
                    </div>
                  </td>
                  {col('categoria')    && <td style={{ ...s.td, color: 'var(--vg-ink-secondary)', fontSize: '0.78rem' }}>{e.categoria}</td>}
                  {col('produto')      && <td style={{ ...s.td, color: 'var(--vg-brand-400)', fontSize: '0.78rem' }}>{e.produto}</td>}
                  {col('datacadastro') && <td style={{ ...s.td, color: 'var(--vg-info-fg)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {e.data_cadastro ? fmtMes(e.data_cadastro.substring(0,7)+'-01') : '—'}
                  </td>}
                  {col('vendedor')  && <td style={{ ...s.td, fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {e.vendedor}
                      {e._pct < 100 && <span style={{ background: 'var(--vg-brand-50)', color: 'var(--vg-brand-500)', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>{e._pct}%</span>}
                    </div>
                  </td>}
                  {col('gestor')   && <td style={{ ...s.td, color: 'var(--vg-ink-secondary)', fontSize: '0.78rem' }}>{e.gestor}</td>}
                  {col('diretor')  && <td style={{ ...s.td, color: 'var(--vg-ink-secondary)', fontSize: '0.78rem' }}>{e.diretor||'—'}</td>}
                  {col('meses') && meses.map(m => {
                    if (!mostraMes(m)) return null;
                    const mi = meses.indexOf(m);
                    const v  = (e.vals?.[mi] ?? libMap[`${e.produto_id}__${m}`] ?? 0);
                    // Verifica se este mês foi considerado meta (pode ter múltiplas entradas)
                    // Todos os meses de meta: banco (all__) + calculado inline (mesAlvo)
                    const _gravados = (metasGravadas[`all__${e.id}`] || []).map(x => x.competencia_meta?.substring(0,7)).filter(Boolean);
                    const _calculado = meta?.elegivel && meta?.mesAlvo ? meta.mesAlvo.substring(0,7) : null;
                    const todosMesesMeta = [...new Set([..._gravados, ...(_calculado ? [_calculado] : [])])];
                    const isMesAlvo  = todosMesesMeta.includes(m?.substring(0,7));
                    // Pega o valor específico deste mês de meta (para mostrar no tooltip)
                    const entradaMeta = (metasGravadas[`all__${e.id}`] || []).find(x => x.competencia_meta?.substring(0,7) === m?.substring(0,7));
                    return (
                      <td key={m} style={{ ...s.td, textAlign: 'right', background: isMesAlvo ? 'var(--vg-success-bg)' : undefined }}>
                        {v > 0
                          ? <span style={{ color: 'var(--vg-success-fg)', fontWeight: isMesAlvo ? 700 : 500 }}>
                              {fmt(v)}
                              {isMesAlvo && (
                                <span title={entradaMeta ? `Meta: ${fmt(entradaMeta.valor_meta)} (${entradaMeta.regra})` : 'Na meta'}
                                  style={{ fontSize: '0.6rem', marginLeft: 3, cursor: 'help' }}>
                                  {entradaMeta?.regra === 'upsell' ? '📈' : '✅'}
                                </span>
                              )}
                            </span>
                          : <span style={{ color: 'var(--vg-border)' }}>—</span>}
                      </td>
                    );
                  })}
                  {col('previsto') && <td style={{ ...s.td, textAlign: 'right', color: 'var(--vg-brand-400)', fontWeight: 600 }}>
                    {e.previsto > 0 ? fmt(e.previsto) : '—'}
                  </td>}
                  {col('total') && <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>
                    {e.totalCreditado > 0 ? fmt(e.totalCreditado) : <span style={{ color: 'var(--vg-border)' }}>—</span>}
                  </td>}                  {col('status') && <td style={{ ...s.td, textAlign: 'center' }}>
                    {e.creditou
                      ? <span style={s.badgeGreen}>✅ Movimentou</span>
                      : <span style={s.badgeRed}>❌ Sem movimentação</span>}
                  </td>}
                  {col('tendencia') && <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{ color: ts.color, fontSize: '0.78rem', fontWeight: 600 }}>{ts.label}</span>
                  </td>}
                  {/* ── COLUNA META — clicável abre gestão em nova aba ── */}
                  {col('meta') && <td style={{ ...s.td, textAlign: 'center', borderLeft: '2px solid var(--vg-success-bg)' }}>
                    {temMetaGravada ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                        {/* Mostra TODAS as entradas de meta da empresa */}
                        {(() => {
                          // Junta: entradas gravadas no banco + meta calculada inline (se não gravada ainda)
                          const todasGravadas = metasGravadas[`all__${e.id}`] || (metaFinal ? [metaFinal] : []);
                          const gravadas = todasGravadas.filter(v =>
                            !v.consultor_id || v.consultor_id === e._consId
                          );
                          const mesesBanco = gravadas.map(x => x.competencia_meta?.substring(0,7));
                          const calculada = meta?.elegivel && meta?.mesAlvo && !mesesBanco.includes(meta.mesAlvo.substring(0,7))
                            ? [{ competencia_meta: meta.mesAlvo.substring(0,10), valor_meta: meta.valorMeta, regra: meta.regra }]
                            : [];
                          const todasEntradas = [...gravadas, ...calculada]
                            .filter(v => filtroMesMeta === 'todos' || v.competencia_meta?.substring(0,7) === filtroMesMeta)
                            .sort((a,b) => (a.competencia_meta||'').localeCompare(b.competencia_meta||''));
                          return todasEntradas;
                        })().map((entrada, idx, arr) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, paddingBottom: idx < arr.length - 1 ? 4 : 0, borderBottom: idx < arr.length - 1 ? '1px solid var(--vg-surface-muted)' : 'none', width: '100%' }}>
                            <span style={{ background: entrada.regra === 'upsell' ? 'var(--vg-warning-bg)' : 'var(--vg-success-bg)', border: `1px solid ${entrada.regra === 'upsell' ? 'var(--vg-warning-fg)' : 'var(--vg-success-fg)'}`, color: entrada.regra === 'upsell' ? 'var(--vg-brand-500)' : 'var(--vg-success-fg)', borderRadius: 5, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {entrada.regra === 'upsell' ? '📈' : '✅'} {entrada.regra === 'upsell' ? 'Upsell' : entrada.regra === 'beneficio' ? '1ª rec.' : entrada.regra === 'convenio' ? '3º mês' : 'Manual'} · {fmtMes((entrada.competencia_meta||'').substring(0,7)+'-01')}
                            </span>
                            <span style={{ color: entrada.regra === 'upsell' ? 'var(--vg-brand-500)' : 'var(--vg-success-fg)', fontSize: '0.75rem', fontWeight: 700 }}>{fmt(entrada.valor_meta)}</span>
                          </div>
                        ))}
                        <a href={`/gestao/${e.id}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--vg-muted)', fontSize: '0.58rem', marginTop: 2, textDecoration: 'none' }}>
                          ✏️ editar ↗
                        </a>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <BadgeMeta meta={meta} pct={e._pct} />
                        {aguardandoDe(e) && (
                          <button onClick={() => abrirConfirm(e)}
                            style={{ marginTop: 2, background: 'var(--vg-brand-50)', border: '1px solid var(--vg-brand-500)', borderRadius: 5, padding: '3px 10px', color: 'var(--vg-brand-500)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            ✓ Confirmar na meta
                          </button>
                        )}
                      </div>
                    )}
                  </td>}
                </tr>

                {/* Diálogo inline de confirmação individual */}
                {confirmRow?._key === e._key && col('meta') && (
                  <tr key={e._key + '-confirm'} style={{ background: 'var(--vg-brand-50)' }}>
                    <td colSpan={99} style={{ padding: '0 12px 12px' }}>
                      <div style={{ background: 'var(--vg-bg)', border: '1px solid var(--vg-brand-500)', borderRadius: 12, padding: '16px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--vg-brand-500)', fontSize: '0.9rem', marginBottom: 3 }}>
                              🎯 Confirmar na meta — {e.nome}
                            </div>
                            <div style={{ color: 'var(--vg-muted)', fontSize: '0.72rem' }}>
                              ID {e.produto_id} · {meta?.regra === 'beneficio' ? '1ª recarga' : '3º mês'} · <strong style={{ color: 'var(--vg-ink)' }}>{fmtMes((String(meta?.mesAlvo || '2000-01')).substring(0,7)+'-01')}</strong>
                              {' '}· Consultor: <strong style={{ color: 'var(--vg-ink)' }}>{e.vendedor || '—'}</strong> ({e._pct ?? 100}%)
                            </div>
                          </div>
                          <button onClick={() => setConfirmRow(null)}
                            style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 6, padding: '4px 10px', color: 'var(--vg-muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            ✕ Fechar
                          </button>
                        </div>

                        {confirmErro && <div style={{ background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: 'var(--vg-danger-fg)', fontSize: '0.78rem' }}>{confirmErro}</div>}

                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                            {[
                              { label: 'Valor bruto',      val: meta?.valorBruto },
                              { label: 'Valor considerado', val: meta?.valorConsid },
                              { label: 'Valor da meta',     val: meta?.valorMeta },
                            ].map(o => (
                              <div key={o.label}>
                                <div style={{ color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 0.6 }}>{o.label}</div>
                                <div style={{ color: 'var(--vg-ink)', fontWeight: 700, fontSize: '0.85rem' }}>{fmt(o.val || 0)}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ minWidth: 180 }}>
                            <label style={{ display: 'block', color: 'var(--vg-muted)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>Valor que entra na meta *</label>
                            <input type="number" step="0.01" value={confirmValor}
                              onChange={ev => setConfirmValor(ev.target.value)}
                              style={{ width: '100%', background: 'var(--vg-surface)', border: '1px solid var(--vg-brand-500)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-ink)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', fontWeight: 700 }}
                              autoFocus />
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={() => setConfirmRow(null)}
                              style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '10px 18px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
                              Cancelar
                            </button>
                            <button onClick={executarConfirm} disabled={confirmando || confirmValor === ''}
                              style={{ background: 'var(--vg-success-fg)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: confirmValor === '' ? 'default' : 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', opacity: confirmValor === '' ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                              {confirmando ? 'Confirmando...' : '✓ Confirmar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Modal inline desabilitado — usa página de gestão */}
                {false && isModalAberto && col('meta') && (
                  <tr key={e._key + '-modal'} style={{ background: 'var(--vg-success-bg)' }}>
                    <td colSpan={99} style={{ padding: '0 12px 12px' }}>
                      <div style={{ background: 'var(--vg-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 12, padding: '16px 20px', animation: 'fadeIn 0.2s ease' }}>
                        {/* Cabeçalho do modal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: metaForm.regra === 'upsell' ? 'var(--vg-brand-500)' : 'var(--vg-success-fg)', fontSize: '0.88rem', marginBottom: 3 }}>
                              {metaForm.regra === 'upsell' ? '📈 Upsell detectado' : temMetaGravada ? '🎯 Editar meta' : '🎯 Marcar na meta'} — {e.nome}
                            </div>
                            <div style={{ color: 'var(--vg-muted)', fontSize: '0.72rem' }}>
                              {metaForm.regra === 'upsell'
                                ? <>📈 Crescimento ≥45% · <strong style={{color:'var(--vg-brand-500)'}}>{fmtMes((String(metaForm.mesAlvoOverride||'2000-01')).substring(0,7)+'-01')}</strong> · Meta original preservada</>
                                : meta ? <>{meta.regra === 'beneficio' ? '1ª recarga' : '3º mês'} · {fmtMes((String(meta.mesAlvo||'2000-01')).substring(0,7)+'-01')}</> : <span>—</span>
                              }
                              {' '}· Consultor: <strong style={{ color: 'var(--vg-ink)' }}>{e.vendedor || '—'}</strong> ({e._pct || 100}%)
                            </div>
                          </div>
                          <button onClick={() => setModalMeta(null)}
                            style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 6, padding: '4px 10px', color: 'var(--vg-muted)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}>
                            ✕ Fechar
                          </button>
                        </div>

                        {erroMeta && <div style={{ background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: 'var(--vg-danger-fg)', fontSize: '0.78rem' }}>{erroMeta}</div>}

                        {/* Campos */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 200 }}>
                            <label style={{ display: 'block', color: 'var(--vg-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Valor que entra na meta *</label>
                            <input type="number" step="0.01" value={metaForm.valor}
                              onChange={ev => setMetaForm(f => ({ ...f, valor: ev.target.value }))}
                              style={{ width: '100%', background: 'var(--vg-surface)', border: '1px solid var(--vg-success-fg)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-ink)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', fontWeight: 700 }}
                              placeholder="Ex: 4398.00" autoFocus />
                            {/* Atalhos */}
                            <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                              {[
                                { label: 'Sugerido', val: meta?.valorMeta },
                                { label: 'Bruto',    val: meta?.valorBruto },
                                { label: 'Consid.',  val: meta?.valorConsid },
                              ].filter(o => o.val > 0).filter((o,i,a) => a.findIndex(x=>x.val===o.val)===i).map(o => (
                                <button key={o.label} onClick={() => setMetaForm(f => ({ ...f, valor: o.val }))}
                                  style={{ background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 5, padding: '2px 8px', color: 'var(--vg-success-fg)', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit', fontWeight: 600 }}>
                                  {o.label}: {fmt(o.val)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ minWidth: 200 }}>
                            <label style={{ display: 'block', color: 'var(--vg-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Regra</label>
                            <select value={metaForm.regra} onChange={ev => setMetaForm(f => ({ ...f, regra: ev.target.value }))}
                              style={{ width: '100%', background: 'var(--vg-surface)', border: '1px solid var(--vg-success-fg)', borderRadius: 8, padding: '8px 12px', color: 'var(--vg-ink)', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>
                              <option value="beneficio">✅ 1ª Recarga (Benefícios/Bônus)</option>
                              <option value="convenio">📅 3º Mês (Convênio/Mobilidade)</option>
                              <option value="manual">✏️ Inclusão Manual</option>
                              <option value="upsell">📈 Upsell (entrada adicional)</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={salvarMeta} disabled={salvandoMeta || !metaForm.valor}
                              style={{ background: 'var(--vg-success-fg)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', fontFamily: 'inherit', opacity: !metaForm.valor ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                              {salvandoMeta ? 'Salvando...' : temMetaGravada ? '💾 Atualizar' : '🎯 Confirmar'}
                            </button>
                            {temMetaGravada && (
                              <button onClick={() => removerMeta(e)}
                                style={{ background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger-fg)', borderRadius: 8, padding: '10px 16px', color: 'var(--vg-danger-fg)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                🗑 Remover
                              </button>
                            )}
                            <a href={`/gestao/${e.id}`} target="_blank"
                              style={{ color: 'var(--vg-muted)', fontSize: '0.72rem', textDecoration: 'none', whiteSpace: 'nowrap' }}
                              onMouseEnter={ev => ev.currentTarget.style.color='var(--vg-success-fg)'}
                              onMouseLeave={ev => ev.currentTarget.style.color='var(--vg-muted)'}>
                              ↗ Abrir ficha completa
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {/* ── COLUNA UPSELL ── */}
                {col('upsell') && (() => {
                  const up = e._upsell;
                  return (
                    <td style={{ ...s.td, textAlign: 'center', borderLeft: '2px solid var(--vg-warning-bg)' }}>
                      {up ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                          <span style={{ background: 'var(--vg-warning-bg)', border: '1px solid var(--vg-warning-fg)', color: 'var(--vg-brand-500)', borderRadius: 5, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            ↑ +{up.crescPct}% · {fmtMes(up.mes+'-01')}
                          </span>
                          <span style={{ color: 'var(--vg-brand-500)', fontSize: '0.75rem', fontWeight: 700 }}>{fmt(up.valor)}</span>
                          <span style={{ color: 'var(--vg-muted)', fontSize: '0.62rem' }}>base: {fmt(up.baseValor)}</span>
                          <a href={`/gestao/${e.id}`} target="_blank" rel="noopener noreferrer"
                            style={{ marginTop: 2, display: 'block', textAlign: 'center', background: 'var(--vg-warning-bg)', border: '1px solid var(--vg-warning-fg)', borderRadius: 5, padding: '3px 10px', color: 'var(--vg-brand-500)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, textDecoration: 'none' }}>
                            + Adicionar na meta ↗
                          </a>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--vg-border)', fontSize: '0.72rem' }}>—</span>
                      )}
                    </td>
                  );
                })()}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--vg-border)', background: 'var(--vg-brand-50)' }}>
              <td colSpan={
                1 + (algumAguardando?1:0) +
                (col('categoria')?1:0) +
                (col('produto')?1:0) +
                (col('vendedor')?1:0) +
                (col('gestor')?1:0) +
                (col('diretor')?1:0)
              } style={{ ...s.td, fontWeight: 700, color: 'var(--vg-brand-500)', fontSize: '0.82rem', paddingTop: 14 }}>
                TOTAL ({lista.length} empresas)
              </td>
              {col('meses') && totaisMes.map((t, i) => mostraMes(meses[i]) ? (
                <td key={i} style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: 'var(--vg-brand-500)', paddingTop: 14 }}>
                  {t > 0 ? fmt(t) : <span style={{ color: 'var(--vg-border)' }}>—</span>}
                </td>
              ) : null)}
              {col('previsto') && <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: 'var(--vg-brand-400)', paddingTop: 14 }}>
                {fmt(lista.reduce((s,e)=>s+(e.previsto||0),0))}
              </td>}
              {col('total') && <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: 'var(--vg-brand-500)', paddingTop: 14 }}>{fmt(totalGeral)}</td>}
              {(col('status') || col('tendencia')) && <td colSpan={(col('status')?1:0)+(col('tendencia')?1:0)} style={{ ...s.td, paddingTop: 14 }} />}
              {col('meta') && (
                <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: 'var(--vg-success-fg)', paddingTop: 14, borderLeft: '2px solid var(--vg-success-bg)' }}>
                  {totalMetaApurado > 0 ? fmt(totalMetaApurado) : '—'}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      {totalPaginas > 1 && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}><Paginacao pagina={pagina} total={totalPaginas} onChange={setPagina} /></div>}

      {/* Diálogo de confirmação em lote */}
      {loteAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,31,59,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => { if (!loteProcessando) { setLoteAberto(false); setLoteResultado(null); } }}>
          <div onClick={ev => ev.stopPropagation()}
            style={{ background: 'var(--vg-bg)', border: '1px solid var(--vg-brand-500)', borderRadius: 14, padding: '20px 24px', width: 'min(560px, 96vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column' }}>
            {!loteResultado ? (
              <>
                <div style={{ fontWeight: 700, color: 'var(--vg-brand-500)', fontSize: '1rem', marginBottom: 4 }}>✓ Confirmar {selecionadasArr.length} empresa{selecionadasArr.length > 1 ? 's' : ''} na meta</div>
                <div style={{ color: 'var(--vg-muted)', fontSize: '0.78rem', marginBottom: 14 }}>Total: <strong style={{ color: 'var(--vg-success-fg)' }}>{fmt(totalSelecionado)}</strong> · usa o valor calculado de cada empresa</div>
                <div style={{ overflowY: 'auto', border: '1px solid var(--vg-border)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, background: 'var(--vg-bg)' }}>
                        <th style={{ ...s.th, padding: '8px 12px' }}>Empresa</th>
                        <th style={{ ...s.th, padding: '8px 12px' }}>Mês</th>
                        <th style={{ ...s.th, padding: '8px 12px', textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selecionadasArr.map(e => (
                        <tr key={e._key} style={{ borderTop: '1px solid var(--vg-surface-muted)' }}>
                          <td style={{ ...s.td, padding: '8px 12px', color: 'var(--vg-ink)' }}>{e.nome}<span style={{ color: 'var(--vg-muted)', fontSize: '0.68rem' }}> · ID {e.produto_id}</span></td>
                          <td style={{ ...s.td, padding: '8px 12px', color: 'var(--vg-ink-secondary)' }}>{fmtMes((String(e._meta?.mesAlvo || '2000-01')).substring(0,7)+'-01')}</td>
                          <td style={{ ...s.td, padding: '8px 12px', textAlign: 'right', color: 'var(--vg-brand-500)', fontWeight: 700 }}>{fmt(e._meta?.valorMeta || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button onClick={() => setLoteAberto(false)} disabled={loteProcessando}
                    style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 8, padding: '10px 18px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                  <button onClick={executarLote} disabled={loteProcessando}
                    style={{ background: 'var(--vg-success-fg)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {loteProcessando ? 'Confirmando...' : `✓ Confirmar todas`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, color: 'var(--vg-success-fg)', fontSize: '1rem', marginBottom: 6 }}>✓ {loteResultado.confirmadas} confirmada{loteResultado.confirmadas === 1 ? '' : 's'}</div>
                {loteResultado.falhas?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ color: 'var(--vg-danger-fg)', fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>{loteResultado.falhas.length} falha{loteResultado.falhas.length === 1 ? '' : 's'}:</div>
                    <div style={{ maxHeight: '40vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {loteResultado.falhas.map((f, i) => (
                        <div key={i} style={{ color: 'var(--vg-ink-secondary)', fontSize: '0.76rem' }}>• {f.nome} (ID {f.id}) — {f.erro}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={() => { setLoteAberto(false); setLoteResultado(null); }}
                    style={{ background: 'var(--vg-success-fg)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
  const corGeral = pctGeral >= 80 ? 'var(--vg-success-fg)' : pctGeral >= 40 ? 'var(--vg-brand-500)' : 'var(--vg-danger-fg)';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: 'var(--vg-muted)', fontSize: '0.78rem' }}><strong style={{ color: 'var(--vg-ink)' }}>{listaSorted.length}</strong> empresas com potencial cadastrado</div>
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
              const cor = pct >= 80 ? 'var(--vg-success-fg)' : pct >= 40 ? 'var(--vg-brand-500)' : 'var(--vg-danger-fg)';
              const stLabel = pct >= 80 ? '✅ Atingindo' : pct >= 40 ? '⚡ Parcial' : e.totalCreditado === 0 ? '❌ Sem crédito' : '⚠️ Abaixo';
              return (
                <tr key={e._key} style={i % 2 === 0 ? { background: 'var(--vg-surface-muted)' } : {}}>
                  <td style={s.td}>
                    <a href={`/gestao/${e.id}`} style={{ fontWeight: 600, color: 'var(--vg-ink)', textDecoration: 'none', cursor: 'pointer' }}
                      onMouseEnter={ev => ev.currentTarget.style.color='var(--vg-success-fg)'}
                      onMouseLeave={ev => ev.currentTarget.style.color='var(--vg-ink)'}>
                      {e.nome}
                    </a>
                    <IdCopiavel id={e.produto_id} />
                  </td>
                  <td style={{ ...s.td, color: 'var(--vg-ink-secondary)', fontSize: '0.78rem' }}>{e.categoria}</td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {e.vendedor}
                      {e._pct < 100 && <span style={{ background: 'var(--vg-brand-50)', color: 'var(--vg-brand-500)', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>{e._pct}%</span>}
                    </div>
                  </td>
                  <td style={{ ...s.td, color: 'var(--vg-ink-secondary)', fontSize: '0.78rem' }}>{e.gestor}</td>
                  <td style={{ ...s.td, color: 'var(--vg-brand-400)', fontSize: '0.78rem' }}>{e.diretor}</td>
                  <td style={s.td}>{fmt(e.potencial_movimentacao)}</td>
                  <td style={{ ...s.td, color: 'var(--vg-brand-500)' }}>{fmt((e.potencial_movimentacao || 0) * (e.peso_categoria || 1) * meses.length)}</td>
                  <td style={{ ...s.td, color: 'var(--vg-success-fg)', fontWeight: 600 }}>{fmt(e.totalCreditado)}</td>
                  <td style={{ ...s.td, color: cor, fontWeight: 700 }}>{fmtPct(pct)}</td>
                  <td style={{ ...s.td, minWidth: 100 }}>
                    <div style={{ background: 'var(--vg-surface-muted)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ background: cor, height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4 }} />
                    </div>
                  </td>
                  <td style={{ ...s.td, fontSize: '0.78rem' }}>{stLabel}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--vg-border)', background: 'var(--vg-brand-50)' }}>
              <td colSpan={5} style={{ ...s.td, fontWeight: 700, color: 'var(--vg-brand-500)', fontSize: '0.82rem', paddingTop: 14 }}>TOTAL ({listaSorted.length} empresas)</td>
              <td style={{ ...s.td, fontWeight: 700, color: 'var(--vg-brand-500)', paddingTop: 14 }}>{fmt(totPot)}</td>
              <td style={{ ...s.td, color: 'var(--vg-brand-500)', fontWeight: 700, paddingTop: 14 }}>{fmt(totEsp)}</td>
              <td style={{ ...s.td, color: 'var(--vg-success-fg)', fontWeight: 700, paddingTop: 14 }}>{fmt(totCred)}</td>
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
  const [recarregando, setRecarregando] = useState(false);
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
  const [filtroMesMeta, setFiltroMesMeta]     = useState('todos'); // filtro por mês da meta
  const [filtroUpsell, setFiltroUpsell]         = useState(false);    // NOVO: só empresas com upsell
  const [filtroMesCadastro, setFiltroMesCadastro] = useState('todos'); // NOVO: filtro por mês de cadastro
  const [ordenar, setOrdenar]                 = useState('ultimo');
  const [porPagina, setPorPagina]             = useState(12);
  const [mesesOcultos, setMesesOcultos]       = useState(() => new Set()); // colunas de mês desmarcadas
  const [mesesDrop, setMesesDrop]             = useState(false);           // dropdown "Meses" aberto

  // ── Modal de meta inline ──────────────────────────────────────────────────
  // Mapa de metas gravadas: empresa_id__consultor_id → valor_meta
  const [metasGravadas, setMetasGravadas] = useState({}); // NOVO: itens por página

  // ── Configuração de colunas ──────────────────────────────────────────────
  const COLUNAS_DEF = [
    { key:'categoria',    label:'Categoria',       grupo:'Identificação' },
    { key:'produto',      label:'Produto',         grupo:'Identificação' },
    { key:'datacadastro', label:'Data Cadastro',   grupo:'Identificação' },
    { key:'vendedor',     label:'Vendedor',        grupo:'Comercial'     },
    { key:'gestor',       label:'Gestor',          grupo:'Comercial'     },
    { key:'diretor',      label:'Diretor',         grupo:'Comercial'     },
    { key:'meses',        label:'Meses (mov.)',    grupo:'Movimentação'  },
    { key:'previsto',     label:'Total Previsto',  grupo:'Movimentação'  },
    { key:'total',        label:'Total Mov.',      grupo:'Movimentação'  },
    { key:'status',       label:'Status',          grupo:'Movimentação'  },
    { key:'tendencia',    label:'Tendência',       grupo:'Movimentação'  },
    { key:'meta',         label:'🎯 Meta',         grupo:'Meta'          },
    { key:'upsell',       label:'📈 Upsell',       grupo:'Meta'          },
  ];
  const PRESETS = {
    padrao:  ['categoria','produto','vendedor','gestor','meses','previsto','total','status','meta'],
    minimo:  ['produto','vendedor','meses','total','meta'],
    todas:   COLUNAS_DEF.map(c=>c.key),
  };
  const [colunasVisiveis, setColunasVisiveis] = useState(new Set(PRESETS.padrao));
  const [painelColunas,   setPainelColunas]   = useState(false);

  useEffect(() => { carregar(); }, []);
  useEffect(() => { import('xlsx').then(m => setXlsxLib(m.default || m)); }, []);
  useEffect(() => { setFiltroGestor('todos'); setFiltroVendedor('todos'); }, [filtroDiretor]);
  useEffect(() => { setFiltroVendedor('todos'); }, [filtroGestor]);


  // Recarrega dados sem resetar filtros
  async function recarregar() {
    setRecarregando(true);
    try {
      const [emps, libsData, { data: ajustesData }, libsTodasData] = await Promise.all([
        fetchAll(supabase.from('empresas').select(`id, produto_id, nome, cnpj, cidade, estado, categoria, produto_contratado, potencial_movimentacao, peso_categoria,
          data_cadastro, pct_principal, pct_agregado_1, pct_agregado_2,
         consultor_principal:consultor_principal_id (id, nome, setor, equipe, gestor, diretor, diretor_id, tipo, meta_inicio, diretorObj:diretor_id(id,nome)),
          consultor_agregado:consultor_agregado_id (id, nome, setor, equipe, gestor, diretor, diretor_id, meta_inicio, diretorObj:diretor_id(id,nome)),
          consultor_agregado_2:consultor_agregado_2_id (id, nome, setor, equipe, gestor, diretor, diretor_id, meta_inicio, diretorObj:diretor_id(id,nome))`)
          .eq('ativo', true).order('id')),
        fetchAll(supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia')),
        supabase.from('ajustes_movimentacao').select('empresa_id, competencia, valor_considerado').order('competencia'),
        fetchAll(supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia')),
      ]);
      setMeses([...new Set((libsData || []).map(l => l.competencia))].sort());
      setEmpresas(emps || []);
      setLibs(libsData || []);
      setAjustes(ajustesData || []);
      setLibsTodas(libsTodasData || []);
      const { data: vmetas } = await supabase.from('valor_meta_empresa').select('empresa_id,consultor_id,competencia_meta,valor_meta,regra');
      if (vmetas) {
        const map = {};
        for (const v of vmetas) {
          const comp = v.competencia_meta ? String(v.competencia_meta).substring(0,10) : null;
          if (!comp) continue;
          const key = String(v.empresa_id) + '__' + comp;
          map[key] = { valor_meta: v.valor_meta, regra: v.regra, competencia_meta: comp };
          const keyAll = 'all__' + String(v.empresa_id);
          if (!map[keyAll]) map[keyAll] = [];
          map[keyAll].push({ competencia_meta: comp, valor_meta: v.valor_meta, regra: v.regra, consultor_id: v.consultor_id });
        }
        setMetasGravadas(map);
      }
    } catch(err) { console.error('Erro ao recarregar:', err); }
    setRecarregando(false);
  }

  async function carregar() {
    setLoading(true);
    try {
      const [emps, libsData, { data: ajustesData }, libsTodasData] = await Promise.all([
        fetchAll(supabase
          .from('empresas')
          .select(`id, produto_id, nome, cnpj, cidade, estado, categoria, produto_contratado, potencial_movimentacao, peso_categoria,
            data_cadastro, pct_principal, pct_agregado_1, pct_agregado_2,
            consultor_principal:consultor_principal_id (id, nome, setor, equipe, gestor, diretor, diretor_id, tipo, meta_inicio, diretorObj:diretor_id(id,nome)),
            consultor_agregado:consultor_agregado_id (id, nome, setor, equipe, gestor, diretor, diretor_id, meta_inicio, diretorObj:diretor_id(id,nome)),
            consultor_agregado_2:consultor_agregado_2_id (id, nome, setor, equipe, gestor, diretor, diretor_id, meta_inicio, diretorObj:diretor_id(id,nome))`)
          .eq('ativo', true).order('id')),
        fetchAll(supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia')),
        supabase.from('ajustes_movimentacao').select('empresa_id, competencia, valor_considerado').order('competencia'),
        fetchAll(supabase.from('liberacoes').select('produto_id, competencia, total_liberado').order('competencia')),
      ]);

      if (!emps || emps.length === 0) console.warn('[carregar] nenhuma empresa retornada');

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
          const comp = v.competencia_meta ? String(v.competencia_meta).substring(0,10) : null;
          if (!comp) continue;
          const key = `${v.empresa_id}__${comp}`;
          map[key] = { valor_meta: v.valor_meta, regra: v.regra, competencia_meta: comp };
          const keyAll = `all__${v.empresa_id}`;
          if (!map[keyAll]) map[keyAll] = [];
          map[keyAll].push({ competencia_meta: comp, valor_meta: v.valor_meta, regra: v.regra, consultor_id: v.consultor_id });
        }
        setMetasGravadas(map);
      }
    } catch(err) {
      console.error('[carregar] erro inesperado:', err);
    } finally {
      setLoading(false);
    }
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

        // Calcula meta automática como base — respeitando meta_inicio do consultor
        const validaDesdeMes = cons?.meta_inicio || null;
        const metaInfoCalc = calcularMeta(e, libsTodasMap, ajusteMap, pct, validaDesdeMes);

        // Verifica se há meta GRAVADA no banco para esta empresa
        // (carregada em metasGravadas como all__empresa_id)
        // Se sim, usa o mês gravado como referência para o _meta
        const entradasBanco = (metasGravadas[`all__${e.id}`] || [])
          .filter(x => x.regra !== 'upsell') // ignora upsells para o _meta principal
          .sort((a,b) => (a.competencia_meta||'').localeCompare(b.competencia_meta||''));

        let metaInfo;
        if (entradasBanco.length > 0) {
          // Usa a primeira entrada não-upsell do banco
          const entrada = entradasBanco[0];
          const comp    = entrada.competencia_meta?.substring(0,10);
          // Busca valor bruto no libsTodasMap
          const libsEmp = (libsTodasMap[e.produto_id] || []).find(l => l.comp === comp);
          const aj      = ajusteMap[`${e.id}__${comp}`];
          const valorBruto   = libsEmp?.val || 0;
          const valorConsid  = aj !== undefined ? aj : valorBruto;
          metaInfo = {
            elegivel:        true,
            regra:           entrada.regra || 'manual',
            mesAlvo:         comp,
            valorMeta:       entrada.valor_meta,
            valorBruto,
            valorConsid,
            peso:            metaInfoCalc?.peso ?? 1,
            progresso:       metaInfoCalc?.progresso ?? 3,
            precisam:        metaInfoCalc?.precisam  ?? (entrada.regra === 'beneficio' ? 1 : 3),
            _fromBanco:      true,
          };
        } else {
          metaInfo = metaInfoCalc;
        }

        // ── Detecta upsell: meses após a meta com crescimento ≥ 45% ──
        let upsellInfo = null;
        if (metaInfo?.elegivel && metaInfo.mesAlvo) {
          const baseValorMeta = metaInfo.valorMeta; // valor que entrou na meta (com peso e %)
          const idxMetaMes    = meses.indexOf(metaInfo.mesAlvo?.substring(0,10) === meses.find(m => m === metaInfo.mesAlvo?.substring(0,7)+'-01') ? metaInfo.mesAlvo?.substring(0,10) : meses.find(m => m?.startsWith(metaInfo.mesAlvo?.substring(0,7))));
          // Meses POSTERIORES ao mês da meta
          const mesesApos = meses.filter(m => m > (metaInfo.mesAlvo?.substring(0,7) || ''));
          let melhorUpsell = null;
          for (const m of mesesApos) {
            const mi   = meses.indexOf(m);
            const vMes = vals[mi] || 0;
            if (vMes > 0 && baseValorMeta > 0) {
              const crescPct = ((vMes - baseValorMeta) / baseValorMeta) * 100;
              if (crescPct >= 45) {
                if (!melhorUpsell || vMes > melhorUpsell.valor) {
                  melhorUpsell = {
                    mes:        m,
                    valor:      vMes,
                    crescPct:   Math.round(crescPct),
                    baseValor:  baseValorMeta,
                    diferenca:  Math.round((vMes - baseValorMeta) * 100) / 100,
                  };
                }
              }
            }
          }
          upsellInfo = melhorUpsell;
        }

        expanded.push({
          ...e,
          _key:   `${e.id}__${cons.id}`,
          _consId: cons.id,
          _meta:  metaInfo,
          _upsell: upsellInfo,   // ← info de upsell detectado
          vals, totalCreditado, tend,
          creditou:    totalCreditado > 0,
          pctPot:      e.potencial_movimentacao > 0 ? (totalCreditado / (e.potencial_movimentacao * (e.peso_categoria||1) * meses.length * fator)) * 100 : null,
          ultimoValor: vals[vals.length - 1] || 0,
          depto:       cons.equipe || cons.setor || '—',
          gestor:      cons.gestor || '—',
          diretor:     cons.diretorObj?.nome || cons.diretor || '—',
          vendedor:    cons.nome   || '—',
          produto:     e.produto_contratado || '—',
          _pct:        pct,
          _valsBase:   valsBase,
          _totalBase:  totalBase,
          previsto:    Math.round((e.potencial_movimentacao||0) * (e.peso_categoria||1) * fator * 100) / 100,
          mesCadastro: e.data_cadastro ? e.data_cadastro.substring(0,7) : null,
        });
      }
    }
    return expanded;
  }, [empresas, meses, libMap, ajusteMap, libsTodasMap, metasGravadas]);

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
    // Filtro por mês de cadastro
    if (filtroMesCadastro !== 'todos') arr = arr.filter(e => e.mesCadastro === filtroMesCadastro);
    // Filtro upsell
    if (filtroUpsell) arr = arr.filter(e => e._upsell);
    // Filtro por status de meta
    if (filtroMeta === 'na_meta')     arr = arr.filter(e => !!metaGravadaDaEmpresa(e, metasGravadas));                                   // Confirmadas (têm linha)
    if (filtroMeta === 'aguardando')  arr = arr.filter(e => e._meta?.elegivel === true && !metaGravadaDaEmpresa(e, metasGravadas));     // Calculadas, sem linha
    if (filtroMeta === 'pendente')    arr = arr.filter(e => e._meta?.elegivel === false && e._meta?.regra !== null);                     // Pendente elegibilidade
    if (filtroMeta === 'fora')        arr = arr.filter(e => !e._meta || e._meta?.regra === null);
    // Filtro por mês específico da meta — usa mesAlvo calculado OU competencia_meta gravada (incluindo upsell)
    if (filtroMesMeta !== 'todos') {
      arr = arr.filter(e => {
        // Checa meta calculada
        if (e._meta?.elegivel && e._meta?.mesAlvo?.substring(0,7) === filtroMesMeta) return true;
        // Checa TODAS as entradas gravadas no banco (meta principal + upsell)
        const todasEntradas = (metasGravadas[`all__${e.id}`] || []);
        if (todasEntradas.some(v => v.competencia_meta?.substring(0,7) === filtroMesMeta)) return true;
        // Fallback: chave específica
        const chaveCalc = e._meta?.mesAlvo ? `${e.id}__${e._meta.mesAlvo.substring(0,10)}` : null;
        const gravado = chaveCalc
          ? metasGravadas[chaveCalc]
          : Object.entries(metasGravadas).filter(([k]) => !k.startsWith('all__')).find(([k]) => k.startsWith(`${e.id}__`))?.[1];
        return gravado?.competencia_meta?.substring(0,7) === filtroMesMeta;
      });
    }
    if (ordenar === 'ultimo')    arr.sort((a, b) => b.ultimoValor - a.ultimoValor);
    if (ordenar === 'total')     arr.sort((a, b) => b.totalCreditado - a.totalCreditado);
    if (ordenar === 'nome')      arr.sort((a, b) => a.nome.localeCompare(b.nome));
    if (ordenar === 'potencial') arr.sort((a, b) => (b.potencial_movimentacao || 0) - (a.potencial_movimentacao || 0));
    if (ordenar === 'sem')       arr.sort((a, b) => Number(a.creditou) - Number(b.creditou));
    if (ordenar === 'meta')      arr.sort((a, b) => (b._meta?.valorMeta || 0) - (a._meta?.valorMeta || 0));
    return arr;
  }, [listaCompleta, busca, filtroCategoria, filtroDiretor, filtroGestor, filtroDepto, filtroVendedor, filtroProduto, filtroStatus, filtroTend, filtroMeta, filtroMesMeta, filtroMesCadastro, filtroUpsell, ordenar]);

  const kpis = useMemo(() => {
    const total       = listaFiltrada.length;
    const creditaram  = listaFiltrada.filter(e => e.creditou).length;
    const semCredito  = total - creditaram;
    const totalCred   = listaFiltrada.reduce((s, e) => s + e.totalCreditado, 0);
    const totalPrevisto = listaFiltrada.reduce((s, e) => s + (e.previsto || 0), 0);
    const crescendo   = listaFiltrada.filter(e => e.tend === 'up').length;
    const pctAtivacao = total > 0 ? (creditaram / total) * 100 : 0;
    // KPIs de meta — usa valor do banco (metasGravadas) quando disponível, senão o calculado
    const getMetaGravada = (e) => metaGravadaDaEmpresa(e, metasGravadas);
    const naMeta      = listaFiltrada.filter(e => getMetaGravada(e) || e._meta?.elegivel).length;
    // Confirmadas = têm linha em valor_meta_empresa; Aguardando = calculadas (elegíveis) mas sem linha.
    const confirmadas = listaFiltrada.filter(e => getMetaGravada(e)).length;
    const aguardando  = listaFiltrada.filter(e => !getMetaGravada(e) && e._meta?.elegivel).length;
    const pendenteMeta = listaFiltrada.filter(e => e._meta?.elegivel === false && e._meta?.regra !== null).length;
    const totalMetaApurado = listaFiltrada.reduce((s, e) => {
      // Soma entradas do banco filtradas pelo mês quando filtroMesMeta está ativo.
      // Filtra pelo consultor da linha (empresa multi-consultor não conta a meta N vezes).
      const todasEntradas = (metasGravadas[`all__${e.id}`] || [])
        .filter(v => !v.consultor_id || v.consultor_id === e._consId);
      if (todasEntradas.length > 0) {
        const entradasFiltradas = filtroMesMeta !== 'todos'
          ? todasEntradas.filter(v => v.competencia_meta?.substring(0,7) === filtroMesMeta)
          : todasEntradas;
        return s + entradasFiltradas.reduce((sv, v) => sv + (v.valor_meta || 0), 0);
      }
      const valor = e._meta?.elegivel ? e._meta.valorMeta : 0;
      return s + (valor || 0);
    }, 0);
    const porMes = meses.map(m => ({
      mes: m,
      total:    listaFiltrada.reduce((s, e) => { const mi=meses.indexOf(m); return s+((e.vals?.[mi] ?? libMap[`${e.produto_id}__${m}`] ?? 0)); }, 0),
      empresas: listaFiltrada.filter(e => { const mi=meses.indexOf(m); return ((e.vals?.[mi] ?? libMap[`${e.produto_id}__${m}`] ?? 0))>0; }).length,
    }));
    const totalUpsell = listaFiltrada.filter(e => e._upsell).length;
    return { total, creditaram, semCredito, totalCred, totalPrevisto, crescendo, pctAtivacao, porMes, naMeta, confirmadas, aguardando, pendenteMeta, totalMetaApurado, totalUpsell };
  }, [listaFiltrada, meses, libMap, metasGravadas, filtroMesMeta]);

  // Meses únicos de cadastro para o filtro
  // mesesCadastro em cascata: mostra só meses disponíveis com os filtros atuais (exceto o próprio filtro de cadastro)
  const mesesCadastro = useMemo(() => {
    let base = [...listaCompleta];
    if (busca.trim())            { const b = busca.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); base = base.filter(e => e.nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(b) || String(e.produto_id).includes(b)); }
    if (filtroCategoria !== 'todos') base = base.filter(e => e.categoria === filtroCategoria);
    if (filtroDiretor   !== 'todos') base = base.filter(e => e.diretor   === filtroDiretor);
    if (filtroGestor    !== 'todos') base = base.filter(e => e.gestor    === filtroGestor);
    if (filtroDepto     !== 'todos') base = base.filter(e => e.depto     === filtroDepto);
    if (filtroVendedor  !== 'todos') base = base.filter(e => e.vendedor  === filtroVendedor);
    if (filtroProduto   !== 'todos') base = base.filter(e => e.produto   === filtroProduto);
    if (filtroStatus === 'creditou')    base = base.filter(e =>  e.creditou);
    if (filtroStatus === 'sem_credito') base = base.filter(e => !e.creditou);
    if (filtroTend  !== 'todos') base = base.filter(e => e.tend === filtroTend);
    if (filtroMeta === 'na_meta')     base = base.filter(e => !!metaGravadaDaEmpresa(e, metasGravadas));
    if (filtroMeta === 'aguardando')  base = base.filter(e => e._meta?.elegivel === true && !metaGravadaDaEmpresa(e, metasGravadas));
    if (filtroMeta === 'pendente')    base = base.filter(e => e._meta?.elegivel === false && e._meta?.regra !== null);
    if (filtroMeta === 'fora')        base = base.filter(e => !e._meta || e._meta?.regra === null);
    return [...new Set(base.map(e => e.mesCadastro).filter(Boolean))].sort().reverse();
  }, [listaCompleta, busca, filtroCategoria, filtroDiretor, filtroGestor, filtroDepto, filtroVendedor, filtroProduto, filtroStatus, filtroTend, filtroMeta]);

  function limparFiltros() {
    setBusca(''); setFiltroCategoria('todos'); setFiltroDiretor('todos');
    setFiltroGestor('todos'); setFiltroDepto('todos'); setFiltroVendedor('todos');
    setFiltroProduto('todos'); setFiltroStatus('todos'); setFiltroTend('todos');
    setFiltroMeta('todos'); setFiltroMesMeta('todos'); setFiltroMesCadastro('todos'); setFiltroUpsell(false); setOrdenar('ultimo');
  }

  const filtrosAtivos = { diretor: filtroDiretor, gestor: filtroGestor, depto: filtroDepto, vendedor: filtroVendedor, categoria: filtroCategoria, produto: filtroProduto, status: filtroStatus, tend: filtroTend, metaStatus: filtroMeta, mesMeta: filtroMesMeta, upsell: filtroUpsell, busca };
  const temFiltro = filtroDiretor !== 'todos' || filtroGestor !== 'todos' || filtroDepto !== 'todos' ||
    filtroVendedor !== 'todos' || filtroCategoria !== 'todos' || filtroProduto !== 'todos' ||
    filtroStatus !== 'todos' || filtroTend !== 'todos' || filtroMeta !== 'todos' ||
    filtroMesMeta !== 'todos' || busca.trim();

  function exportarExcel() {
    if (!xlsxLib) return;

    // Todas as colunas fixas
    const headers = [
      'ID Produto', 'Empresa', 'CNPJ', 'Data Cadastro', 'Categoria', 'Produto',
      'Cidade', 'Estado', 'Vendedor', '% Consultor', 'Gestor', 'Diretor',
      'Potencial/mês', 'Peso Meta (%)', 'Previsto/mês',
    ];
    // Colunas de meses
    meses.forEach(m => headers.push(fmtMes(m)));
    // Colunas de totais e meta
    headers.push(
      'Total Movimentado', 'Total Previsto', 'Status', 'Tendência',
      'Meta Regra', 'Meta Mês', 'Valor Bruto Meta', 'Valor Meta Apurado', 'Meta Status'
    );

    const fmtDate = (d) => { if(!d) return '—'; const [y,m,day]=d.split('-'); return day+'/'+m+'/'+y; };

    const rows = listaFiltrada.map(e => {
      // Busca meta gravada ou calculada
      const chaveCalc = e._meta?.mesAlvo ? `${e.id}__${e._meta.mesAlvo.substring(0,10)}` : null;
      const metaGrav  = chaveCalc
        ? metasGravadas[chaveCalc]
        : Object.entries(metasGravadas).filter(([k]) => !k.startsWith('all__')).find(([k]) => k.startsWith(`${e.id}__`))?.[1];
      const valorMetaFinal = metaGrav?.valor_meta ?? (e._meta?.elegivel ? e._meta.valorMeta : 0);
      const mesMetaRef     = metaGrav?.competencia_meta?.substring(0,7) || e._meta?.mesAlvo?.substring(0,7);
      const metaRegra      = metaGrav?.regra || e._meta?.regra;
      const temMeta        = !!(metaGrav || e._meta?.elegivel);

      const row = [
        e.produto_id,
        e.nome,
        e.cnpj || '—',
        fmtDate(e.data_cadastro),
        e.categoria,
        e.produto,
        e.cidade || '—',
        e.estado || '—',
        e.vendedor,
        e._pct,
        e.gestor,
        e.diretor || '—',
        e.potencial_movimentacao || 0,
        Math.round((e.peso_categoria || 1) * 100),
        e.previsto || 0,
      ];

      // Valores por mês
      let totalMov = 0;
      meses.forEach(m => {
        const mi2 = meses.indexOf(m);
        const v   = (e.vals?.[mi2] ?? libMap[`${e.produto_id}__${m}`] ?? 0);
        totalMov += v;
        row.push(v > 0 ? v : 0);
      });

      row.push(
        totalMov,
        e.previsto || 0,
        e.creditou ? 'Movimentou' : 'Sem movimentação',
        e.tend === 'up' ? 'Crescendo' : e.tend === 'down' ? 'Caindo' : e.tend === 'flat' ? 'Estável' : e.tend === 'new' ? 'Nova' : 'Sem movimentação',
        metaRegra === 'beneficio' ? '1ª Recarga' : metaRegra === 'convenio' ? '3º Mês' : metaRegra === 'manual' ? 'Manual' : e._meta?.regra ? 'Pendente' : '—',
        mesMetaRef ? fmtMes(mesMetaRef + '-01') : '—',
        e._meta?.valorBruto || 0,
        valorMetaFinal || 0,
        temMeta ? 'Na meta' : e._meta?.regra ? 'Pendente' : '—',
      );
      return row;
    });

    // Linha de totais
    const totRow = new Array(15).fill('');
    totRow[0] = 'TOTAL'; totRow[1] = `(${listaFiltrada.length} empresas)`;
    totRow[12] = listaFiltrada.reduce((s,e) => s+(e.potencial_movimentacao||0), 0);
    totRow[14] = listaFiltrada.reduce((s,e) => s+(e.previsto||0), 0);
    meses.forEach((m, i) => {
      const t = listaFiltrada.reduce((s, e) => s+(libMap[`${e.produto_id}__${m}`]||0), 0);
      totRow.push(t);
    });
    const basePos = 15 + meses.length;
    totRow.push(
      listaFiltrada.reduce((s,e)=>s+e.totalCreditado,0),
      listaFiltrada.reduce((s,e)=>s+(e.previsto||0),0),
      '', '', '', '',
      0,
      listaFiltrada.reduce((s,e)=>{
        const chaveCalc = e._meta?.mesAlvo ? `${e.id}__${e._meta.mesAlvo.substring(0,10)}` : null;
        const grav = chaveCalc ? metasGravadas[chaveCalc] : Object.entries(metasGravadas).filter(([k])=>!k.startsWith('all__')).find(([k])=>k.startsWith(`${e.id}__`))?.[1];
        return s + ((grav?.valor_meta ?? (e._meta?.elegivel ? e._meta.valorMeta : 0)) || 0);
      }, 0),
      '',
    );
    rows.push(totRow);

    const ws = xlsxLib.utils.aoa_to_sheet([headers, ...rows]);
    // Larguras de colunas
    ws['!cols'] = headers.map((h, i) => ({
      wch: ['Empresa','Vendedor','Gestor'].some(x=>h.includes(x)) ? 28
         : ['ID','%','Peso'].some(x=>h.includes(x)) ? 10
         : h.includes('/') ? 14  // meses
         : 18
    }));
    // Linha de cabeçalho em negrito (via estilo)
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'Evolucao');
    xlsxLib.writeFile(wb, `evolucao-novas-empresas-${new Date().toISOString().substring(0,10)}.xlsx`);
  }

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}><div style={s.spin}></div><div style={{ color: 'var(--vg-muted)' }}>Carregando...</div></div>
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
        select option { background: var(--vg-surface) !important; color: var(--vg-ink) !important; }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.tag}>Vegas Card / Evolução</div>
          <h1 style={s.title}>Evolução de Novas Empresas</h1>
          <p style={s.sub}>Todas as categorias — acompanhe quem movimentou e quem ainda não movimentou</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={exportarExcel} disabled={!xlsxLib || listaFiltrada.length===0}
            style={{ ...s.linkBtnGreen, background:'var(--vg-success-bg)', borderColor:'var(--vg-success-fg)', color:'var(--vg-success-fg)', cursor:'pointer', border:'1px solid var(--vg-success-fg)', fontFamily:'inherit', opacity:(!xlsxLib||listaFiltrada.length===0)?0.5:1 }}>
            📥 Exportar Excel ({listaFiltrada.length})
          </button>
          <button onClick={recarregar} disabled={recarregando}
            style={{ ...s.linkBtnGreen, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--vg-success-fg)', opacity: recarregando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', animation: recarregando ? 'spin 0.8s linear infinite' : 'none' }}>🔄</span>
            {recarregando ? 'Atualizando...' : 'Atualizar'}
          </button>
          <a href="/importar-movimentacao" style={s.linkBtnGreen}>📊 Importar Movimentação</a>
          <a href="/importar-liberacoes" style={{ ...s.linkBtnGreen, color:'var(--vg-info-fg)', borderColor:'var(--vg-info-fg)', background:'var(--vg-info-bg)' }}>💳 Importar Liberações</a>
        </div>
      </div>

      {temFiltro && <BannerFiltros filtros={filtrosAtivos} onLimpar={limparFiltros} />}

      {/* KPIs */}
      <div style={s.kpis}>
        <div style={s.kpi}>
  <span style={s.kpiLabel}>Total Contratos</span>
  <span style={s.kpiVal}>{kpis.total}</span>
  <span style={s.kpiSub}>
    {new Set(listaFiltrada.map(e => e.id)).size} empresas distintas
  </span>
</div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-success-fg)' }}>
          <span style={s.kpiLabel}>Movimentaram</span>
          <span style={{ ...s.kpiVal, color: 'var(--vg-success-fg)' }}>{kpis.creditaram}</span>
          <span style={s.kpiSub}>{fmtPct(kpis.pctAtivacao)} de ativação</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-danger-fg)' }}>
          <span style={s.kpiLabel}>Sem Movimentação</span>
          <span style={{ ...s.kpiVal, color: 'var(--vg-danger-fg)' }}>{kpis.semCredito}</span>
          <span style={s.kpiSub}>ainda não movimentaram</span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-brand-500)' }}>
          <span style={s.kpiLabel}>Total Movimentado</span>
          <span style={{ ...s.kpiVal, color: 'var(--vg-brand-500)' }}>{fmt(kpis.totalCred)}</span>
          <span style={s.kpiSub}>{meses.length} meses · todas as categorias</span>
        </div>
        {/* NOVO: KPI Total Previsto */}
        <div style={{ ...s.kpi, borderColor: 'var(--vg-brand-400)' }}>
          <span style={s.kpiLabel}>📊 Total Previsto</span>
          <span style={{ ...s.kpiVal, color: 'var(--vg-brand-400)' }}>{fmt(kpis.totalPrevisto)}</span>
          <span style={s.kpiSub}>potencial × peso/mês</span>
        </div>
        {/* NOVOS KPIs de meta */}
        <div style={{ ...s.kpi, borderColor: 'var(--vg-success-fg)', cursor: 'pointer' }} onClick={() => { setFiltroMeta('na_meta'); setAba('evolucao'); }}>
          <span style={s.kpiLabel}>✅ Na Meta</span>
          <span style={s.kpiVal}>
            <span style={{ color: 'var(--vg-success-fg)' }}>{kpis.confirmadas}</span>
            <span style={{ color: 'var(--vg-muted)', fontSize: '0.85rem', fontWeight: 600 }}> · </span>
            <span style={{ color: 'var(--vg-brand-500)' }}>{kpis.aguardando}</span>
          </span>
          <span style={s.kpiSub}>
            <span style={{ color: 'var(--vg-success-fg)' }}>{kpis.confirmadas} confirmadas</span>
            <span style={{ color: 'var(--vg-muted)' }}> · </span>
            <span style={{ color: 'var(--vg-brand-500)' }}>{kpis.aguardando} aguardando</span>
          </span>
        </div>
        {/* KPI Upsell */}
        <div style={{ ...s.kpi, borderColor: filtroUpsell ? 'var(--vg-warning-fg)' : 'var(--vg-warning-fg)', cursor: 'pointer', background: filtroUpsell ? 'var(--vg-warning-bg)' : 'var(--vg-surface)' }}
          onClick={() => { setFiltroUpsell(f => !f); setAba('evolucao'); }}>
          <span style={s.kpiLabel}>📈 Possível Upsell</span>
          <span style={{ ...s.kpiVal, color: 'var(--vg-brand-500)' }}>{kpis.totalUpsell || 0}</span>
          <span style={{ ...s.kpiSub, color: kpis.totalUpsell > 0 ? 'var(--vg-brand-500)' : 'var(--vg-muted)' }}>
            {kpis.totalUpsell > 0 ? `≥45% acima da meta` : 'nenhum detectado'}
            {filtroUpsell && <span style={{color:'var(--vg-brand-500)',marginLeft:4,fontWeight:700}}>· ativo</span>}
          </span>
        </div>
        <div style={{ ...s.kpi, borderColor: 'var(--vg-brand-500)', cursor: 'pointer' }} onClick={() => { setFiltroMeta('pendente'); setAba('evolucao'); }}>
          <span style={s.kpiLabel}>⏳ Pendente Meta</span>
          <span style={{ ...s.kpiVal, color: 'var(--vg-brand-500)' }}>{kpis.pendenteMeta}</span>
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
            <select style={{ ...s.sel, borderColor: filtroProduto !== 'todos' ? 'var(--vg-brand-400)' : 'var(--vg-border)', color: filtroProduto !== 'todos' ? 'var(--vg-brand-400)' : 'var(--vg-ink)' }}
              value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
              <option value="todos">Todos os produtos</option>
              {opcoes.produtos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {/* NOVO: filtro por meta */}
            <select style={{ ...s.sel, borderColor: filtroMeta !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-border)', color: filtroMeta !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-ink)' }}
              value={filtroMeta} onChange={e => setFiltroMeta(e.target.value)}>
              <option value="todos">🎯 Todas (meta)</option>
              <option value="na_meta">✅ Confirmadas na meta</option>
              <option value="aguardando">⏳ Aguardando confirmação</option>
              <option value="pendente">⏳ Pendente elegibilidade</option>
              <option value="fora">— Fora da meta</option>
            </select>
            {/* Filtro upsell toggle */}
            <button onClick={() => setFiltroUpsell(f => !f)}
              style={{ ...s.sel, cursor: 'pointer', fontFamily: 'inherit', background: filtroUpsell ? 'var(--vg-warning-bg)' : 'var(--vg-surface-muted)', borderColor: filtroUpsell ? 'var(--vg-warning-fg)' : 'var(--vg-border)', color: filtroUpsell ? 'var(--vg-brand-500)' : 'var(--vg-muted)', fontWeight: filtroUpsell ? 700 : 400 }}>
              📈 {filtroUpsell ? '✓ Upsell' : 'Upsell'}
            </button>
          </div>
          {/* Linha 2: hierarquia + ordenar */}
          <div style={s.filtroRow}>
            <select style={{ ...s.sel, borderColor: 'var(--vg-brand-400)', color: filtroDiretor !== 'todos' ? 'var(--vg-brand-400)' : 'var(--vg-ink)' }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
              <option value="todos">Todos os diretores</option>
              {opcoes.diretores.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroGestor !== 'todos' ? 'var(--vg-info-fg)' : 'var(--vg-border)', color: filtroGestor !== 'todos' ? 'var(--vg-info-fg)' : 'var(--vg-ink)' }} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">{filtroDiretor === 'todos' ? 'Todos os gestores' : `Gestores de ${filtroDiretor}`}</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroDepto !== 'todos' ? 'var(--vg-brand-500)' : 'var(--vg-border)', color: filtroDepto !== 'todos' ? 'var(--vg-brand-500)' : 'var(--vg-ink)' }} value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
              <option value="todos">Todas as equipes</option>
              {opcoes.deptos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroVendedor !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-border)', color: filtroVendedor !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-ink)' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
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

          {/* ── NOVO: Linha 3 — Filtro mês cadastro + mês da meta + Seletor de colunas ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>

            {/* Filtro por mês de cadastro — select compacto */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--vg-info-fg)', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>📅 Cadastro em:</span>
              <select
                value={filtroMesCadastro}
                onChange={e => setFiltroMesCadastro(e.target.value)}
                style={{ ...s.sel, borderColor: filtroMesCadastro !== 'todos' ? 'var(--vg-info-fg)' : 'var(--vg-border)', color: filtroMesCadastro !== 'todos' ? 'var(--vg-info-fg)' : 'var(--vg-ink)', minWidth: 160 }}>
                <option value="todos">Todos os meses</option>
                {mesesCadastro.map(m => {
                  const qtd = listaCompleta.filter(e => e.mesCadastro === m).length;
                  return <option key={m} value={m}>{fmtMes(m+'-01')} ({qtd} emp.)</option>;
                })}
              </select>
            </div>

            {/* Linha com filtros de mês + seletor colunas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Filtros de mês — selects lado a lado */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filtro por mês da meta — select compacto */}
            {(() => {
              const mesesCalc = listaCompleta.filter(e => e._meta?.elegivel).map(e => e._meta.mesAlvo?.substring(0,7)).filter(Boolean);
              const mesesGrav = Object.entries(metasGravadas)
                .filter(([k]) => k.startsWith('all__'))
                .flatMap(([, arr]) => Array.isArray(arr) ? arr.map(v => v.competencia_meta?.substring(0,7)) : [])
                .filter(Boolean);
              const mesesUnicos = [...new Set([...mesesCalc, ...mesesGrav])].sort();
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--vg-success-fg)', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>🎯 Mês da meta:</span>
                  <select
                    value={filtroMesMeta}
                    onChange={e => setFiltroMesMeta(e.target.value)}
                    style={{ ...s.sel, borderColor: filtroMesMeta !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-border)', color: filtroMesMeta !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-ink)', minWidth: 200 }}>
                    <option value="todos">Todos os meses</option>
                    {mesesUnicos.map(m => {
                      const totalMes = listaCompleta.reduce((s, e) => {
                        const todasEntradas = (metasGravadas[`all__${e.id}`] || [])
                          .filter(v => !v.consultor_id || v.consultor_id === e._consId);
                        const doMes = todasEntradas.filter(v => v.competencia_meta?.substring(0,7) === m);
                        if (doMes.length > 0) return s + doMes.reduce((sv, v) => sv + (v.valor_meta || 0), 0);
                        if (e._meta?.elegivel && e._meta?.mesAlvo?.substring(0,7) === m) return s + (e._meta.valorMeta || 0);
                        return s;
                      }, 0);
                      const qtd = listaCompleta.filter(e => {
                        const todasEntradas = (metasGravadas[`all__${e.id}`] || []);
                        if (todasEntradas.some(v => v.competencia_meta?.substring(0,7) === m)) return true;
                        return e._meta?.elegivel && e._meta?.mesAlvo?.substring(0,7) === m;
                      }).length;
                      return <option key={m} value={m}>{fmtMes(m+'-01')} — {fmt(totalMes)} ({qtd} emp.)</option>;
                    })}
                  </select>
                </div>
              );
            })()}

            {/* Colunas de meses — dropdown compacto com checkboxes */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMesesDrop(v => !v)}
                style={{ ...s.sel, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  borderColor: mesesOcultos.size > 0 ? 'var(--vg-brand-500)' : 'var(--vg-border)',
                  color: mesesOcultos.size > 0 ? 'var(--vg-brand-500)' : 'var(--vg-ink)', whiteSpace: 'nowrap' }}>
                📅 Meses ({meses.length - mesesOcultos.size}/{meses.length}) ▾
              </button>
              {mesesDrop && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, minWidth: 180,
                  background: 'var(--vg-bg)', border: '1px solid var(--vg-border)', borderRadius: 10,
                  padding: 10, boxShadow: '0 8px 30px rgba(28,31,59,0.18)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <button onClick={() => setMesesOcultos(new Set())}
                      style={{ ...s.sel, padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer', color: 'var(--vg-success-fg)' }}>Todos</button>
                    <button onClick={() => setMesesOcultos(new Set(meses))}
                      style={{ ...s.sel, padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer', color: 'var(--vg-danger-fg)' }}>Nenhum</button>
                  </div>
                  {meses.map(m => {
                    const marcado = !mesesOcultos.has(m);
                    return (
                      <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px',
                        cursor: 'pointer', fontSize: '0.78rem', color: 'var(--vg-ink)' }}>
                        <input type="checkbox" checked={marcado}
                          onChange={() => setMesesOcultos(prev => {
                            const n = new Set(prev);
                            if (n.has(m)) n.delete(m); else n.add(m);
                            return n;
                          })} />
                        {fmtMes(m)}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            </div>{/* fecha div filtros de mês */}
            {/* Seletor de colunas + por página */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

              {/* Por página */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--vg-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Por página:</span>
                {[12, 24, 50, 100].map(n => (
                  <button key={n} onClick={() => setPorPagina(n)}
                    style={{ background: porPagina === n ? 'var(--vg-brand-50)' : 'var(--vg-surface-muted)', border: `1px solid ${porPagina === n ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`, borderRadius: 6, padding: '5px 10px', color: porPagina === n ? 'var(--vg-brand-500)' : 'var(--vg-muted)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: porPagina === n ? 700 : 400 }}>
                    {n}
                  </button>
                ))}
              </div>

              {/* Seletor de colunas */}
              <div style={{ position: 'relative' }}>
              <button onClick={() => setPainelColunas(p => !p)}
                style={{ background: painelColunas ? 'var(--vg-brand-50)' : 'var(--vg-surface-muted)', border: `1px solid ${painelColunas ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`, borderRadius: 8, padding: '7px 14px', color: painelColunas ? 'var(--vg-brand-500)' : 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚙️ Colunas selecionadas: {colunasVisiveis.size} de {COLUNAS_DEF.length}
                <span style={{ fontSize: '0.65rem' }}>{painelColunas ? '▲' : '▼'}</span>
              </button>

              {painelColunas && (
                <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 100, background: 'var(--vg-surface)', border: '1px solid var(--vg-border)', borderRadius: 12, padding: 16, minWidth: 320, boxShadow: '0 8px 32px rgba(28,31,59,0.18)' }}>
                  {/* Presets */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--vg-border)', paddingBottom: 10 }}>
                    {[['padrao','Padrão'],['minimo','Mínimo'],['todas','Todas']].map(([key,label]) => (
                      <button key={key} onClick={() => setColunasVisiveis(new Set(PRESETS[key]))}
                        style={{ background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 6, padding: '4px 12px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600 }}>
                        {label}
                      </button>
                    ))}
                    <span style={{ color: 'var(--vg-muted)', fontSize: '0.7rem', marginLeft: 4, display: 'flex', alignItems: 'center' }}>ou escolha:</span>
                  </div>
                  {/* Checkboxes por grupo */}
                  {['Identificação','Comercial','Movimentação','Meta'].map(grupo => {
                    const cols = COLUNAS_DEF.filter(c => c.grupo === grupo);
                    return (
                      <div key={grupo} style={{ marginBottom: 10 }}>
                        <div style={{ color: 'var(--vg-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>{grupo}</div>
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
                                style={{ background: ativo ? 'var(--vg-brand-50)' : 'var(--vg-surface-muted)', border: `1px solid ${ativo ? 'var(--vg-brand-500)' : 'var(--vg-border)'}`, borderRadius: 6, padding: '4px 10px', color: ativo ? 'var(--vg-brand-500)' : 'var(--vg-muted)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: ativo ? 700 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {ativo ? '✓' : '○'} {col.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setPainelColunas(false)}
                    style={{ marginTop: 6, background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 7, padding: '5px 14px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', width: '100%' }}>
                    ✕ Fechar
                  </button>
                </div>
              )}
              </div> {/* fecha: div position:relative do seletor colunas */}
            </div> {/* fecha: div flex do wrapper colunas+paginacao */}
            </div> {/* fecha: linha com filtro mês meta + seletor colunas */}
          </div> {/* fecha: div flexDirection:column linha 3 */}

          <TabelaEvolucao
            lista={listaFiltrada} meses={meses} libMap={libMap}
            colunas={colunasVisiveis} porPagina={porPagina}
            metasGravadas={metasGravadas}
            filtroMesMeta={filtroMesMeta}
            mesesVisiveis={meses.filter(m => !mesesOcultos.has(m))}
            onSalvarMeta={async (empresa, form) => {
              // Para upsell usa mesAlvoOverride; senão usa mesAlvo da meta normal
              const comp = form.mesAlvoOverride
                ? String(form.mesAlvoOverride).substring(0,10)
                : empresa._meta?.mesAlvo ? String(empresa._meta.mesAlvo).substring(0,10) : null;
              if (!comp) return { error: 'Mês da meta não identificado' };

              // Para upsell NÃO deleta a meta anterior — só insere nova
              if (!form.mesAlvoOverride) {
                await supabase.from('valor_meta_empresa')
                  .delete().eq('empresa_id', empresa.id).eq('competencia_meta', comp);
              }

              const { error } = await supabase.from('valor_meta_empresa').insert({
                empresa_id:        empresa.id,
                produto_id:        empresa.produto_id,
                consultor_id:      empresa._consId || null,
                competencia_meta:  comp,
                valor_bruto:       empresa._meta?.valorBruto || 0,
                valor_considerado: empresa._meta?.valorConsid || 0,
                valor_meta:        parseFloat(form.valor),
                pct_consultor:     empresa._pct ?? 100,
                regra:             form.regra,
                mes_sequencia:     form.regra === 'beneficio' ? 1 : form.regra === 'convenio' ? 3 : 0,
              });

              if (error) {
                // Tenta sem consultor_id
                const { error: err2 } = await supabase.from('valor_meta_empresa').insert({
                  empresa_id:        empresa.id,
                  produto_id:        empresa.produto_id,
                  consultor_id:      null,
                  competencia_meta:  comp,
                  valor_bruto:       empresa._meta?.valorBruto || 0,
                  valor_considerado: empresa._meta?.valorConsid || 0,
                  valor_meta:        parseFloat(form.valor),
                  pct_consultor:     empresa._pct ?? 100,
                  regra:             form.regra,
                  mes_sequencia:     form.regra === 'beneficio' ? 1 : form.regra === 'convenio' ? 3 : 0,
                });
                if (err2) return { error: err2.message };
              }

              // Atualiza mapa local
              const metaKey = `${empresa.id}__${comp}`;
              const allKey = `all__${empresa.id}`;
              setMetasGravadas(prev => {
                const novaEntrada = { valor_meta: parseFloat(form.valor), regra: form.regra, competencia_meta: comp };
                const listaAtual = (prev[allKey] || []).filter(x => x.competencia_meta !== comp);
                return {
                  ...prev,
                  [metaKey]: novaEntrada,
                  [allKey]: [...listaAtual, novaEntrada],
                };
              });
              return { ok: true };
            }}
            onRemoverMeta={async (empresa) => {
              const comp = empresa._meta?.mesAlvo ? String(empresa._meta.mesAlvo).substring(0,10) : null;
              if (!comp) return;
              await supabase.from('valor_meta_empresa')
                .delete().eq('empresa_id', empresa.id).eq('competencia_meta', comp);
              const delKey = `${empresa.id}__${comp}`;
              setMetasGravadas(prev => { const n={...prev}; delete n[delKey]; return n; });
            }}
            onConfirmarMeta={async (empresa, valorMeta) => {
              // Confirmação = registro NOVO (sem delete). Grava a meta calculada em valor_meta_empresa.
              const meta = empresa._meta;
              if (!meta?.mesAlvo) return { error: 'Mês da meta não identificado' };
              const comp = meta.mesAlvo.substring(0,7) + '-01';
              const { error } = await supabase.from('valor_meta_empresa').insert({
                empresa_id:        empresa.id,
                produto_id:        empresa.produto_id,
                consultor_id:      empresa._consId || null,
                competencia_meta:  comp,
                valor_bruto:       meta.valorBruto || 0,
                valor_considerado: meta.valorConsid || 0,
                valor_meta:        parseFloat(valorMeta),
                pct_consultor:     empresa._pct ?? 100,
                regra:             meta.regra,
                mes_sequencia:     meta.regra === 'beneficio' ? 1 : meta.regra === 'convenio' ? 3 : 0,
              });
              if (error) return { error: error.message };
              setMetasGravadas(prev => {
                const pointKey = `${empresa.id}__${meta.mesAlvo.substring(0,10)}`;
                const allKey   = `all__${empresa.id}`;
                const entrada  = { valor_meta: parseFloat(valorMeta), regra: meta.regra, competencia_meta: comp, consultor_id: empresa._consId || null };
                const listaAtual = (prev[allKey] || []).filter(x => !(x.competencia_meta?.substring(0,7) === comp.substring(0,7) && (x.consultor_id ?? null) === (empresa._consId ?? null)));
                return { ...prev, [pointKey]: entrada, [allKey]: [...listaAtual, entrada] };
              });
              return { ok: true };
            }}
            onConfirmarLote={async (empresasArr) => {
              const registros = empresasArr.map(empresa => {
                const meta = empresa._meta;
                if (!meta?.mesAlvo) return null;
                const comp = meta.mesAlvo.substring(0,7) + '-01';
                return {
                  empresa, comp, valor: meta.valorMeta, regra: meta.regra,
                  registro: {
                    empresa_id:        empresa.id,
                    produto_id:        empresa.produto_id,
                    consultor_id:      empresa._consId || null,
                    competencia_meta:  comp,
                    valor_bruto:       meta.valorBruto || 0,
                    valor_considerado: meta.valorConsid || 0,
                    valor_meta:        meta.valorMeta,
                    pct_consultor:     empresa._pct ?? 100,
                    regra:             meta.regra,
                    mes_sequencia:     meta.regra === 'beneficio' ? 1 : meta.regra === 'convenio' ? 3 : 0,
                  },
                };
              }).filter(Boolean);

              const CHUNK = 50;
              let confirmadas = 0; const falhas = []; const aplicados = [];
              for (let i = 0; i < registros.length; i += CHUNK) {
                const slice = registros.slice(i, i + CHUNK);
                const { error } = await supabase.from('valor_meta_empresa').insert(slice.map(r => r.registro));
                if (error) {
                  // Fallback: insere um a um para identificar quais falharam.
                  for (const r of slice) {
                    const { error: e2 } = await supabase.from('valor_meta_empresa').insert(r.registro);
                    if (e2) falhas.push({ nome: r.empresa.nome, id: r.empresa.produto_id, erro: e2.message });
                    else { confirmadas++; aplicados.push(r); }
                  }
                } else {
                  confirmadas += slice.length;
                  aplicados.push(...slice);
                }
              }
              if (aplicados.length) {
                setMetasGravadas(prev => {
                  const next = { ...prev };
                  for (const r of aplicados) {
                    const meta = r.empresa._meta;
                    const pointKey = `${r.empresa.id}__${meta.mesAlvo.substring(0,10)}`;
                    const allKey   = `all__${r.empresa.id}`;
                    const entrada  = { valor_meta: r.valor, regra: r.regra, competencia_meta: r.comp, consultor_id: r.empresa._consId || null };
                    const listaAtual = (next[allKey] || []).filter(x => !(x.competencia_meta?.substring(0,7) === r.comp.substring(0,7) && (x.consultor_id ?? null) === (r.empresa._consId ?? null)));
                    next[pointKey] = entrada;
                    next[allKey] = [...listaAtual, entrada];
                  }
                  return next;
                });
              }
              return { confirmadas, falhas };
            }}
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
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--vg-success-fg)', margin: '12px 0 4px' }}>{fmt(m.total)}</div>
                <div style={{ color: 'var(--vg-ink-secondary)', fontSize: '0.8rem' }}>{m.empresas} empresas creditando</div>
                <div style={{ color: 'var(--vg-muted)', fontSize: '0.75rem', marginTop: 2 }}>{kpis.total - m.empresas} sem crédito neste mês</div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'var(--vg-surface-muted)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--vg-success-fg)', height: '100%', width: `${kpis.total > 0 ? (m.empresas / kpis.total) * 100 : 0}%` }} />
                  </div>
                  <div style={{ color: 'var(--vg-muted)', fontSize: '0.72rem', marginTop: 4 }}>{kpis.total > 0 ? fmtPct((m.empresas / kpis.total) * 100) : '0%'} de ativação</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--vg-ink)' }}>Distribuição de Tendências</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {['up','down','flat','new','none'].map(t => {
                const count = listaFiltrada.filter(e => e.tend === t).length;
                const ts = TEND[t];
                return (
                  <div key={t} style={{ ...s.mesCard, flex: '0 0 auto', minWidth: 140, cursor: 'pointer' }}
                    onClick={() => { setFiltroTend(t); setAba('evolucao'); }}>
                    <div style={{ color: ts.color, fontWeight: 700, fontSize: '1.6rem' }}>{count}</div>
                    <div style={{ color: ts.color, fontSize: '0.85rem', marginTop: 6 }}>{ts.label}</div>
                    <div style={{ color: 'var(--vg-muted)', fontSize: '0.72rem', marginTop: 4 }}>clique para filtrar</div>
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
          <div style={{ color: 'var(--vg-muted)', fontSize: '0.82rem', marginTop: 6, marginBottom: 16 }}>
            Empresas com potencial cadastrado · {meses.length} meses de referência
          </div>
          <div style={{ ...s.filtroRow, marginBottom: 16 }}>
            <select style={{ ...s.sel, borderColor: filtroDiretor !== 'todos' ? 'var(--vg-brand-400)' : 'var(--vg-border)', color: filtroDiretor !== 'todos' ? 'var(--vg-brand-400)' : 'var(--vg-ink)' }} value={filtroDiretor} onChange={e => setFiltroDiretor(e.target.value)}>
              <option value="todos">Todos os diretores</option>
              {opcoes.diretores.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroGestor !== 'todos' ? 'var(--vg-info-fg)' : 'var(--vg-border)', color: filtroGestor !== 'todos' ? 'var(--vg-info-fg)' : 'var(--vg-ink)' }} value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)}>
              <option value="todos">{filtroDiretor === 'todos' ? 'Todos os gestores' : `Gestores de ${filtroDiretor}`}</option>
              {opcoes.gestores.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroDepto !== 'todos' ? 'var(--vg-brand-500)' : 'var(--vg-border)', color: filtroDepto !== 'todos' ? 'var(--vg-brand-500)' : 'var(--vg-ink)' }} value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)}>
              <option value="todos">Todas as equipes</option>
              {opcoes.deptos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select style={{ ...s.sel, borderColor: filtroVendedor !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-border)', color: filtroVendedor !== 'todos' ? 'var(--vg-success-fg)' : 'var(--vg-ink)' }} value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
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
  btn:      { background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-border)', borderRadius: 7, padding: '5px 10px', color: 'var(--vg-ink-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 32 },
  ativo:    { background: 'var(--vg-brand-500)', borderColor: 'var(--vg-brand-500)', color: 'var(--vg-brand-500)', fontWeight: 700 },
  disabled: { opacity: 0.3, cursor: 'default' },
  dots:     { color: 'var(--vg-muted)', fontSize: '0.82rem', padding: '0 2px' },
};

const s = {
  page:         { maxWidth: 1400, margin: '0 auto', padding: '24px 24px', fontFamily: "'Inter', sans-serif", color: 'var(--vg-ink)', background: 'var(--vg-bg)', minHeight: '100vh', boxSizing: 'border-box' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 16 },
  tag:          { color: 'var(--vg-muted)', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', marginBottom: 8, textTransform: 'uppercase' },
  title:        { fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--vg-ink)' },
  sub:          { color: 'var(--vg-ink-secondary)', fontSize: '0.9rem' },
  linkBtnGreen: { background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', borderRadius: 10, padding: '10px 20px', color: 'var(--vg-success-fg)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 },
  kpis:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 },
  kpi:          { background: 'var(--vg-surface)', border: '1px solid var(--vg-surface-muted)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 },
  kpiLabel:     { color: 'var(--vg-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1 },
  kpiVal:       { fontFamily: "'Outfit', sans-serif", fontSize: '1.2rem', fontWeight: 700 },
  kpiSub:       { color: 'var(--vg-muted)', fontSize: '0.72rem' },
  tabs:         { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab:          { background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-surface-muted)', borderRadius: 10, padding: '8px 16px', color: 'var(--vg-muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit' },
  tabAtiva:     { background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', color: 'var(--vg-success-fg)' },
  card:         { background: 'var(--vg-surface)', border: '1px solid var(--vg-surface-muted)', borderRadius: 16, padding: 28, marginBottom: 24 },
  cardTitle:    { fontFamily: "'Outfit', sans-serif", fontSize: '1rem', fontWeight: 700, color: 'var(--vg-ink)' },
  filtroRow:    { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  busca:        { flex: '1 1 220px', background: 'var(--vg-surface)', border: '1px solid var(--vg-border)', borderRadius: 10, padding: '9px 14px', color: 'var(--vg-ink)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' },
  sel:          { background: 'var(--vg-surface)', border: '1px solid var(--vg-border)', borderRadius: 10, padding: '9px 14px', color: 'var(--vg-ink)', fontSize: '0.85rem', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th:           { padding: '8px 12px', textAlign: 'left', color: 'var(--vg-muted)', fontWeight: 500, borderBottom: '1px solid var(--vg-surface-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5, position: 'sticky', top: 0, background: 'var(--vg-surface)', zIndex: 2 },
  td:           { padding: '10px 12px', borderBottom: '1px solid var(--vg-surface-muted)', whiteSpace: 'nowrap' },
  badgeGreen:   { background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', color: 'var(--vg-success-fg)', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  badgeRed:     { background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger-fg)', color: 'var(--vg-danger-fg)', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600 },
  mesCard:      { background: 'var(--vg-surface-muted)', border: '1px solid var(--vg-surface-muted)', borderRadius: 14, padding: '20px 24px', flex: '1 1 180px', minWidth: 180 },
  mesBadge:     { display: 'inline-block', background: 'var(--vg-success-bg)', border: '1px solid var(--vg-success-fg)', color: 'var(--vg-success-fg)', borderRadius: 8, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 700 },
  spin:         { width: 40, height: 40, border: '3px solid var(--vg-border)', borderTop: '3px solid var(--vg-success-fg)', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
};

// cache bust 2026-08-03T19:52:42Z
