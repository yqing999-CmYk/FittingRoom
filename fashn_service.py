import os
import base64
import httpx
from pathlib import Path


def _clean_httpx_error(e: httpx.HTTPStatusError) -> str:
    """Return a concise error string instead of the verbose httpx default."""
    code = e.response.status_code
    if code == 401:
        return "Invalid API key (401). Check your FASHN_API_KEY in .env."
    if code == 402:
        return "Fashn.ai free credits exhausted (402). Please top up your account."
    if code == 429:
        return "Fashn.ai rate limit hit (429). Please wait a moment and try again."
    try:
        msg = e.response.json().get("detail") or e.response.json().get("error") or ""
    except Exception:
        msg = e.response.text[:120]
    return f"Fashn.ai API error {code}: {msg}" if msg else f"Fashn.ai API error {code}"

FASHN_API_BASE = "https://api.fashn.ai/v1"


def _api_key() -> str:
    key = os.getenv("FASHN_API_KEY", "")
    if not key or key == "your_api_key_here":
        raise ValueError("FASHN_API_KEY is not configured. Please add your API key to the .env file.")
    return key


def encode_image(image_path: str) -> str:
    path = Path(image_path)
    suffix = path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


async def start_tryon(model_image_path: str, garment_image_path: str, category: str = "auto") -> dict:
    """Submit a try-on job. Returns { id, error }."""
    payload = {
        "model_name": "tryon-v1.6",
        "inputs": {
            "model_image": encode_image(model_image_path),
            "garment_image": encode_image(garment_image_path),
            "category": category,
            "mode": "balanced",
        },
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{FASHN_API_BASE}/run",
                headers={"Authorization": f"Bearer {_api_key()}"},
                json=payload,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(_clean_httpx_error(e))
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error reaching Fashn.ai: {type(e).__name__}")
        return resp.json()


async def poll_status(prediction_id: str) -> dict:
    """Poll job status. Returns { id, status, output, error }."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{FASHN_API_BASE}/status/{prediction_id}",
                headers={"Authorization": f"Bearer {_api_key()}"},
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(_clean_httpx_error(e))
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error: {type(e).__name__}")
        return resp.json()


async def start_video(image_path: str, prompt: str = "", duration: int = 5, resolution: str = "720p") -> dict:
    """Submit an image-to-video job. Returns { id, error }."""
    payload = {
        "model_name": "image-to-video",
        "inputs": {
            "image": encode_image(image_path),
            "duration": duration,
            "resolution": resolution,
        },
    }
    if prompt:
        payload["inputs"]["prompt"] = prompt

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                f"{FASHN_API_BASE}/run",
                headers={"Authorization": f"Bearer {_api_key()}"},
                json=payload,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(_clean_httpx_error(e))
        except httpx.RequestError as e:
            raise RuntimeError(f"Network error reaching Fashn.ai: {type(e).__name__}")
        return resp.json()


async def download_image(url: str, save_path: Path) -> None:
    """Download result image from CDN and save locally."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        save_path.write_bytes(resp.content)
