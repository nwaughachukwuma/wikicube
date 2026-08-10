# WikiCube embedding service (FastAPI + sentence-transformers).
# The nomic-embed-text-v1.5 model downloads on first run; mount a volume at
# /root/.cache/huggingface to persist it across restarts.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

EXPOSE 8000

CMD ["granian", "--interface", "asgi", "--host", "0.0.0.0", "--port", "8000", "src.main:app"]
