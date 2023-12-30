extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;
extern crate futures;
extern crate termion;

use mandos_common::{Screen, ScreenTile, KeyCode, MAP_HEIGHT, MAP_WIDTH};
use tokio::net::TcpListener;
use tokio_serde::formats::*;
use tokio_util::codec::{FramedRead, FramedWrite, LengthDelimitedCodec};
use futures::prelude::*;
use futures::{Stream, StreamExt, SinkExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:8880").await?;

    loop {
        let (mut socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let (r, w) = socket.split();

            let mut deserialized = tokio_serde::SymmetricallyFramed::new(
                FramedRead::new(r, LengthDelimitedCodec::new()),
                SymmetricalJson::<KeyCode>::default()
            );

            let mut serialized = tokio_serde::SymmetricallyFramed::new(
                FramedWrite::new(w, LengthDelimitedCodec::new()),
                SymmetricalJson::<Screen>::default()
            );

            let (mut pc_x, mut pc_y) = (MAP_WIDTH / 2, MAP_HEIGHT / 2);

            while let Some(keycode_result) = deserialized.next().await {
                match keycode_result {
                    Ok(keycode) => {
                        println!("Received: {:?}", keycode);
                        match keycode {
                            KeyCode::Up => pc_y -= 1,
                            KeyCode::Down => pc_y += 1,
                            KeyCode::Left => pc_x -= 1,
                            KeyCode::Right => pc_x += 1,
                            _ => (),
                        }
                        let mut screen = Screen::new((80, 24));
                        screen.tiles[pc_y * MAP_WIDTH + pc_x] = ScreenTile { c: '@' };
                        serialized.send(screen).await.unwrap();
                        println!("Sent screen");
                    },
                    Err(e) => {
                        eprintln!("Error receiving keycode: {:?}", e);
                        break;
                    }
                }
            }
        });
    }
}