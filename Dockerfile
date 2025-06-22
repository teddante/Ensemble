# Multi-stage Docker build for Ensemble AI Application
FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Create app user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Development stage
FROM base as development

# Install development dependencies
RUN pip install pytest pytest-cov pytest-asyncio black flake8 mypy

# Copy source code
COPY . .

# Change ownership to app user
RUN chown -R appuser:appuser /app
USER appuser

# Expose port for development
EXPOSE 8000

# Development command
CMD ["python", "src/ensemble.py"]

# Production stage
FROM base as production

# Copy only necessary files
COPY src/ ./src/
COPY default.env .
COPY LICENSE .
COPY README.md .

# Create output directory
RUN mkdir -p output && chown -R appuser:appuser /app

# Change to app user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import asyncio; from src.health_check import run_health_check; \
    result = asyncio.run(run_health_check()); \
    exit(0 if result['status'] != 'unhealthy' else 1)"

# Production command
CMD ["python", "src/ensemble.py"]

# Test stage
FROM development as test

# Run tests
RUN python -m pytest tests/ -v --cov=src --cov-report=term-missing

# Production build
FROM production as final