import logging
from openai import OpenAI
import os
import datetime
import re
import time
from pathlib import Path
from config import load_config
import asyncio  # Added import for asyncio

# Setup enhanced logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)
def log_with_preview(logger, message, text, max_length=150):
    preview = get_text_preview(text, max_length)
    logger.info(f"{message}: {preview}")

# Helper function to get a preview of text with a specified max length
def get_text_preview(text, max_length=150):
    """Returns a preview of the text with specified maximum length."""
    if not text:
        return "Empty response"
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."

# Initializes the OpenRouter client using configuration
# Returns an instance of the OpenAI client
def init_client(config):
    logger.info("Initializing OpenRouter client")
    try:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=config["OPENROUTER_API_KEY"],
        )
        
        return client
    except Exception as e:
        logger.exception("Failed to initialize client: %s", str(e))
        raise

# New async helper function to fetch a single response
async def fetch_single_response(client, prompt, model):
    start_time = time.time()
    logger.info(f"Starting request to model: {model}")
    
    
    try:
        completion = await asyncio.to_thread(client.chat.completions.create,
                                             model=model,
                                             messages=[{"role": "user", "content": prompt}])
        
        response_time = time.time() - start_time
        response_content = completion.choices[0].message.content
        preview = get_text_preview(response_content)
        
        logger.info(f"Response received from {model} in {response_time:.2f} seconds")
        log_with_preview(logger, f"Preview from {model}", response_content)
        
        
        return response_content
    except Exception as e:
        response_time = time.time() - start_time
        logger.exception(f"Error generating response from model {model} after {response_time:.2f} seconds: {str(e)}")
        return f"Error: {e}"

# Updated function to fetch responses in parallel using asyncio
async def fetch_llm_responses(client, prompt, models):
    logger.info(f"Fetching responses from {len(models)} models in parallel")
    start_time = time.time()
    
    tasks = [asyncio.create_task(fetch_single_response(client, prompt, model)) for model in models]
    responses = await asyncio.gather(*tasks)
    
    total_time = time.time() - start_time
    logger.info(f"All model responses collected in {total_time:.2f} seconds")
    
    # Log response lengths
    for i, (model, response) in enumerate(zip(models, responses)):
        if response.startswith("Error:"):
            logger.warning(f"Model {model} returned an error")
        else:
            logger.info(f"Model {model} returned {len(response)} characters")
    
    return responses

# Combines individual LLM responses into a single prompt for refinement
# Adds context and instructions to merge the responses into a concise and direct answer
def combine_responses(prompt, models, responses):
    logger.info("Combining responses for refinement")
    
    combined_prompt = (
        "Here are the responses from different LLMs to the prompt: '{0}'. "
        "Please combine these perspectives and provide a single, refined, optimal output based on the original prompt.\n\n".format(prompt)
    )
    
    for i, response in enumerate(responses):
        combined_prompt += f"Model {i+1} Response ({models[i]}):\n{response}\n\n"
    
    
    return combined_prompt

# Updated refine_response to be asynchronous
async def refine_response(client, combined_prompt, refinement_model):
    """
    Refines the combined responses from multiple LLMs into a single coherent answer.
    
    Args:
        client: The OpenAI client instance
        combined_prompt: The combined responses and original prompt
        refinement_model: The model ID to use for refining the response
        
    Returns:
        str: The refined response or an error message
    """
    logger.info(f"Starting refinement process using model: {refinement_model}")
    start_time = time.time()
    
    max_retries = 3
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Refinement attempt {attempt + 1}/{max_retries}")
            completion = await asyncio.to_thread(
                client.chat.completions.create,
                model=refinement_model,
                messages=[
                    {
                        "role": "system", 
                        "content": "You are a helpful assistant that synthesizes multiple AI responses into a single coherent, accurate, and comprehensive answer."
                    },
                    {
                        "role": "user", 
                        "content": combined_prompt
                    }
                ],
            )
            
            # Successfully got a response
            refined_content = completion.choices[0].message.content
            total_time = time.time() - start_time
            logger.info(f"Successfully refined the response in {total_time:.2f} seconds")
            preview = get_text_preview(refined_content)
            log_with_preview(logger, "Refined response preview", refined_content)
            logger.debug(f"Refined response length: {len(refined_content)} characters")
            return refined_content
            
        except Exception as e:
            attempt_time = time.time() - start_time
            logger.warning(f"Refinement attempt {attempt + 1}/{max_retries} failed after {attempt_time:.2f} seconds: {str(e)}")
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logger.error(f"All refinement attempts failed after {time.time() - start_time:.2f} seconds total")
                raise Exception(f"Failed to refine responses after {max_retries} attempts: {str(e)}")

# Creates the output directory if it doesn't exist
def ensure_output_directory():
    
    output_dir = Path(os.path.dirname(__file__), "..", "output")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    return output_dir

# Generates an appropriate filename for the output file
def generate_filename(prompt):
    
    # Get current date and time
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    
    # Sanitize and truncate the prompt for the filename
    # Remove special characters and replace spaces with hyphens
    sanitized_prompt = re.sub(r'[^\w\s-]', '', prompt.lower())
    sanitized_prompt = re.sub(r'[\s]+', '-', sanitized_prompt).strip('-')
    
    # Truncate to first few words (max 30 characters)
    if len(sanitized_prompt) > 30:
        
        sanitized_prompt = sanitized_prompt[:30]
    
    # Create filename with timestamp and sanitized prompt
    filename = f"{timestamp}_{sanitized_prompt}.txt"
    
    return filename

# Writes the refined answer to a file in the output directory
def write_output_to_file(refined_answer, prompt):
    logger.info("Writing output to file")
    try:
        # Ensure output directory exists
        output_dir = ensure_output_directory()
        
        # Generate filename
        filename = generate_filename(prompt)
        
        # Create full path
        output_path = output_dir / filename
        
        # Write content to file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(refined_answer)
        
        logger.info(f"Successfully wrote {len(refined_answer)} characters to file: {output_path}")
        return output_path
    except Exception as e:
        logger.exception(f"Error writing output to file: {str(e)}")
        return None

# Function to get the prompt from file, config, or user input
def get_prompt(config):
    """
    Get the prompt from one of three sources in order of priority:
    1. From prompt.txt file in repository root
    2. From configuration
    3. From user input
    
    Args:
        config: The loaded configuration dictionary
        
    Returns:
        str: The prompt text or empty string if no prompt could be obtained
    """
    logger.info("Acquiring prompt")
    
    # Check for a prompt file in the repository root
    prompt_file_path = os.path.join(os.path.dirname(__file__), "..", "prompt.txt")
    
    if os.path.exists(prompt_file_path):
        try:
            with open(prompt_file_path, "r", encoding="utf-8") as f:
                prompt = f.read()
            log_with_preview(logger, f"Using prompt from file: {prompt_file_path} ({len(prompt)} characters)", prompt)
            log_with_preview(logger, "Prompt preview", prompt)
            return prompt
        except Exception as e:
            logger.exception(f"Failed to read prompt file: {str(e)}")
            # Fall through to next method if file reading fails
    
    if config.get("PROMPT"):
        prompt = config["PROMPT"]
        log_with_preview(logger, f"Using prompt from configuration ({len(prompt)} characters)", prompt)
        log_with_preview(logger, "Prompt preview", prompt)
        return prompt
    
    # If we get here, no prompt was found in file or config, ask the user
    logger.info("No prompt found in file or config, requesting from user")
    prompt = input("Enter your prompt: ")
    log_with_preview(logger, f"Prompt entered by user ({len(prompt)} characters)", prompt)
    log_with_preview(logger, "Prompt preview", prompt)
    return prompt

# Updated main execution function to be asynchronous
async def main():
    start_time = time.time()
    logger.info("Starting Ensemble AI processing")
    
    try:
        logger.info("Loading configuration")
        config = load_config()
        logger.info(f"Configuration loaded with {len(config)} parameters")
        logger.info(f"Using models: {config['MODELS']}")
        
        client = init_client(config)
        models = config["MODELS"]

        prompt = get_prompt(config)

        if not prompt:
            logger.error("No prompt provided. Exiting.")
            return

        logger.info(f"Working with prompt: {prompt[:100]}..." if len(prompt) > 100 else prompt)
        
        # Fetch LLM responses in parallel
        logger.info("Fetching responses from LLMs")
        llm_responses = await fetch_llm_responses(client, prompt, models)

        # Optionally log individual responses from each LLM
        print_individual_responses = False
        if print_individual_responses:
            logger.info("Responses from individual LLMs:")
            for i, response in enumerate(llm_responses):
                logger.info(f"Model {i+1} ({models[i]}): {response[:100]}...")

        logger.info("Creating combined prompt for refinement")
        combined_prompt = combine_responses(prompt, models, llm_responses)
        
        refinement_model = config["REFINEMENT_MODEL_NAME"]
        logger.info(f"Using {refinement_model} as refinement model")
        
        refined_answer = await refine_response(client, combined_prompt, refinement_model)
        
        logger.info(f"Refinement completed successfully")
        print(refined_answer)
        
        # Save the refined answer to a file
        output_path = write_output_to_file(refined_answer, prompt)
        if output_path:
            logger.info(f"Output saved to: {output_path}")
        else:
            logger.warning("Failed to save output to file")
        
        total_execution_time = time.time() - start_time
        logger.info(f"Ensemble processing completed in {total_execution_time:.2f} seconds")
            
    except Exception as ex:
        total_execution_time = time.time() - start_time
        logger.exception(f"An error occurred in main execution after {total_execution_time:.2f} seconds: {str(ex)}")

if __name__ == '__main__':
    logger.info("=== Starting Ensemble AI Application ===")
    try:
        asyncio.run(main())  # Use asyncio.run to execute the async main
        logger.info("=== Ensemble AI Application Completed Successfully ===")
    except Exception as e:
        logger.critical(f"=== Ensemble AI Application Failed: {str(e)} ===")