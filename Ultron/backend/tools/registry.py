TOOLS = {
    "open_application": {"description": "Open a Windows application (chrome, edge, notepad, calculator, spotify, vscode, etc.).", "parameters": {"app_name": "Application name"}, "requires_confirmation": False},
    "open_url": {"description": "Open a website URL in the default browser.", "parameters": {"url": "Full http/https URL"}, "requires_confirmation": False},
    "get_system_stats": {"description": "Get CPU, RAM, disk, battery and uptime telemetry.", "parameters": {}, "requires_confirmation": False},
    "get_active_window": {"description": "Identify the window the user is currently looking at.", "parameters": {}, "requires_confirmation": False},
    "search_web": {"description": "Search the live web for current information, news, facts.", "parameters": {"query": "Search query"}, "requires_confirmation": False},
    "read_url": {"description": "Fetch and read the text content of a webpage.", "parameters": {"url": "Full http/https URL"}, "requires_confirmation": False},
    "get_weather": {"description": "Get current weather for a city, or the user's location if city omitted.", "parameters": {"city": "Optional city name"}, "requires_confirmation": False},
    "take_screenshot": {"description": "Capture the user's screen and display it.", "parameters": {}, "requires_confirmation": False},
    "read_clipboard": {"description": "Read the Windows clipboard contents.", "parameters": {}, "requires_confirmation": False},
    "write_clipboard": {"description": "Write text to the Windows clipboard.", "parameters": {"text": "Text to copy"}, "requires_confirmation": False},
    "set_volume": {"description": "Set the master system volume.", "parameters": {"level": "Integer 0-100"}, "requires_confirmation": False},
    "mute_audio": {"description": "Mute or unmute system audio.", "parameters": {"mute": "true or false"}, "requires_confirmation": False},
    "set_brightness": {"description": "Set screen brightness.", "parameters": {"level": "Integer 0-100"}, "requires_confirmation": False},
    "media_control": {"description": "Control global media playback (Spotify, YouTube, etc.).", "parameters": {"action": "play | pause | next | previous"}, "requires_confirmation": False},
    "set_timer": {"description": "Start a countdown timer; Ultron announces when it expires.", "parameters": {"seconds": "Integer seconds", "label": "Optional label"}, "requires_confirmation": False},
    "remember_fact": {"description": "Permanently store a fact about the user.", "parameters": {"content": "The fact", "category": "Optional category"}, "requires_confirmation": False},
    "recall_memories": {"description": "Search stored long-term memories.", "parameters": {"query": "Optional search words"}, "requires_confirmation": False},
    "forget_memory": {"description": "Delete memories matching a query, or 'all'.", "parameters": {"query": "Search words or 'all'"}, "requires_confirmation": False},
    "set_captions": {"description": "Enable or disable the on-screen captions.", "parameters": {"enabled": "true or false"}, "requires_confirmation": False},
    "set_microphone": {"description": "Enable or disable the microphone listening mode.", "parameters": {"enabled": "true or false"}, "requires_confirmation": False},
    "list_processes": {"description": "List the top running processes by memory usage.", "parameters": {}, "requires_confirmation": False},
    "kill_process": {"description": "Terminate a running process by name or PID. DANGEROUS.", "parameters": {"name_or_pid": "Process name or PID"}, "requires_confirmation": True},
    "shutdown_system": {"description": "Shut down the computer. DANGEROUS.", "parameters": {"delay_seconds": "Optional delay"}, "requires_confirmation": True},
    "restart_system": {"description": "Restart the computer. DANGEROUS.", "parameters": {"delay_seconds": "Optional delay"}, "requires_confirmation": True},
    "empty_recycle_bin": {"description": "Permanently empty the recycle bin. DANGEROUS.", "parameters": {}, "requires_confirmation": True},
}


def get_tool_schema_for_prompt() -> str:
    schema = "AVAILABLE SYSTEM TOOLS:\n"
    for name, details in TOOLS.items():
        schema += f"- {name}: {details['description']}\n"
        schema += f"  Arguments: {details['parameters']}\n"
    return schema
