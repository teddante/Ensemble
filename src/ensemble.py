from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()


client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)


# Read models from .env and parse the comma-separated string into a list
models_str = os.getenv("MODELS")
models = models_str.split(",") if models_str else []

llm_responses = []
prompt = os.getenv("PROMPT")

for model in models:
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )
    llm_responses.append(completion.choices[0].message.content)

print_individual_responses = False  # Set to False to hide individual responses
if print_individual_responses:
    print("Responses from individual LLMs:")
    for i, response in enumerate(llm_responses):
        print(f"Model {i+1} ({models[i]}): {response}")

# Combine responses and refine with another LLM
combined_prompt = "Here are the responses from different LLMs to the question: '{}'. Please combine these perspectives and provide a single, refined answer that is concise, direct and clear.\n\n".format(prompt)
for i, response in enumerate(llm_responses):
    combined_prompt += f"Model {i+1} Response ({models[i]}):\n{response}\n\n"

refinement_model_name =  os.getenv("REFINEMENT_MODEL_NAME")
refinement_completion = client.chat.completions.create(
    model=refinement_model_name,
    messages=[
        {
            "role": "user",
            "content": combined_prompt
        }
    ]
)
refined_answer = refinement_completion.choices[0].message.content
refinement_model = refinement_model_name
print(f"\nCombined and Refined Answer (using {refinement_model}):")
print(refined_answer)