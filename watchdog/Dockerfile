FROM python:3.12-alpine
WORKDIR /app
COPY watchdog.py .
RUN adduser -D -u 10001 wd
USER wd
EXPOSE 9100
# -u: stdout sem buffer, para os logs aparecerem na hora em `docker compose logs`
CMD ["python", "-u", "watchdog.py"]
