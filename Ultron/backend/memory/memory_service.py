# backend/memory/memory_service.py

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

# ultron/data/memory.db (project root / data)
DB_DIR = Path(__file__).resolve().parents[2] / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "memory.db"

_conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
_conn.row_factory = sqlite3.Row

with _conn:
    _conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            created_at TEXT NOT NULL
        )
        """
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def remember(content: str, category: str = "general") -> Dict:
    mid = str(uuid.uuid4())
    content = content.strip()
    with _conn:
        _conn.execute(
            "INSERT INTO memories (id, content, category, created_at) VALUES (?, ?, ?, ?)",
            (mid, content, category, _now()),
        )
    return {"id": mid, "content": content, "category": category}


def list_all(limit: int = 10) -> List[Dict]:
    cur = _conn.execute(
        "SELECT id, content, category, created_at FROM memories ORDER BY created_at DESC LIMIT ?",
        (limit,),
    )
    return [dict(row) for row in cur.fetchall()]


def search(query: str, limit: int = 5) -> List[Dict]:
    words = [w for w in re.split(r"\W+", query.lower()) if len(w) > 3]
    if not words:
        return []
    clauses = " OR ".join(["content LIKE ?"] * len(words))
    params = [f"%{w}%" for w in words]
    cur = _conn.execute(
        f"SELECT id, content, category, created_at FROM memories WHERE {clauses} "
        f"ORDER BY created_at DESC LIMIT ?",
        (*params, limit),
    )
    return [dict(row) for row in cur.fetchall()]


def forget(query: str) -> int:
    q = (query or "").strip().lower()
    with _conn:
        if q in ("", "all", "everything"):
            cur = _conn.execute("DELETE FROM memories")
            return cur.rowcount

        cur = _conn.execute("DELETE FROM memories WHERE id = ?", (query,))
        if cur.rowcount:
            return cur.rowcount

        words = [w for w in re.split(r"\W+", q) if len(w) > 3]
        if not words:
            return 0
        clauses = " OR ".join(["content LIKE ?"] * len(words))
        params = [f"%{w}%" for w in words]
        cur = _conn.execute(f"DELETE FROM memories WHERE {clauses}", params)
        return cur.rowcount