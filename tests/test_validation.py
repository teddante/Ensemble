"""
Tests for the validation module.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
from unittest.mock import patch

try:
    from pydantic import ValidationError
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    class ValidationError(Exception):
        pass

from validation import (
    sanitize_prompt, 
    validate_file_path, 
    validate_models_list,
    EnsembleConfig,
    PromptValidationError,
    ModelConfigValidationError,
    PYDANTIC_AVAILABLE
)


class TestPromptSanitization(unittest.TestCase):
    """Test prompt sanitization functionality."""
    
    def test_sanitize_normal_prompt(self):
        """Test sanitization of normal prompts."""
        prompt = "What is the capital of France?"
        result = sanitize_prompt(prompt)
        self.assertEqual(result, prompt)
    
    def test_sanitize_prompt_with_html(self):
        """Test removal of HTML tags."""
        prompt = "What is <script>alert('test')</script> the capital of France?"
        result = sanitize_prompt(prompt)
        self.assertNotIn("<script>", result)
        self.assertNotIn("alert", result)
    
    def test_sanitize_prompt_with_excessive_whitespace(self):
        """Test normalization of whitespace."""
        prompt = "What    is     the\n\n\ncapital   of   France?"
        result = sanitize_prompt(prompt)
        expected = "What is the capital of France?"
        self.assertEqual(result, expected)
    
    def test_sanitize_empty_prompt(self):
        """Test handling of empty prompts."""
        with self.assertRaises(PromptValidationError):
            sanitize_prompt("")
    
    def test_sanitize_none_prompt(self):
        """Test handling of None prompts."""
        with self.assertRaises(PromptValidationError):
            sanitize_prompt(None)
    
    def test_sanitize_non_string_prompt(self):
        """Test handling of non-string prompts."""
        with self.assertRaises(PromptValidationError):
            sanitize_prompt(123)
    
    def test_sanitize_long_prompt(self):
        """Test truncation of very long prompts."""
        long_prompt = "A" * 15000  # Much longer than default max
        result = sanitize_prompt(long_prompt, max_length=100)
        self.assertLess(len(result), 105)  # Should be truncated with ellipsis
        self.assertTrue(result.endswith("..."))
    
    def test_sanitize_prompt_with_dangerous_content(self):
        """Test detection of potentially dangerous content."""
        dangerous_prompts = [
            "javascript:alert('test')",
            "vbscript:msgbox('test')",
            "<script>alert('test')</script>",
            "<!-- comment -->",
            "data:text/html,<script>alert('test')</script>"
        ]
        
        for prompt in dangerous_prompts:
            with self.assertRaises(PromptValidationError):
                sanitize_prompt(prompt)
    
    def test_sanitize_prompt_too_short_after_cleaning(self):
        """Test handling of prompts that become too short after sanitization."""
        prompt = "<script></script>"  # Becomes empty after cleaning
        with self.assertRaises(PromptValidationError):
            sanitize_prompt(prompt)


class TestFilePathValidation(unittest.TestCase):
    """Test file path validation functionality."""
    
    def test_validate_normal_path(self):
        """Test validation of normal file paths."""
        path = "output/test.txt"
        result = validate_file_path(path)
        self.assertEqual(result, path)
    
    def test_validate_path_with_directory_traversal(self):
        """Test handling of directory traversal attempts."""
        path = "../../../etc/passwd"
        result = validate_file_path(path)
        self.assertNotIn("..", result)
    
    def test_validate_absolute_path_not_allowed(self):
        """Test rejection of absolute paths outside allowed directories."""
        path = "/etc/passwd"
        with self.assertRaises(ValueError):
            validate_file_path(path)
    
    def test_validate_absolute_path_in_tmp(self):
        """Test acceptance of absolute paths in /tmp/."""
        path = "/tmp/test.txt"
        result = validate_file_path(path)
        self.assertEqual(result, path)
    
    def test_validate_empty_path(self):
        """Test handling of empty paths."""
        with self.assertRaises(ValueError):
            validate_file_path("")
    
    def test_validate_none_path(self):
        """Test handling of None paths."""
        with self.assertRaises(ValueError):
            validate_file_path(None)


class TestModelsListValidation(unittest.TestCase):
    """Test models list validation functionality."""
    
    def test_validate_normal_models(self):
        """Test validation of normal model lists."""
        models = ["openai/gpt-4", "anthropic/claude-3"]
        result = validate_models_list(models)
        self.assertEqual(result, models)
    
    def test_validate_empty_models_list(self):
        """Test handling of empty models list."""
        with self.assertRaises(ModelConfigValidationError):
            validate_models_list([])
    
    def test_validate_none_models_list(self):
        """Test handling of None models list."""
        with self.assertRaises(ModelConfigValidationError):
            validate_models_list(None)
    
    def test_validate_models_with_empty_strings(self):
        """Test filtering of empty string models."""
        models = ["openai/gpt-4", "", "anthropic/claude-3", "   "]
        result = validate_models_list(models)
        expected = ["openai/gpt-4", "anthropic/claude-3"]
        self.assertEqual(result, expected)
    
    def test_validate_models_with_non_strings(self):
        """Test filtering of non-string models."""
        models = ["openai/gpt-4", 123, "anthropic/claude-3", None]
        result = validate_models_list(models)
        expected = ["openai/gpt-4", "anthropic/claude-3"]
        self.assertEqual(result, expected)
    
    def test_validate_models_too_long_name(self):
        """Test rejection of overly long model names."""
        long_name = "a" * 101  # Longer than 100 chars
        models = [long_name]
        with self.assertRaises(ModelConfigValidationError):
            validate_models_list(models)
    
    def test_validate_models_invalid_characters(self):
        """Test rejection of model names with invalid characters."""
        models = ["openai/gpt-4!", "anthropic@claude-3"]
        with self.assertRaises(ModelConfigValidationError):
            validate_models_list(models)
    
    def test_validate_many_models_warning(self):
        """Test warning for large number of models."""
        models = [f"provider/model-{i}" for i in range(15)]
        with patch('validation.logger') as mock_logger:
            result = validate_models_list(models)
            self.assertEqual(len(result), 15)
            mock_logger.warning.assert_called()


class TestEnsembleConfig(unittest.TestCase):
    """Test the Pydantic EnsembleConfig model."""
    
    def setUp(self):
        """Skip tests if Pydantic is not available."""
        if not PYDANTIC_AVAILABLE:
            self.skipTest("Pydantic not available - skipping advanced validation tests")
    
    def test_valid_config(self):
        """Test validation of valid configuration."""
        config_data = {
            "openrouter_api_key": "sk-test-key-123",
            "models": ["openai/gpt-4", "anthropic/claude-3"],
            "refinement_model_name": "openai/gpt-4",
            "prompt": "Test prompt"
        }
        config = EnsembleConfig(**config_data)
        self.assertEqual(config.openrouter_api_key, "sk-test-key-123")
        self.assertEqual(len(config.models), 2)
    
    def test_invalid_api_key(self):
        """Test rejection of invalid API keys."""
        invalid_keys = ["", "   ", "replace_me", "default_key_replace_me"]
        
        for key in invalid_keys:
            with self.assertRaises(ValidationError):
                EnsembleConfig(
                    openrouter_api_key=key,
                    models=["openai/gpt-4"],
                    refinement_model_name="openai/gpt-4"
                )
    
    def test_empty_models_list(self):
        """Test rejection of empty models list."""
        with self.assertRaises(ValidationError):
            EnsembleConfig(
                openrouter_api_key="sk-test-key",
                models=[],
                refinement_model_name="openai/gpt-4"
            )
    
    def test_empty_refinement_model(self):
        """Test rejection of empty refinement model."""
        with self.assertRaises(ValidationError):
            EnsembleConfig(
                openrouter_api_key="sk-test-key",
                models=["openai/gpt-4"],
                refinement_model_name=""
            )
    
    def test_config_with_optional_prompt(self):
        """Test configuration with optional prompt."""
        config = EnsembleConfig(
            openrouter_api_key="sk-test-key",
            models=["openai/gpt-4"],
            refinement_model_name="openai/gpt-4"
        )
        self.assertIsNone(config.prompt)
    
    def test_model_name_format_warning(self):
        """Test warning for incorrectly formatted model names."""
        with patch('validation.logger') as mock_logger:
            config = EnsembleConfig(
                openrouter_api_key="sk-test-key",
                models=["invalid-model-format"],
                refinement_model_name="also-invalid"
            )
            # Should create config but log warnings
            self.assertEqual(len(config.models), 1)
            self.assertEqual(mock_logger.warning.call_count, 2)


class TestFallbackValidation(unittest.TestCase):
    """Test fallback validation when Pydantic is not available."""
    
    def test_basic_config_creation(self):
        """Test that EnsembleConfig can be created even without Pydantic."""
        config_data = {
            "openrouter_api_key": "sk-test-key-123",
            "models": ["openai/gpt-4", "anthropic/claude-3"],
            "refinement_model_name": "openai/gpt-4",
            "prompt": "Test prompt"
        }
        config = EnsembleConfig(**config_data)
        self.assertEqual(config.openrouter_api_key, "sk-test-key-123")
        self.assertEqual(config.models, ["openai/gpt-4", "anthropic/claude-3"])
    
    def test_config_dict_method(self):
        """Test that config.dict() works."""
        config = EnsembleConfig(
            openrouter_api_key="test-key",
            models=["model1"],
            refinement_model_name="model1"
        )
        config_dict = config.dict()
        self.assertIn("openrouter_api_key", config_dict)
        self.assertEqual(config_dict["openrouter_api_key"], "test-key")


if __name__ == '__main__':
    unittest.main()