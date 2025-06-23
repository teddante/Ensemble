from openai import OpenAI
import os
import datetime
import re
import time
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
import asyncio
from config import load_config
from validation import sanitize_prompt, PromptValidationError
from rate_limiter import get_rate_limiter, RateLimitConfig, configure_rate_limiter
from monitoring import get_performance_monitor, RequestMetrics, EnsembleMetrics
from logging_config import (
    setup_logging,
    get_logger,
    set_correlation_id,
    log_performance,
)
from error_handling import (
    handle_error,
    ErrorContext,
    AuthenticationError,
    NetworkError,
    APIError,
    ProcessingError,
    error_handler,
)

# Setup enhanced logging with environment-based configuration
setup_logging()
logger = get_logger(__name__)

# Configuration constants (will be overridden by config)
DEFAULT_TIMEOUT = 60  # seconds
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 2  # seconds


def log_with_preview(
    logger: logging.Logger, message: str, text: str, max_length: int = 150
) -> None:
    """Log a message with a preview of the text content."""
    preview = get_text_preview(text, max_length)
    logger.info(f"{message}: {preview}")


def get_text_preview(text: str, max_length: int = 150) -> str:
    """
    Return a preview of the text with specified maximum length.

    Args:
        text: The text to preview
        max_length: Maximum length of the preview

    Returns:
        str: Truncated text with ellipsis if needed
    """
    if not text:
        return "Empty response"
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."


# Initializes the OpenRouter client using configuration
# Returns an instance of the OpenAI client
@error_handler("client_initialization", "ensemble")
def init_client(config: Dict[str, Any]) -> OpenAI:
    """
    Initialize OpenRouter client with configuration.

    Args:
        config: Configuration dictionary containing API key and settings

    Returns:
        OpenAI: Configured OpenAI client instance

    Raises:
        AuthenticationError: If API key is missing or invalid
        NetworkError: If client initialization fails due to network issues
    """
    with log_performance("client_initialization"):
        logger.info("Initializing OpenRouter client")

        api_key = config.get("OPENROUTER_API_KEY")
        if not api_key or api_key.strip() == "":
            raise AuthenticationError(
                "OPENROUTER_API_KEY is required but not provided",
                context=ErrorContext(operation="client_init", component="ensemble"),
            )

        try:
            timeout = config.get("REQUEST_TIMEOUT", DEFAULT_TIMEOUT)
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
                timeout=timeout,
            )
            logger.info(f"Client initialized with timeout: {timeout}s")

            logger.info("OpenRouter client initialized successfully")
            return client
        except Exception as e:
            raise NetworkError(
                f"Failed to initialize OpenRouter client: {str(e)}",
                context=ErrorContext(operation="client_init", component="ensemble"),
            ) from e


class CircuitBreaker:
    """Simple circuit breaker implementation."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.state = "closed"  # closed, open, half-open

    def can_execute(self) -> bool:
        """Check if requests can be executed."""
        if self.state == "closed":
            return True
        elif self.state == "open":
            if (
                self.last_failure_time
                and time.time() - self.last_failure_time > self.recovery_timeout
            ):
                self.state = "half-open"
                return True
            return False
        else:  # half-open
            return True

    def record_success(self) -> None:
        """Record successful execution."""
        self.failure_count = 0
        self.state = "closed"

    def record_failure(self) -> None:
        """Record failed execution."""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold:
            self.state = "open"


# Global circuit breakers for each model
_circuit_breakers: Dict[str, CircuitBreaker] = {}


def get_circuit_breaker(model: str) -> CircuitBreaker:
    """Get or create circuit breaker for model."""
    if model not in _circuit_breakers:
        _circuit_breakers[model] = CircuitBreaker()
    return _circuit_breakers[model]


async def fetch_single_response(
    client: OpenAI,
    prompt: str,
    model: str,
    timeout: float = DEFAULT_TIMEOUT,
    request_metrics: Optional[RequestMetrics] = None,
) -> str:
    """
    Fetch a single response from a model with rate limiting, circuit breaker, and retries.

    Args:
        client: OpenAI client instance
        prompt: The prompt to send to the model
        model: Model identifier
        timeout: Request timeout in seconds
        request_metrics: Optional RequestMetrics instance for monitoring

    Returns:
        str: Model response or error message
    """
    start_time = time.time()
    logger.info(f"Starting request to model: {model}")

    # Initialize request metrics if not provided
    if request_metrics is None:
        monitor = get_performance_monitor()
        request_metrics = monitor.start_request(model)

    # Check circuit breaker
    circuit_breaker = get_circuit_breaker(model)
    if not circuit_breaker.can_execute():
        error_msg = f"Circuit breaker open for model {model}"
        logger.warning(error_msg)

        # Record failure in metrics
        monitor = get_performance_monitor()
        monitor.finish_request(request_metrics, False, 0, error_msg)

        return f"Error: {error_msg}"

    # Apply rate limiting
    rate_limiter = get_rate_limiter()
    try:
        await rate_limiter.acquire(model)
    except Exception as e:
        error_msg = f"Rate limiting failed - {e}"
        logger.error(f"Rate limiting error for {model}: {e}")

        # Record failure in metrics
        monitor = get_performance_monitor()
        monitor.finish_request(request_metrics, False, 0, error_msg)

        return f"Error: {error_msg}"

    # Attempt request with retries
    for attempt in range(DEFAULT_MAX_RETRIES):
        try:
            logger.debug(
                f"Attempt {attempt + 1}/{DEFAULT_MAX_RETRIES} for model {model}"
            )

            # Create completion with timeout
            completion = await asyncio.wait_for(
                asyncio.to_thread(
                    client.chat.completions.create,
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=timeout,
                ),
                timeout=timeout + 5,  # Add buffer for asyncio timeout
            )

            response_time = time.time() - start_time
            response_content = completion.choices[0].message.content

            if not response_content:
                raise ValueError("Empty response received from model")

            logger.info(
                f"Response received from {model} in {response_time:.2f} seconds"
            )
            log_with_preview(logger, f"Preview from {model}", response_content)

            # Record success
            rate_limiter.record_success(model)
            circuit_breaker.record_success()

            # Record success in metrics
            monitor = get_performance_monitor()
            monitor.finish_request(request_metrics, True, len(response_content))

            return response_content

        except asyncio.TimeoutError:
            response_time = time.time() - start_time
            error_msg = f"Timeout after {response_time:.2f} seconds"
            logger.warning(f"Request timeout for model {model}: {error_msg}")

            if attempt < DEFAULT_MAX_RETRIES - 1:
                await asyncio.sleep(DEFAULT_RETRY_DELAY * (2**attempt))
                continue
            else:
                rate_limiter.record_failure(model)
                circuit_breaker.record_failure()

                # Record failure in metrics
                monitor = get_performance_monitor()
                monitor.finish_request(request_metrics, False, 0, error_msg)

                return f"Error: {error_msg}"

        except Exception as e:
            response_time = time.time() - start_time
            error_msg = str(e)
            logger.warning(
                f"Error from model {model} after {response_time:.2f} seconds (attempt {attempt + 1}): {error_msg}"
            )

            # Check if error is retryable
            if "rate limit" in error_msg.lower() or "timeout" in error_msg.lower():
                if attempt < DEFAULT_MAX_RETRIES - 1:
                    wait_time = DEFAULT_RETRY_DELAY * (2**attempt)
                    logger.info(f"Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                    continue

            # Record failure
            rate_limiter.record_failure(model)
            circuit_breaker.record_failure()

            if attempt == DEFAULT_MAX_RETRIES - 1:
                # Record final failure in metrics
                monitor = get_performance_monitor()
                monitor.finish_request(request_metrics, False, 0, error_msg)

                return f"Error: {error_msg}"

    # Record final failure for max retries exceeded
    monitor = get_performance_monitor()
    monitor.finish_request(request_metrics, False, 0, "Max retries exceeded")

    return "Error: Max retries exceeded"


async def fetch_llm_responses(
    client: OpenAI, prompt: str, models: List[str]
) -> List[str]:
    """
    Fetch responses from multiple models in parallel with graceful degradation.

    Args:
        client: OpenAI client instance
        prompt: The prompt to send to all models
        models: List of model identifiers

    Returns:
        List[str]: List of responses (or error messages) from models
    """
    logger.info(f"Fetching responses from {len(models)} models in parallel")
    start_time = time.time()

    # Sanitize prompt
    try:
        sanitized_prompt = sanitize_prompt(prompt)
        logger.debug("Prompt sanitized successfully")
    except PromptValidationError as e:
        logger.error(f"Prompt validation failed: {e}")
        return [f"Error: Invalid prompt - {e}" for _ in models]

    # Create monitoring for each model request
    monitor = get_performance_monitor()
    request_metrics_list = [monitor.start_request(model) for model in models]

    # Create tasks for parallel execution with metrics
    tasks = [
        asyncio.create_task(
            fetch_single_response(
                client, sanitized_prompt, model, DEFAULT_TIMEOUT, metrics
            )
        )
        for model, metrics in zip(models, request_metrics_list)
    ]

    # Execute all tasks and collect results
    responses = await asyncio.gather(*tasks, return_exceptions=True)

    total_time = time.time() - start_time
    logger.info(f"All model responses collected in {total_time:.2f} seconds")

    # Process responses and handle exceptions
    processed_responses = []
    successful_responses = 0

    for i, (model, response) in enumerate(zip(models, responses)):
        if isinstance(response, Exception):
            error_msg = f"Error: Exception in {model} - {str(response)}"
            logger.error(error_msg)
            processed_responses.append(error_msg)
        elif isinstance(response, str) and response.startswith("Error:"):
            logger.warning(f"Model {model} returned an error: {response}")
            processed_responses.append(response)
        else:
            logger.info(f"Model {model} returned {len(response)} characters")
            processed_responses.append(response)
            successful_responses += 1

    # Check if we have enough successful responses
    if successful_responses == 0:
        logger.error("No models returned successful responses")
        raise Exception("All models failed to generate responses")
    elif successful_responses < len(models) * 0.5:  # Less than 50% success
        logger.warning(f"Only {successful_responses}/{len(models)} models succeeded")

    logger.info(
        f"Successfully collected {successful_responses}/{len(models)} responses"
    )
    return processed_responses


def combine_responses(prompt: str, models: List[str], responses: List[str]) -> str:
    """
    Combine individual LLM responses into a single prompt for refinement.
    Filters out error responses and includes only successful responses.

    Args:
        prompt: Original prompt
        models: List of model identifiers
        responses: List of responses (may include errors)

    Returns:
        str: Combined prompt for refinement
    """
    logger.info("Combining responses for refinement")

    # Filter out error responses
    valid_responses = []
    valid_models = []

    for i, (model, response) in enumerate(zip(models, responses)):
        if not response.startswith("Error:"):
            valid_responses.append(response)
            valid_models.append(model)
        else:
            logger.debug(f"Excluding error response from {model}")

    if not valid_responses:
        logger.error("No valid responses to combine")
        raise ValueError("No valid responses available for refinement")

    logger.info(
        f"Combining {len(valid_responses)} valid responses from {len(valid_models)} models"
    )

    combined_prompt = (
        f"Here are responses from {len(valid_responses)} different LLMs to the prompt: '{prompt}'. "
        "Please analyze these perspectives and provide a single, refined, optimal response that "
        "synthesizes the best elements from each while maintaining accuracy and coherence.\n\n"
        "Original Prompt:\n"
        f"{prompt}\n\n"
        "Responses to synthesize:\n\n"
    )

    for i, (model, response) in enumerate(zip(valid_models, valid_responses)):
        combined_prompt += f"Response {i+1} (from {model}):\n{response}\n\n"

    combined_prompt += (
        "Please provide a comprehensive response that combines the best insights from the above responses. "
        "Focus on accuracy, completeness, and clarity."
    )

    logger.debug(f"Combined prompt length: {len(combined_prompt)} characters")
    return combined_prompt


async def refine_response(
    client: OpenAI, combined_prompt: str, refinement_model: str
) -> str:
    """
    Refine the combined responses from multiple LLMs into a single coherent answer.

    Args:
        client: The OpenAI client instance
        combined_prompt: The combined responses and original prompt
        refinement_model: The model ID to use for refining the response

    Returns:
        str: The refined response

    Raises:
        Exception: If refinement fails after all retries
    """
    logger.info(f"Starting refinement process using model: {refinement_model}")

    # Use the same robust mechanism as other model calls
    try:
        refined_response = await fetch_single_response(
            client,
            combined_prompt,
            refinement_model,
            timeout=DEFAULT_TIMEOUT * 2,  # Give refinement more time
        )

        if refined_response.startswith("Error:"):
            raise Exception(f"Refinement failed: {refined_response}")

        logger.info("Successfully refined the response")
        log_with_preview(logger, "Refined response preview", refined_response)
        logger.debug(f"Refined response length: {len(refined_response)} characters")

        return refined_response

    except Exception as e:
        logger.error(f"Refinement process failed: {str(e)}")
        raise Exception(f"Failed to refine responses: {str(e)}")


def ensure_output_directory() -> Path:
    """
    Create the output directory if it doesn't exist.

    Returns:
        Path: Path to the output directory
    """
    output_dir = Path(os.path.dirname(__file__), "..", "output")
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def generate_filename(prompt: str) -> str:
    """
    Generate an appropriate filename for the output file.

    Args:
        prompt: The original prompt to base filename on

    Returns:
        str: Generated filename with timestamp and sanitized prompt
    """
    # Get current date and time
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    # Sanitize and truncate the prompt for the filename
    sanitized_prompt = re.sub(r"[^\w\s-]", "", prompt.lower())
    sanitized_prompt = re.sub(r"[\s]+", "-", sanitized_prompt).strip("-")

    # Truncate to reasonable length (max 30 characters)
    if len(sanitized_prompt) > 30:
        sanitized_prompt = sanitized_prompt[:30]

    # Create filename with timestamp and sanitized prompt
    filename = f"{timestamp}_{sanitized_prompt}.txt"
    return filename


def write_output_to_file(refined_answer: str, prompt: str) -> Optional[Path]:
    """
    Write the refined answer to a file in the output directory.

    Args:
        refined_answer: The refined response to write
        prompt: The original prompt (used for filename generation)

    Returns:
        Optional[Path]: Path to the output file if successful, None otherwise
    """
    logger.info("Writing output to file")
    try:
        # Ensure output directory exists
        output_dir = ensure_output_directory()

        # Generate filename
        filename = generate_filename(prompt)

        # Create full path
        output_path = output_dir / filename

        # Write content to file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(refined_answer)

        logger.info(
            f"Successfully wrote {len(refined_answer)} characters to file: {output_path}"
        )
        return output_path
    except Exception as e:
        logger.exception(f"Error writing output to file: {str(e)}")
        return None


def get_prompt(config: Dict[str, Any]) -> str:
    """
    Get the prompt from one of three sources in order of priority:
    1. From prompt.txt file in repository root
    2. From configuration
    3. From user input

    Args:
        config: The loaded configuration dictionary

    Returns:
        str: The validated prompt text

    Raises:
        PromptValidationError: If prompt validation fails
    """
    logger.info("Acquiring prompt")

    prompt = None

    # Check for a prompt file in the repository root
    prompt_file_path = os.path.join(os.path.dirname(__file__), "..", "prompt.txt")

    if os.path.exists(prompt_file_path):
        try:
            with open(prompt_file_path, "r", encoding="utf-8") as f:
                prompt = f.read().strip()
            logger.info(
                f"Prompt loaded from file: {prompt_file_path} ({len(prompt)} characters)"
            )
        except Exception as e:
            logger.warning(f"Failed to read prompt file: {str(e)}")
            # Fall through to next method if file reading fails

    # Try configuration if file didn't work
    if not prompt and config.get("PROMPT"):
        prompt = config["PROMPT"].strip()
        logger.info(f"Using prompt from configuration ({len(prompt)} characters)")

    # Ask user if no prompt found
    if not prompt:
        logger.info("No prompt found in file or config, requesting from user")
        while not prompt:
            try:
                prompt = input("Enter your prompt: ").strip()
                if not prompt:
                    print("Prompt cannot be empty. Please try again.")
                    continue
            except KeyboardInterrupt:
                logger.info("User cancelled prompt input")
                raise Exception("Prompt input cancelled by user")
            except Exception as e:
                logger.error(f"Error reading user input: {e}")
                raise Exception(f"Failed to get prompt from user: {e}")

    # Validate the prompt
    try:
        validated_prompt = sanitize_prompt(prompt)
        log_with_preview(logger, "Validated prompt preview", validated_prompt)
        return validated_prompt
    except PromptValidationError as e:
        logger.error(f"Prompt validation failed: {e}")
        raise


async def main():
    """
    Main execution function for Ensemble AI processing.
    """
    # Set up correlation ID for this request
    correlation_id = set_correlation_id()
    start_time = time.time()

    logger.info(
        "=== Starting Ensemble AI processing ===",
        extra={"correlation_id": correlation_id, "operation": "ensemble_main"},
    )

    # Initialize performance monitoring
    monitor = get_performance_monitor()
    ensemble_metrics = None

    try:
        # Load and validate configuration
        logger.info("Loading configuration")
        config = load_config()
        logger.info(f"Configuration loaded with {len(config)} parameters")
        logger.info(f"Using models: {config.get('models', config.get('MODELS', []))}")

        # Configure rate limiting with values from config
        rate_limit_config = RateLimitConfig(
            requests_per_minute=config.get("RATE_LIMIT_PER_MINUTE", 30),
            requests_per_second=2,
            burst_limit=5,
        )
        configure_rate_limiter(rate_limit_config)
        logger.info(
            f"Rate limiting configured: {rate_limit_config.requests_per_minute} req/min"
        )

        # Initialize client
        client = init_client(config)
        models = config.get("models", config.get("MODELS", []))

        if not models:
            raise ValueError("No models configured. Please check your configuration.")

        # Get and validate prompt
        prompt = get_prompt(config)
        logger.info(
            f"Working with validated prompt: {prompt[:100]}..."
            if len(prompt) > 100
            else prompt
        )

        # Start ensemble metrics tracking
        ensemble_metrics = monitor.start_ensemble_operation(len(prompt))

        # Fetch LLM responses in parallel with error handling
        logger.info("Fetching responses from LLMs")
        try:
            llm_responses = await fetch_llm_responses(client, prompt, models)
        except Exception as e:
            logger.error(f"Failed to fetch responses from LLMs: {e}")
            raise Exception(f"Critical error: Unable to fetch any responses - {e}")

        # Create combined prompt for refinement
        logger.info("Creating combined prompt for refinement")
        try:
            combined_prompt = combine_responses(prompt, models, llm_responses)
        except ValueError as e:
            logger.error(f"No valid responses to combine: {e}")
            logger.info(
                "Attempting to use best available response without refinement..."
            )

            # Find the first non-error response
            for response in llm_responses:
                if not response.startswith("Error:"):
                    logger.info("Using single best response without refinement")
                    print(response)

                    # Save the response
                    output_path = write_output_to_file(response, prompt)
                    if output_path:
                        logger.info(f"Output saved to: {output_path}")

                    total_execution_time = time.time() - start_time
                    logger.info(
                        f"Ensemble processing completed (single response) in {total_execution_time:.2f} seconds"
                    )
                    return

            raise Exception("No usable responses available")

        # Refine the response
        refinement_model = config.get(
            "refinement_model_name", config.get("REFINEMENT_MODEL_NAME")
        )
        logger.info(f"Using {refinement_model} as refinement model")

        try:
            refined_answer = await refine_response(
                client, combined_prompt, refinement_model
            )
        except Exception as e:
            logger.error(f"Refinement failed: {e}")
            logger.info("Attempting to use combined responses without refinement...")

            # Use the combined responses directly
            valid_responses = [r for r in llm_responses if not r.startswith("Error:")]
            if valid_responses:
                refined_answer = "\n\n".join(valid_responses)
                logger.info("Using combined responses without AI refinement")
            else:
                raise Exception("No valid responses available for output")

        logger.info("Processing completed successfully")
        print("\n" + "=" * 50)
        print("ENSEMBLE RESPONSE:")
        print("=" * 50)
        print(refined_answer)
        print("=" * 50 + "\n")

        # Save the refined answer to a file
        output_path = write_output_to_file(refined_answer, prompt)
        if output_path:
            logger.info(f"Output saved to: {output_path}")
        else:
            logger.warning("Failed to save output to file")

        # Finish ensemble metrics tracking
        if ensemble_metrics:
            monitor.finish_ensemble_operation(
                ensemble_metrics, True, len(refined_answer)
            )

        # Log performance statistics
        rate_limiter = get_rate_limiter()
        rate_stats = rate_limiter.get_stats()
        if rate_stats:
            logger.info("Rate limiting statistics:")
            for model, model_stats in rate_stats.items():
                logger.info(f"  {model}: {model_stats}")

        # Log monitoring statistics
        perf_stats = monitor.get_ensemble_stats(recent_count=1)
        if perf_stats:
            logger.info(
                f"Performance: avg_duration={perf_stats.get('average_duration', 0):.2f}s"
            )

        total_execution_time = time.time() - start_time
        logger.info(
            f"=== Ensemble processing completed successfully in {total_execution_time:.2f} seconds ==="
        )

    except KeyboardInterrupt:
        logger.info("Processing interrupted by user")
        print("\nProcessing interrupted by user.")

    except Exception as ex:
        # Finish ensemble metrics tracking on failure
        if ensemble_metrics:
            monitor.finish_ensemble_operation(ensemble_metrics, False, 0)

        total_execution_time = time.time() - start_time
        logger.exception(
            f"Critical error in main execution after {total_execution_time:.2f} seconds: {str(ex)}"
        )
        print(f"\nError: {str(ex)}")
        print("Please check the logs for more details.")


if __name__ == "__main__":
    logger.info("=== Starting Ensemble AI Application ===")
    try:
        asyncio.run(main())  # Use asyncio.run to execute the async main
        logger.info("=== Ensemble AI Application Completed Successfully ===")
    except Exception as e:
        logger.critical(f"=== Ensemble AI Application Failed: {str(e)} ===")
