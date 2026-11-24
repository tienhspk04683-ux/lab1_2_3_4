FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLASK_HOST=0.0.0.0 FLASK_PORT=8000 FLASK_DEBUG=false
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
COPY templates ./templates
COPY static ./static
EXPOSE 8000
CMD ["sh","-c","gunicorn --bind 0.0.0.0:${FLASK_PORT:-8000} --workers 2 --threads 4 --timeout 60 app:app"]
