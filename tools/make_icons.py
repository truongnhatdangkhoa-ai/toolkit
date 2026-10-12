"""Sinh toàn bộ icon/logo từ resources/logo-transparent.png.
Chạy:  python3 -I tools/make_icons.py <proj_dir>"""
import sys, os
from PIL import Image, ImageDraw
P = sys.argv[1]; BG = (255, 255, 255, 255)
logo = Image.open(os.path.join(P, 'resources/logo-transparent.png')).convert('RGBA')
RES = os.path.join(P, 'resources/android/res')
def save(img, rel):
    p = os.path.join(P, rel); os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p, optimize=True)
def star(side):  return logo.resize((side, side), Image.LANCZOS)
def canvas(size, bg=None): return Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
def place(base, side):
    s = star(side); base.alpha_composite(s, ((base.width - side) // 2, (base.height - side) // 2)); return base
def mono(side):
    a = star(side).getchannel('A'); m = Image.new('RGBA', a.size, (0, 0, 0, 255)); m.putalpha(a); return m

# --- icon Android
LEG = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for d, px in LEG.items():
    sq = canvas(px, BG); place(sq, int(px * .78))
    m = Image.new('L', (px, px), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, px - 1, px - 1), radius=int(px * .22), fill=255)
    sq.putalpha(m); save(sq, 'resources/android/res/mipmap-%s/ic_launcher.png' % d)
    rd = canvas(px, BG); place(rd, int(px * .66))
    m = Image.new('L', (px, px), 0); ImageDraw.Draw(m).ellipse((0, 0, px - 1, px - 1), fill=255)
    rd.putalpha(m); save(rd, 'resources/android/res/mipmap-%s/ic_launcher_round.png' % d)
    fg = int(px * 108 / 48)   # lớp adaptive 108dp
    save(place(canvas(fg), int(fg * .56)), 'resources/android/res/mipmap-%s/ic_launcher_foreground.png' % d)
    mn = canvas(fg); mn.alpha_composite(mono(int(fg * .56)), ((fg - int(fg * .56)) // 2,) * 2)
    save(mn, 'resources/android/res/mipmap-%s/ic_launcher_monochrome.png' % d)
ADAPT = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
'''
for n in ('ic_launcher', 'ic_launcher_round'):
    p = os.path.join(RES, 'mipmap-anydpi-v26', n + '.xml'); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(ADAPT)
os.makedirs(os.path.join(RES, 'values'), exist_ok=True)
open(os.path.join(RES, 'values/ic_launcher_background.xml'), 'w').write(
 '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
# --- splash: nền trắng + logo giữa, KHÔNG bị kéo giãn theo tỉ lệ màn hình
save(star(480), 'resources/android/res/drawable-nodpi/splash_logo.png')
os.makedirs(os.path.join(RES, 'drawable'), exist_ok=True)
open(os.path.join(RES, 'drawable/splash.xml'), 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background"/>
    <item>
        <bitmap android:gravity="center" android:src="@drawable/splash_logo"/>
    </item>
</layer-list>
''')
# --- ảnh cho Google Play + web
store = canvas(512, BG); place(store, 400); save(store, 'resources/play-store-icon-512.png')
save(star(512), 'www/assets/logo.png'); save(star(192), 'www/assets/logo-192.png'); save(star(64), 'www/assets/favicon.png')
print('ok')
