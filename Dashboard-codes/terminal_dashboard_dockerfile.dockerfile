FROM python:3.11-slim
WORKDIR /app

# Install dependencies
RUN pip install httpx rich

# Copy the python script
COPY terminal_dashboard.py /app/dashboard.py

# Env vars fallback
ENV API_URL=http://api:8000
ENV STORE_ID=STORE_BLR_002

# Run dashboard natively via python
CMD ["python", "/app/dashboard.py"]