from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()


client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)


models = [
    "deepseek/deepseek-r1-distill-llama-70b",
    "deepseek/deepseek-r1-distill-llama-70b",
    "deepseek/deepseek-r1-distill-llama-70b"
]  # Allows users to modify models here

llm_responses = []
prompt = "What is the meaning of life?"

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

print_individual_responses = True  # Set to False to hide individual responses
if print_individual_responses:
    print("Responses from individual LLMs:")
    for i, response in enumerate(llm_responses):
        print(f"Model {i+1} ({models[i]}): {response}")

# Combine responses and refine with another LLM
combined_prompt = "Here are the responses from different LLMs to the question: '{}'. Please combine these perspectives and provide a single, refined answer.\n\n".format(prompt)
for i, response in enumerate(llm_responses):
    combined_prompt += f"Model {i+1} Response ({models[i]}):\n{response}\n\n"

refinement_completion = client.chat.completions.create(
    model="deepseek/deepseek-r1-distill-llama-70b",
    messages=[
        {
            "role": "user",
            "content": combined_prompt
        }
    ]
)
refined_answer = refinement_completion.choices[0].message.content
print("\nCombined and Refined Answer (using deepseek/deepseek-r1-distill-llama-70b):")
print(refined_answer)