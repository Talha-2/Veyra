FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_DEFAULT_TIMEOUT=180 PIP_RETRIES=10

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY . .

# Pre-download Silero VAD + turn-detector weights — REQUIRED: the turn detector
# raises at call time if languages.json et al. are missing (it does not lazily
# fetch), which crashes the job the moment a caller connects.
#
# Deliberately NOT a --mount=type=cache here. A cache mount is scratch space for
# the build step and is never committed into the image, so weights downloaded
# into one vanish from the final layer and every call crashes. They must land in
# a real directory that becomes part of the image.
#
# Retry-with-timeout survives a flaky network without hanging (each attempt is
# capped and a hung one is killed), and the build fails loudly if all attempts
# are exhausted, rather than shipping an agent that cannot take a call.
ENV HF_HOME=/opt/models
RUN n=0; until timeout 300 python agent.py download-files; do \
      n=$((n+1)); \
      if [ "$n" -ge 5 ]; then echo "FATAL: could not download model weights"; exit 1; fi; \
      echo "download-files attempt $n timed out/failed — retrying…"; sleep 5; \
    done \
 && test -n "$(find /opt/models -name languages.json -print -quit)" \
    || { echo "FATAL: turn-detector weights missing after download"; exit 1; }

# production mode: registers with LiveKit and accepts jobs
CMD ["python", "agent.py", "start"]
