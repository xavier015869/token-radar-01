[![Built for make.fun](https://make.fun/badge.svg)](https://make.fun)
[make.fun](https://make.fun) · Entered by [@xavier015869](https://make.fun/@xavier015869) · Referral: https://make.fun/r/9d3wsaqp

# Token Launch Radar

A ranking of every protocol in the sealed DefiLlama snapshot that still
records no token of its own — 281 of them — by the value a token would
carry if the protocol's record stayed exactly as it is, with a concrete
plan for farming each one before a launch. The board covers the
snapshot's 40-protocol watchlist in full and reaches well below its
$50M floor. The 416 protocols that already record a token are set
aside, and so are 61 wrapped, staked or bridged representation
products — WBTC and its kin — which are forms of assets that already
trade and cannot launch a first token of their own.

## The model

Implied value = TVL × sector multiple × momentum × maturity × breadth.
No protocol's name and no sector's multiple is hardcoded:

- **Sector multiples are measured, not asserted.** Every protocol in
  the snapshot that already trades carries both a market cap and a
  TVL, so a sector's multiple is the median of its own tokenized
  peers' market-cap-to-TVL ratios, blended with a prior by peer count
  (weight n/(n+4)): a sector rich in launched peers is priced by its
  own record, and one with none keeps the prior. Each detail view
  shows the measurement behind its number — the peer count and their
  median — next to the multiple it produced.
- **Momentum is damped by size.** The snapshot's 7-day TVL change is
  shrunk toward zero by TVL / (TVL + $25M) before it counts, because a
  small protocol's wild week is mostly noise while a large one's is
  signal. The detail view shows the raw change and the damped one.
- **Maturity** rewards a long tokenless record, saturating near two
  years; **breadth** adds a little for each extra chain, capped at
  five. A confidence score rides along, firmed up by a reported
  change, a long record, real size and several chains.

## Farm plans

Every row carries five steps. Two come from the protocol's category
playbook, with amounts, chains and durations filled from its own
figures. The fourth is written from the protocol's own record: a TVL
climb of 5% or more front-loads the plan, a fall stages it in at half
size, and a protocol on three or more chains is farmed on its real
third chain too. The fifth totals the plan's own fees and weeks, so a
reader sees the whole cost before starting.

## Running it

Node 22.18 or later, standard library only:

```
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path/to/snapshot.json>
```

In make.fun's sandbox the program reads `/input/snapshot.json` and
writes to `/output` with no arguments at all. Either way it writes
`board.json` (the ranked rows), `data.js` (the same board in the
page's compact shape), a copy of `dashboard/` and `screenshots/`, and
`dossier.json`, built by the vendor library from those copies. The
page itself — search, category and chain filters, five sort orders, a
watchlist toggle and a per-protocol detail view — renders offline
from `data.js` alone.

## Layout

- `main.ts` — the entrypoint: snapshot in, hand-in out.
- `lib/model.ts` — the model: measured multiples, damped momentum,
  the board, the farm playbooks and the page's data script.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — the board, a detail view and the watchlist filter.
- `vendor/makefun-board.ts` — the house's dossier writer.
