import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
script = """
import { render } from './lib/buddies.mjs';
const moods = ['idle', 'thinking', 'happy', 'worried', 'thinking', 'celebrate', 'sleeping'];
console.log(JSON.stringify(moods.flatMap(mood => [0, 1, 2].map(frame => ({ mood, text: render(mood, { name: 'Mochi' }, frame * 1000) })))));
"""
rows = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=root))
font_paths = ['/System/Library/Fonts/Menlo.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']
font_path = next((path for path in font_paths if Path(path).exists()), None)
font = ImageFont.truetype(font_path, 20) if font_path else ImageFont.load_default()
small = ImageFont.truetype(font_path, 14) if font_path else font
colors = {'idle': '#9fe6e0', 'thinking': '#9fe6e0', 'happy': '#b7e69f', 'worried': '#ffbc8a', 'celebrate': '#ecd79a', 'sleeping': '#aaa6c8'}
frames = []
for row in rows:
    image = Image.new('RGB', (820, 215), '#0c1017')
    draw = ImageDraw.Draw(image)
    draw.text((28, 22), 'buddy-back', font=small, fill='#ecd79a')
    draw.text((28, 54), '> Your terminal companion is back.', font=font, fill='#eceef2')
    draw.line((28, 94, 790, 94), fill='#28303c')
    draw.text((28, 115), row['text'], font=font, fill=colors[row['mood']])
    draw.text((28, 176), 'Simulated session / real renderer / zero tokens', font=small, fill='#8b95a6')
    frames.append(image)
output = root / 'docs' / 'demo.gif'
output.parent.mkdir(exist_ok=True)
frames[0].save(output, save_all=True, append_images=frames[1:], duration=700, loop=0, optimize=False)
print(f'Wrote {len(frames)} rendered frames to docs/demo.gif')
