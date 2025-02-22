from dotenv import load_dotenv
import os
import logging

def load_config():
    load_dotenv()
    config = {
        "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY", ""),
        "MODELS": os.getenv("MODELS", "").split(","),
        "PROMPT": os.getenv("PROMPT", ""),
        "REFINEMENT_MODEL_NAME": os.getenv("REFINEMENT_MODEL_NAME", "")
    }
    if not config["OPENROUTER_API_KEY"]:
        logging.warning("OPENROUTER_API_KEY is not set in the environment variables.")
    return config
