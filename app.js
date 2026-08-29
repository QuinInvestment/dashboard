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
    history: []
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const d = defaultState();
    return {
      ...d, ...parsed,
      identity: { ...d.identity, ...(parsed.identity||{}) },
      params: { ...d.params, ...(parsed.params||{}) }
    };
  }catch(e){
    console.error('Lecture localStorage impossible', e);
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  renderTicker();
  renderSimulator();
  updateTopbar();
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
      const base = e.id === 'PEA' ? t.investi : t.valeur;
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
        capital = Math.min(capital + monthly, plafond * 3);
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
