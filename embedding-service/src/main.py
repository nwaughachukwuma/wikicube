import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from typing import Literal

app = FastAPI()

# Comma-separated list of allowed origins, e.g.
# CORS_ALLOW_ORIGINS="https://wiki.example.com,http://localhost:3000"
DEFAULT_CORS_ALLOW_ORIGINS = "http://localhost,http://localhost:3000,http://localhost:3031"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "CORS_ALLOW_ORIGINS", DEFAULT_CORS_ALLOW_ORIGINS
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
USER_AGENTS = ["wikicube/1.0"]
model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5")


@app.middleware("http")
async def check_user_agent(request: Request, call_next):
    if request.headers.get("user-agent") not in USER_AGENTS:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)


TaskType = Literal["search_document", "search_query", "classification", "clustering"]
Dimensionality = Literal[256, 512, 768, 1536]

TASK_PREFIXES = {
    "search_document": "search_document: ",
    "search_query": "search_query: ",
    "classification": "classification",
    "clustering": "clustering: ",
}


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=8)
    task_type: TaskType = "search_document"
    dimensionality: Dimensionality = 768


class EmbeddingResponse(BaseModel):
    embeddings: list[list[float]]


@app.get("/health")
def health() -> str:
    return "Hello World!"


@app.post("/generate-embeddings", response_model=EmbeddingResponse)
def generate_embeddings(req: EmbeddingRequest):
    prefixed = [f"{TASK_PREFIXES[req.task_type]}{t}" for t in req.texts]
    embeddings = model.encode(prefixed, normalize_embeddings=True)
    truncated = [e[: req.dimensionality].tolist() for e in embeddings]

    return EmbeddingResponse(embeddings=truncated)
