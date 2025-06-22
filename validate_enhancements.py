#!/usr/bin/env python3
"""
Validation script for Ensemble AI enhancements.

This script validates that all the enhancement implementations are working correctly.
"""

import sys
import os
import traceback
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

def test_imports():
    """Test that all new modules can be imported."""
    print("🧪 Testing module imports...")
    
    try:
        # Test logging configuration
        from logging_config import setup_logging, get_logger, set_correlation_id
        print("  ✅ logging_config module imported successfully")
        
        # Test error handling
        from error_handling import (
            EnsembleError, ValidationError, AuthenticationError,
            ErrorContext, ErrorTracker, handle_error
        )
        print("  ✅ error_handling module imported successfully")
        
        # Test API documentation
        from api_docs import OpenAPIGenerator, EnsembleRequest, EnsembleResponse
        print("  ✅ api_docs module imported successfully")
        
        # Test existing modules still work
        from config import load_config
        from validation import sanitize_prompt
        from rate_limiter import get_rate_limiter
        from monitoring import get_performance_monitor
        from health_check import run_health_check
        print("  ✅ All existing modules imported successfully")
        
        return True
    except Exception as e:
        print(f"  ❌ Import failed: {e}")
        traceback.print_exc()
        return False

def test_logging_system():
    """Test the enhanced logging system."""
    print("🧪 Testing logging system...")
    
    try:
        from logging_config import setup_logging, get_logger, set_correlation_id
        
        # Setup logging
        setup_logging(level='INFO', log_format='human')
        
        # Get logger and test correlation ID
        logger = get_logger(__name__)
        correlation_id = set_correlation_id("test-validation-123")
        
        logger.info("Test log message with correlation ID")
        print(f"  ✅ Logging system working, correlation ID: {correlation_id}")
        
        return True
    except Exception as e:
        print(f"  ❌ Logging test failed: {e}")
        return False

def test_error_handling():
    """Test the error handling system."""
    print("🧪 Testing error handling system...")
    
    try:
        from error_handling import (
            ValidationError, ErrorContext, ErrorTracker, 
            ErrorSanitizer, handle_error
        )
        
        # Test error creation
        context = ErrorContext(operation="validation_test", component="validator")
        error = ValidationError("Test validation error", context=context)
        
        # Test error serialization
        error_dict = error.to_dict()
        if "message" not in error_dict:
            raise AssertionError("Error dict missing 'message' key")
        if error_dict["category"] != "validation":
            raise AssertionError(f"Expected category 'validation', got '{error_dict['category']}'")
        print(f"    - Error serialization: ✅")
        
        # Test error sanitization
        sensitive_message = "Error with API key sk-test-12345"
        sanitized = ErrorSanitizer.sanitize_message(sensitive_message)
        if "sk-test-12345" in sanitized:
            raise AssertionError("Sensitive data not sanitized")
        if "[REDACTED]" not in sanitized:
            raise AssertionError("Redaction marker not found")
        print(f"    - Message sanitization: ✅")
        
        # Test error tracking
        tracker = ErrorTracker()
        tracker.record_error(error)
        stats = tracker.get_error_stats()
        if stats["total_errors"] != 1:
            raise AssertionError(f"Expected 1 error, got {stats['total_errors']}")
        print(f"    - Error tracking: ✅")
        
        print("  ✅ Error handling system working correctly")
        return True
    except Exception as e:
        print(f"  ❌ Error handling test failed: {e}")
        return False

def test_api_documentation():
    """Test the API documentation system."""
    print("🧪 Testing API documentation system...")
    
    try:
        from api_docs import OpenAPIGenerator, EnsembleRequest, generate_api_documentation
        
        # Test data classes
        request = EnsembleRequest(prompt="Test prompt", models=["model1", "model2"])
        assert request.prompt == "Test prompt"
        assert len(request.models) == 2
        
        # Test OpenAPI generation
        generator = OpenAPIGenerator()
        spec = generator.generate_spec()
        
        assert "openapi" in spec
        assert "paths" in spec
        assert "/ensemble" in spec["paths"]
        assert "/health" in spec["paths"]
        
        # Test JSON export
        json_spec = generator.to_json()
        assert len(json_spec) > 100
        
        print("  ✅ API documentation system working correctly")
        return True
    except Exception as e:
        print(f"  ❌ API documentation test failed: {e}")
        return False

def test_configuration_enhancements():
    """Test configuration enhancements."""
    print("🧪 Testing configuration enhancements...")
    
    try:
        from config import load_config
        
        # Test configuration loading with new timeout settings
        config = load_config()
        
        # Check that new configuration options are present
        assert "REQUEST_TIMEOUT" in config
        assert "RATE_LIMIT_PER_MINUTE" in config
        assert "MAX_RETRIES" in config
        
        # Verify timeout is reasonable
        timeout = config["REQUEST_TIMEOUT"]
        assert isinstance(timeout, int)
        assert 10 <= timeout <= 120  # Reasonable range
        
        print(f"  ✅ Configuration enhanced with timeout: {timeout}s")
        return True
    except Exception as e:
        print(f"  ❌ Configuration test failed: {e}")
        return False

def test_file_structure():
    """Test that all expected files are present."""
    print("🧪 Testing file structure...")
    
    expected_files = [
        # Core files
        "src/ensemble.py",
        "src/config.py",
        "src/validation.py",
        "src/rate_limiter.py",
        "src/monitoring.py",
        "src/health_check.py",
        
        # New enhancement files
        "src/logging_config.py",
        "src/error_handling.py",
        "src/api_docs.py",
        
        # Configuration files
        ".gitignore",
        ".pre-commit-config.yaml",
        ".secrets.baseline",
        ".coveragerc",
        "pytest.ini",
        
        # Documentation
        "README.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "ARCHITECTURE.md",
        "DEPLOYMENT.md",
        
        # CI/CD
        ".github/workflows/ci.yml",
        
        # Tests
        "tests/test_ensemble.py",
        "tests/test_error_handling.py",
        "tests/test_logging_config.py",
        "tests/test_api_docs.py",
        
        # Docker
        "Dockerfile",
        "docker-compose.yml",
        
        # Requirements
        "requirements.txt",
        "requirements-dev.txt",
    ]
    
    missing_files = []
    for file_path in expected_files:
        if not Path(file_path).exists():
            missing_files.append(file_path)
    
    if missing_files:
        print(f"  ❌ Missing files: {missing_files}")
        return False
    else:
        print(f"  ✅ All {len(expected_files)} expected files present")
        return True

def main():
    """Run all validation tests."""
    print("🚀 Ensemble AI Enhancement Validation")
    print("=" * 50)
    
    tests = [
        test_imports,
        test_logging_system,
        test_error_handling,
        test_api_documentation,
        test_configuration_enhancements,
        test_file_structure,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  💥 Test {test.__name__} crashed: {e}")
            failed += 1
        print()
    
    print("=" * 50)
    print(f"📊 Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All enhancement validations passed!")
        print("✨ Repository is ready for production and portfolio use!")
        return 0
    else:
        print("⚠️  Some validations failed. Please review the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())