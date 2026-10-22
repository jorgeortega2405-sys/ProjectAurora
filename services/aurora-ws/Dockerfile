FROM rust:alpine AS builder

WORKDIR /usr/src/aurora-ws

RUN apk add --no-cache musl-dev

COPY Cargo.toml .
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

COPY src ./src
RUN cargo build --release

FROM alpine:latest

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=builder /usr/src/aurora-ws/target/release/aurora-ws /app/aurora-ws

ENV PORT=3001
ENV REDIS_URL=redis://redis:6379

EXPOSE 3001

CMD ["/app/aurora-ws"]
