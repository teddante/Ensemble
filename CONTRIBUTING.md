# Contributing to Ensemble AI

Thank you for your interest in contributing to Ensemble AI! This document provides guidelines and information for contributors.

## 🚀 Quick Start

### Development Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/ensemble.git
   cd ensemble
   ```

2. **Set up Python environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

3. **Configure environment**
   ```bash
   cp default.env .env
   # Edit .env with your OpenRouter API key
   ```

4. **Install pre-commit hooks**
   ```bash
   pre-commit install
   pre-commit install --hook-type commit-msg
   ```

5. **Run tests to verify setup**
   ```bash
   pytest tests/ -v
   python benchmarks/performance_benchmark.py
   ```

## 📋 Development Guidelines

### Code Style

We use automated tools to maintain consistent code style:

- **Black** for code formatting (line length: 100)
- **isort** for import sorting
- **Flake8** for linting
- **MyPy** for type checking
- **Bandit** for security scanning

Run all formatters and checks:
```bash
# Format code
black src/ tests/ benchmarks/
isort src/ tests/ benchmarks/

# Check code quality
flake8 src/ tests/ benchmarks/
mypy src/
bandit -r src/
```

### Code Quality Standards

#### Type Hints
- All functions must have type hints for parameters and return values
- Use `typing` module imports for complex types
- Example:
  ```python
  from typing import List, Dict, Optional
  
  def process_models(models: List[str], config: Dict[str, Any]) -> Optional[str]:
      """Process model list with configuration."""
      ...
  ```

#### Documentation
- All public functions and classes must have docstrings
- Use Google-style docstrings
- Include Args, Returns, and Raises sections
- Example:
  ```python
  def sanitize_prompt(prompt: str, max_length: int = 10000) -> str:
      """
      Sanitize user input prompt to prevent injection attacks.
      
      Args:
          prompt: The input prompt to sanitize
          max_length: Maximum allowed length for the prompt
          
      Returns:
          Sanitized prompt string
          
      Raises:
          PromptValidationError: If prompt fails validation
      """
      ...
  ```

#### Error Handling
- Use specific exception types
- Provide clear error messages
- Log errors appropriately
- Example:
  ```python
  try:
      result = risky_operation()
  except SpecificError as e:
      logger.error(f"Operation failed: {e}", extra={'context': 'operation_name'})
      raise ProcessingError(f"Failed to process: {e}") from e
  ```

### Testing Requirements

#### Test Coverage
- Minimum 90% test coverage for new code
- All public functions must have tests
- Include both positive and negative test cases

#### Test Categories
1. **Unit Tests** (`tests/test_*.py`)
   - Test individual functions and classes
   - Mock external dependencies
   - Fast execution (< 1 second per test)

2. **Integration Tests** (`tests/test_integration.py`)
   - Test component interactions
   - Use realistic mock data
   - Test error handling paths

3. **Performance Tests** (`benchmarks/`)
   - Measure execution time and memory usage
   - Set performance regression thresholds
   - Test under various load conditions

#### Writing Tests
```python
import pytest
from unittest.mock import patch, MagicMock

def test_sanitize_prompt_basic():
    """Test basic prompt sanitization."""
    result = sanitize_prompt("Hello world")
    assert result == "Hello world"

def test_sanitize_prompt_with_html():
    """Test HTML tag removal."""
    result = sanitize_prompt("Hello <script>alert('test')</script>world")
    assert "<script>" not in result
    assert "Hello" in result and "world" in result

@pytest.mark.asyncio
async def test_fetch_llm_responses_with_mocks():
    """Test LLM response fetching with mocked client."""
    with patch('ensemble.OpenAI') as mock_client:
        mock_client.return_value.chat.completions.create.return_value = MockResponse("test response")
        result = await fetch_llm_responses(mock_client, "test prompt", ["model1"])
        assert len(result) == 1
        assert "test response" in result[0]
```

### Security Guidelines

#### Input Validation
- Validate and sanitize all user inputs
- Use parameterized queries for database operations
- Implement rate limiting for API endpoints

#### Secret Management
- Never commit API keys or secrets to version control
- Use environment variables for configuration
- Rotate secrets regularly

#### Dependency Management
- Keep dependencies up to date
- Use `safety` to check for vulnerabilities
- Pin dependency versions in requirements.txt

## 🔄 Development Workflow

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test improvements

### Commit Messages
We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:
```
feat(validation): add enhanced API key validation with regex patterns

fix(rate_limiter): resolve race condition in token bucket implementation

docs(README): update deployment instructions for Kubernetes
```

### Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat(module): description of changes"
   ```

3. **Run tests and checks**
   ```bash
   pytest tests/ -v --cov=src
   python benchmarks/performance_benchmark.py
   pre-commit run --all-files
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   
   Then create a pull request on GitHub with:
   - Clear description of changes
   - Links to related issues
   - Screenshots for UI changes
   - Test results and performance impact

5. **PR Review Checklist**
   - [ ] Code follows style guidelines
   - [ ] Tests pass and coverage is maintained
   - [ ] Documentation is updated
   - [ ] No security vulnerabilities introduced
   - [ ] Performance impact is acceptable
   - [ ] Breaking changes are documented

## 🐛 Issue Reporting

### Bug Reports
Use the bug report template and include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment information (OS, Python version, dependencies)
- Relevant logs and error messages

### Feature Requests
Use the feature request template and include:
- Clear description of the feature
- Use cases and benefits
- Implementation suggestions
- Acceptance criteria

### Security Issues
For security vulnerabilities:
- **DO NOT** create public issues
- Email security@yourcompany.com
- Include detailed reproduction steps
- Provide proof of concept if applicable

## 📚 Resources

### Documentation
- [README.md](README.md) - Project overview and setup
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment instructions
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Architecture overview

### Tools and Libraries
- [Black](https://black.readthedocs.io/) - Code formatting
- [pytest](https://docs.pytest.org/) - Testing framework
- [pre-commit](https://pre-commit.com/) - Git hooks
- [Pydantic](https://pydantic-docs.helpmanual.io/) - Data validation
- [Docker](https://docs.docker.com/) - Containerization

### External APIs
- [OpenRouter API](https://openrouter.ai/docs) - Multi-LLM access

## 🤝 Community

### Code of Conduct
Be respectful, inclusive, and professional in all interactions. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

### Communication
- GitHub Issues for bug reports and feature requests
- GitHub Discussions for questions and ideas
- Pull Request reviews for code feedback

### Recognition
Contributors are recognized in:
- CONTRIBUTORS.md file
- Release notes
- Documentation credits

## 📄 License

By contributing to Ensemble AI, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Ensemble AI! Your efforts help make this project better for everyone. 🚀