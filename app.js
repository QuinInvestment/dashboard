/* =========================================================
   PATRIMOINE — app.js
   Aucune dépendance externe. Stockage 100% local (localStorage).
   ========================================================= */

const STORAGE_KEY = 'patrimoine_v1';

const ENVELOPPES = [
  { id: 'CTO', label: 'Compte-titres',  code: 'CTO', color: '#B18CFF', plafond: false, taux: false },
  { id: 'PEA', label: 'PEA',            code: 'PEA', color: '#5B8DEF', plafond: true,  plafondDefault: 150000, taux: false },
  { id: 'LA',  label: 'Livret A',       code: 'LA',  color: '#34C9A3', plafond: true,  plafondDefault: 22950,  taux: true, tauxDefault: 1.70 },
  { id: 'LJ',  label: 'Livret Jeune',   code: 'LJ',  color: '#F5A623', plafond: true,  plafondDefault: 1600,   taux: true, tauxDefault: 1.70 },
  { id: 'AV',  label: 'Assurance Vie',  code: 'AV',  color: '#E85D75', plafond: false, taux: false },
];

const envById = id => ENVELOPPES.find(e => e.id === id);

const TYPE_COLORS = {
  'Action': '#5B8DEF',
  'ETF': '#34C9A3',
  'Obligation': '#C9A227',
  'Fonds €': '#B18CFF',
  'Unité de compte': '#E85D75',
  'Liquidités': '#8B93A7',
  'Autre': '#F5A623'
};
const typeColor = t => TYPE_COLORS[t] || '#5A6274';

function defaultState(){
  const params = {};
  ENVELOPPES.forEach(e => {
    params[e.id] = {};
    if (e.plafond) params[e.id].plafond = e.plafondDefault;
    if (e.taux) params[e.id].taux = e.tauxDefault;
  });
  return {
    identity: { name: 'TOM', currency: 'EUR' },
    actifs: [],
    params,
    avOpenDate: '',
    goal: { amount: null, date: '' },
    history: []
  };
}

/* ---------- couche de stockage résiliente ----------
   Sur certains navigateurs / contextes (fichier ouvert en file://,
   navigation privée, aperçu dans une iframe sandboxée…), localStorage
   peut être bloqué et lever une exception. Sans protection, le moindre
   clic sur "Enregistrer" plantait alors silencieusement : la modale ne
   se fermait jamais et rien ne s'affichait. On teste la disponibilité
   au démarrage et on bascule sur un stockage en mémoire (le temps de la
   session) si besoin, pour que le site reste utilisable dans tous les cas. */
let storageAvailable = true;
let memoryFallback = {};

function testStorage(){
  try{
    const k = '__patrimoine_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  }catch(e){
    return false;
  }
}
storageAvailable = testStorage();

function storageGet(){
  if (storageAvailable){
    try{ return window.localStorage.getItem(STORAGE_KEY); }
    catch(e){ storageAvailable = false; }
  }
  return memoryFallback[STORAGE_KEY] || null;
}

function storageSet(json){
  if (storageAvailable){
    try{ window.localStorage.setItem(STORAGE_KEY, json); return; }
    catch(e){ storageAvailable = false; }
  }
  memoryFallback[STORAGE_KEY] = json;
}

let state = loadState();

function loadState(){
  try{
    const raw = storageGet();
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // merge with defaults so new fields survive upgrades
    const d = defaultState();
    return {
      ...d, ...parsed,
      identity: { ...d.identity, ...(parsed.identity||{}) },
      params: { ...d.params, ...(parsed.params||{}) },
      goal: { ...d.goal, ...(parsed.goal||{}) }
    };
  }catch(e){
    console.error('Lecture du stockage impossible', e);
    return defaultState();
  }
}

function saveState(){
  const wasAvailable = storageAvailable;
  try{
    storageSet(JSON.stringify(state));
  }catch(e){
    console.error('Écriture du stockage impossible', e);
  }
  if (wasAvailable && !storageAvailable){
    toast('Stockage local indisponible : les données resteront affichées mais ne seront pas conservées après fermeture.');
  }
}

/* ---------- helpers ---------- */

function money(n, opts={}){
  const cur = state.identity.currency === 'USD' ? 'USD' : 'EUR';
  const val = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('fr-FR', { style:'currency', currency: cur, maximumFractionDigits: opts.decimals ?? 2, minimumFractionDigits: opts.decimals ?? 2 }).format(val);
}
function pct(n, decimals=1){
  if (!Number.isFinite(n)) return '—';
  return (n>0?'+':'') + n.toFixed(decimals) + ' %';
}
function uid(){ return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

function actifValeur(a){
  if (a.quantite && a.prix) return a.quantite * a.prix;
  return a.valeur || 0;
}
function actifInvesti(a){ return a.investi || 0; }
function actifGain(a){
  const v = actifValeur(a), inv = actifInvesti(a);
  if (!inv) return null;
  return v - inv;
}
function actifGainPct(a){
  const g = actifGain(a), inv = actifInvesti(a);
  if (g === null || !inv) return null;
  return (g / inv) * 100;
}

function envelopeTotals(){
  const totals = {};
  ENVELOPPES.forEach(e => totals[e.id] = { valeur:0, investi:0, count:0 });
  state.actifs.forEach(a => {
    if (!totals[a.enveloppe]) return;
    totals[a.enveloppe].valeur += actifValeur(a);
    totals[a.enveloppe].investi += actifInvesti(a);
    totals[a.enveloppe].count += 1;
  });
  return totals;
}

function grandTotal(){
  return state.actifs.reduce((s,a) => s + actifValeur(a), 0);
}
function grandInvesti(){
  return state.actifs.reduce((s,a) => s + actifInvesti(a), 0);
}

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove('show'), 2400);
}

/* =========================================================
   TABS
   ========================================================= */
document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t===btn));
  const target = btn.dataset.tab;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-'+target));
  if (target === 'dashboard') renderDashboard();
  if (target === 'historique') renderHistorique();
  if (target === 'parametres') renderParametres();
});

/* =========================================================
   DASHBOARD RENDER
   ========================================================= */

function updateTopbar(){
  document.getElementById('brandName').textContent = state.identity.name || 'TOM';
  document.getElementById('topbarTotal').innerHTML = money(grandTotal());
  const hist = state.history;
  const deltaEl = document.getElementById('topbarDelta');
  if (hist.length){
    const last = hist[hist.length-1].total;
    const diff = grandTotal() - last;
    deltaEl.textContent = (diff>=0?'▲ ':'▼ ') + money(Math.abs(diff));
    deltaEl.style.color = diff>=0 ? 'var(--green)' : 'var(--red)';
  } else {
    deltaEl.textContent = '';
  }
}

function renderDashboard(){
  const total = grandTotal();
  const investi = grandInvesti();
  document.getElementById('heroTotal').innerHTML = money(total);

  const gainEl = document.getElementById('heroGain');
  if (investi > 0){
    const gain = total - investi;
    const gp = (gain/investi)*100;
    gainEl.textContent = money(gain) + ' (' + pct(gp) + ')';
    gainEl.className = 'pill ' + (gain>=0 ? 'pos' : 'neg');
  } else {
    gainEl.textContent = 'Renseigne un montant investi pour suivre ta performance';
    gainEl.className = 'pill';
  }

  renderSparkline();
  renderDonut();
  renderEnvelopeCards();
  renderGoal();
  renderDonutType();
  renderTaxEstimate();
  renderTicker();
  renderSimulator();
  updateTopbar();
}

/* ---------- objectif patrimonial ---------- */
function renderGoal(){
  const goal = state.goal || {};
  const total = grandTotal();
  const valueEl = document.getElementById('goalValueText');
  const projEl = document.getElementById('goalProjection');
  const fillEl = document.getElementById('goalFill');

  if (!goal.amount || goal.amount <= 0){
    valueEl.textContent = '—';
    projEl.textContent = 'Définis un montant cible dans Paramètres pour suivre ta progression.';
    fillEl.style.width = '0%';
    return;
  }

  const frac = Math.min(100, (total / goal.amount) * 100);
  valueEl.textContent = `${money(total)} / ${money(goal.amount)} (${frac.toFixed(1)}%)`;
  fillEl.style.width = frac + '%';
  fillEl.style.background = frac >= 100 ? 'var(--green)' : 'var(--gold)';

  if (total >= goal.amount){
    projEl.textContent = '🎯 Objectif atteint !';
    projEl.style.color = 'var(--green)';
    return;
  }
  projEl.style.color = '';

  // Projection à partir de la tendance de l'historique (régression simple sur les points enregistrés)
  const hist = [...state.history];
  hist.push({ date: todayISO(), total });
  if (hist.length < 2){
    projEl.textContent = goal.date
      ? `Objectif fixé au ${goal.date}. Enregistre au moins deux points d'historique pour estimer si tu es dans les temps.`
      : `Enregistre au moins deux points d'historique (onglet Historique) pour estimer une date d'atteinte.`;
    return;
  }
  const first = hist[0], last = hist[hist.length - 1];
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  const growthPerDay = days > 0 ? (last.total - first.total) / days : 0;

  if (growthPerDay <= 0){
    projEl.textContent = 'Ta tendance actuelle est stagnante ou négative — pas de date d\'atteinte estimable.';
    return;
  }
  const remaining = goal.amount - total;
  const daysNeeded = Math.ceil(remaining / growthPerDay);
  const targetDate = new Date(); targetDate.setDate(targetDate.getDate() + daysNeeded);
  const estStr = targetDate.toISOString().slice(0,10);

  if (goal.date){
    const onTrack = targetDate <= new Date(goal.date);
    projEl.textContent = (onTrack ? '✓ ' : '⚠ ') + `Au rythme actuel, objectif atteint vers le ${estStr} (cible : ${goal.date}).`;
    projEl.style.color = onTrack ? 'var(--green)' : 'var(--red)';
  } else {
    projEl.textContent = `Au rythme actuel (${money(growthPerDay*30,{decimals:0})}/mois), objectif atteint vers le ${estStr}.`;
  }
}

/* ---------- répartition par classe d'actif ---------- */
function renderDonutType(){
  const svg = document.getElementById('donutType');
  const legend = document.getElementById('donutTypeLegend');
  const total = grandTotal();

  const totalsByType = {};
  state.actifs.forEach(a => {
    const t = a.type || 'Autre';
    totalsByType[t] = (totalsByType[t] || 0) + actifValeur(a);
  });
  const types = Object.keys(totalsByType).filter(t => totalsByType[t] > 0).sort((a,b) => totalsByType[b]-totalsByType[a]);
  document.getElementById('donutTypeCount').textContent = types.length;

  if (total <= 0 || !types.length){
    svg.innerHTML = `<circle cx="100" cy="100" r="80" fill="none" stroke="var(--surface-3)" stroke-width="24"/>`;
    legend.innerHTML = '<li class="name" style="color:var(--text-faint)">Aucun actif valorisé pour le moment.</li>';
    return;
  }

  const r = 80, cx = 100, cy = 100, circ = 2*Math.PI*r, strokeW = 24;
  let offset = 0, circles = '', legendHtml = '';
  types.forEach(t => {
    const v = totalsByType[t];
    const frac = v / total;
    const dash = frac * circ;
    const color = typeColor(t);
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeW}"
      stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-offset}" stroke-linecap="butt"/>`;
    offset += dash;
    legendHtml += `<li><span class="dot" style="background:${color}"></span><span class="name">${escapeHtml(t)}</span><span class="val">${(frac*100).toFixed(0)}%</span></li>`;
  });
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${strokeW}"/>` + circles;
  legend.innerHTML = legendHtml;
}

/* ---------- estimation fiscale simplifiée (PFU 30% sur CTO) ---------- */
function renderTaxEstimate(){
  const wrap = document.getElementById('taxContent');
  const ctoActifs = state.actifs.filter(a => a.enveloppe === 'CTO');
  const investi = ctoActifs.reduce((s,a) => s + actifInvesti(a), 0);
  const valeur = ctoActifs.reduce((s,a) => s + actifValeur(a), 0);
  const gain = valeur - investi;

  if (!investi || gain <= 0){
    wrap.innerHTML = '<p class="tax-empty">Aucune plus-value latente à estimer sur le CTO pour l\'instant.</p>';
    return;
  }
  const impot = gain * 0.30;
  const net = valeur - impot;
  wrap.innerHTML = `
    <div class="tax-row"><span class="label">Plus-value latente CTO</span><span class="value" style="color:var(--green)">${money(gain,{decimals:0})}</span></div>
    <div class="tax-row"><span class="label">PFU estimé (30%)</span><span class="value" style="color:var(--red)">− ${money(impot,{decimals:0})}</span></div>
    <div class="tax-row net"><span class="label">Valeur nette estimée si cession totale</span><span class="value">${money(net,{decimals:0})}</span></div>
  `;
}

function renderSparkline(){
  const svg = document.getElementById('sparkline');
  const pts = state.history.map(h => h.total);
  pts.push(grandTotal());
  if (pts.length < 2){
    svg.innerHTML = '<text x="300" y="60" text-anchor="middle" fill="var(--text-faint)" font-family="IBM Plex Mono" font-size="12">Pas encore assez de données — enregistre un point dans l\'onglet Historique</text>';
    return;
  }
  const w = 600, h = 120, pad = 6;
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = (max - min) || 1;
  const step = (w - pad*2) / (pts.length - 1);
  const coords = pts.map((v,i) => [pad + i*step, h - pad - ((v-min)/range)*(h-pad*2)]);
  const line = coords.map((c,i) => (i===0?'M':'L') + c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ');
  const area = line + ` L${coords[coords.length-1][0]},${h} L${coords[0][0]},${h} Z`;
  const up = pts[pts.length-1] >= pts[0];
  const color = up ? 'var(--green)' : 'var(--red)';
  svg.innerHTML = `
    <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${up ? '#34D399' : '#F87171'}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${up ? '#34D399' : '#F87171'}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#sparkGrad)" stroke="none"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${coords[coords.length-1][0]}" cy="${coords[coords.length-1][1]}" r="3.5" fill="${color}"/>
  `;
}

function renderDonut(){
  const svg = document.getElementById('donut');
  const legend = document.getElementById('donutLegend');
  const totals = envelopeTotals();
  const total = grandTotal();
  document.getElementById('donutCount').textContent = state.actifs.length;

  if (total <= 0){
    svg.innerHTML = `<circle cx="100" cy="100" r="80" fill="none" stroke="var(--surface-3)" stroke-width="24"/>`;
    legend.innerHTML = '<li class="name" style="color:var(--text-faint)">Aucun actif valorisé pour le moment.</li>';
    return;
  }

  const r = 80, cx = 100, cy = 100, circ = 2*Math.PI*r, strokeW = 24;
  let offset = 0;
  let circles = '';
  let legendHtml = '';
  ENVELOPPES.forEach(e => {
    const v = totals[e.id].valeur;
    if (v <= 0) return;
    const frac = v / total;
    const dash = frac * circ;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}" stroke-width="${strokeW}"
      stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-offset}" stroke-linecap="butt"/>`;
    offset += dash;
    legendHtml += `<li><span class="dot" style="background:${e.color}"></span><span class="name">${e.label}</span><span class="val">${(frac*100).toFixed(0)}%</span></li>`;
  });
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${strokeW}"/>` + circles;
  legend.innerHTML = legendHtml;
}

function renderEnvelopeCards(){
  const totals = envelopeTotals();
  const wrap = document.getElementById('envelopeCards');
  wrap.innerHTML = ENVELOPPES.map(e => {
    const t = totals[e.id];
    const p = state.params[e.id] || {};
    let gaugeHtml = '';
    if (e.plafond){
      const base = e.id === 'PEA' ? t.investi : t.valeur; // PEA plafond = versements, livrets = solde
      const plafond = p.plafond || e.plafondDefault;
      const frac = Math.min(100, (base/plafond)*100);
      const warn = frac >= 90;
      gaugeHtml = `
        <div class="env-gauge">
          <div class="gauge-track"><div class="gauge-fill" style="width:${frac}%;background:${e.color}"></div></div>
          <div class="gauge-label ${warn?'warn':''}">
            <span>${money(base,{decimals:0})} / ${money(plafond,{decimals:0})}</span>
            <span>${frac.toFixed(0)}%</span>
          </div>
        </div>`;
    }
    let rateHtml = '';
    if (e.taux){
      rateHtml = `<div class="env-rate">Taux configuré : ${(p.taux ?? e.tauxDefault)}% / an</div>`;
    }
    return `
      <div class="env-card" style="--c:${e.color}" data-env="${e.id}">
        <div class="env-code">${e.code}</div>
        <div class="env-name">${e.label}</div>
        <div class="env-value">${money(t.valeur)}</div>
        <div class="env-count">${t.count} actif${t.count>1?'s':''}</div>
        ${gaugeHtml}
        ${rateHtml}
      </div>`;
  }).join('');

  wrap.querySelectorAll('.env-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelector('.tab[data-tab="actifs"]').click();
      document.getElementById('filterEnveloppe').value = card.dataset.env;
      renderActifsTable();
    });
  });
}

function renderTicker(){
  const track = document.getElementById('tickerTrack');
  if (!state.actifs.length){
    track.innerHTML = '<span class="ticker-item">Ajoute des actifs pour animer le bandeau —</span>';
    return;
  }
  const items = state.actifs.map(a => {
    const gp = actifGainPct(a);
    const e = envById(a.enveloppe);
    const cls = gp === null ? '' : (gp >= 0 ? 'ticker-up' : 'ticker-down');
    const arrow = gp === null ? '·' : (gp >= 0 ? '▲' : '▼');
    return `<span class="ticker-item"><span class="ticker-dot" style="background:${e?e.color:'#666'}"></span><b>${escapeHtml(a.nom)}</b> ${money(actifValeur(a),{decimals:0})} <span class="${cls}">${arrow} ${gp===null?'—':pct(gp)}</span></span>`;
  });
  // duplicate for seamless loop
  track.innerHTML = items.join('') + items.join('');
}

function renderSimulator(){
  const sel = document.getElementById('simEnveloppe');
  const monthlyInput = document.getElementById('simMonthly');
  function compute(){
    const envId = sel.value;
    const totals = envelopeTotals();
    const base = totals[envId].valeur;
    const p = state.params[envId] || {};
    const e = envById(envId);
    const rate = (p.taux ?? e.tauxDefault ?? 0) / 100;
    const monthly = Number(monthlyInput.value) || 0;
    const plafond = p.plafond || e.plafondDefault;

    function fv(years){
      const n = years * 12, r = rate/12;
      let capital = base;
      for (let i=0;i<n;i++){
        capital = Math.min(capital + monthly, plafond * 3); // cap runaway simulation
        capital *= (1 + r);
      }
      return capital;
    }
    const y1 = fv(1), y5 = fv(5), y10 = fv(10);
    document.getElementById('simOutput').innerHTML =
      `Dans 1 an : <b>${money(y1,{decimals:0})}</b> &nbsp;·&nbsp; 5 ans : <b>${money(y5,{decimals:0})}</b> &nbsp;·&nbsp; 10 ans : <b>${money(y10,{decimals:0})}</b>`;
  }
  sel.onchange = compute;
  monthlyInput.oninput = compute;
  compute();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* =========================================================
   ACTIFS — table, filtres, modal
   ========================================================= */

function populateEnvelopeSelects(){
  const filterSel = document.getElementById('filterEnveloppe');
  const formSel = document.getElementById('fEnveloppe');
  const extra = ENVELOPPES.map(e => `<option value="${e.id}">${e.label}</option>`).join('');
  filterSel.innerHTML = '<option value="ALL">Toutes les enveloppes</option>' + extra;
  formSel.innerHTML = extra;
}

function renderActifsTable(){
  const body = document.getElementById('actifsBody');
  const empty = document.getElementById('actifsEmpty');
  const search = document.getElementById('searchActif').value.trim().toLowerCase();
  const filterEnv = document.getElementById('filterEnveloppe').value;
  const sort = document.getElementById('sortActifs').value;

  let list = state.actifs.filter(a => {
    if (filterEnv !== 'ALL' && a.enveloppe !== filterEnv) return false;
    if (search && !(a.nom.toLowerCase().includes(search) || (a.type||'').toLowerCase().includes(search))) return false;
    return true;
  });

  list.sort((a,b) => {
    switch(sort){
      case 'valeur-asc': return actifValeur(a) - actifValeur(b);
      case 'nom-asc': return a.nom.localeCompare(b.nom);
      case 'gain-desc': return (actifGainPct(b) ?? -Infinity) - (actifGainPct(a) ?? -Infinity);
      case 'date-desc': return (b.date||'').localeCompare(a.date||'');
      case 'valeur-desc':
      default: return actifValeur(b) - actifValeur(a);
    }
  });

  if (!list.length){
    body.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  body.innerHTML = list.map(a => {
    const e = envById(a.enveloppe);
    const gain = actifGain(a);
    const gp = actifGainPct(a);
    const gainHtml = gain === null
      ? '<span style="color:var(--text-faint)">—</span>'
      : `<span class="${gain>=0?'gain-pos':'gain-neg'}">${money(gain,{decimals:0})} (${pct(gp)})</span>`;
    return `
      <tr data-id="${a.id}">
        <td><span class="env-tag" style="background:${e.color}22;color:${e.color}">${e.code}</span></td>
        <td>${escapeHtml(a.nom)}</td>
        <td>${escapeHtml(a.type||'—')}</td>
        <td class="mono">${a.quantite ?? '—'}</td>
        <td class="mono">${a.prix ? money(a.prix) : '—'}</td>
        <td class="mono">${a.investi ? money(a.investi,{decimals:0}) : '—'}</td>
        <td class="mono">${money(actifValeur(a),{decimals:0})}</td>
        <td class="mono">${gainHtml}</td>
        <td class="row-arrow">›</td>
      </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => openActifModal(tr.dataset.id));
  });
}

['searchActif','filterEnveloppe','sortActifs'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderActifsTable);
  document.getElementById(id).addEventListener('change', renderActifsTable);
});

/* ---------- modal ---------- */
const modalBackdrop = document.getElementById('modalBackdrop');
const actifForm = document.getElementById('actifForm');

function openActifModal(id){
  actifForm.reset();
  document.getElementById('fDate').value = todayISO();
  if (id){
    const a = state.actifs.find(x => x.id === id);
    document.getElementById('modalTitle').textContent = 'Modifier l\'actif';
    document.getElementById('fId').value = a.id;
    document.getElementById('fEnveloppe').value = a.enveloppe;
    document.getElementById('fNom').value = a.nom;
    document.getElementById('fType').value = a.type || 'Action';
    document.getElementById('fQuantite').value = a.quantite ?? '';
    document.getElementById('fPrix').value = a.prix ?? '';
    document.getElementById('fInvesti').value = a.investi ?? '';
    document.getElementById('fValeur').value = a.valeur ?? '';
    document.getElementById('fDate').value = a.date || todayISO();
    document.getElementById('fNotes').value = a.notes || '';
    document.getElementById('fDelete').hidden = false;
  } else {
    document.getElementById('modalTitle').textContent = 'Nouvel actif';
    document.getElementById('fId').value = '';
    document.getElementById('fDelete').hidden = true;
  }
  modalBackdrop.hidden = false;
  document.getElementById('fNom').focus();
}
function closeModal(){
  modalBackdrop.hidden = true;
  // Le focus reste sinon coincé sur un champ désormais masqué, ce qui bloquerait
  // les raccourcis clavier (n, /) tant qu'on n'a pas cliqué ailleurs manuellement.
  if (document.activeElement && modalBackdrop.contains(document.activeElement)){
    document.activeElement.blur();
  }
}

document.getElementById('btnAddActif').addEventListener('click', () => openActifModal(null));
document.getElementById('btnAddActifEmpty').addEventListener('click', () => openActifModal(null));
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('fCancel').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modalBackdrop.hidden){ closeModal(); return; }

  const typingInField = ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);

  // "n" -> nouvel actif (sauf si on est en train de taper quelque part)
  if (e.key === 'n' && !typingInField && modalBackdrop.hidden){
    e.preventDefault();
    openActifModal(null);
    return;
  }

  // "/" -> aller sur l'onglet Actifs et focus la recherche
  if (e.key === '/' && !typingInField){
    e.preventDefault();
    document.querySelector('.tab[data-tab="actifs"]').click();
    document.getElementById('searchActif').focus();
  }
});

actifForm.addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('fId').value || uid();
  const payload = {
    id,
    enveloppe: document.getElementById('fEnveloppe').value,
    nom: document.getElementById('fNom').value.trim(),
    type: document.getElementById('fType').value,
    quantite: parseFloat(document.getElementById('fQuantite').value) || null,
    prix: parseFloat(document.getElementById('fPrix').value) || null,
    investi: parseFloat(document.getElementById('fInvesti').value) || 0,
    valeur: parseFloat(document.getElementById('fValeur').value) || 0,
    date: document.getElementById('fDate').value || todayISO(),
    notes: document.getElementById('fNotes').value.trim()
  };
  const existingIdx = state.actifs.findIndex(a => a.id === id);
  if (existingIdx >= 0) state.actifs[existingIdx] = payload;
  else state.actifs.push(payload);
  saveState();
  closeModal();
  renderActifsTable();
  renderDashboard();
  toast(existingIdx >= 0 ? 'Actif mis à jour' : 'Actif ajouté');
});

document.getElementById('fDelete').addEventListener('click', () => {
  const id = document.getElementById('fId').value;
  if (!id) return;
  if (!confirm('Supprimer définitivement cet actif ?')) return;
  state.actifs = state.actifs.filter(a => a.id !== id);
  saveState();
  closeModal();
  renderActifsTable();
  renderDashboard();
  toast('Actif supprimé');
});

/* =========================================================
   HISTORIQUE
   ========================================================= */

function renderHistorique(){
  renderLineChart();
  const body = document.getElementById('histBody');
  const empty = document.getElementById('histEmpty');
  if (!state.history.length){
    body.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const rows = [...state.history].reverse();
  body.innerHTML = rows.map(h => `
    <tr data-date="${h.date}">
      <td class="mono">${h.date}</td>
      <td class="mono">${money(h.total,{decimals:0})}</td>
      <td class="mono">${money(h.CTO||0,{decimals:0})}</td>
      <td class="mono">${money(h.PEA||0,{decimals:0})}</td>
      <td class="mono">${money(h.LA||0,{decimals:0})}</td>
      <td class="mono">${money(h.LJ||0,{decimals:0})}</td>
      <td class="mono">${money(h.AV||0,{decimals:0})}</td>
      <td class="row-arrow"><button class="btn btn-ghost" data-del="${h.date}" style="padding:4px 10px">×</button></td>
    </tr>`).join('');

  body.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.history = state.history.filter(h => h.date !== btn.dataset.del);
      saveState();
      renderHistorique();
      renderDashboard();
    });
  });
}

function renderLineChart(){
  const svg = document.getElementById('lineChart');
  const pts = [...state.history];
  const w = 900, h = 300, padL = 60, padR = 20, padT = 20, padB = 30;

  if (pts.length < 2){
    svg.innerHTML = `<text x="450" y="150" text-anchor="middle" fill="var(--text-faint)" font-family="IBM Plex Mono" font-size="13">Enregistre au moins deux points pour tracer une courbe</text>`;
    return;
  }
  const values = pts.map(p => p.total);
  const min = Math.min(0, ...values), max = Math.max(...values) * 1.08 || 1;
  const xStep = (w - padL - padR) / (pts.length - 1);
  const yOf = v => padT + (h-padT-padB) - ((v-min)/(max-min || 1))*(h-padT-padB);
  const xOf = i => padL + i*xStep;

  const line = pts.map((p,i) => (i===0?'M':'L') + xOf(i).toFixed(1) + ',' + yOf(p.total).toFixed(1)).join(' ');
  const area = line + ` L${xOf(pts.length-1).toFixed(1)},${h-padB} L${xOf(0).toFixed(1)},${h-padB} Z`;

  // gridlines (4 horizontal)
  let grid = '';
  for (let i=0;i<=4;i++){
    const yy = padT + i*(h-padT-padB)/4;
    const val = max - i*(max-min)/4;
    grid += `<line x1="${padL}" y1="${yy}" x2="${w-padR}" y2="${yy}" stroke="var(--border)" stroke-width="1"/>`;
    grid += `<text x="${padL-8}" y="${yy+4}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="var(--text-faint)">${money(val,{decimals:0})}</text>`;
  }
  const dots = pts.map((p,i) => `<circle cx="${xOf(i)}" cy="${yOf(p.total)}" r="3" fill="var(--gold)"><title>${p.date} — ${money(p.total)}</title></circle>`).join('');
  const labelStep = Math.ceil(pts.length/6);
  const labels = pts.map((p,i) => i%labelStep===0 ? `<text x="${xOf(i)}" y="${h-8}" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="var(--text-faint)">${p.date.slice(5)}</text>` : '').join('');

  svg.innerHTML = `
    <defs><linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C9A227" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#C9A227" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#lineGrad)" stroke="none"/>
    <path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  `;
}

document.getElementById('btnSnapshot').addEventListener('click', () => {
  const totals = envelopeTotals();
  const date = todayISO();
  const point = {
    date,
    total: grandTotal(),
    CTO: totals.CTO.valeur, PEA: totals.PEA.valeur, LA: totals.LA.valeur, LJ: totals.LJ.valeur, AV: totals.AV.valeur
  };
  const idx = state.history.findIndex(h => h.date === date);
  if (idx >= 0) state.history[idx] = point;
  else state.history.push(point);
  state.history.sort((a,b) => a.date.localeCompare(b.date));
  saveState();
  renderHistorique();
  renderDashboard();
  toast('Point enregistré pour ' + date);
});

/* =========================================================
   PARAMETRES
   ========================================================= */

function renderParametres(){
  document.getElementById('paramName').value = state.identity.name;
  document.getElementById('paramCurrency').value = state.identity.currency;
  document.getElementById('avOpenDate').value = state.avOpenDate || '';
  document.getElementById('goalAmount').value = state.goal?.amount ?? '';
  document.getElementById('goalDate').value = state.goal?.date ?? '';

  const wrap = document.getElementById('envelopeParams');
  wrap.innerHTML = ENVELOPPES.map(e => {
    const p = state.params[e.id] || {};
    let fields = '';
    if (e.plafond){
      fields += `<label>Plafond (€)<input type="number" min="0" step="1" data-env="${e.id}" data-field="plafond" value="${p.plafond ?? e.plafondDefault}"></label>`;
    }
    if (e.taux){
      fields += `<label>Taux annuel (%)<input type="number" min="0" step="0.01" data-env="${e.id}" data-field="taux" value="${p.taux ?? e.tauxDefault}"></label>`;
    }
    if (!fields) fields = '<p style="color:var(--text-faint);font-size:12.5px;margin:0">Pas de plafond réglementaire.</p>';
    return `<div class="env-param-card" style="--c:${e.color}">
        <div class="env-code">${e.code}</div>
        <div class="env-name">${e.label}</div>
        ${fields}
      </div>`;
  }).join('');

  wrap.querySelectorAll('input[data-env]').forEach(input => {
    input.addEventListener('change', () => {
      const env = input.dataset.env, field = input.dataset.field;
      state.params[env] = state.params[env] || {};
      state.params[env][field] = parseFloat(input.value) || 0;
      saveState();
      renderDashboard();
      toast('Paramètre mis à jour');
    });
  });

  renderAvCountdown();
}

document.getElementById('paramName').addEventListener('input', e => {
  state.identity.name = e.target.value || 'TOM';
  saveState();
  updateTopbar();
});
document.getElementById('paramCurrency').addEventListener('change', e => {
  state.identity.currency = e.target.value;
  saveState();
  renderDashboard();
});
document.getElementById('avOpenDate').addEventListener('change', e => {
  state.avOpenDate = e.target.value;
  saveState();
  renderAvCountdown();
});
document.getElementById('goalAmount').addEventListener('input', e => {
  state.goal = state.goal || {};
  state.goal.amount = parseFloat(e.target.value) || null;
  saveState();
  renderGoal();
});
document.getElementById('goalDate').addEventListener('change', e => {
  state.goal = state.goal || {};
  state.goal.date = e.target.value;
  saveState();
  renderGoal();
});

function renderAvCountdown(){
  const el = document.getElementById('avCountdown');
  if (!state.avOpenDate){
    el.textContent = 'Renseigne la date d\'ouverture pour suivre l\'anniversaire fiscal des 8 ans.';
    return;
  }
  const open = new Date(state.avOpenDate);
  const eightY = new Date(open); eightY.setFullYear(eightY.getFullYear()+8);
  const now = new Date();
  const diffDays = Math.ceil((eightY - now) / 86400000);
  if (diffDays <= 0){
    el.textContent = '✓ Contrat au-delà de 8 ans — abattement annuel applicable sur les gains.';
  } else {
    const years = Math.floor(diffDays/365), months = Math.floor((diffDays%365)/30);
    el.textContent = `Encore ${years} an${years>1?'s':''} et ${months} mois avant les 8 ans (${eightY.toISOString().slice(0,10)}).`;
  }
}

/* ---------- export / import / reset ---------- */
document.getElementById('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `patrimoine-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export généré');
});

document.getElementById('btnExportCsv').addEventListener('click', () => {
  const headers = ['Enveloppe','Nom','Type','Quantite','Prix unitaire','Montant investi','Valeur','Date','Notes'];
  const csvEscape = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const rows = state.actifs.map(a => [
    envById(a.enveloppe)?.label || a.enveloppe,
    a.nom, a.type || '', a.quantite ?? '', a.prix ?? '', a.investi ?? '', actifValeur(a), a.date || '', a.notes || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `actifs-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export CSV généré');
});

document.getElementById('btnImport').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const imported = JSON.parse(reader.result);
      if (!imported.actifs) throw new Error('format invalide');
      state = { ...defaultState(), ...imported };
      saveState();
      populateEnvelopeSelects();
      renderDashboard();
      renderActifsTable();
      toast('Import réussi');
    }catch(err){
      alert('Fichier invalide : ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btnReset').addEventListener('click', () => {
  if (!confirm('Cette action supprime définitivement toutes tes données locales. Continuer ?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  populateEnvelopeSelects();
  renderDashboard();
  renderActifsTable();
  renderParametres();
  toast('Données réinitialisées');
});

/* =========================================================
   INIT
   ========================================================= */
populateEnvelopeSelects();
renderDashboard();
renderActifsTable();
