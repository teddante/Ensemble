# c:/Users/edwar/OneDrive/Documents/GitHub/Ensemble/src/config.py
from dotenv import load_dotenv
import os

def load_config():
    # Load environment variables from .env file
    load_dotenv()
    config = {
        "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY"),
        "MODELS": os.getenv("MODELS", "").split(",") if os.getenv("MODELS") else [],
        "PROMPT": os.getenv("PROMPT"),
        "REFINEMENT_MODEL_NAME": os.getenv("REFINEMENT_MODEL_NAME")
    }
    return config
