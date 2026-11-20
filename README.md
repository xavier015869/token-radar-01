# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xavier015869/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xavier015869/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over the sealed DefiLlama snapshot: it ranks all 281 protocols that record no token and are not mere representations of an asset that already trades by an implied token value from a stated model — TVL × a sector launch multiple × momentum from the snapshot's own 7-day TVL change × a maturity premium for a long tokenless record × a small per-chain breadth bonus — never a hardcoded list of names. Every one of the snapshot's 40 watchlist protocols is covered. Each ranked protocol carries a five-step farm plan from a per-category playbook (lending loops, DEX volume and LP, bridge crossings, curator vaults, chain activity and more), with the amounts, costs and durations filled from that protocol's own chains and TVL tier. The dashboard is sortable and filterable by category, chain and watchlist, and every protocol's detail view shows the model's arithmetic line by line next to its farm plan.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9d3wsaqp&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
