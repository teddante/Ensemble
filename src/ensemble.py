from openai import OpenAI
import os
from config import load_config

# Initializes the OpenRouter client using configuration
# Returns an instance of the OpenAI client
def init_client(config):
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=config["OPENROUTER_API_KEY"],
    )

# Fetches responses from each LLM model specified in the configuration
# Iterates through the models, sends the prompt, and collects each response
def fetch_llm_responses(client, prompt, models):
    responses = []
    for model in models:
        print(f"Generating response from model: {model}...")
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        responses.append(completion.choices[0].message.content)
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

# Refines the combined prompt using a designated LLM model to produce the final answer
def refine_response(client, combined_prompt, refinement_model):
    print(f"Generating refined answer using model: {refinement_model}...")
    completion = client.chat.completions.create(
        model=refinement_model,
        messages=[{"role": "user", "content": combined_prompt}],
    )
    return completion.choices[0].message.content

# Main execution function
# Loads configuration, initiates clients, fetches and refines responses, and prints the final answer
def main():
    config = load_config()
    client = init_client(config)
    models = config["MODELS"]
    prompt = config["PROMPT"] or input("Enter your prompt: ")
    
    llm_responses = fetch_llm_responses(client, prompt, models)

    # Optionally print individual responses from each LLM
    print_individual_responses = False
    if print_individual_responses:
        print("Responses from individual LLMs:")
        for i, response in enumerate(llm_responses):
            print(f"Model {i+1} ({models[i]}): {response}")

    combined_prompt = combine_responses(prompt, models, llm_responses)
    refinement_model = config["REFINEMENT_MODEL_NAME"]
    refined_answer = refine_response(client, combined_prompt, refinement_model)
    
    print(f"\nCombined and Refined Answer (using {refinement_model}):")
    print(refined_answer)

if __name__ == '__main__':
    main()