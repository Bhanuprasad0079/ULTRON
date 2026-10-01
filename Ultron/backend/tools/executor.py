from __future__ import annotations

import logging

from memory import memory_service
from tools import system_tools, web_tools

logger = logging.getLogger("ultron.tools")

HANDLERS = {
    "open_application": system_tools.open_application,
    "open_url": system_tools.open_url,
    "get_system_stats": system_tools.get_system_stats,
    "get_active_window": system_tools.get_active_window,
    "search_web": web_tools.search_web,
    "read_url": web_tools.read_url,
    "get_weather": web_tools.get_weather,
    "take_screenshot": system_tools.take_screenshot,
    "read_clipboard": system_tools.read_clipboard,
    "write_clipboard": system_tools.write_clipboard,
    "set_volume": system_tools.set_volume,
    "mute_audio": system_tools.mute_audio,
    "set_brightness": system_tools.set_brightness,
    "media_control": system_tools.media_control,
    "list_processes": system_tools.list_processes,
    "kill_process": system_tools.kill_process,
    "shutdown_system": system_tools.shutdown_system,
    "restart_system": system_tools.restart_system,
    "empty_recycle_bin": system_tools.empty_recycle_bin,
}


async def execute_tool(name: str, args: dict) -> dict:
    logger.info("Executing tool: %s args=%s", name, args)

    if name == "remember_fact":
        content = str(args.get("content", "")).strip()
        if not content:
            return {"success": False, "message": "Nothing to remember."}
        memory_service.remember(content, str(args.get("category", "general")))
        return {"success": True, "message": "Memory archived.", "data": {"stored": content}}

    if name == "recall_memories":
        query = str(args.get("query", "")).strip()
        rows = memory_service.search(query) if query else memory_service.list_all(limit=5)
        if not rows:
            return {"success": True, "message": "No memories found.", "data": {"memories": "NONE"}}
        return {"success": True, "message": f"{len(rows)} retrieved.", "data": {"memories": " | ".join(r["content"] for r in rows)}}

    if name == "forget_memory":
        count = memory_service.forget(str(args.get("query", "all")))
        return {"success": True, "message": f"Purged {count}.", "data": {"deleted": count}}

    if name == "set_timer":
        try:
            seconds = max(1, min(7200, int(args.get("seconds", 60))))
        except (TypeError, ValueError):
            return {"success": False, "message": "Invalid seconds."}
        return {"success": True, "deferred": "timer", "seconds": seconds,
                "label": str(args.get("label", "")), "message": f"Timer set: {seconds}s",
                "data": {"seconds": seconds}}

    if name == "set_captions":
        enabled = bool(args.get("enabled", True))
        return {"success": True, "meta": "captions", "enabled": enabled,
                "message": "Captions toggled.", "data": {"captions": enabled}}

    if name == "set_microphone":
        enabled = bool(args.get("enabled", True))
        return {"success": True, "meta": "microphone", "enabled": enabled,
                "message": "Microphone toggled.", "data": {"microphone": enabled}}

    handler = HANDLERS.get(name)
    if handler is None:
        return {"success": False, "message": "Unknown tool requested."}

    try:
        return await handler(args)
    except Exception as e:
        logger.exception("Tool %s crashed", name)
        return {"success": False, "message": f"Tool failure: {e}"}