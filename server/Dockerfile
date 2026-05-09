FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY substrate/ substrate/

EXPOSE 8080

CMD ["uvicorn", "substrate.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]
