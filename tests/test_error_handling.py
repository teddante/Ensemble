"""
Tests for the error handling module.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import time
import unittest
from unittest.mock import MagicMock, patch

from error_handling import (APIError, AuthenticationError, ConfigurationError,
                            EnsembleError, ErrorCategory, ErrorContext,
                            ErrorSanitizer, ErrorSeverity, ErrorTracker,
                            NetworkError, ProcessingError, RateLimitError,
                            StorageError, SystemError, ValidationError,
                            error_handler, handle_error)


class TestErrorClasses(unittest.TestCase):
    """Test custom error classes."""

    def test_ensemble_error_basic(self):
        """Test basic EnsembleError functionality."""
        error = EnsembleError("Test error")
        self.assertEqual(error.message, "Test error")
        self.assertEqual(error.category, ErrorCategory.UNKNOWN)
        self.assertEqual(error.severity, ErrorSeverity.MEDIUM)
        self.assertIsNotNone(error.user_message)

    def test_ensemble_error_with_context(self):
        """Test EnsembleError with context."""
        context = ErrorContext(operation="test_op", component="test_component")
        error = EnsembleError("Test error", context=context)
        self.assertEqual(error.context.operation, "test_op")
        self.assertEqual(error.context.component, "test_component")

    def test_validation_error(self):
        """Test ValidationError specifics."""
        error = ValidationError("Invalid input", field="username")
        self.assertEqual(error.category, ErrorCategory.VALIDATION)
        self.assertEqual(error.severity, ErrorSeverity.LOW)
        self.assertEqual(error.field, "username")

    def test_authentication_error(self):
        """Test AuthenticationError specifics."""
        error = AuthenticationError("Invalid API key")
        self.assertEqual(error.category, ErrorCategory.AUTHENTICATION)
        self.assertEqual(error.severity, ErrorSeverity.HIGH)
        self.assertIn("API key", error.recovery_suggestions[0])

    def test_rate_limit_error(self):
        """Test RateLimitError specifics."""
        error = RateLimitError("Rate limit exceeded", retry_after=60)
        self.assertEqual(error.category, ErrorCategory.RATE_LIMIT)
        self.assertEqual(error.retry_after, 60)
        self.assertIn("60 seconds", error.recovery_suggestions[1])

    def test_network_error(self):
        """Test NetworkError specifics."""
        error = NetworkError("Connection timeout")
        self.assertEqual(error.category, ErrorCategory.NETWORK)
        self.assertIn("connection", error.recovery_suggestions[0].lower())

    def test_api_error(self):
        """Test APIError specifics."""
        error = APIError("Service unavailable", status_code=503, service="openrouter")
        self.assertEqual(error.category, ErrorCategory.API)
        self.assertEqual(error.status_code, 503)
        self.assertEqual(error.service, "openrouter")

    def test_configuration_error(self):
        """Test ConfigurationError specifics."""
        error = ConfigurationError("Invalid config", config_key="MODELS")
        self.assertEqual(error.category, ErrorCategory.CONFIGURATION)
        self.assertEqual(error.config_key, "MODELS")

    def test_processing_error(self):
        """Test ProcessingError specifics."""
        error = ProcessingError("Processing failed")
        self.assertEqual(error.category, ErrorCategory.PROCESSING)

    def test_storage_error(self):
        """Test StorageError specifics."""
        error = StorageError("File not found", file_path="/tmp/test.txt")
        self.assertEqual(error.category, ErrorCategory.STORAGE)
        self.assertEqual(error.file_path, "/tmp/test.txt")

    def test_system_error(self):
        """Test SystemError specifics."""
        error = SystemError("System failure")
        self.assertEqual(error.category, ErrorCategory.SYSTEM)
        self.assertEqual(error.severity, ErrorSeverity.CRITICAL)

    def test_error_to_dict(self):
        """Test error serialization to dictionary."""
        context = ErrorContext(operation="test", component="test")
        error = EnsembleError("Test error", context=context)
        error_dict = error.to_dict()

        self.assertIn("type", error_dict)
        self.assertIn("message", error_dict)
        self.assertIn("category", error_dict)
        self.assertIn("severity", error_dict)
        self.assertIn("context", error_dict)
        self.assertEqual(error_dict["message"], "Test error")


class TestErrorSanitizer(unittest.TestCase):
    """Test error message sanitization."""

    def test_sanitize_api_key(self):
        """Test API key sanitization."""
        message = "Error with API key sk-or-1234567890abcdef"
        sanitized = ErrorSanitizer.sanitize_message(message)
        self.assertNotIn("sk-or-1234567890abcdef", sanitized)
        self.assertIn("[REDACTED]", sanitized)

    def test_sanitize_password(self):
        """Test password sanitization."""
        message = 'Error: password="secret123" failed'
        sanitized = ErrorSanitizer.sanitize_message(message)
        self.assertNotIn("secret123", sanitized)
        self.assertIn("[REDACTED]", sanitized)

    def test_sanitize_email(self):
        """Test email sanitization."""
        message = "Error for user test@example.com"
        sanitized = ErrorSanitizer.sanitize_message(message)
        self.assertNotIn("test@example.com", sanitized)
        self.assertIn("[REDACTED]", sanitized)

    def test_sanitize_custom_replacement(self):
        """Test custom replacement text."""
        message = "Error with API key sk-test123"
        sanitized = ErrorSanitizer.sanitize_message(message, replacement="***")
        self.assertIn("***", sanitized)
        self.assertNotIn("sk-test123", sanitized)

    def test_sanitize_clean_message(self):
        """Test that clean messages pass through unchanged."""
        message = "Simple error message"
        sanitized = ErrorSanitizer.sanitize_message(message)
        self.assertEqual(message, sanitized)


class TestErrorTracker(unittest.TestCase):
    """Test error tracking and analytics."""

    def setUp(self):
        """Set up test fixtures."""
        self.tracker = ErrorTracker(max_history=100)

    def test_record_error(self):
        """Test error recording."""
        error = ValidationError("Test validation error")
        self.tracker.record_error(error)

        self.assertEqual(len(self.tracker.error_history), 1)
        self.assertEqual(self.tracker.error_counts["ValidationError"], 1)
        self.assertEqual(self.tracker.category_counts[ErrorCategory.VALIDATION], 1)
        self.assertEqual(self.tracker.severity_counts[ErrorSeverity.LOW], 1)

    def test_multiple_errors(self):
        """Test recording multiple errors."""
        errors = [
            ValidationError("Error 1"),
            AuthenticationError("Error 2"),
            ValidationError("Error 3"),
        ]

        for error in errors:
            self.tracker.record_error(error)

        self.assertEqual(len(self.tracker.error_history), 3)
        self.assertEqual(self.tracker.error_counts["ValidationError"], 2)
        self.assertEqual(self.tracker.error_counts["AuthenticationError"], 1)

    def test_error_stats(self):
        """Test error statistics generation."""
        # Record some errors
        self.tracker.record_error(ValidationError("Error 1"))
        self.tracker.record_error(AuthenticationError("Error 2"))

        stats = self.tracker.get_error_stats(time_window_minutes=60)

        self.assertEqual(stats["total_errors"], 2)
        self.assertGreater(stats["error_rate_per_minute"], 0)
        self.assertIn("ValidationError", stats["error_types"])
        self.assertIn("AuthenticationError", stats["error_types"])

    def test_alert_conditions(self):
        """Test alert condition checking."""
        # Create conditions for alerts
        for _ in range(
            55
        ):  # High error rate (55 errors in 5 minutes = 11 errors/minute > 10)
            self.tracker.record_error(ValidationError("Error"))

        alerts = self.tracker.check_alert_conditions()

        # Should trigger high error rate alert
        self.assertGreater(len(alerts), 0)
        self.assertTrue(any(alert["type"] == "high_error_rate" for alert in alerts))

    def test_critical_error_alert(self):
        """Test critical error alerting."""
        self.tracker.record_error(SystemError("Critical failure"))

        alerts = self.tracker.check_alert_conditions()

        # Should trigger critical error alert
        self.assertTrue(any(alert["type"] == "critical_errors" for alert in alerts))


class TestErrorHandling(unittest.TestCase):
    """Test error handling functions."""

    def test_handle_error_ensemble_error(self):
        """Test handling of EnsembleError."""
        error = ValidationError("Test error")

        with self.assertRaises(ValidationError):
            handle_error(error, reraise=True)

    def test_handle_error_standard_exception(self):
        """Test conversion of standard exceptions."""
        error = ValueError("Invalid value")

        with self.assertRaises(ValidationError):
            handle_error(error, reraise=True)

    def test_handle_error_no_reraise(self):
        """Test error handling without reraising."""
        error = ConnectionError("Network failed")

        result = handle_error(error, reraise=False)

        self.assertIsInstance(result, NetworkError)
        self.assertIn("Network error", result.message)

    def test_handle_error_with_context(self):
        """Test error handling with context."""
        context = ErrorContext(operation="test", component="test")
        error = ValueError("Test error")

        result = handle_error(error, context=context, reraise=False)

        self.assertEqual(result.context.operation, "test")
        self.assertEqual(result.context.component, "test")

    @patch("error_handling.get_error_tracker")
    def test_error_handler_decorator(self, mock_get_tracker):
        """Test error handler decorator."""
        mock_tracker = MagicMock()
        mock_get_tracker.return_value = mock_tracker

        @error_handler("test_operation", "test_component")
        def test_function():
            raise ValueError("Test error")

        with self.assertRaises(ValidationError):
            test_function()

        # Verify error was recorded
        mock_tracker.record_error.assert_called_once()


class TestErrorContext(unittest.TestCase):
    """Test ErrorContext functionality."""

    def test_error_context_creation(self):
        """Test ErrorContext creation."""
        context = ErrorContext(
            operation="test_op",
            component="test_component",
            user_id="user123",
            request_id="req456",
        )

        self.assertEqual(context.operation, "test_op")
        self.assertEqual(context.component, "test_component")
        self.assertEqual(context.user_id, "user123")
        self.assertEqual(context.request_id, "req456")
        self.assertIsInstance(context.timestamp, float)

    def test_error_context_with_extra_data(self):
        """Test ErrorContext with extra data."""
        extra_data = {"model": "test-model", "prompt_length": 100}
        context = ErrorContext(
            operation="test", component="test", extra_data=extra_data
        )

        self.assertEqual(context.extra_data["model"], "test-model")
        self.assertEqual(context.extra_data["prompt_length"], 100)


if __name__ == "__main__":
    unittest.main()
