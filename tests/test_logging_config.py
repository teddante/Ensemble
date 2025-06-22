"""
Tests for the logging configuration module.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
import logging
import tempfile
import json
from unittest.mock import patch, MagicMock
from io import StringIO

from logging_config import (
    setup_logging, get_logger, set_correlation_id, set_request_id,
    clear_context, get_context, LoggingContext, log_performance,
    JSONFormatter, HumanReadableFormatter, CorrelationIDFilter,
    EnsembleLogger
)


class TestLoggingSetup(unittest.TestCase):
    """Test logging setup and configuration."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Clear any existing configuration
        logging.getLogger().handlers.clear()
    
    def test_setup_logging_default(self):
        """Test default logging setup."""
        setup_logging()
        
        logger = get_logger(__name__)
        self.assertIsInstance(logger, logging.Logger)
        
        # Should have at least one handler
        root_logger = logging.getLogger()
        self.assertGreater(len(root_logger.handlers), 0)
    
    def test_setup_logging_with_parameters(self):
        """Test logging setup with custom parameters."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.log') as temp_file:
            temp_file_path = temp_file.name
        
        try:
            setup_logging(
                level='DEBUG',
                log_format='json',
                log_file=temp_file_path
            )
            
            logger = get_logger(__name__)
            logger.info("Test message")
            
            # Check that file was created and has content
            self.assertTrue(os.path.exists(temp_file_path))
            with open(temp_file_path, 'r') as f:
                content = f.read()
                self.assertIn("Test message", content)
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    
    @patch.dict(os.environ, {'LOG_LEVEL': 'WARNING', 'LOG_FORMAT': 'human'})
    def test_environment_configuration(self):
        """Test configuration from environment variables."""
        setup_logging()
        
        root_logger = logging.getLogger()
        self.assertEqual(root_logger.level, logging.WARNING)


class TestCorrelationID(unittest.TestCase):
    """Test correlation ID functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        clear_context()
    
    def test_set_correlation_id(self):
        """Test setting correlation ID."""
        correlation_id = set_correlation_id("test-correlation-123")
        self.assertEqual(correlation_id, "test-correlation-123")
        
        context = get_context()
        self.assertEqual(context['correlation_id'], "test-correlation-123")
    
    def test_auto_generate_correlation_id(self):
        """Test auto-generation of correlation ID."""
        correlation_id = set_correlation_id()
        self.assertIsNotNone(correlation_id)
        self.assertTrue(len(correlation_id) > 0)
        
        context = get_context()
        self.assertEqual(context['correlation_id'], correlation_id)
    
    def test_set_request_id(self):
        """Test setting request ID."""
        request_id = set_request_id("test-request-456")
        self.assertEqual(request_id, "test-request-456")
        
        context = get_context()
        self.assertEqual(context['request_id'], "test-request-456")
    
    def test_clear_context(self):
        """Test clearing context."""
        set_correlation_id("test")
        set_request_id("test")
        
        clear_context()
        
        context = get_context()
        self.assertIsNone(context['correlation_id'])
        self.assertIsNone(context['request_id'])


class TestLoggingContext(unittest.TestCase):
    """Test logging context manager."""
    
    def setUp(self):
        """Set up test fixtures."""
        clear_context()
    
    def test_logging_context_manager(self):
        """Test logging context manager."""
        with LoggingContext(correlation_id="ctx-123", request_id="req-456"):
            context = get_context()
            self.assertEqual(context['correlation_id'], "ctx-123")
            self.assertEqual(context['request_id'], "req-456")
        
        # Context should be cleared after exiting
        context = get_context()
        self.assertIsNone(context['correlation_id'])
        self.assertIsNone(context['request_id'])
    
    def test_nested_logging_context(self):
        """Test nested logging contexts."""
        set_correlation_id("original-123")
        
        with LoggingContext(correlation_id="nested-456"):
            context = get_context()
            self.assertEqual(context['correlation_id'], "nested-456")
        
        # Should restore original context
        context = get_context()
        self.assertEqual(context['correlation_id'], "original-123")


class TestJSONFormatter(unittest.TestCase):
    """Test JSON formatter."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.formatter = JSONFormatter()
    
    def test_json_format_basic(self):
        """Test basic JSON formatting."""
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/path.py",
            lineno=123,
            msg="Test message",
            args=(),
            exc_info=None
        )
        record.correlation_id = "test-123"
        record.request_id = "req-456"
        
        formatted = self.formatter.format(record)
        log_data = json.loads(formatted)
        
        self.assertEqual(log_data['message'], "Test message")
        self.assertEqual(log_data['level'], "INFO")
        self.assertEqual(log_data['correlation_id'], "test-123")
        self.assertEqual(log_data['request_id'], "req-456")
        self.assertIn('timestamp', log_data)
        self.assertIn('logger', log_data)
    
    def test_json_format_with_exception(self):
        """Test JSON formatting with exception."""
        try:
            raise ValueError("Test exception")
        except ValueError:
            exc_info = sys.exc_info()
        
        record = logging.LogRecord(
            name="test.logger",
            level=logging.ERROR,
            pathname="/test/path.py",
            lineno=123,
            msg="Error occurred",
            args=(),
            exc_info=exc_info
        )
        record.correlation_id = "test-123"
        
        formatted = self.formatter.format(record)
        log_data = json.loads(formatted)
        
        self.assertIn('exception', log_data)
        self.assertEqual(log_data['exception']['type'], 'ValueError')
        self.assertEqual(log_data['exception']['message'], 'Test exception')
        self.assertIn('traceback', log_data['exception'])
    
    def test_json_format_with_extra_fields(self):
        """Test JSON formatting with extra fields."""
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/path.py",
            lineno=123,
            msg="Test message",
            args=(),
            exc_info=None
        )
        record.correlation_id = "test-123"
        record.custom_field = "custom_value"
        record.model_name = "test-model"
        
        formatted = self.formatter.format(record)
        log_data = json.loads(formatted)
        
        self.assertIn('extra', log_data)
        self.assertEqual(log_data['extra']['custom_field'], 'custom_value')
        self.assertEqual(log_data['extra']['model_name'], 'test-model')


class TestHumanReadableFormatter(unittest.TestCase):
    """Test human-readable formatter."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.formatter = HumanReadableFormatter()
    
    def test_human_format(self):
        """Test human-readable formatting."""
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/path.py",
            lineno=123,
            msg="Test message",
            args=(),
            exc_info=None
        )
        record.correlation_id = "test-123"
        
        formatted = self.formatter.format(record)
        
        self.assertIn("Test message", formatted)
        self.assertIn("test-123", formatted)
        self.assertIn("INFO", formatted)


class TestCorrelationIDFilter(unittest.TestCase):
    """Test correlation ID filter."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.filter = CorrelationIDFilter()
        clear_context()
    
    def test_filter_adds_correlation_id(self):
        """Test that filter adds correlation ID to records."""
        set_correlation_id("test-filter-123")
        
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/path.py",
            lineno=123,
            msg="Test message",
            args=(),
            exc_info=None
        )
        
        result = self.filter.filter(record)
        
        self.assertTrue(result)
        self.assertEqual(record.correlation_id, "test-filter-123")
    
    def test_filter_default_correlation_id(self):
        """Test filter with no correlation ID set."""
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="/test/path.py",
            lineno=123,
            msg="Test message",
            args=(),
            exc_info=None
        )
        
        result = self.filter.filter(record)
        
        self.assertTrue(result)
        self.assertEqual(record.correlation_id, "no-correlation-id")


class TestPerformanceLogger(unittest.TestCase):
    """Test performance logging."""
    
    def setUp(self):
        """Set up test fixtures."""
        setup_logging()
    
    @patch('time.time')
    def test_log_performance(self, mock_time):
        """Test performance logging context manager."""
        mock_time.side_effect = [1000.0, 1000.5]  # 0.5 second duration
        
        with patch('logging_config.get_logger') as mock_get_logger:
            mock_logger = MagicMock()
            mock_get_logger.return_value = mock_logger
            
            with log_performance("test_operation"):
                pass  # Simulate work
            
            # Check that start and end logs were called
            self.assertEqual(mock_logger.debug.call_count, 1)
            self.assertEqual(mock_logger.info.call_count, 1)
            
            # Check the completion log
            completion_call = mock_logger.info.call_args
            self.assertIn("test_operation", completion_call[0][0])
            self.assertEqual(completion_call[1]['extra']['duration_seconds'], 0.5)
            self.assertEqual(completion_call[1]['extra']['status'], 'success')
    
    @patch('time.time')
    def test_log_performance_with_exception(self, mock_time):
        """Test performance logging with exception."""
        mock_time.side_effect = [1000.0, 1000.3]  # 0.3 second duration
        
        with patch('logging_config.get_logger') as mock_get_logger:
            mock_logger = MagicMock()
            mock_get_logger.return_value = mock_logger
            
            with self.assertRaises(ValueError):
                with log_performance("test_operation"):
                    raise ValueError("Test error")
            
            # Check the error log
            error_call = mock_logger.error.call_args
            self.assertIn("test_operation", error_call[0][0])
            self.assertEqual(error_call[1]['extra']['duration_seconds'], 0.3)
            self.assertEqual(error_call[1]['extra']['status'], 'failure')
            self.assertEqual(error_call[1]['extra']['error_type'], 'ValueError')


class TestEnsembleLogger(unittest.TestCase):
    """Test EnsembleLogger class."""
    
    def setUp(self):
        """Set up test fixtures."""
        # Clear existing handlers
        logging.getLogger().handlers.clear()
    
    def test_ensemble_logger_singleton_behavior(self):
        """Test that get_logger works properly."""
        logger1 = get_logger("test1")
        logger2 = get_logger("test2")
        
        self.assertIsInstance(logger1, logging.Logger)
        self.assertIsInstance(logger2, logging.Logger)
        self.assertNotEqual(logger1.name, logger2.name)


if __name__ == '__main__':
    unittest.main()