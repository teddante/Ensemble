"""
Health check system for Ensemble application.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import load_config
from monitoring import get_performance_monitor
from validation import PromptValidationError, sanitize_prompt


class HealthStatus(Enum):
    """Health status levels."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class HealthCheckResult:
    """Result of a health check."""

    name: str
    status: HealthStatus
    message: str
    duration: float
    details: Optional[Dict[str, Any]] = None


class HealthChecker:
    """
    Comprehensive health checking system for Ensemble.

    Performs various health checks including:
    - Configuration validation
    - System dependencies
    - Performance metrics
    - External service connectivity
    """

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.performance_monitor = get_performance_monitor()

    async def run_all_checks(self) -> Dict[str, Any]:
        """Run all health checks and return comprehensive status."""
        start_time = time.time()

        checks = [
            self.check_configuration,
            self.check_dependencies,
            self.check_file_system,
            self.check_validation_system,
            self.check_performance_metrics,
            self.check_memory_usage,
        ]

        results = []
        for check in checks:
            try:
                result = await check()
                results.append(result)
            except Exception as e:
                self.logger.exception(f"Health check {check.__name__} failed with exception")
                results.append(
                    HealthCheckResult(
                        name=check.__name__,
                        status=HealthStatus.UNHEALTHY,
                        message=f"Check failed with exception: {str(e)}",
                        duration=0.0,
                    )
                )

        total_duration = time.time() - start_time
        overall_status = self._determine_overall_status(results)

        return {
            "status": overall_status.value,
            "timestamp": time.time(),
            "total_duration": total_duration,
            "checks": [
                {
                    "name": result.name,
                    "status": result.status.value,
                    "message": result.message,
                    "duration": result.duration,
                    "details": result.details,
                }
                for result in results
            ],
            "summary": self._generate_summary(results),
        }

    async def check_configuration(self) -> HealthCheckResult:
        """Check configuration loading and validation."""
        start_time = time.time()

        try:
            config = load_config()

            # Check required fields
            required_fields = ["MODELS", "REFINEMENT_MODEL_NAME"]
            missing_fields = [field for field in required_fields if not config.get(field)]

            if missing_fields:
                return HealthCheckResult(
                    name="configuration",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Missing required configuration fields: {missing_fields}",
                    duration=time.time() - start_time,
                    details={
                        "missing_fields": missing_fields,
                        "config_keys": list(config.keys()),
                    },
                )

            # Check API key
            api_key = config.get("OPENROUTER_API_KEY", config.get("openrouter_api_key"))
            if not api_key or "replace" in api_key.lower():
                return HealthCheckResult(
                    name="configuration",
                    status=HealthStatus.DEGRADED,
                    message="API key not configured properly",
                    duration=time.time() - start_time,
                    details={"has_api_key": bool(api_key)},
                )

            # Check models list
            models = config.get("MODELS", config.get("models", []))
            if not models or len(models) == 0:
                return HealthCheckResult(
                    name="configuration",
                    status=HealthStatus.UNHEALTHY,
                    message="No models configured",
                    duration=time.time() - start_time,
                    details={"models_count": 0},
                )

            return HealthCheckResult(
                name="configuration",
                status=HealthStatus.HEALTHY,
                message=f"Configuration loaded successfully with {len(models)} models",
                duration=time.time() - start_time,
                details={
                    "models_count": len(models),
                    "has_api_key": bool(api_key),
                    "config_fields": len(config),
                },
            )

        except Exception as e:
            return HealthCheckResult(
                name="configuration",
                status=HealthStatus.UNHEALTHY,
                message=f"Configuration loading failed: {str(e)}",
                duration=time.time() - start_time,
                details={"error": str(e)},
            )

    async def check_dependencies(self) -> HealthCheckResult:
        """Check system dependencies and imports."""
        start_time = time.time()

        try:
            # Test critical imports
            try:
                import openai

                openai_available = True
                openai_version = getattr(openai, "__version__", "unknown")
            except ImportError:
                openai_available = False
                openai_version = "not installed"

            try:
                import pydantic

                pydantic_available = True
                _ = pydantic.__version__  # Mark as used
            except ImportError:
                pydantic_available = False

            try:
                import bleach

                bleach_available = True
                _ = bleach.__version__  # Mark as used
            except ImportError:
                bleach_available = False

            try:
                import ratelimit

                ratelimit_available = True
                _ = ratelimit.__version__  # Mark as used
            except ImportError:
                ratelimit_available = False

            # Test basic functionality if available
            if openai_available:
                from openai import OpenAI

                _ = OpenAI  # Mark as used
            if pydantic_available:
                from pydantic import BaseModel

                _ = BaseModel  # Mark as used

            # Determine overall status
            missing_critical = []
            if not openai_available:
                missing_critical.append("openai")
            if not pydantic_available:
                missing_critical.append("pydantic")

            if missing_critical:
                status = HealthStatus.UNHEALTHY
                message = f"Critical dependencies missing: {', '.join(missing_critical)}"
            elif not bleach_available or not ratelimit_available:
                status = HealthStatus.DEGRADED
                missing = []
                if not bleach_available:
                    missing.append("bleach")
                if not ratelimit_available:
                    missing.append("ratelimit")
                message = f"Optional dependencies missing: {', '.join(missing)}"
            else:
                status = HealthStatus.HEALTHY
                message = "All dependencies are available"

            return HealthCheckResult(
                name="dependencies",
                status=status,
                message=message,
                duration=time.time() - start_time,
                details={
                    "openai_version": openai_version,
                    "openai_available": openai_available,
                    "pydantic_available": pydantic_available,
                    "bleach_available": bleach_available,
                    "ratelimit_available": ratelimit_available,
                },
            )

        except ImportError as e:
            return HealthCheckResult(
                name="dependencies",
                status=HealthStatus.UNHEALTHY,
                message=f"Missing dependency: {str(e)}",
                duration=time.time() - start_time,
                details={"missing_dependency": str(e)},
            )
        except Exception as e:
            return HealthCheckResult(
                name="dependencies",
                status=HealthStatus.DEGRADED,
                message=f"Dependency check warning: {str(e)}",
                duration=time.time() - start_time,
                details={"warning": str(e)},
            )

    async def check_file_system(self) -> HealthCheckResult:
        """Check file system accessibility and permissions."""
        start_time = time.time()

        try:
            # Check output directory creation
            output_dir = Path("output")
            output_dir.mkdir(parents=True, exist_ok=True)

            if not output_dir.exists():
                return HealthCheckResult(
                    name="file_system",
                    status=HealthStatus.UNHEALTHY,
                    message="Cannot create output directory",
                    duration=time.time() - start_time,
                )

            # Check write permissions
            test_file = output_dir / "health_check_test.txt"
            try:
                with open(test_file, "w") as f:
                    f.write("health check test")
                test_file.unlink()  # Clean up

                return HealthCheckResult(
                    name="file_system",
                    status=HealthStatus.HEALTHY,
                    message="File system access is working",
                    duration=time.time() - start_time,
                    details={"output_dir_writable": True},
                )

            except PermissionError:
                return HealthCheckResult(
                    name="file_system",
                    status=HealthStatus.DEGRADED,
                    message="Output directory is not writable",
                    duration=time.time() - start_time,
                    details={"output_dir_writable": False},
                )

        except Exception as e:
            return HealthCheckResult(
                name="file_system",
                status=HealthStatus.UNHEALTHY,
                message=f"File system check failed: {str(e)}",
                duration=time.time() - start_time,
                details={"error": str(e)},
            )

    async def check_validation_system(self) -> HealthCheckResult:
        """Check validation and sanitization systems."""
        start_time = time.time()

        try:
            # Test prompt sanitization
            test_prompts = [
                "Normal prompt",
                "<script>alert('test')</script>Dangerous prompt",
                "   Prompt with   excessive   whitespace   ",
                "A" * 1000,  # Long prompt
            ]

            for prompt in test_prompts:
                try:
                    sanitized = sanitize_prompt(prompt)
                    if not sanitized:
                        raise ValueError("Sanitization returned empty result")
                except PromptValidationError:
                    # Expected for dangerous prompts
                    pass

            return HealthCheckResult(
                name="validation_system",
                status=HealthStatus.HEALTHY,
                message="Validation system is working correctly",
                duration=time.time() - start_time,
                details={"test_prompts_processed": len(test_prompts)},
            )

        except Exception as e:
            return HealthCheckResult(
                name="validation_system",
                status=HealthStatus.DEGRADED,
                message=f"Validation system warning: {str(e)}",
                duration=time.time() - start_time,
                details={"error": str(e)},
            )

    async def check_performance_metrics(self) -> HealthCheckResult:
        """Check performance monitoring system."""
        start_time = time.time()

        try:
            # Get current metrics
            health_status = self.performance_monitor.get_health_status()
            model_stats = self.performance_monitor.get_model_stats()
            ensemble_stats = self.performance_monitor.get_ensemble_stats()

            status = HealthStatus.HEALTHY
            message = "Performance monitoring is active"

            # Check if we have concerning metrics
            if health_status["status"] == "degraded":
                status = HealthStatus.DEGRADED
                message = f"Performance issues detected: {', '.join(health_status['issues'])}"

            return HealthCheckResult(
                name="performance_metrics",
                status=status,
                message=message,
                duration=time.time() - start_time,
                details={
                    "monitoring_status": health_status["status"],
                    "tracked_models": len(model_stats),
                    "recent_operations": ensemble_stats.get("total_operations", 0),
                },
            )

        except Exception as e:
            return HealthCheckResult(
                name="performance_metrics",
                status=HealthStatus.DEGRADED,
                message=f"Performance monitoring check failed: {str(e)}",
                duration=time.time() - start_time,
                details={"error": str(e)},
            )

    async def check_memory_usage(self) -> HealthCheckResult:
        """Check memory usage and resource consumption."""
        start_time = time.time()

        try:
            import os

            import psutil

            # Get current process memory usage
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / 1024 / 1024

            # Get system memory
            system_memory = psutil.virtual_memory()
            memory_percent = (memory_mb / (system_memory.total / 1024 / 1024)) * 100

            status = HealthStatus.HEALTHY
            message = f"Memory usage: {memory_mb:.1f}MB ({memory_percent:.1f}% of system)"

            if memory_percent > 80:
                status = HealthStatus.DEGRADED
                message = f"High memory usage: {memory_mb:.1f}MB ({memory_percent:.1f}% of system)"
            elif memory_percent > 95:
                status = HealthStatus.UNHEALTHY
                message = (
                    f"Critical memory usage: {memory_mb:.1f}MB ({memory_percent:.1f}% of system)"
                )

            return HealthCheckResult(
                name="memory_usage",
                status=status,
                message=message,
                duration=time.time() - start_time,
                details={
                    "memory_mb": memory_mb,
                    "memory_percent": memory_percent,
                    "system_memory_mb": system_memory.total / 1024 / 1024,
                },
            )

        except ImportError:
            return HealthCheckResult(
                name="memory_usage",
                status=HealthStatus.DEGRADED,
                message="psutil not available, cannot check memory usage",
                duration=time.time() - start_time,
                details={"psutil_available": False},
            )
        except Exception as e:
            return HealthCheckResult(
                name="memory_usage",
                status=HealthStatus.DEGRADED,
                message=f"Memory check failed: {str(e)}",
                duration=time.time() - start_time,
                details={"error": str(e)},
            )

    def _determine_overall_status(self, results: List[HealthCheckResult]) -> HealthStatus:
        """Determine overall health status from individual check results."""
        if any(result.status == HealthStatus.UNHEALTHY for result in results):
            return HealthStatus.UNHEALTHY
        elif any(result.status == HealthStatus.DEGRADED for result in results):
            return HealthStatus.DEGRADED
        else:
            return HealthStatus.HEALTHY

    def _generate_summary(self, results: List[HealthCheckResult]) -> Dict[str, Any]:
        """Generate a summary of health check results."""
        total_checks = len(results)
        healthy_checks = sum(1 for r in results if r.status == HealthStatus.HEALTHY)
        degraded_checks = sum(1 for r in results if r.status == HealthStatus.DEGRADED)
        unhealthy_checks = sum(1 for r in results if r.status == HealthStatus.UNHEALTHY)

        return {
            "total_checks": total_checks,
            "healthy_checks": healthy_checks,
            "degraded_checks": degraded_checks,
            "unhealthy_checks": unhealthy_checks,
            "health_percentage": ((healthy_checks / total_checks * 100) if total_checks > 0 else 0),
        }


# Global health checker instance
_global_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """Get the global health checker instance."""
    global _global_health_checker
    if _global_health_checker is None:
        _global_health_checker = HealthChecker()
    return _global_health_checker


async def run_health_check() -> Dict[str, Any]:
    """Run a complete health check and return results."""
    checker = get_health_checker()
    return await checker.run_all_checks()


def export_health_check(format: str = "json") -> str:
    """Export health check results in the specified format."""

    async def _run():
        return await run_health_check()

    # Run the async function
    import asyncio

    results = asyncio.run(_run())

    if format == "json":
        return json.dumps(results, indent=2, default=str)
    else:
        raise ValueError(f"Unsupported export format: {format}")


if __name__ == "__main__":
    # Command-line health check

    async def main():
        results = await run_health_check()
        print(json.dumps(results, indent=2, default=str))

    asyncio.run(main())
