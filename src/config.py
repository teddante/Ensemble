from dotenv import load_dotenv, find_dotenv, dotenv_values
import os
import logging
from pathlib import Path

def load_config():
    # Try to load user's .env file
    user_env_path = find_dotenv(usecwd=True)
    
    # Load default environment file path
    default_env_path = Path(os.path.dirname(__file__), "..", "default.env")
    
    # Initialize config with empty values
    config = {}
    
    # If default.env exists, load it first as base configuration
    if default_env_path.exists():
        logging.info(f"Loading default configuration from {default_env_path}")
        config.update(dotenv_values(default_env_path))
    else:
        logging.warning(f"Default environment file not found at {default_env_path}")
    
    # If user's .env exists, load and override defaults
    if user_env_path:
        logging.info(f"Loading user configuration from {user_env_path}")
        user_config = dotenv_values(user_env_path)
        config.update(user_config)
        
        # Also set environment variables from the .env file
        load_dotenv(user_env_path)
    else:
        logging.info("No user .env file found, using default configuration only")
    
    # Ensure MODELS is a list (handle empty string case)
    models = config.get("MODELS", "")
    config["MODELS"] = models.split(",") if models else []
    
    # Warn if API key is using default placeholder
    if not config.get("OPENROUTER_API_KEY") or config.get("OPENROUTER_API_KEY") == "default_key_replace_me":
        logging.warning("OPENROUTER_API_KEY is not set or using default placeholder. API calls will fail.")
        
    return config
