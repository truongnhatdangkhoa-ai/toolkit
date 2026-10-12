"""Tách nền ô caro (đã bị "vẽ cứng" vào ảnh) khỏi logo -> PNG trong suốt, cắt sát, vuông."""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(np.int16)
mx, mn = a.max(2), a.min(2)
sat = mx - mn
# ứng viên nền: gần như không màu (xám/trắng) — ô caro, bóng đổ nhạt
cand = (sat <= 16) & (mn >= 150)
lab, n = ndi.label(cand)
sizes0 = ndi.sum(cand, lab, range(1, n + 1))
border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); border = border[border > 0]
big = [i + 1 for i, z in enumerate(sizes0) if z > 250]          # khe kín trong cánh sao (thấy nền ô caro) cũng là nền
bg = np.isin(lab, border) | np.isin(lab, big)
fg = ~bg
fg = ndi.binary_opening(fg, iterations=1)                      # bỏ chấm lẻ
fg = ndi.binary_erosion(fg, iterations=2)                      # bào viền sáng do khử răng cưa
lab2, n2 = ndi.label(fg); sizes = ndi.sum(fg, lab2, range(1, n2 + 1))
keep = [i + 1 for i, s in enumerate(sizes) if s > 400]          # giữ các mảng lớn (5 cánh + chữ K + mảnh vuông)
fg = np.isin(lab2, keep)
alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
al = np.asarray(alpha).astype(np.float32)
al = np.clip((al - 60) * (255 / 150), 0, 255).astype(np.uint8)  # làm gọn viền mềm
rgba = np.dstack([np.asarray(im), al]); out = Image.fromarray(rgba, 'RGBA')
bbox = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox(); out = out.crop(bbox)
s = max(out.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(out, ((s - out.width) // 2, (s - out.height) // 2))
sq.save(dst); print('logo', sq.size, 'bbox', bbox)
