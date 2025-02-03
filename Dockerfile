# Use Python 3.11 as base image
FROM python:3.11

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_NO_CACHE_DIR=1

# Create application user
RUN groupadd -r mediamirror && useradd -m --no-log-init -r -g mediamirror mediamirror

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget build-essential python3-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip

# Make logs directory
RUN mkdir /logs \
    && chown -R mediamirror:mediamirror /logs

# User operations
USER mediamirror
ENV PATH="/home/mediamirror/.local/bin:${PATH}"

# Copy Flask app files
WORKDIR /app
COPY --chown=mediamirror:mediamirror . .

# Install Python requirements
RUN pip install --upgrade pip \
    && pip install --user -r requirements.txt

# Expose ports
EXPOSE 5000

# Start Flask app
CMD ["flask", "--app", "/app/mediamirror/app.py", "run"]
