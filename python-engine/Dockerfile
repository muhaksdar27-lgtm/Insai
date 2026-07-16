FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8181
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8181} --timeout-keep-alive 60"]
