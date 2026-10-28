"""Measure fixed-geometry default warm light screenshots, without rendering or editing images."""
from pathlib import Path
import hashlib
import json
import subprocess
from datetime import datetime, timezone
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'single-light-verification'
paths = [out / 'default-warm-off.png', out / 'default-warm-on.png']
a, b = [np.asarray(Image.open(path).convert('RGB'), dtype=np.float64) for path in paths]
assert a.shape == b.shape
height, width = a.shape[:2]
js = "import {STAMPS,getFocus} from './src/config.js';import {DEFAULT_PARAMETERS} from './src/parameters.js';console.log(JSON.stringify(getFocus(STAMPS.find(stamp=>stamp.id==='craft')," + str(width) + "," + str(height) + ",DEFAULT_PARAMETERS)))"
pose = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=root, check=True, capture_output=True, text=True).stdout)
uv = np.array([(u, v) for v in np.arange(.02, .98, .008) for u in np.arange(.02, .98, .008)])
x = np.rint(pose['x'] + (uv[:, 0] - .5) * pose['width']).astype(int)
y = np.rint(pose['y'] + (uv[:, 1] - .5) * pose['height']).astype(int)
before, after = a[y, x], b[y, x]
delta = after - before
luma = np.array([.2126, .7152, .0722])
gain = delta @ luma
edge = np.any((uv < .075) | (uv > .925), axis=1)
paper = edge & (np.min(before, axis=1) > 180)
green = np.all((uv > .12) & (uv < .88), axis=1) & (before[:, 1] - before[:, 0] > 7) & (before[:, 1] - before[:, 2] > 18)

def measure(mask):
    indices = np.flatnonzero(mask)
    assert len(indices), 'Classification must contain actual pixels'
    return {
        'samples': int(len(indices)),
        'beforeMeanRGB': before[mask].mean(axis=0).round(4).tolist(),
        'afterMeanRGB': after[mask].mean(axis=0).round(4).tolist(),
        'meanRGBGain': delta[mask].mean(axis=0).round(4).tolist(),
        'meanLuminanceGain': round(float(gain[mask].mean()), 4),
        'meanRedMinusBlueGain': round(float((delta[mask, 0] - delta[mask, 2]).mean()), 4),
        'representative': [{'uv': uv[index].round(4).tolist(), 'xy': [int(x[index]), int(y[index])], 'beforeRGB': before[index].astype(int).tolist(), 'afterRGB': after[index].astype(int).tolist()} for index in [indices[np.argmax(gain[mask])], indices[np.argmin(gain[mask])]]]
    }

measurements = {}
for name, mask in [('paperEdge', paper), ('greenPrint', green)]:
    measurements[name] = {'all': measure(mask), 'highlights': measure(mask & (gain > 1)), 'shadows': measure(mask & (gain < -1))}
    assert measurements[name]['highlights']['samples'] > 10
    assert measurements[name]['highlights']['meanRedMinusBlueGain'] > .5
measurements['greenPrint']['greenChannelRemainsDominantFraction'] = float(np.mean((after[green, 1] > after[green, 0]) & (after[green, 1] > after[green, 2])))
assert measurements['greenPrint']['greenChannelRemainsDominantFraction'] > .95
result = {
    'result': 'passed',
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Default NCS same-pose unlit versus warm illumination; no third-party pixel similarity claim.',
    'method': 'Fixed no-tilt focus pose from current getFocus/defaults, UV-classified pale paper margins and original green ink. Separate lit and shaded samples; PNGs are read-only.',
    'inputs': {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
    'sourceSnapshot': json.loads((out / 'report.json').read_text(encoding='utf-8-sig'))['sourceSnapshot'],
    'pose': pose,
    'measurements': measurements,
}
(out / 'default-warm-pixel-analysis.json').write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(result, indent=2, ensure_ascii=False))
