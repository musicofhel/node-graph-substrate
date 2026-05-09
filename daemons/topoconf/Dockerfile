FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake build-essential git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

RUN pip install --no-cache-dir -e /topo-confidence

COPY . .

CMD ["python", "topoconf_daemon.py"]
