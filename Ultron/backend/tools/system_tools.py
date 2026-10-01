# backend/tools/system_tools.py

from __future__ import annotations

import ctypes
import glob
import logging
import os
import shutil
import subprocess
import winreg
from datetime import datetime
from urllib.parse import urlparse

import psutil
import pyperclip
from PIL import ImageGrab

logger = logging.getLogger("ultron.tools.system")

CAPTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "captures")
os.makedirs(CAPTURES_DIR, exist_ok=True)

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
KEYEVENTF_KEYUP = 0x0002

MEDIA_VK = {"play": 0xB3, "pause": 0xB3, "next": 0xB0, "previous": 0xB1, "stop": 0xB2}

APP_ALIASES = {
    "edge": "msedge.exe", "microsoft edge": "msedge.exe", "msedge": "msedge.exe",
    "chrome": "chrome.exe", "google chrome": "chrome.exe",
    "firefox": "firefox.exe", "mozilla firefox": "firefox.exe",
    "notepad": "notepad.exe", "calculator": "calc.exe", "calc": "calc.exe",
    "task manager": "taskmgr.exe", "explorer": "explorer.exe", "file explorer": "explorer.exe",
    "paint": "mspaint.exe", "vscode": "Code.exe", "visual studio code": "Code.exe", "code": "Code.exe",
    "spotify": "Spotify.exe", "discord": "Discord.exe", "steam": "steam.exe",
    "word": "winword.exe", "excel": "excel.exe", "powerpoint": "powerpoint.exe",
    "terminal": "wt.exe", "windows terminal": "wt.exe", "control panel": "control.exe",
    "settings": "ms-settings:",
}

KNOWN_PATHS = {
    "msedge.exe": [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"],
    "chrome.exe": [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"],
}

GLOB_PATTERNS = {
    "chrome.exe": [r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"],
    "Spotify.exe": [r"%LOCALAPPDATA%\Spotify\Spotify.exe", r"%APPDATA%\Spotify\Spotify.exe"],
    "Discord.exe": [r"%LOCALAPPDATA%\Discord\app-*\Discord.exe"],
    "steam.exe": [r"C:\Program Files (x86)\Steam\steam.exe", r"C:\Program Files\Steam\steam.exe"],
}


def _app_paths_lookup(exe: str):
    sub = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}"
    sub_wow = rf"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\{exe}"
    for hkey in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        for path in (sub, sub_wow):
            try:
                with winreg.OpenKey(hkey, path) as key:
                    value, _ = winreg.QueryValueEx(key, "")
                    if value and os.path.isfile(value):
                        return value
            except OSError:
                continue
    return None


def _resolve(name: str):
    key = name.lower().strip()
    target = APP_ALIASES.get(key)
    candidates = []
    if target:
        if target.endswith(":"):
            return ("protocol", target)
        candidates.append(target)
    else:
        candidates.append(key if key.endswith(".exe") else key + ".exe")

    for exe in candidates:
        found = shutil.which(exe) or _app_paths_lookup(exe)
        if found:
            return ("exe", found)
        for p in KNOWN_PATHS.get(exe, []):
            if os.path.isfile(p):
                return ("exe", p)
        for pattern in GLOB_PATTERNS.get(exe, []):
            matches = glob.glob(os.path.expandvars(pattern))
            if matches:
                return ("exe", matches[0])
    return None


def active_window_title() -> str:
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value or "Unknown"
    except Exception:
        return "Unknown"


async def open_application(args: dict) -> dict:
    app_name = str(args.get("app_name", "")).lower().strip()
    if not app_name:
        return {"success": False, "message": "No application name provided."}
    resolved = _resolve(app_name)
    if resolved is None:
        return {"success": False, "message": f"Application not found: {app_name}", "data": {"application": app_name, "status": "NOT FOUND"}}
    try:
        kind, value = resolved
        if kind == "protocol":
            os.startfile(value)
        else:
            subprocess.Popen([value], cwd=os.path.expanduser("~"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        return {"success": True, "message": f"Launched {app_name}", "data": {"application": app_name, "status": "OPENED"}}
    except Exception as e:
        return {"success": False, "message": f"Launch failed: {e}", "data": {"application": app_name, "status": "FAILED"}}


async def open_url(args: dict) -> dict:
    url = str(args.get("url", "")).strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {"success": False, "message": "Only http/https URLs are permitted."}
    try:
        os.startfile(url)
        return {"success": True, "message": "URL opened", "data": {"url": url, "status": "OPENED"}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def get_system_stats(args: dict) -> dict:
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        ram = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\")
        battery = psutil.sensors_battery()
        boot = datetime.fromtimestamp(psutil.boot_time())
        uptime = datetime.now() - boot
        hours, rem = divmod(int(uptime.total_seconds()), 3600)
        minutes = rem // 60
        return {
            "success": True,
            "message": "Telemetry acquired.",
            "data": {
                "cpu": f"{cpu}%",
                "ram": f"{ram.percent}% ({round(ram.used / 1e9, 1)}GB / {round(ram.total / 1e9, 1)}GB)",
                "disk_c": f"{disk.percent}%",
                "battery": f"{battery.percent}%" if battery else "N/A",
                "uptime": f"{hours}h {minutes}m",
            },
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


async def get_active_window(args: dict) -> dict:
    title = active_window_title()
    return {"success": True, "message": "Observation complete.", "data": {"active_window": title}}


async def take_screenshot(args: dict) -> dict:
    try:
        img = ImageGrab.grab()
        fname = f"shot_{datetime.now().strftime('%H%M%S_%f')}.png"
        path = os.path.join(CAPTURES_DIR, fname)
        img.save(path)
        return {"success": True, "message": "Visual captured.", "data": {"image_url": f"/captures/{fname}"}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def read_clipboard(args: dict) -> dict:
    try:
        text = pyperclip.paste()
        return {"success": True, "message": "Clipboard read.", "data": {"clipboard": text[:500] or "(empty)"}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def write_clipboard(args: dict) -> dict:
    text = str(args.get("text", ""))
    if not text:
        return {"success": False, "message": "Nothing to write."}
    try:
        pyperclip.copy(text)
        return {"success": True, "message": "Clipboard written.", "data": {"written": text[:100]}}
    except Exception as e:
        return {"success": False, "message": str(e)}


def _get_volume_interface():
    from comtypes import CLSCTX_ALL
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
    devices = AudioUtilities.GetSpeakers()
    interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return interface.QueryInterface(IAudioEndpointVolume)


async def set_volume(args: dict) -> dict:
    try:
        level = max(0, min(100, int(args.get("level", 50))))
        vol = _get_volume_interface()
        vol.SetMasterVolumeLevelScalar(level / 100.0, None)
        vol.SetMute(0, None)
        return {"success": True, "message": f"Volume set to {level}%", "data": {"volume": f"{level}%"}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def mute_audio(args: dict) -> dict:
    try:
        mute = bool(args.get("mute", True))
        vol = _get_volume_interface()
        vol.SetMute(1 if mute else 0, None)
        return {"success": True, "message": "Muted." if mute else "Unmuted.", "data": {"mute": mute}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def set_brightness(args: dict) -> dict:
    try:
        import screen_brightness_control as sbc
        level = max(0, min(100, int(args.get("level", 50))))
        sbc.set_brightness(level)
        return {"success": True, "message": f"Brightness {level}%", "data": {"brightness": f"{level}%"}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def media_control(args: dict) -> dict:
    action = str(args.get("action", "play")).lower()
    vk = MEDIA_VK.get(action)
    if not vk:
        return {"success": False, "message": "Unknown media action."}
    try:
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
        ctypes.windll.user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
        return {"success": True, "message": f"Media: {action}", "data": {"action": action}}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def list_processes(args: dict) -> dict:
    try:
        procs = []
        for p in psutil.process_iter(["name", "pid", "memory_percent"]):
            procs.append((p.info["name"], p.info["pid"], p.info["memory_percent"] or 0))
        procs.sort(key=lambda x: x[2], reverse=True)
        top = procs[:8]
        return {
            "success": True,
            "message": f"{len(procs)} processes observed.",
            "data": {"top_processes": " | ".join(f"{n} ({round(m, 1)}%)" for n, _pid, m in top)},
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


async def kill_process(args: dict) -> dict:
    target = str(args.get("name_or_pid", "")).strip()
    if not target:
        return {"success": False, "message": "No target specified."}
    try:
        killed = 0
        for p in psutil.process_iter(["name", "pid"]):
            if target.isdigit() and p.info["pid"] == int(target):
                p.kill(); killed += 1
            elif p.info["name"] and target.lower() in p.info["name"].lower():
                p.kill(); killed += 1
        if killed:
            return {"success": True, "message": f"Terminated {killed} process(es).", "data": {"killed": killed}}
        return {"success": False, "message": f"Process not found: {target}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def shutdown_system(args: dict) -> dict:
    delay = int(args.get("delay_seconds", 10))
    subprocess.Popen(["shutdown", "/s", "/t", str(delay)], creationflags=DETACHED_PROCESS)
    return {"success": True, "message": f"Shutdown in {delay}s", "data": {"action": "shutdown", "delay": delay}}


async def restart_system(args: dict) -> dict:
    delay = int(args.get("delay_seconds", 10))
    subprocess.Popen(["shutdown", "/r", "/t", str(delay)], creationflags=DETACHED_PROCESS)
    return {"success": True, "message": f"Restart in {delay}s", "data": {"action": "restart", "delay": delay}}


async def empty_recycle_bin(args: dict) -> dict:
    try:
        subprocess.run(["powershell", "-command", "Clear-RecycleBin", "-Force"],
                       capture_output=True, timeout=30, creationflags=DETACHED_PROCESS)
        return {"success": True, "message": "Recycle bin purged.", "data": {"action": "recycle_purge"}}
    except Exception as e:
        return {"success": False, "message": str(e)}