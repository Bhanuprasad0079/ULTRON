"""
In-memory cache for common Qwen responses.
"""
import hashlib
from typing import Dict, Any
import logging

logger = logging.getLogger("ultron.cache")

_cache: Dict[str, Dict[str, Any]] = {}
MAX_CACHE_SIZE = 500

def get_cache_key(user_text: str, context_hash: str) -> str:
    combined = f"{user_text.strip().lower()}|{context_hash}"
    return hashlib.md5(combined.encode()).hexdigest()

def get_cached_response(user_text: str, context_hash: str) -> Dict[str, Any] | None:
    key = get_cache_key(user_text, context_hash)
    if key in _cache:
        logger.info(f"⚡ Response cache hit")
        return _cache[key]
    return None

def cache_response(user_text: str, context_hash: str, response: Dict[str, Any]) -> None:
    key = get_cache_key(user_text, context_hash)
    _cache[key] = response
    
    # Evict old entries if cache is full
    if len(_cache) > MAX_CACHE_SIZE:
        oldest_key = next(iter(_cache))
        del _cache[oldest_key]