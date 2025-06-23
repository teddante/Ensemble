"""
Comprehensive error handling and recovery system for Ensemble AI.

This module provides:
- Custom exception classes with detailed context
- Error message sanitization for production
- Structured error logging with correlation IDs
- Recovery strategies for different error types
- Error analytics and reporting
"""

import json
import logging
import re
import sys
import time
import traceback
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class ErrorSeverity(Enum):
    """Error severity levels for classification and alerting."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    """Error categories for classification and handling."""

    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    RATE_LIMIT = "rate_limit"
    NETWORK = "network"
    API = "api"
    CONFIGURATION = "configuration"
    PROCESSING = "processing"
    STORAGE = "storage"
    SYSTEM = "system"
    UNKNOWN = "unknown"


@dataclass
class ErrorContext:
    """Context information for error tracking and debugging."""

    operation: str
    component: str
    user_id: Optional[str] = None
    request_id: Optional[str] = None
    correlation_id: Optional[str] = None
    model_name: Optional[str] = None
    prompt_hash: Optional[str] = None
    timestamp: float = field(default_factory=time.time)
    extra_data: Dict[str, Any] = field(default_factory=dict)


class EnsembleError(Exception):
    """Base exception class for Ensemble AI application."""

    def __init__(
        self,
        message: str,
        category: ErrorCategory = ErrorCategory.UNKNOWN,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        context: Optional[ErrorContext] = None,
        recovery_suggestions: Optional[List[str]] = None,
        user_message: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.category = category
        self.severity = severity
        self.context = context or ErrorContext(operation="unknown", component="unknown")
        self.recovery_suggestions = recovery_suggestions or []
        self.user_message = user_message or self._generate_user_message()
        self.timestamp = time.time()

    def _generate_user_message(self) -> str:
        """Generate a user-friendly error message."""
        category_messages = {
            ErrorCategory.VALIDATION: "Please check your input and try again.",
            ErrorCategory.AUTHENTICATION: "Authentication failed. Please check your API key.",
            ErrorCategory.RATE_LIMIT: "Too many requests. Please wait a moment and try again.",
            ErrorCategory.NETWORK: "Network connection issue. Please check your connection and retry.",
            ErrorCategory.API: "External service is temporarily unavailable. Please try again later.",
            ErrorCategory.CONFIGURATION: "Configuration error. Please check your settings.",
            ErrorCategory.PROCESSING: "Processing error occurred. Please try again.",
            ErrorCategory.STORAGE: "File operation failed. Please check permissions and disk space.",
            ErrorCategory.SYSTEM: "System error occurred. Please contact support if it persists.",
            ErrorCategory.UNKNOWN: "An unexpected error occurred. Please try again.",
        }
        return category_messages.get(self.category, "An error occurred. Please try again.")

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for logging and serialization."""
        return {
            "type": self.__class__.__name__,
            "message": self.message,
            "user_message": self.user_message,
            "category": self.category.value,
            "severity": self.severity.value,
            "timestamp": self.timestamp,
            "context": {
                "operation": self.context.operation,
                "component": self.context.component,
                "user_id": self.context.user_id,
                "request_id": self.context.request_id,
                "correlation_id": self.context.correlation_id,
                "model_name": self.context.model_name,
                "prompt_hash": self.context.prompt_hash,
                "timestamp": self.context.timestamp,
                "extra_data": self.context.extra_data,
            },
            "recovery_suggestions": self.recovery_suggestions,
            "traceback": traceback.format_exc() if sys.exc_info()[0] else None,
        }


class ValidationError(EnsembleError):
    """Exception for input validation errors."""

    def __init__(self, message: str, field: Optional[str] = None, **kwargs):
        self.field = field
        super().__init__(
            message,
            category=ErrorCategory.VALIDATION,
            severity=ErrorSeverity.LOW,
            **kwargs,
        )


class AuthenticationError(EnsembleError):
    """Exception for authentication and authorization errors."""

    def __init__(self, message: str, **kwargs):
        super().__init__(
            message,
            category=ErrorCategory.AUTHENTICATION,
            severity=ErrorSeverity.HIGH,
            recovery_suggestions=[
                "Check your API key configuration",
                "Verify your API key is valid and not expired",
                "Ensure you have proper permissions",
            ],
            **kwargs,
        )


class RateLimitError(EnsembleError):
    """Exception for rate limiting errors."""

    def __init__(self, message: str, retry_after: Optional[int] = None, **kwargs):
        self.retry_after = retry_after
        suggestions = ["Wait before making more requests"]
        if retry_after:
            suggestions.append(f"Retry after {retry_after} seconds")

        super().__init__(
            message,
            category=ErrorCategory.RATE_LIMIT,
            severity=ErrorSeverity.MEDIUM,
            recovery_suggestions=suggestions,
            **kwargs,
        )


class NetworkError(EnsembleError):
    """Exception for network-related errors."""

    def __init__(self, message: str, **kwargs):
        super().__init__(
            message,
            category=ErrorCategory.NETWORK,
            severity=ErrorSeverity.MEDIUM,
            recovery_suggestions=[
                "Check your internet connection",
                "Verify the service endpoint is accessible",
                "Try again in a few moments",
            ],
            **kwargs,
        )


class APIError(EnsembleError):
    """Exception for external API errors."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        service: Optional[str] = None,
        **kwargs,
    ):
        self.status_code = status_code
        self.service = service
        super().__init__(
            message,
            category=ErrorCategory.API,
            severity=ErrorSeverity.MEDIUM,
            recovery_suggestions=[
                "External service may be temporarily unavailable",
                "Check service status page",
                "Try again later",
            ],
            **kwargs,
        )


class ConfigurationError(EnsembleError):
    """Exception for configuration errors."""

    def __init__(self, message: str, config_key: Optional[str] = None, **kwargs):
        self.config_key = config_key
        super().__init__(
            message,
            category=ErrorCategory.CONFIGURATION,
            severity=ErrorSeverity.HIGH,
            recovery_suggestions=[
                "Check your configuration file",
                "Verify environment variables are set correctly",
                "Review the documentation for proper configuration",
            ],
            **kwargs,
        )


class ProcessingError(EnsembleError):
    """Exception for processing and business logic errors."""

    def __init__(self, message: str, **kwargs):
        super().__init__(
            message,
            category=ErrorCategory.PROCESSING,
            severity=ErrorSeverity.MEDIUM,
            **kwargs,
        )


class StorageError(EnsembleError):
    """Exception for file and storage operations."""

    def __init__(self, message: str, file_path: Optional[str] = None, **kwargs):
        self.file_path = file_path
        super().__init__(
            message,
            category=ErrorCategory.STORAGE,
            severity=ErrorSeverity.MEDIUM,
            recovery_suggestions=[
                "Check file permissions",
                "Verify disk space availability",
                "Ensure the directory exists",
            ],
            **kwargs,
        )


class SystemError(EnsembleError):
    """Exception for system-level errors."""

    def __init__(self, message: str, **kwargs):
        super().__init__(
            message,
            category=ErrorCategory.SYSTEM,
            severity=ErrorSeverity.CRITICAL,
            recovery_suggestions=[
                "Contact system administrator",
                "Check system resources",
                "Review system logs",
            ],
            **kwargs,
        )


class ErrorSanitizer:
    """Sanitizes error messages for production use."""

    # Patterns to remove from error messages
    SENSITIVE_PATTERNS = [
        r"sk-[a-zA-Z0-9-]{6,}",  # API keys (OpenAI format)
        r'password["\s]*[:=]["\s]*[^\s"]+',  # Passwords
        r'token["\s]*[:=]["\s]*[^\s"]+',  # Tokens
        r'secret["\s]*[:=]["\s]*[^\s"]+',  # Secrets
        r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b",  # Credit card numbers
        r"\b\d{3}-\d{2}-\d{4}\b",  # SSN
        r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",  # Email addresses (optional)
    ]

    @classmethod
    def sanitize_message(cls, message: str, replacement: str = "[REDACTED]") -> str:
        """
        Sanitize error message by removing sensitive information.

        Args:
            message: Original error message
            replacement: String to replace sensitive data with

        Returns:
            Sanitized error message
        """
        sanitized = message
        for pattern in cls.SENSITIVE_PATTERNS:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
        return sanitized

    @classmethod
    def sanitize_traceback(cls, tb: str) -> str:
        """Sanitize traceback information."""
        return cls.sanitize_message(tb)


class ErrorTracker:
    """Tracks and analyzes errors for monitoring and alerting."""

    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.error_history: deque = deque(maxlen=max_history)
        self.error_counts: Dict[str, int] = defaultdict(int)
        self.category_counts: Dict[ErrorCategory, int] = defaultdict(int)
        self.severity_counts: Dict[ErrorSeverity, int] = defaultdict(int)
        self.logger = logging.getLogger(__name__)

    def record_error(self, error: EnsembleError) -> None:
        """Record an error for tracking and analysis."""
        error_data = error.to_dict()
        self.error_history.append(error_data)

        # Update counters
        self.error_counts[error.__class__.__name__] += 1
        self.category_counts[error.category] += 1
        self.severity_counts[error.severity] += 1

        # Log the error
        self._log_error(error)

    def _log_error(self, error: EnsembleError) -> None:
        """Log error with appropriate level and context."""
        log_level = {
            ErrorSeverity.LOW: logging.INFO,
            ErrorSeverity.MEDIUM: logging.WARNING,
            ErrorSeverity.HIGH: logging.ERROR,
            ErrorSeverity.CRITICAL: logging.CRITICAL,
        }.get(error.severity, logging.ERROR)

        sanitized_message = ErrorSanitizer.sanitize_message(error.message)

        extra_data = {
            "error_type": error.__class__.__name__,
            "error_category": error.category.value,
            "error_severity": error.severity.value,
            "error_context": error.context.__dict__,
            "recovery_suggestions": error.recovery_suggestions,
        }

        self.logger.log(log_level, sanitized_message, extra=extra_data)

    def get_error_stats(self, time_window_minutes: int = 60) -> Dict[str, Any]:
        """Get error statistics for the specified time window."""
        current_time = time.time()
        window_start = current_time - (time_window_minutes * 60)

        recent_errors = [
            error for error in self.error_history if error["timestamp"] >= window_start
        ]

        error_types: defaultdict[str, int] = defaultdict(int)
        categories: defaultdict[str, int] = defaultdict(int)
        severities: defaultdict[str, int] = defaultdict(int)
        top_operations: defaultdict[str, int] = defaultdict(int)
        top_components: defaultdict[str, int] = defaultdict(int)

        stats = {
            "total_errors": len(recent_errors),
            "error_rate_per_minute": len(recent_errors) / max(time_window_minutes, 1),
            "error_types": error_types,
            "categories": categories,
            "severities": severities,
            "top_operations": top_operations,
            "top_components": top_components,
        }

        for error in recent_errors:
            error_types[error["type"]] += 1
            categories[error["category"]] += 1
            severities[error["severity"]] += 1
            top_operations[error["context"]["operation"]] += 1
            top_components[error["context"]["component"]] += 1

        return dict(stats)

    def check_alert_conditions(self) -> List[Dict[str, Any]]:
        """Check for conditions that should trigger alerts."""
        alerts = []
        stats = self.get_error_stats(time_window_minutes=5)  # 5-minute window

        # High error rate
        if stats["error_rate_per_minute"] > 10:
            alerts.append(
                {
                    "type": "high_error_rate",
                    "message": f"High error rate: {stats['error_rate_per_minute']:.1f} errors/minute",
                    "severity": "high",
                    "details": stats,
                }
            )

        # Critical errors
        if stats["severities"].get("critical", 0) > 0:
            alerts.append(
                {
                    "type": "critical_errors",
                    "message": f"Critical errors detected: {stats['severities']['critical']}",
                    "severity": "critical",
                    "details": stats,
                }
            )

        # Authentication failures
        if stats["categories"].get("authentication", 0) > 5:
            alerts.append(
                {
                    "type": "auth_failures",
                    "message": f"Multiple authentication failures: {stats['categories']['authentication']}",
                    "severity": "high",
                    "details": stats,
                }
            )

        return alerts


# Global error tracker instance
_error_tracker = ErrorTracker()


def get_error_tracker() -> ErrorTracker:
    """Get the global error tracker instance."""
    return _error_tracker


def handle_error(
    error: Exception, context: Optional[ErrorContext] = None, reraise: bool = True
) -> EnsembleError:
    """
    Handle and convert exceptions to EnsembleError instances.

    Args:
        error: The original exception
        context: Additional context information
        reraise: Whether to reraise the converted exception

    Returns:
        Converted EnsembleError instance

    Raises:
        EnsembleError: If reraise is True
    """
    # If it's already an EnsembleError, just track and possibly reraise
    if isinstance(error, EnsembleError):
        get_error_tracker().record_error(error)
        if reraise:
            raise error
        return error

    # Convert standard exceptions to EnsembleError
    ensemble_error = _convert_exception(error, context)
    get_error_tracker().record_error(ensemble_error)

    if reraise:
        raise ensemble_error from error

    return ensemble_error


def _convert_exception(error: Exception, context: Optional[ErrorContext]) -> EnsembleError:
    """Convert standard exceptions to appropriate EnsembleError types."""
    error_message = str(error)
    error_type = type(error).__name__

    # Map common exceptions to appropriate error types
    if isinstance(error, (ConnectionError, TimeoutError)):
        return NetworkError(f"Network error: {error_message}", context=context)
    elif isinstance(error, PermissionError):
        return StorageError(f"Permission denied: {error_message}", context=context)
    elif isinstance(error, FileNotFoundError):
        return StorageError(f"File not found: {error_message}", context=context)
    elif isinstance(error, ValueError):
        return ValidationError(f"Validation error: {error_message}", context=context)
    elif "rate limit" in error_message.lower():
        return RateLimitError(error_message, context=context)
    elif "unauthorized" in error_message.lower() or "authentication" in error_message.lower():
        return AuthenticationError(error_message, context=context)
    else:
        return ProcessingError(f"{error_type}: {error_message}", context=context)


def error_handler(operation: str, component: str, **context_kwargs):
    """
    Decorator for automatic error handling and context injection.

    Args:
        operation: Name of the operation being performed
        component: Name of the component where the operation occurs
        **context_kwargs: Additional context data
    """

    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            context = ErrorContext(operation=operation, component=component, **context_kwargs)

            try:
                return func(*args, **kwargs)
            except Exception as e:
                handle_error(e, context=context, reraise=True)

        return wrapper

    return decorator


# Recovery strategies
class RecoveryStrategy:
    """Base class for error recovery strategies."""

    def can_recover(self, error: EnsembleError) -> bool:
        """Check if this strategy can recover from the given error."""
        raise NotImplementedError

    def recover(self, error: EnsembleError, *args, **kwargs) -> Any:
        """Attempt to recover from the error."""
        raise NotImplementedError


class RetryStrategy(RecoveryStrategy):
    """Recovery strategy that retries the operation."""

    def __init__(self, max_retries: int = 3, delay: float = 1.0, backoff_multiplier: float = 2.0):
        self.max_retries = max_retries
        self.delay = delay
        self.backoff_multiplier = backoff_multiplier

    def can_recover(self, error: EnsembleError) -> bool:
        """Check if error is retryable."""
        retryable_categories = {
            ErrorCategory.NETWORK,
            ErrorCategory.API,
            ErrorCategory.RATE_LIMIT,
        }
        return error.category in retryable_categories

    def recover(self, error: EnsembleError, operation_func: Callable, *args, **kwargs) -> Any:
        """Retry the operation with exponential backoff."""
        current_delay = self.delay

        for attempt in range(self.max_retries):
            try:
                time.sleep(current_delay)
                return operation_func(*args, **kwargs)
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise e
                current_delay *= self.backoff_multiplier

        raise error


# Example usage and testing
if __name__ == "__main__":
    # Test error handling
    logger = logging.getLogger(__name__)
    logging.basicConfig(level=logging.INFO)

    # Test basic error creation
    context = ErrorContext(operation="test_operation", component="test_component")

    try:
        raise ValidationError("Test validation error", context=context)
    except EnsembleError as e:
        print(f"Caught error: {e.user_message}")
        print(f"Error details: {json.dumps(e.to_dict(), indent=2, default=str)}")

    # Test error tracking
    tracker = get_error_tracker()
    stats = tracker.get_error_stats()
    print(f"Error stats: {json.dumps(stats, indent=2, default=str)}")

    # Test error sanitization
    sensitive_message = "Error with API key sk-or-1234567890abcdef in request"
    sanitized = ErrorSanitizer.sanitize_message(sensitive_message)
    print(f"Original: {sensitive_message}")
    print(f"Sanitized: {sanitized}")
