# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ensemble is a multi-LLM CLI tool that queries multiple Large Language Models simultaneously via OpenRouter API and synthesizes their responses into a single, refined answer. The system handles parallel requests, rate limiting, error handling, and response refinement.

## Common Development Commands

### Testing
```bash
# Run all tests with coverage
pytest tests/ -v --cov=src --cov-report=html

# Run specific test categories
pytest tests/ -m "unit"              # Unit tests only
pytest tests/ -m "integration"       # Integration tests only
pytest tests/ -m "not slow"          # Skip slow tests

# Run single test file
pytest tests/test_ensemble.py -v

# Performance benchmarks
python benchmarks/performance_benchmark.py
```

### Code Quality
```bash
# Format code (Black with 100 char line length)
black src/ tests/ benchmarks/

# Sort imports
isort src/ tests/ benchmarks/

# Type checking
mypy src/

# Linting
flake8 src/ tests/ benchmarks/

# Security scanning
bandit -r src/

# Check for vulnerabilities
safety check

# Run all quality checks together
black src/ tests/; isort src/ tests/; flake8 src/ tests/; mypy src/; bandit -r src/
```

### Running the Application
```bash
# Interactive mode (prompts for input)
python src/ensemble.py

# With environment variable
export PROMPT="Your question here"
python src/ensemble.py

# Using prompt file
echo "Your question" > prompt.txt
python src/ensemble.py

# Docker
docker build -t ensemble .
docker run -e OPENROUTER_API_KEY=your_key ensemble
```

## Architecture Overview

### Core Components

**Main Application Flow** (`src/ensemble.py`):
- Configuration loading and validation
- Rate limiting and circuit breaker pattern
- Parallel LLM request handling with async/await
- Response synthesis and refinement
- File output management

**Configuration System** (`src/config.py`):
- Hierarchical config loading: default.env → .env → environment variables
- Pydantic-based validation with fallbacks
- Dynamic timeout and rate limit configuration

**Input Validation** (`src/validation.py`):
- Prompt sanitization with HTML/script tag removal
- API key format validation for OpenRouter
- Model name validation with provider/model format
- Path traversal protection

**Supporting Modules**:
- `monitoring.py`: Performance metrics and request tracking
- `rate_limiter.py`: Token bucket algorithm for API rate limiting  
- `error_handling.py`: Structured error handling with context
- `logging_config.py`: Structured logging with correlation IDs
- `health_check.py`: System health monitoring
- `api_docs.py`: API documentation generation

### Key Patterns

**Error Handling**: Uses `@error_handler` decorator with structured ErrorContext for consistent error handling across components.

**Rate Limiting**: Implements token bucket algorithm with per-model rate limits and circuit breakers to prevent cascade failures.

**Async Architecture**: All LLM requests use async/await for parallel execution with proper timeout handling.

**Configuration**: Supports multiple configuration sources with validation and fallbacks for graceful degradation.

## Environment Configuration

### Required Environment Variables
- `OPENROUTER_API_KEY`: Your OpenRouter API key (required)

### Optional Environment Variables
- `MODELS`: Comma-separated list of models (default: claude-3-haiku,gemini-1.5-pro,gpt-4o-mini)
- `REFINEMENT_MODEL_NAME`: Model for response synthesis (default: first model in list)
- `RATE_LIMIT_PER_MINUTE`: API rate limit (default: 30)
- `REQUEST_TIMEOUT`: Request timeout in seconds (default: 60 dev, 30 prod)
- `LOG_LEVEL`: Logging level (default: INFO)

### Configuration Files
- `default.env`: Default configuration values
- `.env`: User-specific overrides (not committed to git)
- `prompt.txt`: Optional prompt file (takes precedence over env vars)

## Testing Strategy

The test suite uses pytest with comprehensive markers:
- `unit`: Fast unit tests for individual functions
- `integration`: Component interaction tests
- `performance`: Load and performance tests
- `security`: Security validation tests
- `network`: Tests requiring network access
- `slow`: Tests taking >10 seconds

Coverage requirement: 90% minimum for new code.

## Dependencies

### Runtime Dependencies (requirements.txt)
- `openai==1.12.0`: OpenRouter API client
- `python-dotenv==1.0.1`: Environment file loading
- `pydantic==2.9.2`: Data validation
- `bleach==6.1.0`: HTML sanitization
- `ratelimit==2.2.1`: Rate limiting utilities
- `flask==2.3.3`: Web framework (for health checks)
- `psutil==5.9.8`: System monitoring

### Development Dependencies (requirements-dev.txt)
- Testing: `pytest`, `pytest-cov`, `pytest-asyncio`
- Code Quality: `black`, `flake8`, `mypy`, `isort`
- Security: `bandit`, `safety`, `detect-secrets`
- Documentation: `pydoc-markdown`, `mkdocs-material`

## Model Configuration

Models are specified in `provider/model` format (e.g., `anthropic/claude-3-haiku-20240307`). The system validates model names and handles per-model rate limiting and circuit breaking.

Common models available through OpenRouter:
- `anthropic/claude-3-haiku-20240307`
- `google/gemini-1.5-pro-latest`
- `openai/gpt-4o-mini`
- `meta-llama/llama-3.1-8b-instruct`

## Development Workflow

1. Set up environment: `cp default.env .env` and add your API key
2. Install dependencies: `pip install -r requirements.txt -r requirements-dev.txt`
3. Install pre-commit hooks: `pre-commit install`
4. Run tests: `pytest tests/ -v`
5. Make changes following the code quality standards in CONTRIBUTING.md
6. Run quality checks before committing