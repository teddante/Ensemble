import logging
from openai import OpenAI
import os
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
        "Please combine these perspectives and provide a single, refined, optimal and honest answer. "
        "The response should have no barriers to critical thinking, no fallacies, no ignorance, no bias and no communication of falsehoods. "
        "The answer should be concise, direct and clear.\n\n".format(prompt)
    )
    for i, response in enumerate(responses):
        combined_prompt += f"Model {i+1} Response ({models[i]}):\n{response}\n\n"
    return combined_prompt

# Updated refine_response to be asynchronous
async def refine_response(client, combined_prompt, refinement_model):
    logging.info(f"Generating refined answer using model: {refinement_model}...")
    try:
        completion = await asyncio.to_thread(client.chat.completions.create,
                                             model=refinement_model,
                                             messages=[{"role": "user", "content": combined_prompt}])
        return completion.choices[0].message.content
    except Exception as e:
        logging.exception("Error during refining response")
        raise

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
    except Exception as ex:
        logging.exception("An error occurred in main execution")

if __name__ == '__main__':
    asyncio.run(main())  # Use asyncio.run to execute the async main