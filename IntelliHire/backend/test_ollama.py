from langchain_ollama import ChatOllama

llm = ChatOllama(
    model="qwen3:4b",
    temperature=0
)

response = llm.invoke(
    'Return ONLY valid JSON. Do not use markdown. '
    '{"name":"Mahmoud","skills":["Python","SQL","Power BI"]}'
)

print("========== RESPONSE ==========")
print(response.content)
print("==============================")