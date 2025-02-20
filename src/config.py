from dotenv import load_dotenv
import os

def load_config():
    load_dotenv()
    return {
        "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY", ""),
        "MODELS": os.getenv("MODELS", "").split(","),
        "PROMPT": os.getenv("PROMPT", ""),
        "REFINEMENT_MODEL_NAME": os.getenv("REFINEMENT_MODEL_NAME", "")
    }
