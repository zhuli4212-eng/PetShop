"""按《养成数值总案》的起步种兔与货架时间，复算只养兔时的扩房储备节奏。"""
from argparse import ArgumentParser
from dataclasses import dataclass
from random import Random

from 遗传模拟 import LAB_GRADES, LITTERS, inherit_axis


STOCK_TIERS = (1, 2, 3, 1, 2, 4, 1, 3, 2, 1)


@dataclass(frozen=True)
class Rabbit:
    sex: int
    grades: tuple
    rarity: tuple
    gentle: bool

    def young_value(self):
        # 安哥拉幼体基准价96，品质系数改写为分母1200的整数分数。
        q1200 = 1200 + 10 * (sum(self.grades) - 18)
        q1200 += 36 * self.rarity.count(1) + 96 * self.rarity.count(2)
        return (96 * q1200 + 600) // 1200


def child(rng, parents):
    grades = tuple(inherit_axis(rng, a, b) for a, b in zip(*(p.grades for p in parents)))
    rarity = []
    for i in range(5):
        source = rng.randrange(100)
        if source < 90:
            p = parents[int(source >= 45)]
            rarity.append(p.rarity[i])
            if i == 0:
                gentle = p.gentle
        else:
            rank = rng.choices((0, 1, 2), (80, 18, 2))[0]
            rarity.append(rank)
            if i == 0:
                gentle = rank == 0 and rng.randrange(3) == 0
    return Rabbit(rng.randrange(2), grades, tuple(rarity), gentle)


def lab_young(rng, sex):
    grades = tuple(rng.choices(range(7), weights=LAB_GRADES, k=6))
    rare_slot = rng.randrange(5) if rng.random() < .10 else -1
    rarity = tuple(2 if i == rare_slot else int(rng.random() < .2) for i in range(5))
    return Rabbit(sex, grades, rarity, rarity[0] == 0 and rng.randrange(3) == 0)


def next_angora_stock(now, sex, sold):
    batch = now // 30
    while STOCK_TIERS[batch % len(STOCK_TIERS)] != 3 or (batch, sex) in sold:
        batch += 1
    sold.add((batch, sex))
    return max(now, batch * 30)


def run_shop(rng, opening_order):
    parents = [Rabbit(s, (3,) * 6, (0,) * 5, s == 1) for s in (0, 1)]
    cash, now = 680, 0
    sold_stock, milestones = set(), {}
    for litter in range(1, 81):
        now += 2
        sizes, weights = LITTERS['兔']
        kits = [child(rng, parents) for _ in range(rng.choices(sizes, weights)[0])]
        kept = []
        for sex in range(2):
            best = max((p for p in kits if p.sex == sex), key=lambda p: sum(p.grades), default=None)
            if best is not None:
                kept.append(best)
                kits.remove(best)
        values = [p.young_value() for p in kits]
        cash += sum(values) + 14
        if opening_order:
            gentle_values = [v for v, p in zip(values, kits) if p.gentle]
            if gentle_values:
                v = max(gentle_values)
                cash += (18 * v + 5) // 10 - v
                opening_order = False
        if len(kept) == 1:
            sex = 1 - kept[0].sex
            now = next_angora_stock(now, sex, sold_stock)
            imported = lab_young(rng, sex)
            cash -= (28 * imported.young_value() + 9) // 10
            if cash < 0:
                return milestones
            kept.append(imported)
        for target in (900, 1528, 1984):
            if cash >= target and target not in milestones:
                milestones[target] = (litter, now)
        if len(milestones) == 3:
            break
        parents = kept
        now += 30
    return milestones


def quantile(values, fraction):
    ordered = sorted(values)
    # Nearest-rank quantile.
    return ordered[max(0, (len(ordered) * fraction + 99) // 100 - 1)]


def main():
    parser = ArgumentParser()
    parser.add_argument('--runs', type=int, default=5000)
    args = parser.parse_args()
    assert args.runs > 0
    assert Rabbit(0,(3,)*6,(0,)*5,True).young_value() == 96
    for opening_order in (False, True):
        rng = Random(20261113)
        trials = [run_shop(rng, opening_order) for _ in range(args.runs)]
        print('保留首张定向单' if opening_order else '只卖自由市场')
        for target in (900, 1528, 1984):
            records = [run[target] for run in trials if target in run]
            if not records:
                print(target, '无到达样本')
                continue
            litters, times = zip(*records)
            print(f'{target} 金币 | 到达 {len(records)}/{args.runs} | 窝数中位 {quantile(litters,50)}'
                  f' | 分钟 P10/P50/P90 {quantile(times,10)}/{quantile(times,50)}/{quantile(times,90)}')


if __name__ == '__main__':
    main()
