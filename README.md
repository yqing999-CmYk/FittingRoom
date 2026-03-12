# Virtual Fitting Room

A web application that lets you upload a person photo and a clothing photo, then uses AI to generate a realistic try-on result image — and optionally animate it into a short video.

---

## Introduction

Virtual Fitting Room is a personal-use tool for experimenting with AI-powered clothing try-on. Upload any person photo on the left and any garment photo on the right, choose the clothing category, and click **Clothing Changing**. The result appears below within seconds. You can also click **Gen Video** to animate the result into a 5 or 10-second MP4.

All generated images and videos are saved locally in the `The result/` folder and displayed in a scrollable session gallery at the bottom of the page.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| AI — Try-On | [Fashn.ai API](https://fashn.ai) `tryon-v1.6` | REST API |
| AI — Video | Fashn.ai API `image-to-video` | REST API |
| Backend | [FastAPI](https://fastapi.tiangolo.com) | 0.115.0 |
| ASGI Server | [Uvicorn](https://www.uvicorn.org) | 0.30.6 |
| HTTP Client | [httpx](https://www.python-httpx.org) | 0.27.2 |
| Image Handling | [Pillow](https://pillow.readthedocs.io) | 10.4.0 |
| Frontend | Vanilla JS + HTML5 + CSS3 | — |
| Runtime | Python | 3.11 |
| Config | python-dotenv | 1.0.1 |

---

## Project Structure

```
FittingRoom/
├── backend/
│   ├── main.py             # FastAPI app entry point; mounts API routes and static files
│   ├── tryon_router.py     # API routes: /api/tryon  /api/video  /api/status  /api/results
│   ├── fashn_service.py    # Fashn.ai integration: start_tryon, start_video, poll_status, download
│   └── requirements.txt   # Pinned Python dependencies
│
├── frontend/
│   ├── index.html          # Page layout: upload panels, controls, result, gallery, video
│   ├── style.css           # All styling
│   └── app.js              # Upload, drag-and-drop, polling, gallery, video logic
│
├── Plan/
│   ├── plan.txt            # Tech stack research notes and options considered
│   └── settings.txt        # Decision rationale and future upgrade roadmap
│
├── The result/             # All AI-generated images (.png) and videos (.mp4) saved here
├── uploads/                # Temporary storage for user-uploaded images (per session)
├── src images/             # Sample person and clothing photos for testing
│
├── .env                    # Your secrets — API key goes here (not committed to git)
├── .env.example            # Template for .env
├── setup.bat               # One-time environment setup script (Windows)
├── start.bat               # Launch the server (Windows)
└── README.md               # This file
```

---

## How It Works

### Try-On Flow

```
Browser (Vanilla JS)
  │
  │  POST /api/tryon  (person image + garment image as multipart/form-data)
  ▼
FastAPI backend
  │  Saves images to ./uploads/{session_id}/
  │  Encodes both images as base64
  │  POST → Fashn.ai API  (model_name: "tryon-v1.6")
  │  Receives prediction ID immediately
  │  Stores job in memory:  { job_id → { status, result_url, filename, job_type } }
  │  Returns { job_id }
  ▼
Browser polls  GET /api/status/{job_id}  every 3 seconds
  │
  │  Backend polls Fashn.ai status endpoint
  │  When status = "completed":
  │    Downloads result PNG from Fashn.ai CDN
  │    Saves to ./The result/tryon_{timestamp}_{id}.png
  │    Updates job dict with result_url
  │  Returns { status, result_url, filename }
  ▼
Browser shows result image + download button + Gen Video controls
Result added to scrollable session gallery
```

### Video Flow

```
User clicks "Gen Video" on a completed try-on result
  │
  │  POST /api/video  (result_filename + duration + resolution + optional prompt)
  ▼
FastAPI backend
  │  Reads saved PNG from ./The result/
  │  Encodes as base64
  │  POST → Fashn.ai API  (model_name: "image-to-video")
  │  Stores job with job_type: "video"
  ▼
Browser polls same  GET /api/status/{job_id}  endpoint
  │  Backend detects job_type = "video"
  │  Downloads result MP4 from Fashn.ai CDN
  │  Saves to ./The result/video_{timestamp}_{id}.mp4
  ▼
Browser shows <video> player + download button at the bottom of the page
```

### Key Design Decisions

- **Base64 encoding**: Images are sent to Fashn.ai as base64 data URLs, so no public URL is needed for local files.
- **Async polling**: The `POST /api/tryon` returns a job ID immediately. The browser polls every 3 seconds so the server stays non-blocking.
- **Single status endpoint**: Both try-on and video jobs share `/api/status/{job_id}`. The `job_type` field determines whether to save a `.png` or `.mp4`.
- **Local storage**: All results are saved permanently to `./The result/` and survive server restarts.

---

## Setup Environment

### Prerequisites

- Windows 10 / 11
- Python 3.11 installed at:
  `C:\Users\<you>\AppData\Local\Programs\Python\Python311\python.exe`
- A free Fashn.ai API key from [https://app.fashn.ai/api](https://app.fashn.ai/api)

### Step 1 — Get an API key

1. Sign up at [https://fashn.ai](https://fashn.ai)
2. Go to the [API dashboard](https://app.fashn.ai/api)
3. Click **Create new API key** — copy it immediately (shown only once)

### Step 2 — Add your API key

Open `.env` in the project root and replace the placeholder:

```
FASHN_API_KEY=your_actual_key_here
```

### Step 3 — Run setup (first time only)

Double-click `setup.bat`, or in Command Prompt:

```cmd
cd C:\Users\****\FittingRoom
setup.bat
```

This will:
- Create a Python virtual environment (`venv/`)
- Install all dependencies from `backend/requirements.txt`
- Create `.env` if it does not exist

---

## How to Test Now

Sample images are provided in `src images/` for immediate testing.

### Start the server

Double-click `start.bat`, or in Command Prompt:

```cmd
cd C:\Users\****\FittingRoom
start.bat
```

The server kills any existing process on port 8000, then starts fresh.
Output will show:

```
Virtual Fitting Room
http://localhost:8000
```

### Open the app

Open your browser and go to:

```
http://localhost:8000
```


## How to Run in the Future

After the first-time setup, just run:

```cmd
cd C:\Users\****\FittingRoom
start.bat
```

Then visit `http://localhost:8000`.

**If you change the API key**, edit `.env` and restart the server — the key is read once at startup.

**If you add Python dependencies**, activate the venv and install them:

```cmd
cd C:\Users\****\FittingRoom
venv\Scripts\activate
pip install <package>
pip freeze > backend\requirements.txt
```
---

## How to Wrap It for Deployment

### Option A — Deploy to a Linux VPS (e.g. DigitalOcean, Linode)

**1. Transfer the project**

```bash
# On the server (Ubuntu/Debian)
git clone <your-repo-url> /opt/fittingroom
# or scp the folder
```

**2. Install Python and create venv**

```bash
cd /opt/fittingroom
python3.11 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

**3. Create .env on the server**

```bash
cp .env.example .env
nano .env   # add FASHN_API_KEY
```

**4. Run with Gunicorn (production ASGI)**

```bash
pip install gunicorn
cd backend
gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

**5. Reverse proxy with Nginx** (recommended)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    client_max_body_size 20M;   # allow large image uploads

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
```

**6. Keep it running with systemd**

```ini
# /etc/systemd/system/fittingroom.service
[Unit]
Description=Virtual Fitting Room
After=network.target

[Service]
WorkingDirectory=/opt/fittingroom/backend
ExecStart=/opt/fittingroom/venv/bin/gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
Restart=always
EnvironmentFile=/opt/fittingroom/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable fittingroom
systemctl start fittingroom
```

---

### Option B — Docker

**Dockerfile** (create at project root):

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p "The result" uploads

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Build and run:**

```bash
docker build -t fittingroom .
docker run -d \
  -p 8000:8000 \
  -e FASHN_API_KEY=your_key_here \
  -v $(pwd)/The\ result:/app/The\ result \
  --name fittingroom \
  fittingroom
```

The `-v` volume mount keeps generated images persistent across container restarts.

---

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FASHN_API_KEY` | Yes | Your Fashn.ai API key from [app.fashn.ai/api](https://app.fashn.ai/api) |

---

## API Reference

---

## Notes

- **Free tier**: Fashn.ai gives 10 trial credits on sign-up. After that, pay-as-you-go at $0.075/image (no monthly commitment required — use the "On-Demand" option).
- **Privacy**: Images are sent to Fashn.ai's servers for processing. Do not upload sensitive photos.
- **Session gallery**: The gallery shows results from the current browser session only. All result files remain in `./The result/` permanently.
- **Upload cleanup**: The `./uploads/` folder accumulates session folders over time. Safe to delete its contents manually when not needed.
