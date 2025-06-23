"""
Comprehensive logging configuration for Ensemble AI application.

This module provides environment-based logging configuration with support for:
- JSON structured logging for production
- Human-readable logging for development
- Request correlation IDs
- Log rotation and retention
- Performance monitoring integration
"""

import logging
import logging.handlers
import os
import sys
import json
import time
import uuid
from typing import Dict, Any, Optional
from pathlib import Path
import threading

# Thread-local storage for request context
_request_context = threading.local()


class CorrelationIDFilter(logging.Filter):
    """Filter to add correlation ID to log records."""

    def filter(self, record):
        """Add correlation ID to the log record."""
        record.correlation_id = getattr(
            _request_context, "correlation_id", "no-correlation-id"
        )
        record.request_id = getattr(_request_context, "request_id", "no-request-id")
        return True


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.hostname = os.uname().nodename if hasattr(os, "uname") else "unknown"

    def format(self, record):
        """Format the log record as JSON."""
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "process_id": record.process,
            "thread_id": record.thread,
            "thread_name": record.threadName,
            "hostname": self.hostname,
            "correlation_id": getattr(record, "correlation_id", "no-correlation-id"),
            "request_id": getattr(record, "request_id", "no-request-id"),
        }

        # Add exception information if present
        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
                "traceback": self.formatException(record.exc_info),
            }

        # Add extra fields from the record
        extra_fields = {
            k: v
            for k, v in record.__dict__.items()
            if k
            not in [
                "name",
                "msg",
                "args",
                "levelname",
                "levelno",
                "pathname",
                "filename",
                "module",
                "lineno",
                "funcName",
                "created",
                "msecs",
                "relativeCreated",
                "thread",
                "threadName",
                "processName",
                "process",
                "exc_info",
                "exc_text",
                "stack_info",
                "correlation_id",
                "request_id",
            ]
        }

        if extra_fields:
            log_entry["extra"] = extra_fields

        return json.dumps(log_entry, default=str)


class HumanReadableFormatter(logging.Formatter):
    """Human-readable formatter for development."""

    def __init__(self):
        super().__init__(
            fmt="%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - [%(correlation_id)s] - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )


class EnsembleLogger:
    """Main logging configuration class for Ensemble."""

    def __init__(self):
        self.logger = None
        self.handlers = []
        self._setup_complete = False

    def setup_logging(
        self,
        level: Optional[str] = None,
        log_format: Optional[str] = None,
        log_file: Optional[str] = None,
        enable_rotation: bool = True,
        max_file_size: int = 10 * 1024 * 1024,  # 10MB
        backup_count: int = 5,
    ) -> None:
        """
        Set up comprehensive logging configuration.

        Args:
            level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
            log_format: Format type ('json' or 'human')
            log_file: Path to log file (None for console only)
            enable_rotation: Whether to enable log rotation
            max_file_size: Maximum file size before rotation
            backup_count: Number of backup files to keep
        """
        if self._setup_complete:
            return

        # Determine configuration from environment
        env = os.getenv("ENVIRONMENT", "development").lower()
        level = level or os.getenv(
            "LOG_LEVEL", "INFO" if env == "production" else "DEBUG"
        )
        log_format = log_format or os.getenv(
            "LOG_FORMAT", "json" if env == "production" else "human"
        )
        log_file = log_file or os.getenv("LOG_FILE")

        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(getattr(logging, level.upper()))

        # Clear existing handlers
        for handler in root_logger.handlers[:]:
            root_logger.removeHandler(handler)

        # Create correlation ID filter
        correlation_filter = CorrelationIDFilter()

        # Set up formatter
        if log_format.lower() == "json":
            formatter = JSONFormatter()
        else:
            formatter = HumanReadableFormatter()

        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(getattr(logging, level.upper()))
        console_handler.setFormatter(formatter)
        console_handler.addFilter(correlation_filter)
        root_logger.addHandler(console_handler)
        self.handlers.append(console_handler)

        # File handler (if specified)
        if log_file:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)

            if enable_rotation:
                file_handler = logging.handlers.RotatingFileHandler(
                    log_file,
                    maxBytes=max_file_size,
                    backupCount=backup_count,
                    encoding="utf-8",
                )
            else:
                file_handler = logging.FileHandler(log_file, encoding="utf-8")

            file_handler.setLevel(getattr(logging, level.upper()))
            file_handler.setFormatter(formatter)
            file_handler.addFilter(correlation_filter)
            root_logger.addHandler(file_handler)
            self.handlers.append(file_handler)

        # Configure specific loggers
        self._configure_library_loggers()

        self._setup_complete = True
        self.logger = logging.getLogger(__name__)
        self.logger.info(
            f"Logging configured: level={level}, format={log_format}, file={log_file}"
        )

    def _configure_library_loggers(self) -> None:
        """Configure logging levels for third-party libraries."""
        # Reduce noise from third-party libraries
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("requests").setLevel(logging.WARNING)
        logging.getLogger("openai").setLevel(logging.INFO)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("asyncio").setLevel(logging.WARNING)

    def set_correlation_id(self, correlation_id: str = None) -> str:
        """Set correlation ID for request tracking."""
        if correlation_id is None:
            correlation_id = str(uuid.uuid4())
        _request_context.correlation_id = correlation_id
        return correlation_id

    def set_request_id(self, request_id: str = None) -> str:
        """Set request ID for detailed request tracking."""
        if request_id is None:
            request_id = str(uuid.uuid4())
        _request_context.request_id = request_id
        return request_id

    def clear_context(self) -> None:
        """Clear request context."""
        _request_context.correlation_id = None
        _request_context.request_id = None

    def get_context(self) -> Dict[str, str]:
        """Get current request context."""
        return {
            "correlation_id": getattr(_request_context, "correlation_id", None),
            "request_id": getattr(_request_context, "request_id", None),
        }


# Global logger instance
_ensemble_logger = EnsembleLogger()


def setup_logging(
    level: str = None,
    log_format: str = None,
    log_file: str = None,
    enable_rotation: bool = True,
    max_file_size: int = 10 * 1024 * 1024,
    backup_count: int = 5,
) -> None:
    """
    Set up logging configuration for the Ensemble application.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: Format type ('json' or 'human')
        log_file: Path to log file (None for console only)
        enable_rotation: Whether to enable log rotation
        max_file_size: Maximum file size before rotation
        backup_count: Number of backup files to keep
    """
    _ensemble_logger.setup_logging(
        level, log_format, log_file, enable_rotation, max_file_size, backup_count
    )


def get_logger(name: str = None) -> logging.Logger:
    """
    Get a logger instance with proper configuration.

    Args:
        name: Logger name (defaults to caller's module)

    Returns:
        Configured logger instance
    """
    if not _ensemble_logger._setup_complete:
        setup_logging()

    return logging.getLogger(name)


def set_correlation_id(correlation_id: str = None) -> str:
    """
    Set correlation ID for request tracking.

    Args:
        correlation_id: Correlation ID (generates UUID if None)

    Returns:
        The correlation ID that was set
    """
    return _ensemble_logger.set_correlation_id(correlation_id)


def set_request_id(request_id: str = None) -> str:
    """
    Set request ID for detailed request tracking.

    Args:
        request_id: Request ID (generates UUID if None)

    Returns:
        The request ID that was set
    """
    return _ensemble_logger.set_request_id(request_id)


def clear_context() -> None:
    """Clear request context."""
    _ensemble_logger.clear_context()


def get_context() -> Dict[str, str]:
    """Get current request context."""
    return _ensemble_logger.get_context()


class LoggingContext:
    """Context manager for request logging."""

    def __init__(self, correlation_id: str = None, request_id: str = None):
        self.correlation_id = correlation_id
        self.request_id = request_id
        self.old_context = None

    def __enter__(self):
        self.old_context = get_context()
        if self.correlation_id:
            set_correlation_id(self.correlation_id)
        if self.request_id:
            set_request_id(self.request_id)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Restore old context
        if self.old_context["correlation_id"]:
            set_correlation_id(self.old_context["correlation_id"])
        if self.old_context["request_id"]:
            set_request_id(self.old_context["request_id"])
        else:
            clear_context()


# Performance logging helper
class PerformanceLogger:
    """Helper for performance logging."""

    def __init__(self, logger: logging.Logger, operation: str):
        self.logger = logger
        self.operation = operation
        self.start_time = None

    def __enter__(self):
        self.start_time = time.time()
        self.logger.debug(f"Starting operation: {self.operation}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        if exc_type is None:
            self.logger.info(
                f"Operation completed: {self.operation}",
                extra={
                    "operation": self.operation,
                    "duration_seconds": duration,
                    "status": "success",
                },
            )
        else:
            self.logger.error(
                f"Operation failed: {self.operation}",
                extra={
                    "operation": self.operation,
                    "duration_seconds": duration,
                    "status": "failure",
                    "error_type": exc_type.__name__ if exc_type else None,
                    "error_message": str(exc_val) if exc_val else None,
                },
            )


def log_performance(operation: str) -> PerformanceLogger:
    """
    Create a performance logging context.

    Args:
        operation: Name of the operation being performed

    Returns:
        Performance logging context manager
    """
    logger = get_logger()
    return PerformanceLogger(logger, operation)


# Example usage and testing
if __name__ == "__main__":
    # Test logging configuration
    setup_logging(level="DEBUG", log_format="human")

    logger = get_logger(__name__)

    # Test basic logging
    logger.info("Testing logging configuration")

    # Test with correlation ID
    with LoggingContext(correlation_id="test-correlation-123"):
        logger.info("This message has a correlation ID")

        # Test performance logging
        with log_performance("test_operation"):
            time.sleep(0.1)  # Simulate work
            logger.debug("Doing some work...")

    logger.info("Logging test completed")
