# Add src directory to sys.path for module imports
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
from unittest.mock import patch, mock_open
import tempfile
import shutil
from pathlib import Path
from config import load_config


class TestConfigFallback(unittest.TestCase):
    def setUp(self):
        # Create temporary directory for test files
        self.test_dir = tempfile.mkdtemp()
        
        # Sample content for environment files
        self.default_env_content = (
            "OPENROUTER_API_KEY=default_key_replace_me\n"
            "MODELS=default-model-1,default-model-2\n"
            "PROMPT=default_prompt\n"
            "REFINEMENT_MODEL_NAME=default-refinement-model\n"
        )
        
        self.user_env_content = (
            "OPENROUTER_API_KEY=user_api_key\n"
            "MODELS=user-model-1,user-model-2\n"
            "REFINEMENT_MODEL_NAME=user-refinement-model\n"
        )
        
    def tearDown(self):
        # Clean up temporary directory
        shutil.rmtree(self.test_dir)
    
    @patch('config.find_dotenv')
    @patch('config.Path')
    @patch('config.dotenv_values')
    def test_only_default_env_exists(self, mock_dotenv_values, mock_path, mock_find_dotenv):
        # Setup mocks
        mock_find_dotenv.return_value = None  # No user .env file
        
        # Mock default.env file exists
        mock_default_path = mock_path.return_value
        mock_default_path.exists.return_value = True
        
        # Mock dotenv_values to return configs
        mock_dotenv_values.return_value = {
            "OPENROUTER_API_KEY": "default_key_replace_me",
            "MODELS": "default-model-1,default-model-2",
            "PROMPT": "default_prompt",
            "REFINEMENT_MODEL_NAME": "default-refinement-model"
        }
        
        # Call the function under test
        config = load_config()
        
        # Verify expected results
        self.assertEqual(config["OPENROUTER_API_KEY"], "default_key_replace_me")
        self.assertEqual(config["MODELS"], ["default-model-1", "default-model-2"])
        self.assertEqual(config["PROMPT"], "default_prompt")
        self.assertEqual(config["REFINEMENT_MODEL_NAME"], "default-refinement-model")
    
    @patch('config.find_dotenv')
    @patch('config.Path')
    @patch('config.dotenv_values')
    @patch('config.load_dotenv')
    def test_both_env_files_exist(self, mock_load_dotenv, mock_dotenv_values, mock_path, mock_find_dotenv):
        # Setup mocks
        mock_find_dotenv.return_value = "/path/to/user/.env"  # User .env file exists
        
        # Mock default.env file exists
        mock_default_path = mock_path.return_value
        mock_default_path.exists.return_value = True
        
        # Mock dotenv_values to return different configs based on path
        def mock_dotenv_values_side_effect(path):
            if str(path) == "/path/to/user/.env":
                return {
                    "OPENROUTER_API_KEY": "user_api_key",
                    "MODELS": "user-model-1,user-model-2",
                    "REFINEMENT_MODEL_NAME": "user-refinement-model"
                }
            else:
                return {
                    "OPENROUTER_API_KEY": "default_key_replace_me",
                    "MODELS": "default-model-1,default-model-2",
                    "PROMPT": "default_prompt",
                    "REFINEMENT_MODEL_NAME": "default-refinement-model"
                }
        
        mock_dotenv_values.side_effect = mock_dotenv_values_side_effect
        
        # Call the function under test
        config = load_config()
        
        # Verify user settings override defaults
        self.assertEqual(config["OPENROUTER_API_KEY"], "user_api_key")
        self.assertEqual(config["MODELS"], ["user-model-1", "user-model-2"])
        self.assertEqual(config["PROMPT"], "default_prompt")  # Not in user .env, should use default
        self.assertEqual(config["REFINEMENT_MODEL_NAME"], "user-refinement-model")
    
    @patch('config.find_dotenv')
    @patch('config.Path')
    @patch('config.dotenv_values')
    def test_no_env_files_exist(self, mock_dotenv_values, mock_path, mock_find_dotenv):
        # Setup mocks
        mock_find_dotenv.return_value = None  # No user .env file
        
        # Mock default.env file doesn't exist
        mock_default_path = mock_path.return_value
        mock_default_path.exists.return_value = False
        
        # Call the function under test
        config = load_config()
        
        # Verify empty defaults
        self.assertEqual(config["MODELS"], [])
        
        # Make sure API key warning is triggered for empty values
        # This would normally be tested with a mock for the logger

if __name__ == '__main__':
    unittest.main()