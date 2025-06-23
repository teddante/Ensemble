"""
Performance monitoring and metrics collection for Ensemble.
"""

import datetime
import json
import logging
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class RequestMetrics:
    """Metrics for a single request."""

    model: str
    start_time: float
    end_time: Optional[float] = None
    success: bool = False
    error_message: Optional[str] = None
    response_length: int = 0

    @property
    def duration(self) -> Optional[float]:
        """Calculate request duration."""
        if self.end_time is None:
            return None
        return self.end_time - self.start_time


@dataclass
class EnsembleMetrics:
    """Metrics for a complete ensemble operation."""

    start_time: float
    end_time: Optional[float] = None
    prompt_length: int = 0
    models_attempted: int = 0
    models_succeeded: int = 0
    refinement_success: bool = False
    output_length: int = 0
    request_metrics: List[RequestMetrics] = field(default_factory=list)

    @property
    def duration(self) -> Optional[float]:
        """Calculate total ensemble duration."""
        if self.end_time is None:
            return None
        return self.end_time - self.start_time

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        if self.models_attempted == 0:
            return 0.0
        return self.models_succeeded / self.models_attempted


class PerformanceMonitor:
    """
    Performance monitoring system for Ensemble operations.

    Collects metrics on:
    - Request latencies per model
    - Success/failure rates
    - Error patterns
    - Resource usage
    """

    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self._lock = threading.Lock()
        self._ensemble_metrics: deque = deque(maxlen=max_history)
        self._model_stats: Dict[str, Dict] = defaultdict(
            lambda: {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "total_duration": 0.0,
                "error_counts": defaultdict(int),
                "recent_latencies": deque(maxlen=100),
            }
        )
        self.logger = logging.getLogger(__name__)

    def start_ensemble_operation(self, prompt_length: int) -> EnsembleMetrics:
        """Start tracking a new ensemble operation."""
        metrics = EnsembleMetrics(start_time=time.time(), prompt_length=prompt_length)
        self.logger.debug(f"Started tracking ensemble operation with prompt length {prompt_length}")
        return metrics

    def start_request(self, model: str) -> RequestMetrics:
        """Start tracking a model request."""
        metrics = RequestMetrics(model=model, start_time=time.time())
        self.logger.debug(f"Started tracking request to {model}")
        return metrics

    def finish_request(
        self,
        metrics: RequestMetrics,
        success: bool,
        response_length: int = 0,
        error_message: Optional[str] = None,
    ) -> None:
        """Finish tracking a model request."""
        metrics.end_time = time.time()
        metrics.success = success
        metrics.response_length = response_length
        metrics.error_message = error_message

        with self._lock:
            stats = self._model_stats[metrics.model]
            stats["total_requests"] += 1

            if success:
                stats["successful_requests"] += 1
                stats["total_duration"] += metrics.duration
                stats["recent_latencies"].append(metrics.duration)
            else:
                stats["failed_requests"] += 1
                if error_message:
                    stats["error_counts"][error_message] += 1

        self.logger.debug(
            f"Finished tracking request to {metrics.model}: "
            f"success={success}, duration={metrics.duration:.2f}s"
        )

    def finish_ensemble_operation(
        self, metrics: EnsembleMetrics, refinement_success: bool, output_length: int = 0
    ) -> None:
        """Finish tracking an ensemble operation."""
        metrics.end_time = time.time()
        metrics.refinement_success = refinement_success
        metrics.output_length = output_length
        metrics.models_attempted = len(metrics.request_metrics)
        metrics.models_succeeded = sum(1 for r in metrics.request_metrics if r.success)

        with self._lock:
            self._ensemble_metrics.append(metrics)

        self.logger.info(
            f"Ensemble operation completed: "
            f"duration={metrics.duration:.2f}s, "
            f"success_rate={metrics.success_rate:.2%}, "
            f"refinement_success={refinement_success}"
        )

    def get_model_stats(self, model: Optional[str] = None) -> Dict[str, Any]:
        """Get statistics for a specific model or all models."""
        with self._lock:
            if model:
                if model not in self._model_stats:
                    return {}

                stats = self._model_stats[model].copy()
                stats["error_counts"] = dict(stats["error_counts"])
                stats["recent_latencies"] = list(stats["recent_latencies"])

                # Calculate derived metrics
                if stats["successful_requests"] > 0:
                    stats["average_latency"] = (
                        stats["total_duration"] / stats["successful_requests"]
                    )
                    stats["p95_latency"] = self._calculate_percentile(stats["recent_latencies"], 95)
                    stats["p99_latency"] = self._calculate_percentile(stats["recent_latencies"], 99)
                else:
                    stats["average_latency"] = 0.0
                    stats["p95_latency"] = 0.0
                    stats["p99_latency"] = 0.0

                if stats["total_requests"] > 0:
                    stats["success_rate"] = stats["successful_requests"] / stats["total_requests"]
                else:
                    stats["success_rate"] = 0.0

                return {model: stats}
            else:
                # Return stats for all models
                all_stats = {}
                for model_name, _ in self._model_stats.items():
                    all_stats.update(self.get_model_stats(model_name))
                return all_stats

    def get_ensemble_stats(self, recent_count: Optional[int] = None) -> Dict[str, Any]:
        """Get ensemble operation statistics."""
        with self._lock:
            if not self._ensemble_metrics:
                return {}

            recent_ops = list(self._ensemble_metrics)
            if recent_count:
                recent_ops = recent_ops[-recent_count:]

            total_ops = len(recent_ops)
            successful_ops = sum(1 for op in recent_ops if op.refinement_success)

            durations = [op.duration for op in recent_ops if op.duration is not None]
            success_rates = [op.success_rate for op in recent_ops]

            stats = {
                "total_operations": total_ops,
                "successful_operations": successful_ops,
                "operation_success_rate": (successful_ops / total_ops if total_ops > 0 else 0.0),
                "average_model_success_rate": (
                    sum(success_rates) / len(success_rates) if success_rates else 0.0
                ),
            }

            if durations:
                stats.update(
                    {
                        "average_duration": sum(durations) / len(durations),
                        "min_duration": min(durations),
                        "max_duration": max(durations),
                        "p95_duration": self._calculate_percentile(durations, 95),
                        "p99_duration": self._calculate_percentile(durations, 99),
                    }
                )

            return stats

    def get_health_status(self) -> Dict[str, Any]:
        """Get overall health status of the system."""
        model_stats = self.get_model_stats()
        ensemble_stats = self.get_ensemble_stats(recent_count=100)  # Last 100 operations

        # Determine health based on recent performance
        health_status = "healthy"
        issues = []

        # Check model health
        for model, stats in model_stats.items():
            if stats.get("success_rate", 0) < 0.8:  # Less than 80% success rate
                health_status = "degraded"
                issues.append(f"Model {model} has low success rate: {stats['success_rate']:.2%}")

            if stats.get("average_latency", 0) > 30:  # More than 30 seconds average
                health_status = "degraded"
                issues.append(f"Model {model} has high latency: {stats['average_latency']:.2f}s")

        # Check ensemble health
        if ensemble_stats.get("operation_success_rate", 0) < 0.9:  # Less than 90% success
            health_status = "degraded"
            issues.append(
                f"Low ensemble success rate: {ensemble_stats['operation_success_rate']:.2%}"
            )

        return {
            "status": health_status,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "issues": issues,
            "model_count": len(model_stats),
            "recent_operations": ensemble_stats.get("total_operations", 0),
        }

    def export_metrics(self, format: str = "json") -> str:
        """Export all metrics in the specified format."""
        data = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "model_stats": self.get_model_stats(),
            "ensemble_stats": self.get_ensemble_stats(),
            "health_status": self.get_health_status(),
        }

        if format == "json":
            return json.dumps(data, indent=2, default=str)
        else:
            raise ValueError(f"Unsupported export format: {format}")

    def reset_metrics(self) -> None:
        """Reset all collected metrics."""
        with self._lock:
            self._ensemble_metrics.clear()
            self._model_stats.clear()
        self.logger.info("All metrics have been reset")

    @staticmethod
    def _calculate_percentile(values: List[float], percentile: float) -> float:
        """Calculate the specified percentile of a list of values."""
        if not values:
            return 0.0

        sorted_values = sorted(values)
        index = int((percentile / 100) * len(sorted_values))
        index = min(index, len(sorted_values) - 1)
        return sorted_values[index]


# Global performance monitor instance
_global_monitor: Optional[PerformanceMonitor] = None


def get_performance_monitor() -> PerformanceMonitor:
    """Get the global performance monitor instance."""
    global _global_monitor
    if _global_monitor is None:
        _global_monitor = PerformanceMonitor()
    return _global_monitor


def configure_performance_monitor(max_history: int = 1000) -> None:
    """Configure the global performance monitor."""
    global _global_monitor
    _global_monitor = PerformanceMonitor(max_history=max_history)
