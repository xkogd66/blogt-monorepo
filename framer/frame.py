#!/usr/bin/env python3
"""Apply frame overlay to square photos, stamping EXIF time from metadata."""

import os
import sys
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

FRAME_PATH     = Path(__file__).parent / "frame.jpg"
VIGNETTE_FEATHER = 0.025  # ponytail: fraction of image faded at each edge
TIMESTAMP_X    = 0.095  # must clear the vertical registration mark at x≈136
TIMESTAMP_Y    = 0.915
FONT_SIZE_RATIO = 0.022


def get_exif_time(path):
    img = Image.open(path)
    try:
        exif = img._getexif() or {}
        for tag in (36867, 36868, 306):  # DateTimeOriginal, DateTimeDigitized, DateTime
            field = exif.get(tag)
            if field:
                try:
                    return datetime.strptime(field, "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass
    except Exception:
        pass
    # Fall back to filesystem creation time (macOS birthtime, else mtime)
    s = os.stat(path)
    ts = getattr(s, "st_birthtime", s.st_mtime)
    return datetime.fromtimestamp(ts)


def make_vignette(w, h, feather):
    # Alpha mask: opaque center, transparent edges.
    # Rounded rectangle is inset by `sigma` so the blur has a transparent
    # ring to gradient into — straight edges fade gently, corners fade more.
    sigma = max(1, int(min(w, h) * feather))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [sigma, sigma, w - sigma - 1, h - sigma - 1],
        radius=sigma * 2, fill=255
    )
    return mask.filter(ImageFilter.GaussianBlur(sigma))


def find_font(size):
    for path in [
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/System/Library/Fonts/Courier New.ttf",
        "/Library/Fonts/Courier New.ttf",
        "/System/Library/Fonts/Menlo.ttc",
    ]:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


FRAME_THRESHOLD = 215  # ponytail: tune 0-255; lower = more of the frame is opaque

def add_frame(src, dst=None, stamp_only=False):
    src_img = Image.open(src)
    exif_bytes = src_img.info.get("exif")

    if stamp_only:
        result = src_img.convert("RGBA")
        fw, fh = result.size
    else:
        photo = src_img.convert("RGB")
        pw, ph = photo.size

        frame = Image.open(FRAME_PATH).convert("RGB")
        fw, fh = frame.size  # output is frame's native size

        # Scale photo down only if it's larger than the frame; never upscale
        scale = min(fw / pw, fh / ph)
        if scale < 1.0:
            pw, ph = int(pw * scale), int(ph * scale)
            photo = photo.resize((pw, ph), Image.LANCZOS)

        # Vignette: fade photo opacity at edges so its own colors bleed into the
        # white canvas rather than being washed out
        alpha_mask = make_vignette(pw, ph, VIGNETTE_FEATHER)

        # Center photo on white canvas at frame size — frame border stays visible
        canvas = Image.new("RGB", (fw, fh), (255, 255, 255))
        ox, oy = (fw - pw) // 2, (fh - ph) // 2
        canvas.paste(photo, (ox, oy), mask=alpha_mask)

        # Composite frame on top. Auto-detect window color from center pixel:
        # white-center frame → white pixels transparent (show photo), dark marks opaque
        # black-center frame → black pixels transparent (show photo), everything else opaque
        frame_l = frame.convert("L")
        center_val = frame_l.getpixel((fw // 2, fh // 2))
        if center_val < 128:  # black window
            frame_mask = frame_l.point(lambda p: 0 if p < 50 else 255)
        else:  # white window
            frame_mask = frame_l.point(lambda p: 0 if p >= FRAME_THRESHOLD else 255)
        frame_rgba = frame.convert("RGBA")
        frame_rgba.putalpha(frame_mask)
        result = Image.alpha_composite(canvas.convert("RGBA"), frame_rgba)

    # Timestamp — sits in the white border below the photo, not inside the photo
    dt = get_exif_time(src)
    time_str = dt.strftime("%H:%M:%S") if dt else "??:??:??"
    draw = ImageDraw.Draw(result)
    font = find_font(int(fw * FONT_SIZE_RATIO))
    ts_x = int(fw * TIMESTAMP_X)
    if stamp_only:
        # Scan center column upward to find where bottom white border starts
        result_rgb = result.convert("RGB")
        cx = fw // 2
        border_top = fh - 1
        for y in range(fh - 1, fh // 2, -1):
            r, g, b = result_rgb.getpixel((cx, y))
            if r < 230 or g < 230 or b < 230:
                border_top = y + 1
                break
        ts_y = border_top + (fh - border_top) // 3
    else:
        ts_y = oy + ph + (fh - oy - ph) // 3  # 1/3 into the bottom border strip
    draw.text((ts_x, ts_y), time_str, fill=(30, 30, 30, 255), font=font)

    out = result.convert("RGB")
    if dst is None:
        p = Path(src)
        dst = p.parent / f"{p.stem}_framed{p.suffix}"
    save_kwargs = {"quality": 95}
    if exif_bytes:
        save_kwargs["exif"] = exif_bytes
    out.save(dst, **save_kwargs)
    print(f"→ {dst}")


if __name__ == "__main__":
    stamp_only = "--ts" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(f"Usage: frame.py [--ts] <photo.jpg> [output.jpg]")
        print(f"  --ts  stamp timestamp only (skip frame compositing)")
        print(f"Frame: {FRAME_PATH}")
        sys.exit(1)
    add_frame(args[0], args[1] if len(args) > 1 else None, stamp_only=stamp_only)
