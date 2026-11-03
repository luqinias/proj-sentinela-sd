# Imagens com versão fixada (regra do enunciado: nada de "latest").
FROM rust:1.90-slim-bookworm AS build
WORKDIR /src
# 1) Cache de dependências: compila um main vazio só com Cargo.toml/Cargo.lock
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release --locked && rm -rf src
# 2) Código real
COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

FROM debian:bookworm-slim
# curl: usado pelo healthcheck do Docker (liveness) e para testes "de dentro da rede"
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 app
COPY --from=build /src/target/release/sentinel-app /usr/local/bin/sentinel-app
USER app
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/sentinel-app"]
