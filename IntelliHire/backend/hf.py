import os

from dotenv import load_dotenv
from huggingface_hub import InferenceClient


load_dotenv()

token = os.getenv("HUGGINGFACEHUB_API_TOKEN")

if not token:
    raise ValueError("HUGGINGFACEHUB_API_TOKEN is missing")


client = InferenceClient(
    api_key=token
)


models = [
    "meta-llama/Llama-3.2-3B-Instruct",
    "google/gemma-2-2b-it",
    "Qwen/Qwen3-4B-Thinking-2507",
]


for model in models:

    print("\n==============================")
    print("Testing:", model)
    print("==============================")

    try:

        response = client.chat_completion(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": "Return exactly: Hello IntelliHire"
                }
            ],
            max_tokens=50,
            temperature=0.1,
        )

        print("SUCCESS")
        print(response.choices[0].message.content)

    except Exception as e:

        print("FAILED")
        print(type(e).__name__)
        print(e)