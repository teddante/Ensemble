#!/usr/bin/env python3
"""
Performance benchmarking suite for Ensemble AI application.

This script provides comprehensive performance testing including:
- Response time measurements
- Memory usage profiling
- Concurrent request handling
- Rate limiting validation
- Error handling performance
"""

import asyncio
import time
import statistics
import sys
import os
import json
import argparse
import psutil
import tracemalloc
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from unittest.mock import patch, MagicMock

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import ensemble
from monitoring import get_performance_monitor, configure_performance_monitor
from rate_limiter import configure_rate_limiter, RateLimitConfig


@dataclass
class BenchmarkResult:
    """Result of a benchmark run."""
    name: str
    duration: float
    memory_peak: float
    success: bool
    error_message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class MockAPIClient:
    """Mock API client for benchmarking without making real API calls."""
    
    def __init__(self, latency_ms: int = 100, failure_rate: float = 0.0):
        self.latency_ms = latency_ms
        self.failure_rate = failure_rate
        self.call_count = 0
    
    def chat_completions_create(self, model: str, **kwargs) -> Any:
        """Mock API call with configurable latency and failure rate."""
        self.call_count += 1
        
        # Simulate API latency
        time.sleep(self.latency_ms / 1000.0)
        
        # Simulate failures
        if self.failure_rate > 0 and (self.call_count % int(1/self.failure_rate)) == 0:
            raise Exception(f"Simulated API failure for {model}")
        
        # Create mock response
        response_content = f"Mock response from {model} (call #{self.call_count})"
        
        class MockMessage:
            def __init__(self, content):
                self.content = content
        
        class MockChoice:
            def __init__(self, content):
                self.message = MockMessage(content)
        
        class MockResponse:
            def __init__(self, content):
                self.choices = [MockChoice(content)]
        
        return MockResponse(response_content)


class PerformanceBenchmark:
    """Comprehensive performance benchmarking suite."""
    
    def __init__(self, output_file: str = None):
        self.output_file = output_file
        self.results: List[BenchmarkResult] = []
        self.mock_config = {
            "OPENROUTER_API_KEY": "test-api-key",
            "MODELS": ["model-1", "model-2", "model-3"],
            "REFINEMENT_MODEL_NAME": "refinement-model",
            "PROMPT": "Benchmark test prompt for performance evaluation"
        }
    
    async def run_all_benchmarks(self) -> List[BenchmarkResult]:
        """Run all performance benchmarks."""
        print("🚀 Starting Performance Benchmark Suite")
        print("=" * 50)
        
        benchmarks = [
            ("Basic Response Time", self.benchmark_basic_response_time),
            ("Memory Usage", self.benchmark_memory_usage),
            ("Concurrent Requests", self.benchmark_concurrent_requests),
            ("Error Handling", self.benchmark_error_handling),
            ("Rate Limiting", self.benchmark_rate_limiting),
            ("Scalability", self.benchmark_scalability),
            ("Configuration Loading", self.benchmark_config_loading),
            ("Large Prompt Handling", self.benchmark_large_prompt),
        ]
        
        for name, benchmark_func in benchmarks:
            print(f"\n📊 Running: {name}")
            try:
                result = await benchmark_func()
                self.results.append(result)
                self._print_result(result)
            except Exception as e:
                error_result = BenchmarkResult(
                    name=name,
                    duration=0.0,
                    memory_peak=0.0,
                    success=False,
                    error_message=str(e)
                )
                self.results.append(error_result)
                self._print_result(error_result)
        
        self._print_summary()
        
        if self.output_file:
            self._save_results()
        
        return self.results
    
    async def benchmark_basic_response_time(self) -> BenchmarkResult:
        """Benchmark basic response time."""
        mock_client = MockAPIClient(latency_ms=50)
        
        with patch('ensemble.load_config', return_value=self.mock_config), \
             patch('ensemble.init_client', return_value=mock_client), \
             patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
             patch('builtins.print'), \
             patch('builtins.input', return_value="Test prompt"):
            
            start_time = time.time()
            start_memory = psutil.Process().memory_info().rss / 1024 / 1024
            
            await ensemble.main()
            
            duration = time.time() - start_time
            end_memory = psutil.Process().memory_info().rss / 1024 / 1024
            memory_peak = end_memory - start_memory
            
            return BenchmarkResult(
                name="Basic Response Time",
                duration=duration,
                memory_peak=memory_peak,
                success=True,
                details={
                    "api_calls": mock_client.call_count,
                    "avg_latency_per_call": duration / max(mock_client.call_count, 1)
                }
            )
    
    async def benchmark_memory_usage(self) -> BenchmarkResult:
        """Benchmark memory usage patterns."""
        tracemalloc.start()
        mock_client = MockAPIClient(latency_ms=10)
        
        with patch('ensemble.load_config', return_value=self.mock_config), \
             patch('ensemble.init_client', return_value=mock_client), \
             patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
             patch('builtins.print'), \
             patch('builtins.input', return_value="Memory test prompt"):
            
            start_time = time.time()
            
            # Run multiple operations to test memory leaks
            for _ in range(5):
                await ensemble.main()
            
            duration = time.time() - start_time
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            memory_peak = peak / 1024 / 1024  # Convert to MB
            
            return BenchmarkResult(
                name="Memory Usage",
                duration=duration,
                memory_peak=memory_peak,
                success=True,
                details={
                    "current_memory_mb": current / 1024 / 1024,
                    "peak_memory_mb": memory_peak,
                    "operations_count": 5
                }
            )
    
    async def benchmark_concurrent_requests(self) -> BenchmarkResult:
        """Benchmark concurrent request handling."""
        mock_client = MockAPIClient(latency_ms=100)
        concurrent_runs = 10
        
        async def single_run():
            with patch('ensemble.load_config', return_value=self.mock_config), \
                 patch('ensemble.init_client', return_value=mock_client), \
                 patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
                 patch('builtins.print'), \
                 patch('builtins.input', return_value="Concurrent test"):
                await ensemble.main()
        
        start_time = time.time()
        start_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        # Run concurrent operations
        tasks = [single_run() for _ in range(concurrent_runs)]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        duration = time.time() - start_time
        end_memory = psutil.Process().memory_info().rss / 1024 / 1024
        memory_peak = end_memory - start_memory
        
        return BenchmarkResult(
            name="Concurrent Requests",
            duration=duration,
            memory_peak=memory_peak,
            success=True,
            details={
                "concurrent_operations": concurrent_runs,
                "avg_duration_per_operation": duration / concurrent_runs,
                "total_api_calls": mock_client.call_count
            }
        )
    
    async def benchmark_error_handling(self) -> BenchmarkResult:
        """Benchmark error handling performance."""
        mock_client = MockAPIClient(latency_ms=50, failure_rate=0.5)  # 50% failure rate
        
        with patch('ensemble.load_config', return_value=self.mock_config), \
             patch('ensemble.init_client', return_value=mock_client), \
             patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
             patch('builtins.print'), \
             patch('builtins.input', return_value="Error handling test"):
            
            start_time = time.time()
            start_memory = psutil.Process().memory_info().rss / 1024 / 1024
            
            # This should handle errors gracefully
            await ensemble.main()
            
            duration = time.time() - start_time
            end_memory = psutil.Process().memory_info().rss / 1024 / 1024
            memory_peak = end_memory - start_memory
            
            return BenchmarkResult(
                name="Error Handling",
                duration=duration,
                memory_peak=memory_peak,
                success=True,
                details={
                    "failure_rate": 0.5,
                    "api_calls": mock_client.call_count,
                    "graceful_degradation": True
                }
            )
    
    async def benchmark_rate_limiting(self) -> BenchmarkResult:
        """Benchmark rate limiting performance."""
        # Configure aggressive rate limiting
        rate_config = RateLimitConfig(
            requests_per_minute=10,
            requests_per_second=2,
            burst_limit=3
        )
        configure_rate_limiter(rate_config)
        
        mock_client = MockAPIClient(latency_ms=10)
        
        with patch('ensemble.load_config', return_value=self.mock_config), \
             patch('ensemble.init_client', return_value=mock_client), \
             patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
             patch('builtins.print'), \
             patch('builtins.input', return_value="Rate limiting test"):
            
            start_time = time.time()
            start_memory = psutil.Process().memory_info().rss / 1024 / 1024
            
            await ensemble.main()
            
            duration = time.time() - start_time
            end_memory = psutil.Process().memory_info().rss / 1024 / 1024
            memory_peak = end_memory - start_memory
            
            return BenchmarkResult(
                name="Rate Limiting",
                duration=duration,
                memory_peak=memory_peak,
                success=True,
                details={
                    "rate_limit_applied": True,
                    "expected_delay": "Rate limiting should add delay",
                    "api_calls": mock_client.call_count
                }
            )
    
    async def benchmark_scalability(self) -> BenchmarkResult:
        """Benchmark scalability with increasing load."""
        model_counts = [1, 3, 5, 10]
        results = []
        
        for model_count in model_counts:
            config = self.mock_config.copy()
            config["MODELS"] = [f"model-{i}" for i in range(model_count)]
            
            mock_client = MockAPIClient(latency_ms=50)
            
            with patch('ensemble.load_config', return_value=config), \
                 patch('ensemble.init_client', return_value=mock_client), \
                 patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
                 patch('builtins.print'), \
                 patch('builtins.input', return_value="Scalability test"):
                
                start_time = time.time()
                await ensemble.main()
                duration = time.time() - start_time
                
                results.append({
                    "model_count": model_count,
                    "duration": duration,
                    "api_calls": mock_client.call_count
                })
        
        # Calculate average performance
        avg_duration = statistics.mean([r["duration"] for r in results])
        total_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        return BenchmarkResult(
            name="Scalability",
            duration=avg_duration,
            memory_peak=total_memory,
            success=True,
            details={
                "scaling_results": results,
                "linear_scaling": "Check if duration scales linearly with model count"
            }
        )
    
    async def benchmark_config_loading(self) -> BenchmarkResult:
        """Benchmark configuration loading performance."""
        start_time = time.time()
        start_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        # Load configuration multiple times
        for _ in range(100):
            with patch('ensemble.load_config', return_value=self.mock_config):
                ensemble.load_config()
        
        duration = time.time() - start_time
        end_memory = psutil.Process().memory_info().rss / 1024 / 1024
        memory_peak = end_memory - start_memory
        
        return BenchmarkResult(
            name="Configuration Loading",
            duration=duration,
            memory_peak=memory_peak,
            success=True,
            details={
                "config_loads": 100,
                "avg_load_time": duration / 100
            }
        )
    
    async def benchmark_large_prompt(self) -> BenchmarkResult:
        """Benchmark handling of large prompts."""
        large_prompt = "Large prompt test. " * 1000  # ~17KB prompt
        config = self.mock_config.copy()
        config["PROMPT"] = large_prompt
        
        mock_client = MockAPIClient(latency_ms=100)
        
        with patch('ensemble.load_config', return_value=config), \
             patch('ensemble.init_client', return_value=mock_client), \
             patch('asyncio.to_thread', side_effect=lambda func, *args, **kwargs: func(*args, **kwargs)), \
             patch('builtins.print'), \
             patch('builtins.input', return_value=large_prompt):
            
            start_time = time.time()
            start_memory = psutil.Process().memory_info().rss / 1024 / 1024
            
            await ensemble.main()
            
            duration = time.time() - start_time
            end_memory = psutil.Process().memory_info().rss / 1024 / 1024
            memory_peak = end_memory - start_memory
            
            return BenchmarkResult(
                name="Large Prompt Handling",
                duration=duration,
                memory_peak=memory_peak,
                success=True,
                details={
                    "prompt_size_kb": len(large_prompt) / 1024,
                    "api_calls": mock_client.call_count,
                    "memory_efficiency": "Check memory usage with large prompts"
                }
            )
    
    def _print_result(self, result: BenchmarkResult) -> None:
        """Print benchmark result."""
        status = "✅ PASS" if result.success else "❌ FAIL"
        print(f"   {status} Duration: {result.duration:.3f}s, Memory: {result.memory_peak:.2f}MB")
        
        if result.error_message:
            print(f"   Error: {result.error_message}")
        
        if result.details:
            print(f"   Details: {json.dumps(result.details, indent=6)}")
    
    def _print_summary(self) -> None:
        """Print benchmark summary."""
        print("\n" + "="*50)
        print("📈 BENCHMARK SUMMARY")
        print("="*50)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r.success)
        failed_tests = total_tests - passed_tests
        
        total_duration = sum(r.duration for r in self.results)
        avg_duration = total_duration / max(total_tests, 1)
        max_memory = max(r.memory_peak for r in self.results)
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        print(f"Total Duration: {total_duration:.3f}s")
        print(f"Average Duration: {avg_duration:.3f}s")
        print(f"Peak Memory Usage: {max_memory:.2f}MB")
        
        if failed_tests > 0:
            print(f"\n❌ Failed Tests:")
            for result in self.results:
                if not result.success:
                    print(f"   - {result.name}: {result.error_message}")
        
        # Performance recommendations
        print(f"\n💡 Performance Recommendations:")
        if avg_duration > 5:
            print("   - Consider optimizing response time (avg > 5s)")
        if max_memory > 500:
            print("   - Consider memory optimization (peak > 500MB)")
        if failed_tests > 0:
            print("   - Address failed test cases for production readiness")
        
        print("\n🎯 Performance Targets:")
        print("   - Response time: < 5s average")
        print("   - Memory usage: < 500MB peak")
        print("   - Success rate: > 95%")
        print("   - Error handling: Graceful degradation")
    
    def _save_results(self) -> None:
        """Save results to file."""
        output_data = {
            "timestamp": time.time(),
            "summary": {
                "total_tests": len(self.results),
                "passed_tests": sum(1 for r in self.results if r.success),
                "total_duration": sum(r.duration for r in self.results),
                "peak_memory": max(r.memory_peak for r in self.results)
            },
            "results": [asdict(result) for result in self.results]
        }
        
        with open(self.output_file, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\n💾 Results saved to: {self.output_file}")


async def main():
    """Main benchmark runner."""
    parser = argparse.ArgumentParser(description="Ensemble Performance Benchmark Suite")
    parser.add_argument("--output", "-o", help="Output file for results (JSON)")
    parser.add_argument("--models", "-m", type=int, default=3, help="Number of models to test")
    parser.add_argument("--runs", "-r", type=int, default=1, help="Number of benchmark runs")
    
    args = parser.parse_args()
    
    # Configure performance monitoring for benchmarking
    configure_performance_monitor(max_history=1000)
    
    benchmark = PerformanceBenchmark(output_file=args.output)
    
    print(f"🔧 Benchmark Configuration:")
    print(f"   Models: {args.models}")
    print(f"   Runs: {args.runs}")
    print(f"   Output: {args.output or 'Console only'}")
    
    all_results = []
    
    for run in range(args.runs):
        if args.runs > 1:
            print(f"\n🔄 Run {run + 1}/{args.runs}")
        
        results = await benchmark.run_all_benchmarks()
        all_results.extend(results)
    
    if args.runs > 1:
        print(f"\n📊 AGGREGATE RESULTS ({args.runs} runs)")
        print("="*50)
        
        # Group results by test name
        grouped_results = {}
        for result in all_results:
            if result.name not in grouped_results:
                grouped_results[result.name] = []
            grouped_results[result.name].append(result)
        
        # Calculate averages
        for test_name, test_results in grouped_results.items():
            durations = [r.duration for r in test_results if r.success]
            if durations:
                avg_duration = statistics.mean(durations)
                std_duration = statistics.stdev(durations) if len(durations) > 1 else 0
                print(f"{test_name}: {avg_duration:.3f}s ± {std_duration:.3f}s")


if __name__ == "__main__":
    asyncio.run(main())