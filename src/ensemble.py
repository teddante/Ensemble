import logging
from openai import OpenAI
import os
import datetime
import re
from pathlib import Path
from config import load_config
import asyncio  # Added import for asyncio

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initializes the OpenRouter client using configuration
# Returns an instance of the OpenAI client
def init_client(config):
    try:
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=config["OPENROUTER_API_KEY"],
        )
    except Exception as e:
        logging.exception("Failed to initialize client")
        raise

# New async helper function to fetch a single response
async def fetch_single_response(client, prompt, model):
    logging.info(f"Generating response from model: {model}...")
    try:
        completion = await asyncio.to_thread(client.chat.completions.create,
                                             model=model,
                                             messages=[{"role": "user", "content": prompt}])
        return completion.choices[0].message.content
    except Exception as e:
        logging.exception(f"Error generating response from model {model}")
        return f"Error: {e}"

# Updated function to fetch responses in parallel using asyncio
async def fetch_llm_responses(client, prompt, models):
    tasks = [asyncio.create_task(fetch_single_response(client, prompt, model)) for model in models]
    responses = await asyncio.gather(*tasks)
    return responses

# Combines individual LLM responses into a single prompt for refinement
# Adds context and instructions to merge the responses into a concise and direct answer
def combine_responses(prompt, models, responses):
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
    logging.info(f"Generating refined answer using model: {refinement_model}...")
    
    max_retries = 3
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries):
        try:
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
            logging.info("Successfully refined the response")
            return refined_content
            
        except Exception as e:
            logging.warning(f"Attempt {attempt + 1}/{max_retries} failed: {str(e)}")
            if attempt < max_retries - 1:
                logging.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                logging.error("All refinement attempts failed")
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
        
        return output_path
    except Exception as e:
        logging.exception("Error writing output to file")
        return None

# Updated main execution function to be asynchronous
async def main():
    try:
        config = load_config()
        client = init_client(config)
        models = config["MODELS"]

        # Check for a prompt file in the repository root
        prompt_file_path = os.path.join(os.path.dirname(__file__), "..", "prompt.txt")
        if os.path.exists(prompt_file_path):
            try:
                with open(prompt_file_path, "r", encoding="utf-8") as f:
                    prompt = f.read()
                logging.info(f"Using prompt from file: {prompt_file_path}")
            except Exception as e:
                logging.exception("Failed to read prompt file")
                prompt = ""
        elif config["PROMPT"]:
            prompt = config["PROMPT"]
        else:
            prompt = input("Enter your prompt: ")

        if not prompt:
            logging.error("No prompt provided. Exiting.")
            return

        # Fetch LLM responses in parallel
        llm_responses = await fetch_llm_responses(client, prompt, models)

        # Optionally log individual responses from each LLM
        print_individual_responses = False
        if print_individual_responses:
            logging.info("Responses from individual LLMs:")
            for i, response in enumerate(llm_responses):
                logging.info(f"Model {i+1} ({models[i]}): {response}")

        combined_prompt = combine_responses(prompt, models, llm_responses)
        refinement_model = config["REFINEMENT_MODEL_NAME"]
        refined_answer = await refine_response(client, combined_prompt, refinement_model)
        
        logging.info(f"Combined and Refined Answer (using {refinement_model}):")
        print(refined_answer)
        
        # Save the refined answer to a file
        output_path = write_output_to_file(refined_answer, prompt)
        if output_path:
            logging.info(f"Output saved to: {output_path}")
        else:
            logging.warning("Failed to save output to file")
            
    except Exception as ex:
        logging.exception("An error occurred in main execution")

if __name__ == '__main__':
    asyncio.run(main())  # Use asyncio.run to execute the async main