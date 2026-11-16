"""运行 python 制作/数值校验/遗传模拟.py，复算《遗传与赛级》留种对照。"""
from argparse import ArgumentParser
from collections import Counter
from random import Random


LITTERS = {
    "兔": ((3, 4, 5), (25, 50, 25)),
    "猫": ((2, 3, 4), (20, 55, 25)),
    "狗": ((2, 3, 4, 5), (15, 35, 35, 15)),
}
LAB_GRADES = (0, 10, 40, 42, 8, 0, 0)
PROMOTION = (18, 18, 18, 18, 10, 6, 0)
SHOW_POINTS = (0, 15, 35, 55, 75, 90, 100)
SHOW_WEIGHTS = (10, 20, 20, 20, 10, 20)


def inherit_axis(rng, father, mother):
    donor, mate = (father, mother) if rng.randrange(2) == 0 else (mother, father)
    up = PROMOTION[donor]
    if mate < donor - 1:
        up = min(up, 3)
    roll = rng.randrange(100)
    if roll < up:
        return min(6, donor + 1)
    if roll >= 90:
        return max(0, donor - 1)
    return donor


def show(grades, rarities):
    quality = sum(SHOW_POINTS[g] * w for g, w in zip(grades, SHOW_WEIGHTS))
    score100 = min(10000, quality + 100 * min(4, sum(rarities)))
    defect = grades[-1]
    if score100 >= 9500 and defect >= 5 and grades.count(6) >= 2:
        return score100 / 100, 180
    if score100 >= 8200 and defect >= 4:
        return score100 / 100, 90
    if score100 >= 6800 and defect >= 3:
        return score100 / 100, 40
    return score100 / 100, 0


def choose(rng, candidates, strategy):
    if not candidates:
        return tuple(rng.choices(range(7), weights=LAB_GRADES, k=6))
    if strategy == "随机":
        return rng.choice(candidates)
    rng.shuffle(candidates)
    if strategy == "兼顾六维":
        return max(candidates, key=lambda g: (sum(g), min(g)))
    return max(candidates, key=lambda g: (g[2], sum(g)))


def simulate(rng, species, runs, generations, strategy):
    outcomes = {year: Counter() for year in generations}
    sizes, weights = LITTERS[species]
    for _ in range(runs):
        pair = [(3,) * 6, (3,) * 6]
        top_coat = all_max = False
        imports = 0
        for year in range(1, max(generations) + 1):
            pools = [[], []]
            for _ in range(rng.choices(sizes, weights=weights)[0]):
                sex = rng.randrange(2)
                grades = tuple(inherit_axis(rng, f, m) for f, m in zip(*pair))
                pools[sex].append(grades)
                top_coat |= grades[2] == 6
                all_max |= min(grades) == 6
            imports += sum(not group for group in pools)
            pair = [choose(rng, group, strategy) for group in pools]
            if year in outcomes:
                out = outcomes[year]
                out["top_coat"] += top_coat
                out["all_max"] += all_max
                out["sum_indices"] += sum(map(sum, pair))
                out["imports"] += imports
    return outcomes


def simulate_four_pairs(rng, species, runs):
    sizes, weights = LITTERS[species]
    milestones = {12: 0, 24: 0, 36: 0, 48: 0}
    for _ in range(runs):
        parents = [[(3,) * 6] * 4 for _ in range(2)]
        seen = False
        for generation in range(1, max(milestones) + 1):
            offspring = [[], []]
            for pair in zip(*parents):
                for _ in range(rng.choices(sizes, weights=weights)[0]):
                    child = tuple(inherit_axis(rng, f, m) for f, m in zip(*pair))
                    offspring[rng.randrange(2)].append(child)
                    seen |= min(child) == 6
            for sex, group in enumerate(offspring):
                rng.shuffle(group)
                group.sort(key=lambda g: (min(g), sum(g)), reverse=True)
                parents[sex] = group[:4]
                while len(parents[sex]) < 4:
                    parents[sex].append(choose(rng, [], "随机"))
            if generation in milestones:
                milestones[generation] += seen
    return milestones


def main():
    parser = ArgumentParser()
    parser.add_argument("--runs", type=int, default=3000)
    parser.add_argument("--species", choices=LITTERS, default="兔")
    parser.add_argument("--seed", type=int, default=20261113)
    parser.add_argument("--long-runs", type=int, default=400)
    args = parser.parse_args()
    assert args.runs > 0
    assert args.long_runs >= 0
    assert show((6,) * 6, (2,) * 5) == (100, 180)
    assert show((3,) * 6, (0,) * 5) == (55, 0)
    assert show((4,) * 6, (0,) * 5) == (75, 40)
    assert show((5,) * 6, (0,) * 5) == (90, 90)
    assert show((6, 6, 5, 6, 5, 5), (1, 1, 0, 0, 0)) == (97, 180)
    print("策略 | 代 | 留种均值(0–6) | 曾产毛发S+ | 曾产全S+ | 累计引种均数")
    for index, strategy in enumerate(("随机", "兼顾六维", "专攻毛发")):
        outcomes = simulate(Random(args.seed + index), args.species, args.runs, (4, 8, 12), strategy)
        for year, out in outcomes.items():
            print(f"{strategy} | {year} | {out['sum_indices'] / (args.runs * 12):.2f} | "
                  f"{out['top_coat'] / args.runs:.1%} | {out['all_max']}/{args.runs} | "
                  f"{out['imports'] / args.runs:.2f}")
    if args.long_runs:
        print("四对并行择优育种 | 代 | 曾产全S+")
        for year, hits in simulate_four_pairs(Random(args.seed + 3), args.species, args.long_runs).items():
            print(f"四对 | {year} | {hits}/{args.long_runs} | {hits/args.long_runs:.1%}")


if __name__ == "__main__":
    main()
