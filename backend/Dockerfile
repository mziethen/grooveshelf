FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home grooveshelf && mkdir /data && chown grooveshelf /data
COPY app ./app
USER grooveshelf
ENV GROOVESHELF_DATABASE=/data/grooveshelf.sqlite3
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
