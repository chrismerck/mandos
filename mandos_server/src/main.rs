extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;
extern crate futures;
extern crate termion;

use mandos_common::Screen;
use tokio::net::TcpListener;
use tokio_serde::formats::*;
use tokio_util::codec::{FramedRead, FramedWrite, LengthDelimitedCodec};
use futures::prelude::*;
use termion::event::Key;
use futures::{StreamExt, SinkExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:8880").await?;

    loop {
        let (socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let (r, w) = socket.split();

            let mut deserialized = tokio_serde::SymmetricallyFramed::new(
                FramedRead::new(r, LengthDelimitedCodec::new()),
                SymmetricalJson::<Key>::default()
            );

            let mut serialized = tokio_serde::SymmetricallyFramed::new(
                FramedWrite::new(w, LengthDelimitedCodec::new()),
                SymmetricalJson::<Screen>::default()
            );

            while let Some(key_result) = deserialized.next().await {
                match key_result {
                    Ok(key) => {
                        println!("Received: {:?}", key);
                        let screen = Screen::new((80, 24));
                        serialized.send(screen).await;
                        println!("Sent screen");
                    },
                    Err(e) => {
                        eprintln!("Error receiving key: {:?}", e);
                        break;
                    }
                }
            }
        });
    }
}