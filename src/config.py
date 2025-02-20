# This file defines default configuration values for connecting to the OpenRouter API

from dotenv import load_dotenv
import os

def load_config():
    # Load environment variables from .env file
    load_dotenv()
    config = {
        # API key for the OpenRouter service
        "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY"),
        # Comma-separated list of language model identifiers
        "MODELS": os.getenv("MODELS", "").split(",") if os.getenv("MODELS") else [],
        # Default prompt; if empty, user input will be requested
        "PROMPT": os.getenv("PROMPT"),
        # Model name used for the refinement step
        "REFINEMENT_MODEL_NAME": os.getenv("REFINEMENT_MODEL_NAME")
    }
    return config
