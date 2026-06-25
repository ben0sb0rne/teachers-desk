#!/usr/bin/env python3
"""Monte-Carlo first-winner call counts for Math Bingo, by pattern x class size
x pool depth. Output constants seed BINGO_PATTERNS callFactor + the pace model.
Nothing here ships; only the printed numbers do."""
import random
from statistics import mean

random.seed(7)
FREE = (2, 2)

def line_targets():
    t = []
    for r in range(5): t.append(frozenset((r, c) for c in range(5) if (r, c) != FREE))
    for c in range(5): t.append(frozenset((r, c) for r in range(5) if (r, c) != FREE))
    t.append(frozenset((i, i) for i in range(5) if (i, i) != FREE))
    t.append(frozenset((i, 4 - i) for i in range(5) if (i, 4 - i) != FREE))
    return t

def targets(pid):
    if pid == 'line': return line_targets()
    if pid == 'corners': return [frozenset({(0, 0), (0, 4), (4, 0), (4, 4)})]
    if pid == 'stamp':
        return [frozenset({(0, 0), (0, 1), (1, 0), (1, 1)}),
                frozenset({(0, 3), (0, 4), (1, 3), (1, 4)}),
                frozenset({(3, 0), (3, 1), (4, 0), (4, 1)}),
                frozenset({(3, 3), (3, 4), (4, 3), (4, 4)})]
    if pid == 'plus':
        s = set((2, c) for c in range(5)) | set((r, 2) for r in range(5)); s.discard(FREE)
        return [frozenset(s)]
    if pid == 'x':
        s = set((i, i) for i in range(5)) | set((i, 4 - i) for i in range(5)); s.discard(FREE)
        return [frozenset(s)]
    if pid == 'blackout':
        s = set((r, c) for r in range(5) for c in range(5)); s.discard(FREE)
        return [frozenset(s)]

def make_card(per):
    card = {}
    for ci in range(5):
        vals = random.sample(range(per), 5)
        for r in range(5):
            if (r, ci) == FREE: continue
            card[(r, ci)] = (ci, vals[r])
    return card

def first_winner(pid, num_cards, per, trials):
    tlist = targets(pid)
    res = []
    for _ in range(trials):
        cards = [make_card(per) for _ in range(num_cards)]
        # ball -> list of (card_idx, target_idx); remaining[card][t] = cells left
        ball_hits = {}
        remaining = []
        for cidx, card in enumerate(cards):
            rem = [len(t) for t in tlist]
            remaining.append(rem)
            for tidx, t in enumerate(tlist):
                for cell in t:
                    ball_hits.setdefault(card[cell], []).append((cidx, tidx))
        balls = [(ci, v) for ci in range(5) for v in range(per)]
        random.shuffle(balls)
        won = len(balls)
        for i, ball in enumerate(balls, 1):
            done = False
            for (cidx, tidx) in ball_hits.get(ball, ()):
                remaining[cidx][tidx] -= 1
                if remaining[cidx][tidx] == 0:
                    won = i; done = True; break
            if done: break
        res.append(won)
    return mean(res)

PATTERNS = ['line', 'corners', 'stamp', 'plus', 'x', 'blackout']
CARDS = [10, 15, 20, 28]
POOLS = [15, 9, 6]
TRIALS = 3000

print(f"first-winner avg calls  (trials={TRIALS})\n")
for per in POOLS:
    print(f"=== pool {per}/col  ({per*5} balls) ===")
    header = "pattern   " + "".join(f"{n:>7}cd" for n in CARDS)
    print(header)
    base = {}
    for pid in PATTERNS:
        row = [first_winner(pid, n, per, TRIALS) for n in CARDS]
        if pid == 'line': base = dict(zip(CARDS, row))
        print(f"{pid:<9}" + "".join(f"{v:>9.1f}" for v in row))
    # callFactor vs single-line at each class size
    print("factor vs line:")
    for pid in PATTERNS:
        row = [first_winner(pid, n, per, 1500) / base[n] for n in CARDS]
        print(f"{pid:<9}" + "".join(f"{v:>9.2f}" for v in row))
    print()
