// Token Launch Radar page: renders window.RADAR (written by main.ts from the
// sealed snapshot), with search, category and chain filters, five sort orders,
// a watchlist toggle, and a per-protocol detail view that shows the model's
// own arithmetic and the farm plan. The farm plan text is generated here from
// the same playbook inputs the board uses (category, chains, TVL), so what
// the page shows and what board.json carries are the same words.
'use strict';

const R = window.RADAR;
const rows = R.rows.map((a) => ({
  rank: a[0], slug: a[1], name: a[2], category: a[3], chains: a[4], tvl: a[5],
  chg: a[6], age: a[7], implied: a[8], conf: a[9], watch: a[10] === 1,
  multiple: a[11], momentum: a[12], maturity: a[13], breadth: a[14],
}));

const $ = (id) => document.getElementById(id);
const fmt$ = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
const fmtFull = (n) => `$${n.toLocaleString('en-US')}`;
const fmtAge = (d) => (d >= 730 ? `${(d / 365).toFixed(1)} yrs` : d >= 60 ? `${Math.round(d / 30)} mo` : `${d} days`);

/* --- farm plans: the same playbooks as lib/model.ts, word for word --- */
function farmCapital(tvl) {
  if (tvl >= 500_000_000) return 5000;
  if (tvl >= 100_000_000) return 2500;
  if (tvl >= 25_000_000) return 1000;
  return 400;
}
const money = (n) => `$${n.toLocaleString('en-US')}`;
function farmSteps(r) {
  const chain = r.chains[0] ?? 'Ethereum';
  const chain2 = r.chains[1] ?? chain;
  const cap = farmCapital(r.tvl);
  const cat = r.category ?? '';
  const name = r.name;
  const open = `Open ${name} on ${chain}, connect a fresh wallet and complete its onboarding or points registration in one sitting (about 20 minutes, under $5 in gas).`;
  const close = `Keep a dated log of every deposit, trade and claim for ${name}; review it monthly and be ready to claim within the first week if a token or points conversion is announced (1 hour a month, no cost).`;
  let core;
  if (cat === 'Lending') {
    core = [
      `Supply ${money(cap)} of a major stablecoin as collateral on ${name} on ${chain} and leave it supplied for at least 10 weeks (capital ${money(cap)}, gas about $10).`,
      `Borrow 30 to 40 percent against the collateral and re-supply the borrowed asset once, then unwind the loop after 2 weeks so the account shows real borrowing history (interest cost roughly $15 to $40).`,
      `Repeat a smaller ${money(Math.round(cap / 2))} supply-and-borrow cycle on ${chain2} in weeks 4 and 8, so activity spans two chains and two separate months (gas about $10).`,
    ];
  } else if (cat === 'Dexs' || cat === 'DEX') {
    core = [
      `Swap about ${money(cap * 2)} of volume through ${name} on ${chain} across 8 separate weeks, mixing pairs and order sizes so the flow reads as real trading (fees and slippage roughly $30 to $60).`,
      `Provide ${money(cap)} to its main stable or blue-chip pool on ${chain} and keep the position open at least 8 weeks, rebalancing monthly (gas about $15).`,
      `Trade on ${chain2} as well in two of those weeks and hold any LP or points balance the venue issues until a conversion is announced (gas about $10).`,
    ];
  } else if (cat === 'Bridge' || cat === 'Canonical Bridge') {
    core = [
      `Bridge ${money(cap)} from Ethereum to ${chain2} through ${name} in week 1 and leave the funds working on the far side for at least 6 weeks (bridge fee and gas roughly $15).`,
      `Make one crossing every 2 weeks for 10 weeks, alternating direction and amount between ${money(Math.round(cap / 2))} and ${money(cap)}, so the wallet builds a steady crossing history (fees roughly $40 in total).`,
      `Use the bridged funds in one local protocol on ${chain2} each trip instead of bridging straight back, which ties the activity to real usage (2 hours a month).`,
    ];
  } else if (cat === 'Liquid Staking' || cat === 'Liquid Restaking' || cat === 'Restaking') {
    core = [
      `Stake ${money(cap)} of the base asset through ${name} on ${chain} and hold the liquid receipt token for at least 12 weeks (gas about $10, staking yield offsets part of the cost).`,
      `Put half of the receipt tokens to work in one lending market or LP on ${chain2} from week 2, so the position earns a second layer of points or fees (gas about $10).`,
      `Add ${money(Math.round(cap / 4))} more in weeks 5 and 9 rather than staking once, giving the wallet three separate stake events across the season (gas about $10).`,
    ];
  } else if (cat === 'Risk Curators' || cat === 'Onchain Capital Allocator') {
    core = [
      `Deposit ${money(cap)} into the largest vault ${name} curates on ${chain} and keep it there at least 10 weeks, since curator points weight time in the vault (gas about $10).`,
      `Split a second ${money(Math.round(cap / 2))} across two more of its vaults on ${chain2} in week 3, so the wallet touches several strategies rather than one (gas about $10).`,
      `Withdraw 20 percent and redeposit it once around week 7, then restore the full position, so the history shows active allocation rather than a single park (gas about $8).`,
    ];
  } else if (cat === 'Yield') {
    core = [
      `Deposit ${money(cap)} into ${name}'s main vault on ${chain} and leave it compounding for at least 10 weeks (gas about $10).`,
      `Harvest and restake the yield every 2 weeks, six times in all, so the wallet records a season of active farming rather than one deposit (gas about $20 in total).`,
      `Hold a second ${money(Math.round(cap / 2))} position on ${chain2} from week 4 to diversify the record across chains (gas about $8).`,
    ];
  } else if (cat === 'Chain') {
    core = [
      `Bridge ${money(cap)} onto ${name} in week 1 and keep at least half of it on the chain for the full 12 weeks (bridge fee and gas roughly $20).`,
      `Make 3 to 5 transactions a week on the chain for 12 weeks: swaps, one NFT mint, one lending deposit, so the wallet reaches 40 or more active days (gas roughly $25 in total).`,
      `Use the chain's two most-used dApps by TVL at least twice each and hold a small governance or ecosystem NFT if one is issued to active wallets (about $30).`,
    ];
  } else if (cat === 'CEX' || cat === 'CeDeFi') {
    core = [
      `Complete full KYC on ${name}, deposit ${money(cap)} and keep the balance on the venue for at least 8 weeks (no trading cost to hold).`,
      `Place two or three spot trades a week for 8 weeks, about ${money(cap * 3)} of total volume, favouring maker orders to keep fees near $25 for the season.`,
      `Join every launchpool, earn or points campaign the venue runs during those 8 weeks and stake the required asset for each one (1 hour a week).`,
    ];
  } else if (cat === 'Derivatives' || cat === 'Perps') {
    core = [
      `Deposit ${money(cap)} of margin on ${name} on ${chain} and trade small, hedged positions twice a week for 8 weeks, keeping liquidation risk near zero (fees roughly $40).`,
      `Build about ${money(cap * 6)} of cumulative volume across those 8 weeks with varied pairs and sizes so the flow reads as genuine trading.`,
      `Hold the margin balance on the venue between sessions for the full 8 weeks and claim any fee rebates or points the venue credits weekly (no extra cost).`,
    ];
  } else if (cat === 'RWA') {
    core = [
      `Complete ${name}'s investor onboarding and KYC in week 1 (about 45 minutes, no fee) and fund the account with ${money(cap)}.`,
      `Buy ${money(cap)} of its shortest-duration tokenised asset on ${chain} and hold it to maturity or for at least 10 weeks, whichever comes first.`,
      `Reinvest the first coupon or redemption into a second asset on the platform in week 6, so the record shows repeat allocation (no extra fee).`,
    ];
  } else if (cat === 'Insurance') {
    core = [
      `Stake ${money(cap)} into ${name}'s underwriting pool on ${chain} and keep it staked for at least 12 weeks, since cover points weight duration (gas about $10).`,
      `Buy one small real cover policy for a position you actually hold, about ${money(Math.round(cap / 10))} of premium, so the wallet is both underwriter and customer.`,
      `Re-stake the pool rewards at weeks 4 and 8 instead of withdrawing them, compounding the position through the season (gas about $6).`,
    ];
  } else if (cat === 'Basis Trading') {
    core = [
      `Deposit ${money(cap)} of stablecoins into ${name}'s basis vault on ${chain} and leave it for at least 10 weeks while the basis is harvested (gas about $10).`,
      `Add ${money(Math.round(cap / 4))} in weeks 4 and 8 so the wallet shows three separate deposits across the season (gas about $8).`,
      `Read the vault's weekly funding report and shift 20 percent to its second vault if one underperforms for two straight weeks (30 minutes a week, no cost).`,
    ];
  } else {
    core = [
      `Use ${name}'s core product on ${chain} with ${money(cap)} at least once a week for 8 weeks, varying amounts so the activity reads as genuine use (gas roughly $25 in total).`,
      `Reach the product's second feature tier as well (a second market, vault or mode) by week 4 and keep both positions open to week 10 (gas about $10).`,
      `Repeat the main action on ${chain2} in two separate weeks so the record spans two chains and at least three calendar months (gas about $10).`,
    ];
  }
  return [open, ...core, close];
}

/* --- rendering --- */
let selected = null;
function visible() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value;
  const chain = $('chain').value;
  const watchOnly = $('watch').checked;
  let list = rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || (r.category ?? '') === cat) &&
    (!chain || r.chains.includes(chain)) &&
    (!watchOnly || r.watch));
  const key = $('sort').value;
  const by = { rank: (a, b) => a.rank - b.rank, tvl: (a, b) => b.tvl - a.tvl, chg: (a, b) => (b.chg ?? -999) - (a.chg ?? -999), age: (a, b) => b.age - a.age, conf: (a, b) => b.conf - a.conf }[key];
  return list.sort(by);
}
function render() {
  const list = visible();
  $('count').textContent = `${list.length} of ${rows.length} protocols shown`;
  $('rows').innerHTML = list.slice(0, 400).map((r) => `
    <tr data-slug="${r.slug}" class="${selected === r.slug ? 'selected' : ''}">
      <td class="num">${r.rank}</td>
      <td><span class="name">${r.name}</span>${r.watch ? '<span class="badge">WATCHLIST</span>' : ''}<br><span class="slug">${r.slug}</span></td>
      <td>${r.category ?? '—'}</td>
      <td class="num">${fmt$(r.tvl)}</td>
      <td class="num ${r.chg === null ? '' : r.chg >= 0 ? 'up' : 'down'}">${r.chg === null ? '—' : `${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%`}</td>
      <td class="num">${fmtAge(r.age)}</td>
      <td class="num"><strong>${fmt$(r.implied)}</strong></td>
      <td class="num conf">${r.conf}</td>
    </tr>`).join('');
  for (const tr of $('rows').querySelectorAll('tr')) {
    tr.addEventListener('click', () => select(tr.dataset.slug, false));
  }
}
function select(slug, scroll) {
  selected = slug;
  const r = rows.find((x) => x.slug === slug);
  if (!r) return;
  for (const tr of $('rows').querySelectorAll('tr')) tr.classList.toggle('selected', tr.dataset.slug === slug);
  const steps = farmSteps(r).map((s) => `<li>${s}</li>`).join('');
  $('detail').innerHTML = `
    <h2>${r.name}${r.watch ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
    <p class="sub">${r.slug} · ${r.category ?? 'Uncategorised'} · rank #${r.rank} of ${rows.length} pre-token protocols</p>
    <dl class="kv">
      <dt>TVL (snapshot)</dt><dd>${fmtFull(r.tvl)}</dd>
      <dt>7-day TVL change</dt><dd>${r.chg === null ? 'not reported' : `${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%`}</dd>
      <dt>Tokenless record</dt><dd>${fmtAge(r.age)} (${r.age} days)</dd>
      <dt>Confidence</dt><dd>${r.conf} / 100</dd>
    </dl>
    <h3>Why this implied value</h3>
    <div class="math">
      <div class="kv"><dt>TVL</dt><dd>${fmtFull(r.tvl)}</dd>
      <dt>× sector multiple (${r.category ?? 'default'})</dt><dd>${r.multiple.toFixed(2)}</dd>
      <dt>× momentum (7d ${r.chg === null ? 'n/a' : `${r.chg.toFixed(1)}%`})</dt><dd>${r.momentum.toFixed(2)}</dd>
      <dt>× maturity (${fmtAge(r.age)} tokenless)</dt><dd>${r.maturity.toFixed(2)}</dd>
      <dt>× breadth (${r.chains.length} chain${r.chains.length === 1 ? '' : 's'})</dt><dd>${r.breadth.toFixed(2)}</dd></div>
      <div class="math total">= ${fmtFull(r.implied)} implied token value</div>
    </div>
    <h3>Chains</h3>
    <div class="chips">${r.chains.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
    <h3>Farm plan</h3>
    <ol class="plan">${steps}</ol>`;
  if (scroll) $('detail').scrollIntoView({ block: 'nearest' });
}

/* --- wire up --- */
const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
$('cat').innerHTML += cats.map((c) => `<option>${c}</option>`).join('');
const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
$('chain').innerHTML += chains.map((c) => `<option>${c}</option>`).join('');
const totalImplied = rows.reduce((a, r) => a + r.implied, 0);
$('stats').innerHTML = `
  <div><dt>Protocols ranked</dt><dd>${rows.length}</dd></div>
  <div><dt>Watchlist covered</dt><dd>${rows.filter((r) => r.watch).length} / ${R.watch_total}</dd></div>
  <div><dt>Combined implied value</dt><dd>${fmt$(totalImplied)}</dd></div>`;
$('asof').textContent = R.as_of;
for (const id of ['q', 'cat', 'chain', 'watch', 'sort']) $(id).addEventListener('input', render);
const params = new URLSearchParams(location.search);
if (params.get('watch') === '1') $('watch').checked = true;
if (params.get('cat')) $('cat').value = params.get('cat');
if (params.get('chain')) $('chain').value = params.get('chain');
if (params.get('q')) $('q').value = params.get('q');
render();
select(params.get('slug') ?? rows[0].slug, false);
