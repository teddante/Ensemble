"""
Configuration management for Ensemble AI.

This module handles hierarchical configuration loading from environment files,
environment variables, and defaults. It provides validation and fallback
mechanisms for graceful degradation.
"""

import logging
import os
from pathlib import Path

# Import dependencies with fallbacks
try:
    from dotenv import dotenv_values, find_dotenv, load_dotenv

    DOTENV_AVAILABLE = True
except ImportError:
    DOTENV_AVAILABLE = False
    logging.warning("python-dotenv not available - environment file loading will be limited")

    def load_dotenv(*args, **kwargs):  # type: ignore
        """Fallback function when python-dotenv is not available."""
        pass

    def find_dotenv(*args, **kwargs):  # type: ignore
        """Fallback function to find .env files when python-dotenv is not available."""
        return None

    def dotenv_values(path):  # type: ignore
        """Fallback function to read .env values when python-dotenv is not available."""
        try:
            with open(path, "r") as f:
                values = {}
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        values[key.strip()] = value.strip()
                return values
        except Exception:
            return {}


try:
    from pydantic import ValidationError

    from validation import EnsembleConfig, ModelConfigValidationError

    VALIDATION_AVAILABLE = True
except ImportError:
    VALIDATION_AVAILABLE = False
    logging.warning("validation module not available - configuration validation will be limited")

    class EnsembleConfig:  # type: ignore
        """Fallback configuration class when Pydantic is not available."""

        def __init__(self, **kwargs):
            """Initialize configuration with provided keyword arguments."""
            for key, value in kwargs.items():
                setattr(self, key, value)

        def dict(self):
            """Return configuration as dictionary."""
            return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

    class ModelConfigValidationError(Exception):  # type: ignore
        """Exception raised when model configuration validation fails."""

        pass

    class ValidationError(Exception):  # type: ignore
        """Exception raised when general validation fails."""

        pass


def load_config():
    """
    Load and validate configuration from environment files.

    Returns:
        dict: Validated configuration dictionary

    Raises:
        ValidationError: If configuration validation fails
        ModelConfigValidationError: If model configuration is invalid
    """
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

    # Set default values for missing required fields
    if not config.get("OPENROUTER_API_KEY"):
        config["OPENROUTER_API_KEY"] = ""

    if not config.get("REFINEMENT_MODEL_NAME"):
        if config["MODELS"]:
            config["REFINEMENT_MODEL_NAME"] = config["MODELS"][0]
        else:
            config["REFINEMENT_MODEL_NAME"] = ""

    # Set timeout configuration with environment-based defaults
    if not config.get("REQUEST_TIMEOUT"):
        # Use environment variable or default based on environment
        env_timeout = os.getenv("REQUEST_TIMEOUT")
        if env_timeout:
            config["REQUEST_TIMEOUT"] = int(env_timeout)
        else:
            # Default timeouts based on environment
            environment = os.getenv("ENVIRONMENT", "development").lower()
            if environment == "production":
                config["REQUEST_TIMEOUT"] = 30  # More aggressive in production
            else:
                config["REQUEST_TIMEOUT"] = 60  # More lenient in development

    # Set rate limiting configuration
    if not config.get("RATE_LIMIT_PER_MINUTE"):
        config["RATE_LIMIT_PER_MINUTE"] = int(os.getenv("RATE_LIMIT_PER_MINUTE", "30"))

    if not config.get("MAX_RETRIES"):
        config["MAX_RETRIES"] = int(os.getenv("MAX_RETRIES", "3"))

    # Validate configuration if validation is available
    if VALIDATION_AVAILABLE:
        try:
            validated_config = EnsembleConfig(
                openrouter_api_key=config.get("OPENROUTER_API_KEY", ""),
                models=config.get("MODELS", []),
                refinement_model_name=config.get("REFINEMENT_MODEL_NAME", ""),
                prompt=config.get("PROMPT", ""),
            )

            # Convert back to dict with validated values
            config.update(validated_config.dict())

            logging.info("Configuration validation successful")

        except ValidationError as e:
            logging.error(f"Configuration validation failed: {e}")
            # For backwards compatibility, warn but don't fail if API key is missing
            if "openrouter_api_key" in str(e).lower():
                logging.warning("OPENROUTER_API_KEY validation failed. API calls will fail.")
            else:
                raise
        except Exception as e:
            logging.error(f"Unexpected error during configuration validation: {e}")
            logging.warning("Proceeding with unvalidated configuration")
    else:
        # Basic validation without Pydantic
        if not config.get("OPENROUTER_API_KEY"):
            logging.warning("OPENROUTER_API_KEY not set. API calls will fail.")
        if not config.get("MODELS"):
            logging.warning("No models configured.")
        logging.info("Basic configuration validation completed (advanced validation unavailable)")

    return config
