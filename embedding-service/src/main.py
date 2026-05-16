from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from typing import Literal

app = FastAPI()

model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5")

TaskType = Literal["search_document", "search_query", "classification"]
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
