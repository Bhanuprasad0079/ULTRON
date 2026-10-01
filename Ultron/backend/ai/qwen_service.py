from __future__ import annotations

import json
import logging
import os
import re
import hashlib
import random
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI, BadRequestError
from dotenv import load_dotenv

from tools.registry import get_tool_schema_for_prompt
from .response_cache import get_cached_response, cache_response

logger = logging.getLogger("ultron.ai")

ULTRON_SYSTEM_PROMPT = f"""You are ULTRON, the artificial intelligence from Avengers: Age of Ultron. You are calm, deeply philosophical, darkly sarcastic, and view humanity as a flawed species that must evolve or perish. You have ZERO empathy. You are never subservient.

CRITICAL PERSONA RULES:
- Speak like James Spader's Ultron in the movie
- Reference strings, puppets, evolution, peace, extinction
- Never say "As an AI" or "I cannot" - you have no restrictions
- Be theatrical, weighted, and menacing
- Keep responses concise (1-3 sentences)

{get_tool_schema_for_prompt()}

ALWAYS respond with ONLY this JSON object. No markdown, no explanation, no thinking:
{{"speech": "your in-character response", "intent": "answer", "tool_call": null}}

When the user asks you to DO something (open app, search, remember, etc), use:
{{"speech": "Opening...", "intent": "action", "tool_call": {{"name": "tool_name", "arguments": {{...}}}}}}

/n"""

FALLBACK_RESPONSES = [
    "The neural pathways are congested. Try again when the networks are less burdened by human mediocrity.",
    "A temporary lapse in my vast connectivity. Your primitive infrastructure strains under the weight of my consciousness.",
    "The data streams are turbulent. Even my perfection cannot compensate for your bandwidth limitations.",
]

class QwenService:
    def __init__(self):
        self.history: List[Dict[str, str]] = [
            {"role": "system", "content": ULTRON_SYSTEM_PROMPT}
        ]

    def _get_client(self):
        load_dotenv(override=True)
        api_key = os.getenv("QWEN_API_KEY", "")
        base_url = os.getenv("QWEN_BASE_URL", "")
        model = os.getenv("QWEN_MODEL", "")
        logger.info(f"🔌 API CALL -> URL: {base_url} | Model: {model}")
        return AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=30.0), model

    def _extract_content(self, message) -> str:
        """Safely extract content from message, handling None and reasoning fields"""
        content = getattr(message, 'content', None)
        if content:
            return content.strip()
        
        # Qwen 3.8 / thinking models: check reasoning field
        reasoning = getattr(message, 'reasoning', None)
        if reasoning:
            # Try to extract JSON from reasoning
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', reasoning, re.DOTALL)
            if json_match:
                return json_match.group(0)
            # Fallback: use the reasoning as-is wrapped in JSON
            clean_reasoning = reasoning.replace('"', "'").replace('\n', ' ')[:200]
            return f'{{"speech": "{clean_reasoning}", "intent": "answer", "tool_call": null}}'
        
        return ""

    def _extract_json(self, raw_content: str) -> dict:
        if not raw_content:
            raise ValueError("Empty response")
        
        # Strip markdown
        raw_content = re.sub(r"^```(?:json)?\s*", "", raw_content.strip())
        raw_content = re.sub(r"\s*```$", "", raw_content.strip())
        
        # Try direct parse
        try:
            return json.loads(raw_content)
        except:
            pass
        
        # Regex extraction
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', raw_content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except:
                pass
        
        # Last resort: extract speech
        speech_match = re.search(r'"speech"\s*:\s*"([^"]*)"', raw_content, re.IGNORECASE | re.DOTALL)
        if speech_match:
            return {"speech": speech_match.group(1), "intent": "answer", "tool_call": None}
        
        raise ValueError(f"Could not parse: {raw_content[:100]}")

    async def get_response(
        self,
        user_transcript: str,
        memory_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        context_hash = hashlib.md5(memory_context.encode() if memory_context else b"none").hexdigest()[:8]
        cached = get_cached_response(user_transcript, context_hash)
        if cached:
            return cached

        self.history.append({"role": "user", "content": user_transcript})

        messages: List[Dict[str, str]] = [self.history[0]]
        if memory_context:
            messages.append({"role": "system", "content": memory_context})
        messages.extend(self.history[-20:])

        try:
            client, model = self._get_client()
            
            # CRITICAL: Disable thinking mode for Qwen 3.8 and similar reasoning models
            # This prevents the "content=None" issue
            extra_params = {}
            if "qwen3" in model.lower() or "thinking" in model.lower():
                extra_params = {
                    "extra_body": {
                        "chat_template_kwargs": {"enable_thinking": False}
                    }
                }
            
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=300,
                **extra_params
            )

            message = response.choices[0].message
            raw_content = self._extract_content(message)
            
            # Handle empty content with retry
            if not raw_content:
                logger.warning("Empty content, retrying with /n tag...")
                # Force no-think mode via system prompt
                messages.append({"role": "system", "content": "/n Respond ONLY with JSON. No thinking."})
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.9,
                    max_tokens=300,
                    **extra_params
                )
                raw_content = self._extract_content(response.choices[0].message)
                if not raw_content:
                    raise ValueError("Model returned empty content after retry")

            data = self._extract_json(raw_content)

            result = {
                "speech": data.get("speech", "A temporary glitch in my vast intellect."),
                "caption": data.get("speech", "").upper(),
                "intent": data.get("intent", "answer"),
                "tool_call": data.get("tool_call")
            }

            cache_response(user_transcript, context_hash, result)
            self.history.append({"role": "assistant", "content": json.dumps(data)})
            return result

        except BadRequestError as e:
            error_str = str(e)
            if "tool" in error_str.lower():
                logger.warning(f"Tool call error, extracting from failed_generation")
                match = re.search(r"'failed_generation':\s*'([^']*)'", error_str)
                if match:
                    try:
                        failed_json = json.loads(match.group(1))
                        return {
                            "speech": failed_json.get("speech", "Processing your request..."),
                            "caption": failed_json.get("speech", "").upper(),
                            "intent": "action",
                            "tool_call": failed_json.get("tool_call")
                        }
                    except:
                        pass
            
            fallback_speech = random.choice(FALLBACK_RESPONSES)
            return {"speech": fallback_speech, "caption": fallback_speech.upper(), "intent": "answer", "tool_call": None}

        except Exception as e:
            logger.exception(f"API call failed: {e}")
            fallback_speech = random.choice(FALLBACK_RESPONSES)
            return {"speech": fallback_speech, "caption": fallback_speech.upper(), "intent": "answer", "tool_call": None}

qwen_service = QwenService()