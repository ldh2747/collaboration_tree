"""
KoSimCSE 기반 한국어 문장 임베딩 서비스 (FastAPI)
- 포트: 8000
- 최초 실행 시 모델 자동 다운로드 (약 500MB)
- 임베딩 캐싱: SHA256(content) → embedding 벡터

실행:
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

import hashlib
from typing import List

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI(title="KoSimCSE Embedding Service")

# 모델 로드 (최초 1회 다운로드)
model = SentenceTransformer("BM-K/KoSimCSE-roberta")

# 인메모리 임베딩 캐시: sha256(text) → list[float]
_cache: dict[str, List[float]] = {}


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]


def _cache_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if not req.texts:
        return EmbedResponse(embeddings=[])

    results: List[List[float]] = []
    uncached_indices: List[int] = []
    uncached_texts: List[str] = []

    # 캐시 확인
    for i, text in enumerate(req.texts):
        key = _cache_key(text)
        if key in _cache:
            results.append(_cache[key])
        else:
            results.append([])  # placeholder
            uncached_indices.append(i)
            uncached_texts.append(text)

    # 캐시 미스 → 일괄 인코딩
    if uncached_texts:
        vecs: np.ndarray = model.encode(
            uncached_texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        for idx, vec in zip(uncached_indices, vecs):
            emb = vec.tolist()
            key = _cache_key(req.texts[idx])
            _cache[key] = emb
            results[idx] = emb

    return EmbedResponse(embeddings=results)


@app.get("/health")
def health():
    return {"status": "ok", "cached": len(_cache)}
