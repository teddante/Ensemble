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
]

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

print("Responses from individual LLMs:")
for i, response in enumerate(llm_responses):
    print(f"Model {i+1} ({models[i]}): {response}")

# Combine responses and refine with another LLM
combined_prompt = "Here are the responses from different LLMs to the question: '{}'. Please combine these perspectives and provide a single, refined answer.\n\n".format(prompt)
for i, response in enumerate(llm_responses):
    combined_prompt += f"Model {i+1} Response ({models[i]}):\n{response}\n\n"

refinement_completion = client.chat.completions.create(
    model="anthropic/claude-2", # Using Claude-2 for refinement
    messages=[
        {
            "role": "user",
            "content": combined_prompt
        }
    ]
)
refined_answer = refinement_completion.choices[0].message.content
print("\nCombined and Refined Answer (using anthropic/claude-2):")
print(refined_answer)