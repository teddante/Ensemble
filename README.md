# Ensemble - Multi-LLM CLI Tool

A command-line tool that queries multiple Large Language Models simultaneously and combines their responses into a single, refined answer.

## What It Does

Ensemble sends your prompt to multiple LLMs in parallel (via OpenRouter API), then uses one model to synthesize all responses into a comprehensive final answer. Perfect for getting diverse AI perspectives on complex questions.

## Key Features

- **Multi-LLM Querying**: Parallel requests to Claude, GPT, Gemini, and other models
- **Response Synthesis**: Intelligent combination of diverse AI perspectives  
- **Built-in Safety**: Input validation, rate limiting, and error handling
- **File Output**: Saves results to timestamped files for later reference

## Quick Start

### Prerequisites
- Python 3.9+
- OpenRouter API Key ([Get one here](https://openrouter.ai))

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/ensemble.git
cd ensemble

# Install dependencies
pip install -r requirements.txt

# Configure API key
cp default.env .env
# Edit .env and add your OPENROUTER_API_KEY
```

### Usage

```bash
# Run with interactive prompt
python src/ensemble.py

# Or use environment variable
export PROMPT="What are the benefits of renewable energy?"
python src/ensemble.py

# Or create a prompt.txt file
echo "Explain quantum computing" > prompt.txt
python src/ensemble.py
```

### Docker

```bash
# Build and run
docker build -t ensemble .
docker run -e OPENROUTER_API_KEY=your_key ensemble

# Or use docker-compose
echo "OPENROUTER_API_KEY=your_key" > .env
docker-compose up
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | ✅ | - | Your OpenRouter API key |
| `MODELS` | ❌ | claude-3-haiku, gemini-1.5-pro, gpt-4o-mini | Comma-separated model list |
| `REFINEMENT_MODEL_NAME` | ❌ | claude-3-haiku | Model for response synthesis |
| `PROMPT` | ❌ | Interactive input | Pre-configured prompt |
| `RATE_LIMIT_PER_MINUTE` | ❌ | 30 | API rate limit |
| `LOG_LEVEL` | ❌ | INFO | Logging verbosity |

## How It Works

1. **Input**: Accepts prompts from `prompt.txt`, environment variable, or interactive input
2. **Validation**: Sanitizes input and validates against security issues
3. **Multi-LLM Query**: Sends prompt to multiple models in parallel via OpenRouter
4. **Response Collection**: Gathers responses with built-in error handling and retries
5. **Synthesis**: Uses refinement model to combine all responses into final answer
6. **Output**: Displays result and saves to timestamped file in `output/` directory

## Development

### Testing
```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html

# Run specific test file
pytest tests/test_ensemble.py -v
```

### Code Quality
```bash
# Format code
black src/ tests/

# Sort imports
isort src/ tests/

# Type checking
mypy src/

# Security scanning
bandit -r src/
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and quality checks
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.
