# Ensemble

Ensemble is a powerful tool that leverages multiple Large Language Models (LLMs) to provide a multi-perspective answer for any given prompt. By combining diverse responses and refining them, Ensemble delivers a clear, concise, and balanced final answer.

Ensemble's architecture involves fetching responses from multiple LLMs using the OpenRouter API, combining these responses, and then refining the combined response using a dedicated refinement model. The core logic is implemented in `src/ensemble.py`, while the web interface is located in the `src/web` directory.

## Features

- **Multi-LLM Integration:** Interact with various language models concurrently to gain comprehensive insights.
- **Response Refinement:** Merge and refine multiple responses into a single, optimal answer.
- **OpenRouter API Integration:** Utilize the OpenRouter service to access multiple LLMs through one interface.
- **Easy Configuration:** Customize models, prompts, and API keys effortlessly via environment variables, with fallback to default values.

## Setup

1. **Install Dependencies**
   - Run `pip install -r requirements.txt` to install all required packages.

2. **Configure Environment Variables**
   - Ensemble includes a `default.env` file with sensible defaults, but you should:
   - Create your own `.env` file in the project root to override any defaults:
     - `OPENROUTER_API_KEY`: Your OpenRouter API key.
     - `MODELS`: Comma-separated list of LLM model identifiers.
     - `PROMPT`: The prompt to send (optional; if not provided, the script will ask for input).
     - `REFINEMENT_MODEL_NAME`: The model to use for response refinement.

## Configuration

Ensemble uses a two-tier configuration system:

1. **Default Configuration:** The `default.env` file in the project root contains sensible defaults for all required settings.

2. **User Configuration:** Your custom `.env` file overrides any defaults. You only need to specify the values you want to change.

This ensures Ensemble can run with minimal setup while still allowing for complete customization.

## Usage

Execute the main script to generate and refine responses:

```bash
python src/ensemble.py
```

## License

Ensemble is licensed under the MIT License. See the `LICENSE` file for more information.
