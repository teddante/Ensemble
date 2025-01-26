# Ensemble

This project uses AI tools to combine responses from different Large Language Models (LLMs) and refine them into a single answer. It uses the OpenAI API to interact with the LLMs.

**Key Features:**

*   **Multi-LLM Support:**  Leverages multiple LLMs to gather diverse perspectives.
*   **Response Refinement:** Combines and refines responses from different LLMs into a concise and clear answer using another LLM.
*   **OpenRouter Integration:** Uses OpenRouter to access various LLMs through a single API.

**Getting Started:**

1.  **Environment Setup:**
    *   Install required Python packages from `requirements.txt`.
    *   Set up environment variables in a `.env` file, including:
        *   `OPENROUTER_API_KEY`: Your OpenRouter API key.
        *   `MODELS`: Comma-separated list of LLM model names to use.
        *   `PROMPT`: The prompt to send to the LLMs.
        *   `REFINEMENT_MODEL_NAME`: The LLM model name to use for refining the combined responses.

2.  **Run the script:**
    ```bash
    python src/ensemble.py
    ```