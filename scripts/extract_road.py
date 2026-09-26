#!/usr/bin/env python3
"""
Turn a real road into a level.

    python3 scripts/extract_road.py \
        --slug mg-road --title "MG Road" --city Bangalore \
        --name "Mahatma Gandhi Road|MG Road" --bbox 12.965,77.590,12.985,77.625 \
        --landmark "Trinity Circle=Trinity" --landmark "Brigade Road=Brigade Road"

Queries OpenStreetMap (Overpass), stitches the matching way segments into one
continuous path, resamples it every N metres, and writes src/routes/<slug>.json
with the road's real length, a curvature profile the game uses to sway the
road, and landmarks at their true distance along it.

Runs once, at dev time. Nothing in the shipped game talks to OSM.

Data © OpenStreetMap contributors, ODbL. The output file is a derivative
database and should be treated as ODbL too — it's polylines, nothing worth
protecting. The game itself is a produced work and is not share-alike.
"""
import argparse, json, math, re, sys, time, urllib.error, urllib.parse, urllib.request

OVERPASS = "https://overpass-api.de/api/interpreter"

def overpass(q, tries=4):
    """One request, with a polite backoff — Overpass is a shared public server."""
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(tries):
        req = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": "auto-game-extractor/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 504) and attempt < tries - 1:
                wait = 10 * (attempt + 1)
                print(f"  overpass {e.code}, waiting {wait}s", file=sys.stderr); time.sleep(wait); continue
            raise

def hav(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def bearing(a, b):
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    y = math.sin(lo2 - lo1) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return math.degrees(math.atan2(y, x))

def chain_ways(ways):
    """Greedily join way segments that share an endpoint node, starting from the longest."""
    segs = []
    for w in ways:
        nodes = w["nodes"]; geom = [(g["lat"], g["lon"]) for g in w["geometry"]]
        length = sum(hav(geom[i], geom[i + 1]) for i in range(len(geom) - 1))
        segs.append({"nodes": nodes, "geom": geom, "len": length})
    segs.sort(key=lambda s: -s["len"])
    path = segs.pop(0); nodes = list(path["nodes"]); geom = list(path["geom"])
    grew = True
    while grew and segs:
        grew = False
        for i, s in enumerate(segs):
            if s["nodes"][0] == nodes[-1]:
                nodes += s["nodes"][1:]; geom += s["geom"][1:]; segs.pop(i); grew = True; break
            if s["nodes"][-1] == nodes[-1]:
                nodes += s["nodes"][-2::-1]; geom += s["geom"][-2::-1]; segs.pop(i); grew = True; break
            if s["nodes"][-1] == nodes[0]:
                nodes = s["nodes"][:-1] + nodes; geom = s["geom"][:-1] + geom; segs.pop(i); grew = True; break
            if s["nodes"][0] == nodes[0]:
                nodes = s["nodes"][::-1][:-1] + nodes; geom = s["geom"][::-1][:-1] + geom; segs.pop(i); grew = True; break
    return geom, len(segs)

def resample(geom, step):
    """Points every `step` metres along the polyline, with cumulative distance."""
    out = [(geom[0], 0.0)]
    acc = 0.0          # distance at the start of the current segment
    next_at = step     # next sample distance along the whole path
    for i in range(len(geom) - 1):
        a, b = geom[i], geom[i + 1]
        seg = hav(a, b)
        if seg == 0:
            continue
        while next_at <= acc + seg + 1e-9:
            t = (next_at - acc) / seg
            out.append(((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), next_at))
            next_at += step
        acc += seg
    return out, acc

def curvature_profile(samples, step, window_m, smooth_m):
    """Signed turn rate (deg/m) around each sample, smoothed, normalised to [-1, 1]."""
    pts = [p for p, _ in samples]
    n = len(pts)
    if n < 3: return [0.0] * n
    brg = [bearing(pts[i], pts[i + 1]) for i in range(n - 1)] + [bearing(pts[-2], pts[-1])]
    half = max(1, int(window_m / step / 2))
    rate = []
    for i in range(n):
        a, b = max(0, i - half), min(n - 1, i + half)
        d = ((brg[b] - brg[a] + 540) % 360) - 180
        rate.append(d / max(1e-6, (b - a) * step))
    k = max(1, int(smooth_m / step))
    sm = [sum(rate[max(0, i - k):i + k + 1]) / len(rate[max(0, i - k):i + k + 1]) for i in range(n)]
    peak = max(0.02, max(abs(x) for x in sm))  # deg/m; 0.02 ≈ a 3km-radius-ish gentle arc feels like a real bend
    return [max(-1.0, min(1.0, x / peak)) for x in sm]

def landmark_distance(samples, target):
    best, at = 1e12, None
    for p, d in samples:
        h = hav(p, target)
        if h < best: best, at = h, d
    return at, best

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True); ap.add_argument("--title", required=True); ap.add_argument("--city", required=True)
    ap.add_argument("--name", required=True, help="regex on OSM name"); ap.add_argument("--bbox", required=True, help="S,W,N,E")
    ap.add_argument("--landmark", action="append", default=[], help='"Label=osm name regex"')
    ap.add_argument("--step", type=float, default=25.0); ap.add_argument("--window", type=float, default=120.0); ap.add_argument("--smooth", type=float, default=150.0)
    a = ap.parse_args()
    s, w, n, e = a.bbox.split(",")

    d = overpass(f'[out:json][timeout:60];way["highway"]["name"~"{a.name}",i]({s},{w},{n},{e});out geom;')
    ways = [x for x in d["elements"] if x["type"] == "way"]
    if not ways: sys.exit(f"no ways matched /{a.name}/ in bbox")
    geom, unjoined = chain_ways(ways)
    samples, length = resample(geom, a.step)
    sway = curvature_profile(samples, a.step, a.window, a.smooth)

    # All landmarks in one request; matched to labels client-side.
    landmarks = []
    if a.landmark:
        specs = [tuple(x.split("=", 1)) for x in a.landmark]
        union = "|".join(rx for _, rx in specs)
        time.sleep(2)
        r = overpass(f'[out:json][timeout:60];(node["name"~"{union}",i]({s},{w},{n},{e});way["name"~"{union}",i]({s},{w},{n},{e}););out center;')
        found = []
        for el in r["elements"]:
            name = el.get("tags", {}).get("name", "")
            if el["type"] == "node": found.append((name, (el["lat"], el["lon"])))
            elif "center" in el: found.append((name, (el["center"]["lat"], el["center"]["lon"])))
        for label, rx in specs:
            cands = [pt for name, pt in found if re.search(rx, name, re.I)]
            if not cands:
                print(f"  ! landmark {label!r}: nothing in OSM matched /{rx}/", file=sys.stderr); continue
            at, off = min((landmark_distance(samples, c) for c in cands), key=lambda t: t[1])
            landmarks.append({"label": label, "atM": round(at), "offRoadM": round(off)})
    landmarks.sort(key=lambda l: l["atM"])

    out = {
        "slug": a.slug, "title": a.title, "city": a.city,
        "lengthM": round(length), "stepM": a.step,
        "sway": [round(x, 3) for x in sway],
        "landmarks": landmarks,
        "attribution": "Road geometry © OpenStreetMap contributors (ODbL)",
    }
    path = f"src/routes/{a.slug}.json"
    with open(path, "w") as f: json.dump(out, f, indent=1)

    turns = [abs(x) for x in sway]
    print(f"{a.title}, {a.city}: {length/1000:.2f} km from {len(ways)} OSM ways ({unjoined} left unjoined), {len(samples)} samples")
    print(f"  bend: peak {max(turns):.2f}, mean {sum(turns)/len(turns):.2f}  (1.0 = the road's sharpest curve)")
    for l in landmarks: print(f"  📍 {l['label']:<22} at {l['atM']:>5} m   ({l['offRoadM']} m off the road)")
    print(f"  → {path}")

if __name__ == "__main__":
    main()
