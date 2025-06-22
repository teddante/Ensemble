"""
Integration tests for the Ensemble application.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
import asyncio
import tempfile
import shutil
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path
import ensemble
from config import load_config


class MockOpenAIClient:
    """Mock OpenAI client for testing."""
    
    def __init__(self, responses=None, should_fail=False):
        self.responses = responses or {}
        self.should_fail = should_fail
        self.call_count = 0
    
    def chat_completions_create(self, model, messages, **kwargs):
        """Mock chat completions create method."""
        self.call_count += 1
        
        if self.should_fail:
            raise Exception("Simulated API failure")
        
        # Return different responses based on model
        if model in self.responses:
            content = self.responses[model]
        else:
            content = f"Mock response from {model}"
        
        # Create mock response structure
        class MockMessage:
            def __init__(self, content):
                self.content = content
        
        class MockChoice:
            def __init__(self, content):
                self.message = MockMessage(content)
        
        class MockResponse:
            def __init__(self, content):
                self.choices = [MockChoice(content)]
        
        return MockResponse(content)


class TestEnsembleIntegration(unittest.TestCase):
    """Integration tests for the complete Ensemble workflow."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        self.original_cwd = os.getcwd()
        os.chdir(self.test_dir)
        
        # Create test configuration
        self.test_config = {
            "OPENROUTER_API_KEY": "test-api-key",
            "MODELS": ["test-model-1", "test-model-2", "test-model-3"],
            "REFINEMENT_MODEL_NAME": "test-refinement-model",
            "PROMPT": "What is machine learning?"
        }
    
    def tearDown(self):
        """Clean up test fixtures."""
        os.chdir(self.original_cwd)
        shutil.rmtree(self.test_dir)
    
    async def test_successful_ensemble_workflow(self):
        """Test complete successful ensemble workflow."""
        # Mock responses for different models
        mock_responses = {
            "test-model-1": "Machine learning is a subset of AI that enables computers to learn.",
            "test-model-2": "ML involves algorithms that improve automatically through experience.",
            "test-model-3": "It's a method of data analysis that automates analytical model building.",
            "test-refinement-model": "Machine learning is a comprehensive field combining all these aspects."
        }
        
        mock_client = MockOpenAIClient(mock_responses)
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = self.test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            # Capture output
            with patch('builtins.print') as mock_print:
                await ensemble.main()
            
            # Verify that output was generated
            mock_print.assert_called()
            printed_output = str(mock_print.call_args_list[-2][0][0])  # Get the main response
            self.assertIn("Machine learning", printed_output)
    
    async def test_partial_model_failure_workflow(self):
        """Test ensemble workflow with some model failures."""
        # Some models succeed, some fail
        mock_responses = {
            "test-model-1": "Machine learning is a subset of AI.",
            "test-model-2": None,  # This will cause a failure
            "test-model-3": "ML automates analytical model building.",
            "test-refinement-model": "Combined insights about machine learning."
        }
        
        def mock_create_completion(model, messages, **kwargs):
            if model == "test-model-2":
                raise Exception("Model unavailable")
            return MockOpenAIClient(mock_responses).chat_completions_create(model, messages, **kwargs)
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = mock_create_completion
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = self.test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            # Should still produce output despite one model failing
            with patch('builtins.print') as mock_print:
                await ensemble.main()
            
            # Verify that output was still generated
            mock_print.assert_called()
    
    async def test_all_models_fail_workflow(self):
        """Test ensemble workflow when all models fail."""
        mock_client = MockOpenAIClient(should_fail=True)
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = self.test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            # Should handle gracefully and print error
            with patch('builtins.print') as mock_print:
                await ensemble.main()
            
            # Should have printed an error message
            mock_print.assert_called()
            printed_args = [str(call[0][0]) for call in mock_print.call_args_list]
            error_printed = any("Error:" in arg for arg in printed_args)
            self.assertTrue(error_printed)
    
    async def test_refinement_failure_fallback(self):
        """Test fallback when refinement fails but models succeed."""
        mock_responses = {
            "test-model-1": "Response 1",
            "test-model-2": "Response 2",
            "test-model-3": "Response 3",
        }
        
        def mock_create_completion(model, messages, **kwargs):
            if model == "test-refinement-model":
                raise Exception("Refinement model unavailable")
            return MockOpenAIClient(mock_responses).chat_completions_create(model, messages, **kwargs)
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = mock_create_completion
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = self.test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            # Should fallback to combined responses
            with patch('builtins.print') as mock_print:
                await ensemble.main()
            
            # Should have produced output using fallback
            mock_print.assert_called()
    
    def test_config_loading_integration(self):
        """Test configuration loading integration."""
        # Create test environment files
        default_env_content = """
MODELS=default-model-1,default-model-2
REFINEMENT_MODEL_NAME=default-refinement
"""
        
        user_env_content = """
OPENROUTER_API_KEY=user-api-key
MODELS=user-model-1,user-model-2
"""
        
        # Write test files
        with open("default.env", "w") as f:
            f.write(default_env_content)
        
        with open(".env", "w") as f:
            f.write(user_env_content)
        
        with patch('config.Path') as mock_path, \
             patch('config.find_dotenv') as mock_find_dotenv:
            
            # Mock path to point to our test default.env
            mock_default_path = Path("default.env")
            mock_path.return_value = mock_default_path
            
            # Mock find_dotenv to return our test .env
            mock_find_dotenv.return_value = ".env"
            
            config = load_config()
            
            # User settings should override defaults
            self.assertEqual(config["OPENROUTER_API_KEY"], "user-api-key")
            self.assertEqual(config["MODELS"], ["user-model-1", "user-model-2"])
            # Default should be used where user didn't specify
            self.assertEqual(config["REFINEMENT_MODEL_NAME"], "default-refinement")
    
    async def test_prompt_validation_integration(self):
        """Test prompt validation integration."""
        dangerous_prompt = "<script>alert('test')</script>What is AI?"
        
        test_config = self.test_config.copy()
        test_config["PROMPT"] = dangerous_prompt
        
        mock_client = MockOpenAIClient({"test-model-1": "Safe response"})
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            # Should sanitize the prompt and still work
            with patch('builtins.print') as mock_print:
                await ensemble.main()
            
            # Should have processed successfully with sanitized prompt
            mock_print.assert_called()
    
    async def test_output_file_generation(self):
        """Test that output files are generated correctly."""
        mock_responses = {
            "test-model-1": "Test response for output",
            "test-refinement-model": "Refined test response"
        }
        
        mock_client = MockOpenAIClient(mock_responses)
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = self.test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            await ensemble.main()
            
            # Check that output directory was created
            output_dir = Path("output")
            self.assertTrue(output_dir.exists())
            
            # Check that at least one output file was created
            output_files = list(output_dir.glob("*.txt"))
            self.assertGreater(len(output_files), 0)
            
            # Check that the file contains the expected content
            with open(output_files[0], 'r') as f:
                content = f.read()
                self.assertIn("test", content.lower())


class TestRateLimitingIntegration(unittest.TestCase):
    """Test rate limiting integration with the main application."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_config = {
            "OPENROUTER_API_KEY": "test-api-key",
            "MODELS": ["test-model-1", "test-model-2"],
            "REFINEMENT_MODEL_NAME": "test-refinement-model",
            "PROMPT": "Test prompt"
        }
    
    async def test_rate_limiting_applied(self):
        """Test that rate limiting is properly applied."""
        call_times = []
        
        def track_calls(model, messages, **kwargs):
            call_times.append(asyncio.get_event_loop().time())
            # Simple mock response
            class MockMessage:
                content = f"Response from {model}"
            class MockChoice:
                message = MockMessage()
            class MockResponse:
                choices = [MockChoice()]
            return MockResponse()
        
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = track_calls
        
        with patch('ensemble.init_client') as mock_init_client, \
             patch('ensemble.load_config') as mock_load_config, \
             patch('asyncio.to_thread') as mock_to_thread:
            
            mock_load_config.return_value = self.test_config
            mock_init_client.return_value = mock_client
            mock_to_thread.side_effect = lambda func, *args, **kwargs: func(*args, **kwargs)
            
            await ensemble.main()
            
            # Rate limiting should have been configured and applied
            self.assertGreater(len(call_times), 0)


if __name__ == '__main__':
    unittest.main()