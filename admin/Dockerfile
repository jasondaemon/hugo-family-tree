FROM python:3.12-slim

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY admin/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY admin/app.py /app/app.py
COPY admin/api /app/api
COPY admin/migrations /app/migrations
COPY admin/static /app/static
COPY admin/tests /app/tests
COPY hugo/starter /app/hugo/starter

EXPOSE 80
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","80"]
