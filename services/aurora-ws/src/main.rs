use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, RwLock};
use tokio::time::interval;
use tokio_tungstenite::tungstenite::protocol::Message;

type SubscriberMap = Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<String>>>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProgressBroadcast {
    #[serde(rename = "sessionId", default)]
    session_id: String,
    #[serde(default)]
    stage: String,
    #[serde(default)]
    percent: Option<u8>,
    #[serde(default)]
    message: String,
    #[serde(rename = "totalSteps", default)]
    total_steps: Option<usize>,
    #[serde(default)]
    step: Option<usize>,
    #[serde(default)]
    tool: Option<String>,
    #[serde(default)]
    result: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ClientCommand {
    #[serde(rename = "type")]
    cmd_type: String,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

async fn start_redis_listener(redis_url: String, subscribers: SubscriberMap) {
    tokio::spawn(async move {
        let channel_name = "aurora:ai:progress";
        println!("[Aurora WS] Iniciando listener Redis en {} (canal: {})...", redis_url, channel_name);
        loop {
            match redis::Client::open(redis_url.as_str()) {
                Ok(client) => match client.get_async_pubsub().await {
                    Ok(mut pubsub) => {
                        println!("[Aurora WS] Conexión PubSub con Redis establecida exitosamente.");
                        if let Err(e) = pubsub.subscribe(channel_name).await {
                            eprintln!("[Aurora WS] Error al suscribirse a canal {}: {}", channel_name, e);
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            continue;
                        }
                        let mut msg_stream = pubsub.on_message();
                        while let Some(msg) = msg_stream.next().await {
                            let payload: String = match msg.get_payload() {
                                Ok(p) => p,
                                Err(_) => continue,
                            };
                            let parsed: Result<ProgressBroadcast, _> = serde_json::from_str(&payload);
                            if let Ok(event) = parsed {
                                if !event.session_id.is_empty() {
                                    let mut subs = subscribers.write().await;
                                    if let Some(senders) = subs.get_mut(&event.session_id) {
                                        senders.retain(|tx| tx.send(payload.clone()).is_ok());
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Aurora WS] Error al conectar PubSub con Redis: {}", e);
                        tokio::time::sleep(Duration::from_secs(2)).await;
                    }
                },
                Err(e) => {
                    eprintln!("[Aurora WS] Error al instanciar cliente Redis: {}", e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    });
}

fn extract_session_id_from_path(path_and_query: &str) -> Option<String> {
    if let Some(pos) = path_and_query.find('?') {
        let query = &path_and_query[pos + 1..];
        for pair in query.split('&') {
            let mut parts = pair.split('=');
            if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                if k == "sessionId" || k == "session" {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

async fn handle_connection(mut stream: TcpStream, addr: SocketAddr, subscribers: SubscriberMap) {
    let mut peek_buf = [0u8; 1024];
    let n = match stream.peek(&mut peek_buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let peek_str = String::from_utf8_lossy(&peek_buf[..n]);

    if peek_str.starts_with("GET /health") {
        let mut discard = [0u8; 1024];
        let _ = stream.read(&mut discard).await;
        let body = r#"{"status":"ok","service":"aurora-ws","runtime":"rust"}"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.flush().await;
        return;
    }

    let initial_session_id = {
        let mut session = None;
        for line in peek_str.lines() {
            if line.starts_with("GET ") {
                if let Some(uri) = line.split_whitespace().nth(1) {
                    session = extract_session_id_from_path(uri);
                }
                break;
            }
        }
        session
    };

    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[Aurora WS] Error en handshake WebSocket desde {}: {}", addr, e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let mut current_session_id = initial_session_id.clone();
    if let Some(ref sid) = current_session_id {
        let mut subs = subscribers.write().await;
        subs.entry(sid.clone()).or_default().push(tx.clone());
    }

    let welcome_msg = serde_json::json!({
        "stage": "ws_connected",
        "sessionId": current_session_id,
        "runtime": "rust",
        "message": "Conexión WebSocket activa (ProjectAurora Rust Core)"
    })
    .to_string();

    let _ = ws_sender.send(Message::Text(welcome_msg)).await;

    let mut ping_interval = interval(Duration::from_secs(25));

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if ws_sender.send(Message::Ping(vec![])).await.is_err() {
                    break;
                }
            }
            msg = rx.recv() => {
                match msg {
                    Some(text) => {
                        if ws_sender.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            client_msg = ws_receiver.next() => {
                match client_msg {
                    Some(Ok(Message::Text(raw_text))) => {
                        if let Ok(cmd) = serde_json::from_str::<ClientCommand>(&raw_text) {
                            if cmd.cmd_type == "subscribe" {
                                if let Some(sid) = cmd.session_id {
                                    if !sid.is_empty() {
                                        current_session_id = Some(sid.clone());
                                        let mut subs = subscribers.write().await;
                                        subs.entry(sid.clone()).or_default().push(tx.clone());
                                        let ack = serde_json::json!({
                                            "stage": "subscribed",
                                            "sessionId": sid,
                                            "message": "Suscripción confirmada"
                                        }).to_string();
                                        let _ = ws_sender.send(Message::Text(ack)).await;
                                    }
                                }
                            } else if cmd.cmd_type == "ping" {
                                let pong = serde_json::json!({ "type": "pong" }).to_string();
                                let _ = ws_sender.send(Message::Text(pong)).await;
                            }
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = ws_sender.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }

    if let Some(ref sid) = current_session_id {
        let mut subs = subscribers.write().await;
        if let Some(list) = subs.get_mut(sid) {
            list.retain(|sender| !sender.is_closed());
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    println!("[Aurora WS] Iniciando microservicio WebSocket en Rust en {}", bind_addr);

    let subscribers: SubscriberMap = Arc::new(RwLock::new(HashMap::new()));
    start_redis_listener(redis_url, subscribers.clone()).await;

    let listener = match TcpListener::bind(&bind_addr).await {
        Ok(l) => {
            println!("[Aurora WS] Listener TCP enlazado correctamente en {}", bind_addr);
            l
        }
        Err(e) => {
            eprintln!("[Aurora WS] Error fatal al enlazar socket TCP en {}: {}", bind_addr, e);
            return Err(e.into());
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let subs = subscribers.clone();
                tokio::spawn(async move {
                    handle_connection(stream, addr, subs).await;
                });
            }
            Err(e) => {
                eprintln!("[Aurora WS] Error en accept de conexión TCP: {}", e);
            }
        }
    }
}
