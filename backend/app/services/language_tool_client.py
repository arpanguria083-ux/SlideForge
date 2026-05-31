import httpx
import logging
import os


class LanguageToolClient:
    def __init__(self, base_url: str | None = None):
        self.local_url = (
            base_url or os.getenv("LANGUAGETOOL_URL") or "http://localhost:8081"
        ).rstrip("/")
        self.public_url = "https://api.languagetool.org"
        self._last_error: str | None = None
        self._is_local_online = False

    @property
    def base_url(self) -> str:
        return self.local_url if self._is_local_online else self.public_url

    @property
    def check_url(self) -> str:
        return f"{self.base_url}/v2/check"

    async def check(self, text: str, language: str = "en-US") -> list[dict]:
        if not text.strip():
            return []

        # 1. Try local server first for low latency and privacy
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.post(
                    f"{self.local_url}/v2/check", data={"text": text, "language": language}
                )
                response.raise_for_status()
                self._is_local_online = True
                self._last_error = None
                return response.json().get("matches", [])
        except Exception as local_err:
            self._is_local_online = False
            logging.debug(f"Local LanguageTool offline: {local_err}. Trying public API fallback...")

            # 2. Try public cloud LanguageTool API fallback
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    response = await client.post(
                        f"{self.public_url}/v2/check", data={"text": text, "language": language}
                    )
                    response.raise_for_status()
                    self._last_error = None
                    return response.json().get("matches", [])
            except Exception as public_err:
                self._last_error = f"Local: {local_err} | Public: {public_err}"
                logging.debug("All LanguageTool engines offline. Falling back to built-in Regex checker.")
                return []

    async def is_available(self) -> bool:
        # Check local first
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                response = await client.get(f"{self.local_url}/v2/languages")
                if response.status_code == 200:
                    self._is_local_online = True
                    self._last_error = None
                    return True
        except Exception:
            self._is_local_online = False

        # Fallback to checking public API
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{self.public_url}/v2/languages")
                if response.status_code == 200:
                    self._last_error = None
                    return True
                self._last_error = "Public API responded with non-200"
                return False
        except Exception as e:
            self._last_error = str(e)
            return False

    async def status(self) -> dict:
        available = await self.is_available()
        return {
            "available": available,
            "engine": "local_languagetool" if self._is_local_online else "cloud_languagetool" if available else "regex_fallback",
            "base_url": self.base_url,
            "check_url": self.check_url,
            "last_error": self._last_error,
        }

