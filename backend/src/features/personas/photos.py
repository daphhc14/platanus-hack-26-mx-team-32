"""Photo processing for personas (CPU-bound — call via run_in_threadpool)."""
import base64
import io

from PIL import Image


def to_thumbnail(data_uri: str, size: int) -> bytes:
    """Decode a `data:image/...;base64,...` URI and return a small JPEG.

    The stored MIME is unreliable (some PNGs are actually JPEG), so we let
    Pillow sniff the real format from the bytes.
    """
    b64 = data_uri.split(",", 1)[-1].strip()
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((size, size))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82, optimize=True)
    return buf.getvalue()
