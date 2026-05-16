from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from typing import Literal

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://wikicube.vercel.app",
        "http://localhost:3000",
        "http://localhost:3031",
        "http://195.201.23.25:3031",
        "http://localhost",
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
