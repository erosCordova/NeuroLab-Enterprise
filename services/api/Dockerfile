FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app app
COPY migrations migrations
ENV PYTHONUNBUFFERED=1 COOKIE_SECURE=true
RUN useradd --create-home --uid 10001 neurolab
USER neurolab
EXPOSE 10000
CMD ["python", "-m", "app.serve"]
