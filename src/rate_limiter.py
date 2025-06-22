"""
Rate limiting utilities for API requests.
"""
import time
import asyncio
import logging
from typing import Dict, Optional
from dataclasses import dataclass
from collections import defaultdict

logger = logging.getLogger(__name__)

@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    requests_per_minute: int = 60
    requests_per_second: int = 5
    burst_limit: int = 10
    backoff_multiplier: float = 2.0
    max_backoff: float = 60.0

class RateLimiter:
    """
    Rate limiter for API requests with per-model limits and exponential backoff.
    """
    
    def __init__(self, config: RateLimitConfig = None):
        self.config = config or RateLimitConfig()
        self._request_times: Dict[str, list] = defaultdict(list)
        self._locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._backoff_times: Dict[str, float] = defaultdict(float)
        self._consecutive_failures: Dict[str, int] = defaultdict(int)

    async def acquire(self, model_name: str) -> None:
        """
        Acquire permission to make a request for the given model.
        
        Args:
            model_name: The model identifier to rate limit
        """
        async with self._locks[model_name]:
            await self._wait_for_rate_limit(model_name)
            await self._apply_backoff(model_name)
            self._record_request(model_name)
    
    def record_success(self, model_name: str) -> None:
        """
        Record a successful request to reset backoff for the model.
        
        Args:
            model_name: The model identifier
        """
        self._consecutive_failures[model_name] = 0
        self._backoff_times[model_name] = 0.0
        logger.debug(f"Rate limiter: Success recorded for {model_name}")
    
    def record_failure(self, model_name: str) -> None:
        """
        Record a failed request to increase backoff for the model.
        
        Args:
            model_name: The model identifier
        """
        self._consecutive_failures[model_name] += 1
        backoff_time = min(
            self.config.backoff_multiplier ** self._consecutive_failures[model_name],
            self.config.max_backoff
        )
        self._backoff_times[model_name] = time.time() + backoff_time
        
        logger.warning(
            f"Rate limiter: Failure recorded for {model_name}, "
            f"backoff for {backoff_time:.2f}s "
            f"(consecutive failures: {self._consecutive_failures[model_name]})"
        )
    
    async def _wait_for_rate_limit(self, model_name: str) -> None:
        """Wait if rate limit would be exceeded."""
        current_time = time.time()
        request_times = self._request_times[model_name]
        
        # Remove old requests outside the time window
        cutoff_time = current_time - 60  # 1 minute window
        request_times[:] = [t for t in request_times if t > cutoff_time]
        
        # Check per-minute limit
        if len(request_times) >= self.config.requests_per_minute:
            wait_time = request_times[0] + 60 - current_time
            if wait_time > 0:
                logger.info(f"Rate limit: Waiting {wait_time:.2f}s for {model_name} (per-minute limit)")
                await asyncio.sleep(wait_time)
        
        # Check per-second limit
        recent_requests = [t for t in request_times if t > current_time - 1]
        if len(recent_requests) >= self.config.requests_per_second:
            wait_time = 1.0 - (current_time - recent_requests[0])
            if wait_time > 0:
                logger.info(f"Rate limit: Waiting {wait_time:.2f}s for {model_name} (per-second limit)")
                await asyncio.sleep(wait_time)
        
        # Check burst limit
        very_recent = [t for t in request_times if t > current_time - 0.1]
        if len(very_recent) >= self.config.burst_limit:
            wait_time = 0.1
            logger.info(f"Rate limit: Waiting {wait_time:.2f}s for {model_name} (burst limit)")
            await asyncio.sleep(wait_time)
    
    async def _apply_backoff(self, model_name: str) -> None:
        """Apply exponential backoff if needed."""
        backoff_until = self._backoff_times[model_name]
        if backoff_until > time.time():
            wait_time = backoff_until - time.time()
            logger.info(f"Rate limit: Exponential backoff for {model_name}, waiting {wait_time:.2f}s")
            await asyncio.sleep(wait_time)
    
    def _record_request(self, model_name: str) -> None:
        """Record a request timestamp."""
        self._request_times[model_name].append(time.time())
    
    def get_stats(self) -> Dict[str, dict]:
        """Get rate limiting statistics for all models."""
        stats = {}
        current_time = time.time()
        
        for model_name in self._request_times:
            request_times = self._request_times[model_name]
            recent_requests = [t for t in request_times if t > current_time - 60]
            
            stats[model_name] = {
                'requests_last_minute': len(recent_requests),
                'consecutive_failures': self._consecutive_failures[model_name],
                'backoff_until': self._backoff_times[model_name],
                'is_backing_off': self._backoff_times[model_name] > current_time
            }
        
        return stats

# Global rate limiter instance
_global_rate_limiter: Optional[RateLimiter] = None

def get_rate_limiter() -> RateLimiter:
    """Get the global rate limiter instance."""
    global _global_rate_limiter
    if _global_rate_limiter is None:
        _global_rate_limiter = RateLimiter()
    return _global_rate_limiter

def configure_rate_limiter(config: RateLimitConfig) -> None:
    """Configure the global rate limiter."""
    global _global_rate_limiter
    _global_rate_limiter = RateLimiter(config)