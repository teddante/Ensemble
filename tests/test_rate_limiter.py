"""
Tests for the rate limiter module.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
import asyncio
import time
from unittest.mock import patch
from rate_limiter import RateLimiter, RateLimitConfig, get_rate_limiter, configure_rate_limiter


class TestRateLimitConfig(unittest.TestCase):
    """Test the RateLimitConfig dataclass."""
    
    def test_default_config(self):
        """Test default configuration values."""
        config = RateLimitConfig()
        self.assertEqual(config.requests_per_minute, 60)
        self.assertEqual(config.requests_per_second, 5)
        self.assertEqual(config.burst_limit, 10)
        self.assertEqual(config.backoff_multiplier, 2.0)
        self.assertEqual(config.max_backoff, 60.0)
    
    def test_custom_config(self):
        """Test custom configuration values."""
        config = RateLimitConfig(
            requests_per_minute=30,
            requests_per_second=2,
            burst_limit=5,
            backoff_multiplier=1.5,
            max_backoff=30.0
        )
        self.assertEqual(config.requests_per_minute, 30)
        self.assertEqual(config.requests_per_second, 2)
        self.assertEqual(config.burst_limit, 5)
        self.assertEqual(config.backoff_multiplier, 1.5)
        self.assertEqual(config.max_backoff, 30.0)


class TestRateLimiter(unittest.TestCase):
    """Test the RateLimiter class."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.config = RateLimitConfig(
            requests_per_minute=6,  # Very low for testing
            requests_per_second=2,
            burst_limit=3
        )
        self.rate_limiter = RateLimiter(self.config)
    
    def test_rate_limiter_init(self):
        """Test rate limiter initialization."""
        self.assertIsNotNone(self.rate_limiter.config)
        self.assertEqual(self.rate_limiter.config.requests_per_minute, 6)
    
    async def test_acquire_single_request(self):
        """Test acquiring permission for a single request."""
        model = "test-model"
        start_time = time.time()
        await self.rate_limiter.acquire(model)
        elapsed = time.time() - start_time
        # Should be very fast for first request
        self.assertLess(elapsed, 0.1)
    
    async def test_acquire_multiple_requests_same_model(self):
        """Test rate limiting for multiple requests to same model."""
        model = "test-model"
        
        # Make several requests quickly
        for _ in range(3):  # Within burst limit
            await self.rate_limiter.acquire(model)
        
        # This should trigger rate limiting
        start_time = time.time()
        await self.rate_limiter.acquire(model)
        elapsed = time.time() - start_time
        # Should have been delayed
        self.assertGreater(elapsed, 0.05)
    
    def test_record_success(self):
        """Test recording successful requests."""
        model = "test-model"
        self.rate_limiter.record_success(model)
        
        # Check that failure count is reset
        self.assertEqual(self.rate_limiter._consecutive_failures[model], 0)
        self.assertEqual(self.rate_limiter._backoff_times[model], 0.0)
    
    def test_record_failure(self):
        """Test recording failed requests."""
        model = "test-model"
        initial_time = time.time()
        
        self.rate_limiter.record_failure(model)
        
        # Check that failure count increased
        self.assertEqual(self.rate_limiter._consecutive_failures[model], 1)
        self.assertGreater(self.rate_limiter._backoff_times[model], initial_time)
    
    def test_exponential_backoff(self):
        """Test exponential backoff calculation."""
        model = "test-model"
        
        # Record multiple failures
        self.rate_limiter.record_failure(model)
        first_backoff = self.rate_limiter._backoff_times[model]
        
        self.rate_limiter.record_failure(model)
        second_backoff = self.rate_limiter._backoff_times[model]
        
        # Second backoff should be greater (exponential)
        self.assertGreater(second_backoff, first_backoff)
        self.assertEqual(self.rate_limiter._consecutive_failures[model], 2)
    
    def test_max_backoff_limit(self):
        """Test that backoff doesn't exceed maximum."""
        model = "test-model"
        
        # Record many failures to trigger max backoff
        for _ in range(10):
            self.rate_limiter.record_failure(model)
        
        backoff_time = self.rate_limiter._backoff_times[model] - time.time()
        max_backoff = self.rate_limiter.config.max_backoff
        
        # Backoff should not exceed maximum
        self.assertLessEqual(backoff_time, max_backoff + 1)  # Small buffer for timing
    
    def test_get_stats(self):
        """Test getting rate limiting statistics."""
        model1 = "test-model-1"
        model2 = "test-model-2"
        
        # Record some activity
        self.rate_limiter._record_request(model1)
        self.rate_limiter.record_failure(model2)
        
        stats = self.rate_limiter.get_stats()
        
        self.assertIn(model1, stats)
        self.assertIn(model2, stats)
        self.assertIn("requests_last_minute", stats[model1])
        self.assertIn("consecutive_failures", stats[model1])
        self.assertIn("backoff_until", stats[model1])
        self.assertIn("is_backing_off", stats[model1])
        
        # Model2 should be backing off
        self.assertTrue(stats[model2]["is_backing_off"])
        self.assertEqual(stats[model2]["consecutive_failures"], 1)
    
    async def test_different_models_independent_limits(self):
        """Test that different models have independent rate limits."""
        model1 = "test-model-1"
        model2 = "test-model-2"
        
        # Exhaust rate limit for model1
        for _ in range(4):
            await self.rate_limiter.acquire(model1)
        
        # model2 should still be fast
        start_time = time.time()
        await self.rate_limiter.acquire(model2)
        elapsed = time.time() - start_time
        
        self.assertLess(elapsed, 0.1)


class TestGlobalRateLimiter(unittest.TestCase):
    """Test global rate limiter functions."""
    
    def test_get_rate_limiter_singleton(self):
        """Test that get_rate_limiter returns singleton."""
        limiter1 = get_rate_limiter()
        limiter2 = get_rate_limiter()
        self.assertIs(limiter1, limiter2)
    
    def test_configure_rate_limiter(self):
        """Test configuring the global rate limiter."""
        config = RateLimitConfig(requests_per_minute=30)
        configure_rate_limiter(config)
        
        limiter = get_rate_limiter()
        self.assertEqual(limiter.config.requests_per_minute, 30)


class TestRateLimiterIntegration(unittest.TestCase):
    """Integration tests for rate limiter."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Use very permissive limits for integration tests
        self.config = RateLimitConfig(
            requests_per_minute=100,
            requests_per_second=10,
            burst_limit=20
        )
        self.rate_limiter = RateLimiter(self.config)
    
    async def test_realistic_usage_pattern(self):
        """Test realistic usage pattern with multiple models."""
        models = ["model-1", "model-2", "model-3"]
        
        # Simulate realistic request pattern
        tasks = []
        for i in range(15):  # 15 total requests
            model = models[i % len(models)]  # Rotate through models
            task = asyncio.create_task(self._make_request(model))
            tasks.append(task)
            if i % 3 == 0:  # Small delay every 3 requests
                await asyncio.sleep(0.1)
        
        # Wait for all requests to complete
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # All requests should succeed
        for result in results:
            self.assertIsNone(result)  # No exceptions
    
    async def _make_request(self, model):
        """Simulate making a request with rate limiting."""
        await self.rate_limiter.acquire(model)
        # Simulate some processing time
        await asyncio.sleep(0.01)
        self.rate_limiter.record_success(model)
    
    async def test_failure_recovery_pattern(self):
        """Test failure and recovery pattern."""
        model = "test-model"
        
        # Simulate some failures
        for _ in range(3):
            self.rate_limiter.record_failure(model)
        
        # Check that backoff is in effect
        stats = self.rate_limiter.get_stats()
        self.assertTrue(stats[model]["is_backing_off"])
        
        # Simulate successful recovery
        self.rate_limiter.record_success(model)
        
        # Check that backoff is cleared
        stats = self.rate_limiter.get_stats()
        self.assertFalse(stats[model]["is_backing_off"])
        self.assertEqual(stats[model]["consecutive_failures"], 0)


if __name__ == '__main__':
    unittest.main()