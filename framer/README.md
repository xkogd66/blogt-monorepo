# framer

Applies a film-frame overlay to a square photo and stamps the EXIF capture time in the corner.

## Usage

```
python frame.py <photo.jpg> [output.jpg]
```

Output defaults to `<photo>_framed.<ext>` in the same directory.

## How it works

1. Scales `frame.jpg` to match the input photo's resolution
2. Applies a white vignette to the photo edges so they fade into the frame
3. Composites the frame over the photo (white frame pixels become transparent)
4. Reads `DateTimeOriginal` from EXIF and stamps `HH:MM:SS` in the lower-left corner

## Requirements

```
pip install Pillow
```
