# Ensemble

Ensemble is a powerful tool that leverages multiple Large Language Models (LLMs) to provide a multi-perspective answer for any given prompt. By combining diverse responses and refining them, Ensemble delivers a clear, concise, and balanced final answer.

## Features

- **Multi-LLM Integration:** Interact with various language models concurrently to gain comprehensive insights.
- **Response Refinement:** Merge and refine multiple responses into a single, optimal answer.
- **OpenRouter API Integration:** Utilize the OpenRouter service to access multiple LLMs through one interface.
- **Easy Configuration:** Customize models, prompts, and API keys effortlessly via environment variables.

## Setup

1. **Install Dependencies**
   - Run `pip install -r requirements.txt` to install all required packages.

2. **Configure Environment Variables**
   - Create a `.env` file in the project root and add the following:
     - `OPENROUTER_API_KEY`: Your OpenRouter API key.
     - `MODELS`: Comma-separated list of LLM model identifiers.
     - `PROMPT`: The prompt to send (optional; if not provided, the script will ask for input).
     - `REFINEMENT_MODEL_NAME`: The model to use for response refinement.

## Usage

Execute the main script to generate and refine responses:

```bash
python src/ensemble.py
```

The script will:

- Load configuration from the environment.
- Initialize the OpenRouter client.
- Fetch responses from each specified LLM.
- Combine and refine the responses into a final, cohesive answer.