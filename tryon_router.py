import time
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fashn_service import download_image, poll_status, start_tryon, start_video

router = APIRouter()

BASE_DIR = Path(__file__).parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
RESULT_DIR = BASE_DIR / "The result"

# In-memory job store: { job_id -> { status, result_url, filename, error, job_type } }
jobs: dict = {}


@router.post("/tryon")
async def tryon(
    person_image: UploadFile = File(...),
    garment_image: UploadFile = File(...),
    category: str = Form(default="auto"),
):
    session_id = str(uuid.uuid4())[:8]
    session_dir = UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    person_ext = Path(person_image.filename).suffix or ".jpg"
    garment_ext = Path(garment_image.filename).suffix or ".jpg"
    person_path = session_dir / f"person{person_ext}"
    garment_path = session_dir / f"garment{garment_ext}"

    person_path.write_bytes(await person_image.read())
    garment_path.write_bytes(await garment_image.read())

    try:
        result = await start_tryon(str(person_path), str(garment_path), category)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected error: {type(e).__name__}")

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    job_id = result["id"]
    jobs[job_id] = {"status": "in_queue", "result_url": None, "filename": None, "error": None, "job_type": "tryon"}

    return {"job_id": job_id}


@router.post("/video")
async def generate_video(
    result_filename: str = Form(...),
    prompt: str = Form(default=""),
    duration: int = Form(default=5),
    resolution: str = Form(default="720p"),
):
    image_path = RESULT_DIR / result_filename
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Result image not found")

    try:
        result = await start_video(str(image_path), prompt, duration, resolution)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Unexpected error: {type(e).__name__}")

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    job_id = result["id"]
    jobs[job_id] = {"status": "in_queue", "result_url": None, "filename": None, "error": None, "job_type": "video"}

    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]

    # Return cached result if already settled
    if job["status"] in ("completed", "failed"):
        return job

    # Poll Fashn.ai
    try:
        fashn = await poll_status(job_id)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Status check failed: {type(e).__name__}")

    remote_status = fashn.get("status", "processing")

    if remote_status == "completed":
        output_urls = fashn.get("output") or []
        if output_urls:
            cdn_url = output_urls[0]
            job_type = job.get("job_type", "tryon")
            ext = ".mp4" if job_type == "video" else ".png"
            filename = f"{job_type}_{int(time.time())}_{job_id[:6]}{ext}"
            save_path = RESULT_DIR / filename
            try:
                await download_image(cdn_url, save_path)
                job["status"] = "completed"
                job["result_url"] = f"/results/{filename}"
                job["filename"] = filename
            except Exception as e:
                job["status"] = "failed"
                job["error"] = f"Failed to save result: {str(e)}"
        else:
            job["status"] = "failed"
            job["error"] = "Fashn.ai returned no output"

    elif remote_status == "failed":
        job["status"] = "failed"
        job["error"] = fashn.get("error") or "Unknown Fashn.ai error"

    else:
        job["status"] = remote_status  # starting / in_queue / processing

    return job


@router.get("/results")
async def list_results():
    files = sorted(
        RESULT_DIR.glob("*.png"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    return [
        {
            "filename": f.name,
            "url": f"/results/{f.name}",
            "modified": f.stat().st_mtime,
        }
        for f in files
    ]
