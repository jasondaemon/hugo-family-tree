FROM hugomods/hugo:0.124.1 as hugo

FROM python:3.12-alpine
RUN apk add --no-cache rsync libstdc++ libgcc
COPY --from=hugo /usr/bin/hugo /usr/local/bin/hugo

WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn

COPY app.py /app/app.py
EXPOSE 19000
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","19000"]
