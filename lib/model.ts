// Token launch radar model: ranks every protocol that records no token in the
// sealed DefiLlama snapshot by the value its token would carry if the protocol's
// record stayed as it is, and writes a concrete farm plan for each one.
//
// The implied value is a stated model, never a hardcoded list of names:
//   implied = TVL x category multiple x momentum x maturity x breadth
// - category multiple: the FDV/TVL a token in that sector typically launches at;
//   curators and basis desks capture fees on other people's capital, so they sit
//   below 1, while chains and exchanges capture their whole economy, above 2.
// - momentum: the snapshot's own 7-day TVL change, damped and clamped, so a
//   protocol growing into its launch is worth more than one bleeding out.
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

/** Sector launch multiples (FDV per dollar of TVL) the model applies. */
export const CATEGORY_MULTIPLE: Record<string, number> = {
  'Chain': 3.5,
  'CEX': 2.8,
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

/** Whole days the protocol has been tracked, tokenless, at the snapshot date. */
export function ageInDays(p: Protocol, asOf: string): number {
  if (p.listed_at === null) return 0;
  const days = Math.floor((Date.parse(asOf) - Date.parse(p.listed_at)) / DAY_MS);
  return Math.max(0, days);
}

export function scoreProtocol(p: Protocol, asOf: string, watch: boolean): Scored {
  const ageDays = ageInDays(p, asOf);
  const multiple = CATEGORY_MULTIPLE[p.category ?? ''] ?? 1.0;
  const momentum = p.change_7d === null
    ? 1.0
    : Math.min(1.6, Math.max(0.6, 1 + (p.change_7d / 100) * 1.5));
  const ageYears = ageDays / 365;
  const maturity = 0.8 + 0.45 * (1 - Math.exp(-ageYears / 1.5));
  const breadth = 1 + 0.04 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity * breadth));
  // Confidence: a long record, reported momentum and real size all firm it up.
  let confidence = 30;
  if (p.change_7d !== null) confidence += 15;
  if (p.listed_at !== null) confidence += Math.min(30, Math.round(ageDays / 24));
  if (p.tvl_usd >= 100_000_000) confidence += 15;
  else if (p.tvl_usd >= 25_000_000) confidence += 10;
  else if (p.tvl_usd >= 10_000_000) confidence += 5;
  if (p.chains.length >= 3) confidence += 10;
  confidence = Math.min(97, confidence);
  return { p, ageDays, multiple, momentum, maturity, breadth, implied, confidence, watch };
}

/** Every pre-token protocol in the snapshot, best implied value first. */
export function buildBoard(snap: Snapshot): Scored[] {
  const watch = new Set(snap.watchlist);
  const scored = snap.protocols
    .filter(isPreToken)
    .map((p) => scoreProtocol(p, snap.as_of, watch.has(p.slug)));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));
  return scored;
}

/** Capital one farm position needs, scaled to the protocol's own TVL tier. */
export function farmCapital(tvl: number): number {
  if (tvl >= 500_000_000) return 5000;
  if (tvl >= 100_000_000) return 2500;
  if (tvl >= 25_000_000) return 1000;
  return 400;
}

const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

/**
 * The farm plan for one protocol: five steps from its category playbook, each
 * an action with its cost and its duration, filled from the protocol's own
 * figures. The dashboard renders the identical text from the same inputs.
 */
export function farmSteps(s: Scored): string[] {
  const { p } = s;
  const chain = p.chains[0] ?? 'Ethereum';
  const chain2 = p.chains[1] ?? chain;
  const cap = farmCapital(p.tvl_usd);
  const cat = p.category ?? '';
  const open = `Open ${p.name} on ${chain}, connect a fresh wallet and complete its onboarding or points registration in one sitting (about 20 minutes, under $5 in gas).`;
  const close = `Keep a dated log of every deposit, trade and claim for ${p.name}; review it monthly and be ready to claim within the first week if a token or points conversion is announced (1 hour a month, no cost).`;
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
  return [open, ...core, close];
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
  ]);
  const payload = { as_of: snap.as_of, floor_usd: snap.floor_usd, total: board.length, rows };
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
  }
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) return 'implied value rises as rank ascends';
  }
  return null;
}
