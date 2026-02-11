FROM python:3.12-slim

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py
COPY api /app/api
COPY migrations /app/migrations
COPY static /app/static
COPY tests /app/tests

EXPOSE 80
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","80"]
