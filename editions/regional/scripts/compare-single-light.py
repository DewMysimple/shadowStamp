"""Evidence board: preserve each screenshot's aspect and original appearance."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'single-light-study'
refs = Path('C:/Users/Administrator/.codex/attachments/9854cda5-27ba-47b9-abb4-1a41416070bf')
current = root / 'artifacts/single-light-verification/default-warm-on.png'
analysis = json.loads((current.parent / 'default-warm-pixel-analysis.json').read_text(encoding='utf-8'))
p = analysis['pose']
crop = [round(p['x'] - p['width']/2), round(p['y'] - p['height']/2), round(p['x'] + p['width']/2), round(p['y'] + p['height']/2)]
panels = [
    ('修改前 · 用户截图', refs / 'image-3.png', None),
    ('当前默认 · 暖光与浅纸纹', current, crop),
    ('原站参考 · 用户截图', refs / 'image-4.png', None),
]
board = Image.new('RGB', (1260, 688), '#eeece5')
d = ImageDraw.Draw(board)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 21)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 15)
records = []
for i, (title, path, box) in enumerate(panels):
    im = Image.open(path).convert('RGB')
    if box:
        im = im.crop(box)
    im.thumbnail((380, 540), Image.Resampling.LANCZOS)
    x = i * 420 + (420 - im.width) // 2
    y = 62 + (540 - im.height) // 2
    board.paste(im, (x, y))
    d.text((i*420+20, 20), title, fill='#34382d', font=font)
    records.append({'file': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'cropXYXY': box, 'displaySize': list(im.size)})
d.text((20, 620), '仅比较光影层次和色调：参考图的姿态、光位及背景不同，未作相似度评分。', fill='#53584c', font=small)
d.text((20, 648), '当前默认保留印刷；不使用原站贴图、凸字浮雕或金属材质。', fill='#53584c', font=small)
board.save(out / 'single-light-comparison.jpg', quality=93)
(out / 'single-light-comparison.json').write_text(json.dumps({'scope': 'Visual comparison only; no geometric rectification, recolouring or pixel-similarity claim.', 'panels': records}, ensure_ascii=False, indent=2), encoding='utf-8')
