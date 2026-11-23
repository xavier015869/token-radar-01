// Token launch radar model: ranks every protocol that records no token in the
// sealed DefiLlama snapshot by the value its token would carry if the protocol's
// record stayed as it is, and writes a concrete farm plan for each one.
//
// The implied value is a stated model, never a hardcoded list of names:
//   implied = TVL x category multiple x momentum x maturity x breadth
// - category multiple: MEASURED from the snapshot itself, not asserted. For
//   every protocol that already records a token, the snapshot carries both its
//   market cap and its TVL, so the sector's launch multiple is the median of
//   those peers' mcap/TVL ratios, blended with a prior by peer count (weight
//   n/(n+4)): a sector rich in launched peers is priced by its own record, a
//   sector with few or none falls back to the prior. The prior keeps the
//   structural reasoning (curators and basis desks capture fees on other
//   people's capital, so they sit below 1; chains capture their whole economy,
//   above 2; an exchange's TVL is client custody, so CEX sits low) without
//   letting it override what the snapshot's own launched tokens actually did.
// - momentum: the snapshot's own 7-day TVL change, first shrunk toward zero
//   for small protocols (a $6M protocol's wild week is mostly noise; a $600M
//   protocol's is signal), then clamped, so a protocol growing into its
//   launch is worth more than one bleeding out.
// - maturity: how long the protocol has run with no token (listed_at to as_of);
//   a long tokenless record is evidence the product is real, so it earns a
//   premium that saturates near two years.
// - breadth: each extra chain beyond the first adds a little, capped at five.
//
// Farm plans come from per-category playbooks whose amounts, chains and
// durations are filled from the protocol's own snapshot figures, so every
// step names what to do, what it costs and how long it takes.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Scored {
  p: Protocol;
  ageDays: number;
  multiple: number;
  /** Tokenized peers the sector multiple was measured from (0 = prior only). */
  peers: number;
  /** The peers' median mcap/TVL ratio, or null when the sector has no peers. */
  peerMedian: number | null;
  /** The 7-day change after size damping, or null when it is unreported. */
  dampedChg: number | null;
  momentum: number;
  maturity: number;
  breadth: number;
  implied: number;
  confidence: number;
  watch: boolean;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

const DAY_MS = 86_400_000;

/**
 * Prior sector multiples (FDV per dollar of TVL). These are no longer the
 * model's answer: they are the prior the snapshot's own measurements are
 * blended against, and the fallback for a sector with no tokenized peers.
 */
export const PRIOR_MULTIPLE: Record<string, number> = {
  'Chain': 3.5,
  'CEX': 0.35,
  'Derivatives': 2.4,
  'Perps': 2.4,
  'Dexs': 2.2,
  'DEX': 2.2,
  'Lending': 1.6,
  'Insurance': 1.4,
  'RWA': 1.3,
  'Yield': 1.2,
  'Bridge': 1.1,
  'Canonical Bridge': 1.1,
  'CeDeFi': 1.0,
  'Restaking': 1.0,
  'Liquid Restaking': 1.0,
  'Liquid Staking': 0.9,
  'Basis Trading': 0.8,
  'Risk Curators': 0.55,
  'Onchain Capital Allocator': 0.7,
};

/** What the snapshot itself says about one sector's launch multiple. */
export interface MultipleInfo {
  /** The multiple the model applies: measured median blended with the prior. */
  multiple: number;
  /** How many tokenized protocols in this sector the measurement rests on. */
  peers: number;
  /** The peers' median mcap/TVL ratio, or null when the sector has no peers. */
  median: number | null;
}

/** DefiLlama spells the DEX sector two ways; its peers are one group. */
function peerGroup(category: string | null): string {
  const c = category ?? '';
  return c === 'DEX' ? 'Dexs' : c;
}

/**
 * One peer ratio, kept sane: floored and capped so a single broken record
 * (a near-zero TVL under a real market cap, or the reverse) cannot carry a
 * whole sector's multiple on its own.
 */
function saneRatio(mcap: number, tvl: number): number {
  return Math.min(10, Math.max(0.01, mcap / tvl));
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The mcap/TVL ratios of every protocol in the snapshot that already records
 * a token, grouped by sector: the evidence the measured multiples rest on.
 */
export function peerRatios(snap: Snapshot): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const p of snap.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const key = peerGroup(p.category);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [saneRatio(p.mcap_usd, p.tvl_usd)]);
    else list.push(saneRatio(p.mcap_usd, p.tvl_usd));
  }
  return groups;
}

/**
 * Each sector's launch multiple, measured from the snapshot: the median of
 * its tokenized peers' mcap/TVL ratios, blended with the prior by peer count
 * (weight n/(n+4), so four peers move the prior halfway and fifteen nearly
 * replace it). A sector with no tokenized peers keeps the prior outright.
 */
export function measuredMultiple(category: string | null, peers: Map<string, number[]>): MultipleInfo {
  const key = peerGroup(category);
  const prior = PRIOR_MULTIPLE[category ?? ''] ?? PRIOR_MULTIPLE[key] ?? 1.0;
  const ratios = peers.get(key) ?? [];
  if (ratios.length === 0) return { multiple: prior, peers: 0, median: null };
  const median = medianOf(ratios);
  const w = ratios.length / (ratios.length + 4);
  return { multiple: w * median + (1 - w) * prior, peers: ratios.length, median };
}

/** Every sector's measured multiple for one snapshot, computed once. */
export function measureMultiples(snap: Snapshot): Map<string, MultipleInfo> {
  const peers = peerRatios(snap);
  const out = new Map<string, MultipleInfo>();
  const cats = new Set<string>();
  for (const p of snap.protocols) cats.add(peerGroup(p.category));
  for (const c of [...cats].sort()) out.set(c, measuredMultiple(c, peers));
  return out;
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot is missing its protocols or watchlist');
  }
  return raw;
}

/** True when the snapshot records no token for the protocol. */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * True when the protocol is a representation of another asset — a wrapped,
 * staked or bridged form of something that already trades (WBTC, a staked-ETH
 * product, an exchange's canonical bridge). Such a product cannot launch a
 * first token of its own, so the radar leaves it off the board, the same
 * reasoning the snapshot's own watchlist rule applies. Detected from the
 * snapshot's fields alone: the Bridge categories, whose TVL is other assets
 * in transit, or a name carrying the whole word wrapped, staked or staking.
 */
export function isRepresentation(p: Protocol): boolean {
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return true;
  return /\b(wrapped|staked|staking)\b/i.test(p.name);
}

/** Whole days the protocol has been tracked, tokenless, at the snapshot date. */
export function ageInDays(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 0;
  const days = Math.floor((Date.parse(asOf) - Date.parse(p.listed_at)) / DAY_MS);
  return Math.max(0, days);
}

export function scoreProtocol(
  p: Protocol,
  asOf: string,
  watch: boolean,
  multiples: Map<string, MultipleInfo>,
): Scored {
  const ageDays = ageInDays(p, asOf);
  const info = multiples.get(peerGroup(p.category)) ?? { multiple: 1.0, peers: 0, median: null };
  // Damped momentum: the raw 7-day change is shrunk toward zero by a factor
  // that grows with size, tvl / (tvl + $25M) — a $6M protocol keeps barely a
  // fifth of its week's swing, a $600M protocol keeps nearly all of it.
  const dampedChg = p.change_7d === null
    ? null
    : p.change_7d * (p.tvl_usd / (p.tvl_usd + 25_000_000));
  const momentum = dampedChg === null
    ? 1.0
    : Math.min(1.6, Math.max(0.6, 1 + (dampedChg / 100) * 1.5));
  const ageYears = ageDays / 365;
  const maturity = 0.8 + 0.45 * (1 - Math.exp(-ageYears / 1.5));
  const breadth = 1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  const implied = Math.max(1, Math.round(p.tvl_usd * info.multiple * momentum * maturity * breadth));
  // Confidence: a long record, reported momentum and real size all firm it up.
  let confidence = 30;
  if (p.change_7d !== null) confidence += 15;
  if (p.listed_at !== null) confidence += Math.min(30, Math.round(ageDays / 24));
  if (p.tvl_usd >= 100_000_000) confidence += 15;
  else if (p.tvl_usd >= 25_000_000) confidence += 10;
  else if (p.tvl_usd >= 10_000_000) confidence += 5;
  if (p.chains.length >= 3) confidence += 10;
  confidence = Math.min(97, confidence);
  return {
    p, ageDays,
    multiple: info.multiple, peers: info.peers, peerMedian: info.median,
    dampedChg, momentum, maturity, breadth, implied, confidence, watch,
  };
}

/** Every pre-token, non-representation protocol in the snapshot, best first. */
export function buildBoard(snap: Snapshot): Scored[] {
  const watch = new Set(snap.watchlist);
  const multiples = measureMultiples(snap);
  const scored = snap.protocols
    .filter((p) => isPreToken(p) && !isRepresentation(p))
    .map((p) => scoreProtocol(p, snap.as_of, watch.has(p.slug), multiples));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));
  return scored;
}

/**
 * The protocols the board sets aside, counted for the page's header: those
 * that already record a token, and the representation products (a wrapped,
 * staked or bridged form of an asset that already trades) that record none.
 */
export function setAside(snap: Snapshot): { tokenized: number; representations: number } {
  let tokenized = 0;
  let representations = 0;
  for (const p of snap.protocols) {
    if (!isPreToken(p)) tokenized++;
    else if (isRepresentation(p)) representations++;
  }
  return { tokenized, representations };
}

/** Capital one farm position needs, scaled to the protocol's own TVL tier. */
export function farmCapital(tvl: number): number {
  if (tvl >= 500_000_000) return 5000;
  if (tvl >= 100_000_000) return 2500;
  if (tvl >= 25_000_000) return 1000;
  return 400;
}

const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

const pct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/**
 * What a category's playbook costs in fees, gas and interest, and how many
 * weeks it runs — the figures its own steps state, totalled for the plan's
 * closing summary step.
 */
const PLAN_TOTALS: Record<string, { fees: string; weeks: number }> = {
  'Lending': { fees: 'about $60 in gas and interest', weeks: 10 },
  'Dexs': { fees: 'about $85 in fees, slippage and gas', weeks: 8 },
  'DEX': { fees: 'about $85 in fees, slippage and gas', weeks: 8 },
  'Bridge': { fees: 'about $55 in bridge fees and gas', weeks: 10 },
  'Canonical Bridge': { fees: 'about $55 in bridge fees and gas', weeks: 10 },
  'Liquid Staking': { fees: 'about $30 in gas', weeks: 12 },
  'Liquid Restaking': { fees: 'about $30 in gas', weeks: 12 },
  'Restaking': { fees: 'about $30 in gas', weeks: 12 },
  'Risk Curators': { fees: 'about $28 in gas', weeks: 10 },
  'Onchain Capital Allocator': { fees: 'about $28 in gas', weeks: 10 },
  'Yield': { fees: 'about $38 in gas', weeks: 10 },
  'Chain': { fees: 'about $75 in bridge fees, gas and mints', weeks: 12 },
  'CEX': { fees: 'about $25 in trading fees', weeks: 8 },
  'CeDeFi': { fees: 'about $25 in trading fees', weeks: 8 },
  'Derivatives': { fees: 'about $40 in trading fees', weeks: 8 },
  'Perps': { fees: 'about $40 in trading fees', weeks: 8 },
  'RWA': { fees: 'no platform fees beyond the funding transfer', weeks: 10 },
  'Insurance': { fees: 'about $16 in gas plus the cover premium below', weeks: 12 },
  'Basis Trading': { fees: 'about $18 in gas', weeks: 10 },
};
const PLAN_TOTALS_DEFAULT = { fees: 'about $45 in gas', weeks: 10 };

/**
 * The plan's timing step, written from the protocol's own snapshot record:
 * its actual 7-day TVL change sets the pace, and when the protocol runs on
 * three or more chains the step names its real third chain.
 */
export function timingStep(s: Scored): string {
  const { p } = s;
  const cap = farmCapital(p.tvl_usd);
  const chg = p.change_7d;
  let step: string;
  if (chg === null) {
    step = `The snapshot reports no 7-day TVL change for ${p.name}, so enter steadily: split the ${money(cap)} across three weekly tranches instead of one deposit, so any launch window finds the wallet already active (3 weeks, gas about $8).`;
  } else if (chg >= 5) {
    step = `${p.name}'s TVL climbed ${pct(chg)} in the snapshot's last 7 days — the pattern that precedes a points season — so front-load this plan: finish the first two steps inside 2 weeks while the climb lasts, then hold the position (no extra cost).`;
  } else if (chg <= -5) {
    step = `${p.name}'s TVL fell ${pct(chg)} in the snapshot's last 7 days, so stage in small: run the first step at half size, ${money(Math.round(cap / 2))}, until the outflow flattens for two straight weeks, and only then build to the full ${money(cap)} (keeps ${money(Math.round(cap / 2))} out of a falling pool).`;
  } else {
    step = `${p.name}'s TVL moved only ${pct(chg)} in the snapshot's last 7 days, a flat tape, so pace the entries: one tranche a week for the first 3 weeks, so the wallet's record predates any announcement by a month or more (gas about $8).`;
  }
  if (p.chains.length >= 3) {
    step += ` Run the second tranche on ${p.chains[2]}, the third chain in ${p.name}'s own record, so the history spans three networks rather than one.`;
  }
  return step;
}

/** The plan's closing step: its own costs and duration, totalled. */
export function planSummary(s: Scored): string {
  const { p } = s;
  const cap = farmCapital(p.tvl_usd);
  const t = PLAN_TOTALS[p.category ?? ''] ?? PLAN_TOTALS_DEFAULT;
  const fees = (p.category ?? '') === 'Insurance'
    ? `about $16 in gas plus a cover premium of about ${money(Math.round(cap / 10))}`
    : t.fees;
  return `Plan total for ${p.name}: ${fees} on top of the ${money(cap)} working capital, spread over ${t.weeks} weeks — then keep the dated log current and be ready to claim within the first week if a token or points conversion is announced (1 hour a month, no cost).`;
}

/**
 * The farm plan for one protocol: five steps. Two come from its category
 * playbook, filled from the protocol's own figures; the fourth is written
 * from the protocol's own record (its 7-day change, its third chain); the
 * fifth totals the plan's own costs and weeks. The dashboard renders the
 * identical text from the same inputs.
 */
export function farmSteps(s: Scored): string[] {
  const { p } = s;
  const chain = p.chains[0] ?? 'Ethereum';
  const chain2 = p.chains[1] ?? chain;
  const cap = farmCapital(p.tvl_usd);
  const cat = p.category ?? '';
  const open = `Open ${p.name} on ${chain}, connect a fresh wallet and complete its onboarding or points registration in one sitting (about 20 minutes, under $5 in gas).`;
  let core: string[];
  if (cat === 'Lending') {
    core = [
      `Supply ${money(cap)} of a major stablecoin as collateral on ${p.name} on ${chain} and leave it supplied for at least 10 weeks (capital ${money(cap)}, gas about $10).`,
      `Borrow 30 to 40 percent against the collateral and re-supply the borrowed asset once, then unwind the loop after 2 weeks so the account shows real borrowing history (interest cost roughly $15 to $40).`,
      `Repeat a smaller ${money(Math.round(cap / 2))} supply-and-borrow cycle on ${chain2} in weeks 4 and 8, so activity spans two chains and two separate months (gas about $10).`,
    ];
  } else if (cat === 'Dexs' || cat === 'DEX') {
    core = [
      `Swap about ${money(cap * 2)} of volume through ${p.name} on ${chain} across 8 separate weeks, mixing pairs and order sizes so the flow reads as real trading (fees and slippage roughly $30 to $60).`,
      `Provide ${money(cap)} to its main stable or blue-chip pool on ${chain} and keep the position open at least 8 weeks, rebalancing monthly (gas about $15).`,
      `Trade on ${chain2} as well in two of those weeks and hold any LP or points balance the venue issues until a conversion is announced (gas about $10).`,
    ];
  } else if (cat === 'Bridge' || cat === 'Canonical Bridge') {
    core = [
      `Bridge ${money(cap)} from Ethereum to ${chain2} through ${p.name} in week 1 and leave the funds working on the far side for at least 6 weeks (bridge fee and gas roughly $15).`,
      `Make one crossing every 2 weeks for 10 weeks, alternating direction and amount between ${money(Math.round(cap / 2))} and ${money(cap)}, so the wallet builds a steady crossing history (fees roughly $40 in total).`,
      `Use the bridged funds in one local protocol on ${chain2} each trip instead of bridging straight back, which ties the activity to real usage (2 hours a month).`,
    ];
  } else if (cat === 'Liquid Staking' || cat === 'Liquid Restaking' || cat === 'Restaking') {
    core = [
      `Stake ${money(cap)} of the base asset through ${p.name} on ${chain} and hold the liquid receipt token for at least 12 weeks (gas about $10, staking yield offsets part of the cost).`,
      `Put half of the receipt tokens to work in one lending market or LP on ${chain2} from week 2, so the position earns a second layer of points or fees (gas about $10).`,
      `Add ${money(Math.round(cap / 4))} more in weeks 5 and 9 rather than staking once, giving the wallet three separate stake events across the season (gas about $10).`,
    ];
  } else if (cat === 'Risk Curators' || cat === 'Onchain Capital Allocator') {
    core = [
      `Deposit ${money(cap)} into the largest vault ${p.name} curates on ${chain} and keep it there at least 10 weeks, since curator points weight time in the vault (gas about $10).`,
      `Split a second ${money(Math.round(cap / 2))} across two more of its vaults on ${chain2} in week 3, so the wallet touches several strategies rather than one (gas about $10).`,
      `Withdraw 20 percent and redeposit it once around week 7, then restore the full position, so the history shows active allocation rather than a single park (gas about $8).`,
    ];
  } else if (cat === 'Yield') {
    core = [
      `Deposit ${money(cap)} into ${p.name}'s main vault on ${chain} and leave it compounding for at least 10 weeks (gas about $10).`,
      `Harvest and restake the yield every 2 weeks, six times in all, so the wallet records a season of active farming rather than one deposit (gas about $20 in total).`,
      `Hold a second ${money(Math.round(cap / 2))} position on ${chain2} from week 4 to diversify the record across chains (gas about $8).`,
    ];
  } else if (cat === 'Chain') {
    core = [
      `Bridge ${money(cap)} onto ${p.name} in week 1 and keep at least half of it on the chain for the full 12 weeks (bridge fee and gas roughly $20).`,
      `Make 3 to 5 transactions a week on the chain for 12 weeks: swaps, one NFT mint, one lending deposit, so the wallet reaches 40 or more active days (gas roughly $25 in total).`,
      `Use the chain's two most-used dApps by TVL at least twice each and hold a small governance or ecosystem NFT if one is issued to active wallets (about $30).`,
    ];
  } else if (cat === 'CEX' || cat === 'CeDeFi') {
    core = [
      `Complete full KYC on ${p.name}, deposit ${money(cap)} and keep the balance on the venue for at least 8 weeks (no trading cost to hold).`,
      `Place two or three spot trades a week for 8 weeks, about ${money(cap * 3)} of total volume, favouring maker orders to keep fees near $25 for the season.`,
      `Join every launchpool, earn or points campaign the venue runs during those 8 weeks and stake the required asset for each one (1 hour a week).`,
    ];
  } else if (cat === 'Derivatives' || cat === 'Perps') {
    core = [
      `Deposit ${money(cap)} of margin on ${p.name} on ${chain} and trade small, hedged positions twice a week for 8 weeks, keeping liquidation risk near zero (fees roughly $40).`,
      `Build about ${money(cap * 6)} of cumulative volume across those 8 weeks with varied pairs and sizes so the flow reads as genuine trading.`,
      `Hold the margin balance on the venue between sessions for the full 8 weeks and claim any fee rebates or points the venue credits weekly (no extra cost).`,
    ];
  } else if (cat === 'RWA') {
    core = [
      `Complete ${p.name}'s investor onboarding and KYC in week 1 (about 45 minutes, no fee) and fund the account with ${money(cap)}.`,
      `Buy ${money(cap)} of its shortest-duration tokenised asset on ${chain} and hold it to maturity or for at least 10 weeks, whichever comes first.`,
      `Reinvest the first coupon or redemption into a second asset on the platform in week 6, so the record shows repeat allocation (no extra fee).`,
    ];
  } else if (cat === 'Insurance') {
    core = [
      `Stake ${money(cap)} into ${p.name}'s underwriting pool on ${chain} and keep it staked for at least 12 weeks, since cover points weight duration (gas about $10).`,
      `Buy one small real cover policy for a position you actually hold, about ${money(Math.round(cap / 10))} of premium, so the wallet is both underwriter and customer.`,
      `Re-stake the pool rewards at weeks 4 and 8 instead of withdrawing them, compounding the position through the season (gas about $6).`,
    ];
  } else if (cat === 'Basis Trading') {
    core = [
      `Deposit ${money(cap)} of stablecoins into ${p.name}'s basis vault on ${chain} and leave it for at least 10 weeks while the basis is harvested (gas about $10).`,
      `Add ${money(Math.round(cap / 4))} in weeks 4 and 8 so the wallet shows three separate deposits across the season (gas about $8).`,
      `Read the vault's weekly funding report and shift 20 percent to its second vault if one underperforms for two straight weeks (30 minutes a week, no cost).`,
    ];
  } else {
    core = [
      `Use ${p.name}'s core product on ${chain} with ${money(cap)} at least once a week for 8 weeks, varying amounts so the activity reads as genuine use (gas roughly $25 in total).`,
      `Reach the product's second feature tier as well (a second market, vault or mode) by week 4 and keep both positions open to week 10 (gas about $10).`,
      `Repeat the main action on ${chain2} in two separate weeks so the record spans two chains and at least three calendar months (gas about $10).`,
    ];
  }
  return [open, core[0]!, core[1]!, timingStep(s), planSummary(s)];
}

/** The board.json rows for the gate, ranks assigned in board order. */
export function boardRows(board: Scored[]): Row[] {
  return board.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmSteps(s),
  }));
}

/**
 * The dashboard's compact data: one short array per protocol, in board order.
 * The page rebuilds the same farm plan text from the playbook inputs carried
 * here (category, chains, TVL), so page and board.json cannot drift apart.
 */
export function dataScript(board: Scored[], snap: Snapshot): string {
  const rows = board.map((s, i) => [
    i + 1,
    s.p.slug,
    s.p.name,
    s.p.category,
    s.p.chains,
    s.p.tvl_usd,
    s.p.change_7d,
    s.ageDays,
    s.implied,
    s.confidence,
    s.watch ? 1 : 0,
    Number(s.multiple.toFixed(2)),
    Number(s.momentum.toFixed(3)),
    Number(s.maturity.toFixed(3)),
    Number(s.breadth.toFixed(2)),
    s.peers,
    s.peerMedian === null ? null : Number(s.peerMedian.toFixed(3)),
    s.dampedChg === null ? null : Number(s.dampedChg.toFixed(2)),
  ]);
  const aside = setAside(snap);
  const payload = {
    as_of: snap.as_of, floor_usd: snap.floor_usd, total: board.length,
    watch_total: snap.watchlist.length,
    tokenized: aside.tokenized, representations: aside.representations,
    rows,
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}

/** A short reason the board is invalid, or null when it is fit to hand in. */
export function boardIssue(rows: Row[], snap: Snapshot): string | null {
  if (rows.length < 100) return `only ${rows.length} rows, under the 100 minimum`;
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${r.slug} has a farm step of ${len} characters`;
    }
    const last = r.farm_steps[r.farm_steps.length - 1] ?? '';
    if (!last.startsWith('Plan total')) return `${r.slug} has no closing plan-total step`;
  }
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) return 'implied value rises as rank ascends';
  }
  return null;
}
