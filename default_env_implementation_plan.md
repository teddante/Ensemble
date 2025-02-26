# Default Environment File Implementation Plan

## Current Situation
- The program uses `python-dotenv` to load environment variables from a `.env` file.
- If certain environment variables are not found, empty defaults are provided (like empty strings).
- There's no specific fallback mechanism to a default configuration file.

## Solution Overview
We'll implement a default environment file fallback mechanism that allows the program to:
1. Look for user-specified `.env` file first (current behavior)
2. If the file is not found or specific variables are missing, fall back to a default configuration

## Detailed Implementation Plan

1. **Create a Default Environment File**
   - Create a `default.env` file in the project root with sensible defaults
   - This file should include default values for all required environment variables
   - The file should be well-documented with comments explaining each variable

2. **Modify the Configuration Loading Logic**
   - Update `src/config.py` to implement the fallback mechanism
   - First attempt to load from the user's `.env` file
   - If the file is not found or variables are missing, load from the `default.env` file
   - Maintain logging to inform users when falling back to defaults

3. **Update Documentation**
   - Update the README.md to explain the new fallback mechanism
   - Include information about which variables have defaults and how users can override them

4. **Add Tests**
   - Add tests to verify the fallback behavior works correctly
   - Test scenarios where .env file is missing
   - Test scenarios where .env file exists but some variables are missing

## Benefits of This Approach
- Maintains backward compatibility with existing .env files
- Provides sensible defaults for first-time users
- Makes the application more robust to configuration issues
- Follows the principle of least surprise

## Code Changes Required

1. In `src/config.py`:
   - Modify the `load_config` function to implement the fallback mechanism
   - Add a helper function to load and merge configuration from multiple sources

2. Create a `default.env` file that includes:
   ```
   # Default environment variables for Ensemble
   # These values are used if no .env file is found or if specific variables are missing

   # Required: OpenRouter API key (this is just a placeholder and won't work)
   OPENROUTER_API_KEY=default_key_replace_me

   # Required: Models to use for ensemble responses
   # This default uses a few common models available through OpenRouter
   MODELS=anthropic/claude-3-haiku-20240307,google/gemini-1.5-pro-latest,openai/gpt-4o-mini

   # Optional: Default prompt (will be overridden by prompt.txt if it exists, or user input)
   PROMPT=

   # Required: Model to use for refining the ensemble of responses
   REFINEMENT_MODEL_NAME=anthropic/claude-3-haiku-20240307
   ```

3. Sample updated code for `src/config.py`:
   ```python
   from dotenv import load_dotenv, find_dotenv, dotenv_values
   import os
   import logging
   from pathlib import Path

   def load_config():
       # Try to load user's .env file
       user_env_path = find_dotenv(usecwd=True)
       
       # Load default environment file path
       default_env_path = Path(os.path.dirname(__file__), "..", "default.env")
       
       # Initialize config with default values
       config = {}
       
       # If default.env exists, load it first as base configuration
       if default_env_path.exists():
           logging.info(f"Loading default configuration from {default_env_path}")
           config.update(dotenv_values(default_env_path))
       
       # If user's .env exists, load and override defaults
       if user_env_path:
           logging.info(f"Loading user configuration from {user_env_path}")
           user_config = dotenv_values(user_env_path)
           config.update(user_config)
           
           # Also set environment variables from the .env file
           load_dotenv(user_env_path)
       else:
           logging.warning("No user .env file found, using default configuration")
       
       # Ensure required configuration exists
       if not config.get("OPENROUTER_API_KEY") or config.get("OPENROUTER_API_KEY") == "default_key_replace_me":
           logging.warning("OPENROUTER_API_KEY is not set or using default placeholder. API calls will fail.")
       
       # Convert MODELS string to list
       if "MODELS" in config and config["MODELS"]:
           config["MODELS"] = config["MODELS"].split(",")
       else:
           config["MODELS"] = []
           
       return config